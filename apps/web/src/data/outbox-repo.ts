import {
  compararEventos,
  LOTE_MAXIMO,
  type EventoSaliente,
  type NuevoEvento,
  type Outbox,
} from '@hackods/sync';

import type { BaseOlla, EventoOutbox } from './base.js';

/**
 * Outbox persistente sobre Dexie.
 *
 * `@hackods/sync` define el contrato (`Outbox`, `EventoSaliente`, `NuevoEvento`,
 * `LOTE_MAXIMO`) y este archivo NO lo reescribe: lo implementa. La interfaz es
 * sincrona, pero IndexedDB no; por eso la instancia mantiene un espejo en
 * memoria y encadena la escritura a Dexie en orden:
 *
 * - al abrir, `cargar()` trae los pendientes de la base (sobrevive la recarga);
 * - `encolar` actualiza el espejo y encola la escritura, asi una lectura
 *   inmediata ya ve el cambio;
 * - dentro de una transaccion Dexie (`altaPersona`, `guardarRacion`) se usa
 *   `encolarEnTransaccion`, que escribe con el `Table` de esa transaccion y no
 *   con la coleccion suelta: Dexie no deja que una transaccion hija toque una
 *   tabla que el padre no declaro, y escribir por fuera rompe la atomicidad.
 *
 * Idempotencia: el `eventUuid` es la clave de la tabla y encolar dos veces el
 * mismo evento deja una sola fila (mismo criterio que `OutboxMemoria`).
 *
 * Reactividad: la instancia avisa a sus oyentes (`suscribir`) cada vez que
 * cambia el conjunto de pendientes, para que el badge del header se actualice
 * sin recargar y sin `setInterval`. `encolarEnTransaccion` no avisa: la
 * transaccion del llamador todavia puede abortar. El llamador confirma
 * despues con `registrarConfirmado`, ya con la fila en disco.
 */

/** Lo que el llamador entrega: el `NuevoEvento` del contrato, sin tocar. */
export type EntradaEvento = NuevoEvento;

function aFila(evento: NuevoEvento): EventoOutbox {
  if (evento.idempotencyKey !== evento.eventUuid) {
    throw new Error('idempotencyKey debe ser igual a eventUuid');
  }
  return {
    eventUuid: evento.eventUuid,
    idempotencyKey: evento.idempotencyKey,
    lamport: evento.lamport,
    deviceId: evento.deviceId,
    ollaId: evento.ollaId,
    entidad: evento.entidad,
    op: evento.op,
    payload: evento.payload,
    creadoEn: evento.creadoEn,
    intentos: 0,
    ultimoError: null,
    estado: 'pendiente',
  };
}

export class OutboxDexie implements Outbox {
  private readonly base: BaseOlla;
  private readonly tabla: BaseOlla['outbox'];
  private readonly espejo = new Map<string, EventoOutbox>();
  private readonly oyentes = new Set<() => void>();
  private cola: Promise<void> = Promise.resolve();

  constructor(base: BaseOlla) {
    this.base = base;
    this.tabla = base.outbox;
  }

  /**
   * Avisa a quien muestra el badge cuando cambia el conjunto de pendientes.
   * Devuelve como desuscribirse.
   *
   * Es sincrono y no sondea nada: `encolar`, `marcarEnviado`, `marcarError` y
   * `registrarConfirmado` llaman a `avisar()` en el momento. Nada de
   * `setInterval` ni de releer Dexie en cada render.
   */
  suscribir(oyente: () => void): () => void {
    this.oyentes.add(oyente);
    return () => {
      this.oyentes.delete(oyente);
    };
  }

  /** Trae los pendientes persistidos. Idempotente: se puede llamar otra vez. */
  async cargar(): Promise<void> {
    const filas = await this.tabla.where('estado').equals('pendiente').toArray();
    this.espejo.clear();
    for (const fila of filas) {
      this.espejo.set(fila.eventUuid, fila);
    }
    this.avisar();
  }

  /**
   * Encola dentro de la transaccion del llamador. Devuelve `true` si entro y
   * `false` si ya estaba (idempotencia). No toca `this.espejo`: la transaccion
   * puede abortar (p. ej. `RacionDuplicada`) y el espejo no debe quedar sucio
   * por un alta que no ocurrio.
   */
  async encolarEnTransaccion(
    evento: NuevoEvento,
    tabla: BaseOlla['outbox'] = this.tabla,
  ): Promise<boolean> {
    const fila = aFila(evento);
    const existente = await tabla.get(fila.eventUuid);
    if (existente !== undefined) {
      return false;
    }
    await tabla.add(fila);
    return true;
  }

  /**
   * Da por pendiente un evento que YA quedo confirmado en la transaccion del
   * llamador (`altaPersona`, `guardarRacion`). Es el aviso que
   * `encolarEnTransaccion` no puede dar: ahi la transaccion todavia puede
   * abortar y el badge no debe contar un alta que no ocurrio. Idempotente.
   */
  registrarConfirmado(evento: NuevoEvento): void {
    if (this.espejo.has(evento.eventUuid)) {
      return;
    }
    this.espejo.set(evento.eventUuid, aFila(evento));
    this.avisar();
  }

  // --- Contrato `Outbox` (sincrono, sobre el espejo) ---

  /**
   * Encola y persiste. El contrato lo declara `void`; el trabajo de IndexedDB
   * queda encadenado y `asentar()` espera a que termine.
   */
  encolar(evento: NuevoEvento): void {
    const fila = aFila(evento);
    if (this.espejo.has(fila.eventUuid)) {
      return;
    }
    this.espejo.set(fila.eventUuid, fila);
    this.enCola(() => this.tabla.put(fila));
    this.avisar();
  }

  pendientes(): readonly EventoSaliente[] {
    return [...this.espejo.values()].sort(compararEventos);
  }

  lote(maximo: number = LOTE_MAXIMO): readonly EventoSaliente[] {
    const tope = Math.max(0, Math.min(maximo, LOTE_MAXIMO));
    return this.pendientes().slice(0, tope);
  }

  total(): number {
    return this.espejo.size;
  }

  marcarEnviado(eventUuid: string): void {
    if (!this.espejo.delete(eventUuid)) {
      return;
    }
    this.enCola(() => this.tabla.delete(eventUuid));
    this.avisar();
  }

  marcarError(eventUuid: string, error: string): void {
    const evento = this.espejo.get(eventUuid);
    if (evento === undefined) {
      return;
    }
    const actualizado: EventoOutbox = {
      ...evento,
      intentos: evento.intentos + 1,
      ultimoError: error,
    };
    this.espejo.set(eventUuid, actualizado);
    this.enCola(() => this.tabla.put(actualizado));
    this.avisar();
  }

  /** Espera a que las escrituras encadenadas toquen disco (tests y cierre). */
  async asentar(): Promise<void> {
    await this.cola;
  }

  private avisar(): void {
    for (const oyente of this.oyentes) oyente();
  }

  private enCola(tarea: () => Promise<unknown>): void {
    this.cola = this.cola
      .then(async () => {
        await this.base.open();
        await tarea();
      })
      .catch(() => {
        // Una escritura fallida no envenena la cola: el evento sigue en el
        // espejo y se reintenta en el proximo cambio. Nada se descarta solo.
      });
  }
}

/** Una instancia por base abierta: dos outboxes sobre la misma tabla se pisan. */
const porBase = new WeakMap<BaseOlla, OutboxDexie>();

export function outboxDe(base: BaseOlla): OutboxDexie {
  const existente = porBase.get(base);
  if (existente !== undefined) {
    return existente;
  }
  const outbox = new OutboxDexie(base);
  porBase.set(base, outbox);
  return outbox;
}