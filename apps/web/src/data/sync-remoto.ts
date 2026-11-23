/**
 * `SyncPort` REAL sobre las Edge Functions (`sync-push` / `sync-pull`).
 *
 * No reimplementa el outbox: usa el de `outbox-repo.ts` (`OutboxDexie`, que
 * implementa `Outbox` de `@hackods/sync`) y el contrato `SyncPort` del paquete.
 * Lo unico que agrega es el mapeo entre el contrato y la red:
 *
 * - `push()`: manda el primer lote (<=100, orden `(lamport, deviceId)`) y marca
 *   `enviado` SOLO los que el servidor confirmo (aceptados o duplicados: el
 *   duplicado tambien esta en el servidor). Los rechazados quedan pendientes con
 *   su motivo (`marcarError`): son conflictos visibles, no se descartan.
 * - `pull()`: trae los eventos posteriores al cursor y deja que
 *   `aplicarEventos()` los escriba en Dexie. Devuelve el cursor nuevo para
 *   persistirlo.
 * - Si la red falla, NO se marca nada como enviado: los eventos siguen
 *   pendientes con `intentos + 1`. Nunca se pinta "Sincronizado" sin confirmacion.
 *
 * Estados que ve la UI (via `app/sync.ts`): `pendiente` (outbox con filas),
 * `enviado` (el servidor confirmo), `conflicto` (rechazados), `error` (no hubo
 * respuesta) y `sin conexion` (el navegador dice que no hay red).
 */
import type { EventoSaliente, ResultadoPull, ResultadoPush, SyncPort } from '@hackods/sync';

import type { AlmacenCursor } from './cursor-sync.js';
import type { FuncionesSync } from './funciones-supabase.js';
import type { OutboxDexie } from './outbox-repo.js';

export type ResultadoPullRemoto = ResultadoPull & { readonly error?: string };

export class SyncRemoto implements SyncPort {
  private readonly outbox: OutboxDexie;
  private readonly funciones: FuncionesSync;
  private readonly cursor: AlmacenCursor;
  private readonly reloj: () => string;
  private ultima: string | undefined;

  constructor(
    outbox: OutboxDexie,
    funciones: FuncionesSync,
    cursor: AlmacenCursor,
    reloj: () => string = () => new Date().toISOString(),
  ) {
    this.outbox = outbox;
    this.funciones = funciones;
    this.cursor = cursor;
    this.reloj = reloj;
  }

  async push(): Promise<ResultadoPush> {
    const lote = this.outbox.lote();
    if (lote.length === 0) {
      return { aceptados: [], duplicados: [], rechazados: [], pendientes: this.outbox.total() };
    }

    const { datos, error } = await this.funciones.push(lote);
    if (datos === null) {
      const motivo = error ?? 'sin respuesta del servidor';
      for (const evento of lote) this.outbox.marcarError(evento.eventUuid, motivo);
      await this.outbox.asentar();
      return {
        aceptados: [],
        duplicados: [],
        rechazados: [],
        pendientes: this.outbox.total(),
        error: motivo,
      };
    }

    const confirmados = new Set([...datos.aceptados, ...datos.duplicados]);
    for (const evento of lote) {
      if (confirmados.has(evento.idempotencyKey)) {
        this.outbox.marcarEnviado(evento.eventUuid);
      }
    }
    for (const rechazo of datos.rechazados) {
      const evento = lote.find((candidato) => candidato.idempotencyKey === rechazo.idempotencyKey);
      if (evento !== undefined) this.outbox.marcarError(evento.eventUuid, rechazo.motivo);
    }

    await this.outbox.asentar();
    this.ultima = this.reloj();

    return { ...datos, pendientes: this.outbox.total() };
  }

  async pull(_since?: number): Promise<ResultadoPullRemoto> {
    const desde = this.cursor.leer();
    const { datos, error } = await this.funciones.pull(desde);
    if (datos === null) {
      return { eventos: [], cursor: desde, error: error ?? 'sin respuesta del servidor' };
    }
    this.cursor.guardar(datos.cursor);
    return datos;
  }

  status(): { readonly pendientes: number; readonly ultimaSync?: string } {
    return {
      pendientes: this.outbox.total(),
      ...(this.ultima === undefined ? {} : { ultimaSync: this.ultima }),
    };
  }
}

/** Lo que un evento trae para aplicar: sin los campos locales del outbox. */
export type EventoRecibido = Omit<EventoSaliente, 'intentos' | 'ultimoError'>;
