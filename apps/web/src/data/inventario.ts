import { insumoSchema, movimientoSchema, type Insumo, type MotivoMovimiento } from '@hackods/contracts';
import { redondearMitadArriba } from '@hackods/domain';
import type { NuevoEvento } from '@hackods/sync';

import { baseDeOlla, type Lote, type MovimientoLocal } from './base.js';
import { siguienteLamport } from './lamport.js';
import { outboxDe } from './outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO, type Reloj } from './repositorio.js';

/**
 * Despensa local (issue #69): catalogo de insumos, movimientos append-only y
 * lotes con vencimiento.
 *
 * Lo que esta capa garantiza y por que:
 *
 * - **No hay saldo guardado.** Solo se escriben movimientos; el stock se deriva
 *   con `stockPorInsumo()` de `@hackods/domain` (`saldoDespensa`). Un saldo
 *   mutable se desincroniza en la primera correccion.
 * - **Append-only de verdad.** Este modulo expone `registrarMovimiento` y nada
 *   mas que escriba un movimiento: no hay `actualizar` ni `eliminar`, y un
 *   error del dia se corrige con un `ajuste`.
 * - **Atomicidad.** Movimiento + lote + evento del outbox entran en una sola
 *   transaccion de Dexie: no queda un movimiento sin evento, ni un lote de una
 *   entrada que no ocurrio.
 * - **El lote no viaja.** `loteId` se guarda en la fila local
 *   (`MovimientoLocal`) pero el payload del outbox es el `Movimiento` puro: el
 *   contrato no modela lotes y `@hackods/sync` no tiene esa entidad. Es una
 *   limitacion declarada, no un olvido (README de la feature).
 */

const relojGlobal: Reloj = {
  ahora: () => new Date().toISOString(),
  azar: () => Math.random(),
  idEvento: () => crypto.randomUUID(),
};

function idDe(reloj: Reloj): string {
  return (reloj.idEvento ?? (() => crypto.randomUUID()))();
}

/** Precision de `movimientos.delta numeric(12,2)` en Postgres. */
function aDosDecimales(valor: number): number {
  return redondearMitadArriba(valor * 100) / 100;
}

/** El movimiento pedido no respeta el contrato (signo, motivo o cantidad). */
export class MovimientoInvalido extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'MovimientoInvalido';
  }
}

/** El insumo no existe en el catalogo local: no se inventa uno. */
export class InsumoNoEncontrado extends Error {
  constructor(readonly insumoId: string) {
    super(`El insumo "${insumoId}" no está en el catálogo de esta olla.`);
    this.name = 'InsumoNoEncontrado';
  }
}

export interface NuevoMovimiento {
  readonly insumoId: string;
  /**
   * Cantidad con signo en la unidad base del insumo (`g`, `ml`, `unidad`).
   * Entrada positiva; salida y merma negativas; ajuste en cualquiera de los dos
   * sentidos (la correccion puede sumar o restar).
   */
  readonly delta: number;
  readonly motivo: MotivoMovimiento;
  /** Referencia del rol que registra (`cocinera`, `organizadora`). Nunca un nombre. */
  readonly autor: string;
  /** Instante ISO. Por defecto, el reloj inyectado. */
  readonly at?: string;
  /** Lote existente al que se imputa el movimiento. */
  readonly loteId?: string | null;
  /** Solo para entradas: abre un lote nuevo con esta fecha de vencimiento. */
  readonly nuevoLote?: { readonly fechaVencimiento: string } | null;
}

function validarDelta(motivo: MotivoMovimiento, delta: number): void {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new MovimientoInvalido('La cantidad tiene que ser distinta de cero.');
  }
  if (motivo === 'entrada' && delta < 0) {
    throw new MovimientoInvalido('Una entrada suma al stock: la cantidad va en positivo.');
  }
  if ((motivo === 'salida' || motivo === 'merma') && delta > 0) {
    throw new MovimientoInvalido(
      `Una ${motivo} descuenta del stock: se registra con signo negativo.`,
    );
  }
}

export async function listarInsumos(ollaId: string = OLLA_DEMO): Promise<readonly Insumo[]> {
  return baseDeOlla(ollaId).insumos.orderBy('denominacion').toArray();
}

/**
 * Movimientos de la olla, en orden de ocurrencia. Una base por olla
 * (`baseDeOlla`), asi que no hace falta filtrar por `ollaId` en el indice.
 */
export async function listarMovimientos(ollaId: string = OLLA_DEMO): Promise<readonly MovimientoLocal[]> {
  return baseDeOlla(ollaId).movimientos.orderBy('at').toArray();
}

export async function listarLotes(ollaId: string = OLLA_DEMO): Promise<readonly Lote[]> {
  return baseDeOlla(ollaId).lotes.orderBy('fechaVencimiento').toArray();
}

/**
 * Siembra el catalogo del dispositivo. Idempotente y NO destructiva: solo
 * agrega los ids que faltan, para que un minimo corregido a mano sobreviva a la
 * proxima apertura de la pantalla. Devuelve cuantos insumos agrego.
 */
export async function sembrarInsumos(
  insumos: readonly Insumo[],
  ollaId: string = OLLA_DEMO,
): Promise<number> {
  const base = baseDeOlla(ollaId);
  return base.transaction('rw', base.insumos, async () => {
    let agregados = 0;
    for (const insumo of insumos) {
      const validado = insumoSchema.parse(insumo);
      if ((await base.insumos.get(validado.id)) === undefined) {
        await base.insumos.add(validado);
        agregados += 1;
      }
    }
    return agregados;
  });
}

/**
 * Alta de movimiento (append-only) + evento del outbox, en una transaccion.
 *
 * `nuevoLote` abre el lote en la misma transaccion y deja `loteId` en la fila
 * local. Si el lote pedido no existe, no es del insumo o ya no esta
 * disponible, el alta falla entera: no se imputa a un lote ajeno.
 */
export async function registrarMovimiento(
  datos: NuevoMovimiento,
  reloj: Reloj = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<MovimientoLocal> {
  const delta = aDosDecimales(datos.delta);
  validarDelta(datos.motivo, delta);

  const base = baseDeOlla(ollaId);
  if ((await base.insumos.get(datos.insumoId)) === undefined) {
    throw new InsumoNoEncontrado(datos.insumoId);
  }

  if (datos.nuevoLote != null && datos.motivo !== 'entrada') {
    throw new MovimientoInvalido('Solo una entrada abre un lote nuevo.');
  }

  const ahora = datos.at ?? reloj.ahora();
  let confirmado: NuevoEvento | null = null;

  const fila = await base.transaction(
    'rw',
    base.movimientos,
    base.lotes,
    base.meta,
    base.outbox,
    async () => {
      const lamport = await siguienteLamport(base);

      let loteId = datos.loteId ?? null;
      if (datos.nuevoLote != null) {
        loteId = idDe(reloj);
        const lote: Lote = {
          loteId,
          ollaId,
          insumoId: datos.insumoId,
          cantidadInicial: delta,
          fechaVencimiento: datos.nuevoLote.fechaVencimiento,
          estado: 'disponible',
          createdAt: ahora,
          deviceId: DEVICE_DEMO,
          lamport,
        };
        await base.lotes.add(lote);
      } else if (loteId !== null) {
        const existente = await base.lotes.get(loteId);
        if (existente === undefined) {
          throw new MovimientoInvalido(`El lote "${loteId}" no existe en este dispositivo.`);
        }
        if (existente.insumoId !== datos.insumoId) {
          throw new MovimientoInvalido(
            `El lote "${loteId}" es de otro insumo; no se imputa a ciegas.`,
          );
        }
        if (existente.estado !== 'disponible') {
          throw new MovimientoInvalido(`El lote "${loteId}" ya no está disponible.`);
        }
      }

      // El contrato se valida antes de tocar disco: un movimiento invalido no
      // entra "para arreglarlo despues".
      const movimiento = movimientoSchema.parse({
        id: idDe(reloj),
        ollaId,
        insumoId: datos.insumoId,
        delta,
        motivo: datos.motivo,
        autor: datos.autor,
        at: ahora,
        createdAt: ahora,
        updatedAt: ahora,
        deletedAt: null,
        deviceId: DEVICE_DEMO,
        lamport,
      });

      const fila: MovimientoLocal = { ...movimiento, loteId };
      await base.movimientos.add(fila);

      const eventUuid = idDe(reloj);
      const evento: NuevoEvento = {
        eventUuid,
        idempotencyKey: eventUuid,
        lamport,
        deviceId: DEVICE_DEMO,
        ollaId,
        entidad: 'movimientos',
        op: 'upsert',
        // Sin `loteId`: el vinculo con el lote es local (ver encabezado).
        payload: movimiento,
        creadoEn: ahora,
      };
      await outboxDe(base).encolarEnTransaccion(evento, base.outbox);
      confirmado = evento;

      return fila;
    },
  );

  // La transaccion confirmo: recien ahora el evento es un pendiente contable.
  if (confirmado !== null) outboxDe(base).registrarConfirmado(confirmado);

  return fila;
}
