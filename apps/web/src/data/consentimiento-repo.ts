import {
  TIPOS_CONSENTIMIENTO,
  estadoConsentimiento,
  ordenarConsentimientos,
  otorgar,
  revocar,
  ultimoRegistro,
  type EstadoConsentimiento,
  type RegistroConsentimiento,
  type TipoConsentimiento,
} from '@hackods/domain';
import type { NuevoEvento } from '@hackods/sync';

import { baseDeOlla, type ConsentimientoLocal } from './base.js';
import { siguienteLamport } from './lamport.js';
import { outboxDe } from './outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO, idDeEvento, type Reloj } from './repositorio.js';

/**
 * Consentimiento en el dispositivo (#74).
 *
 * Mismo patrón que `repositorio.ts`: la pantalla no conoce Dexie ni la red, y
 * toda escritura entra a la tabla **y** al outbox dentro de la misma
 * transacción (apps/web/AGENTS.md §1 y §2). Si la transacción aborta no queda
 * ni firma ni evento pendiente.
 *
 * Sin red no se bloquea nada: la fila se guarda local, la revocación corta el
 * seguimiento al instante (el estado se lee de Dexie, no del servidor) y el
 * evento espera en el outbox. Quién gana cuando hay dos firmas lo decide la
 * regla pura de `@hackods/domain`, no este archivo.
 */

const relojGlobal: Reloj = {
  ahora: () => new Date().toISOString(),
  azar: () => Math.random(),
  idEvento: () => crypto.randomUUID(),
};

/** Lo que la pantalla necesita para pintar cada casilla. */
export interface ConsentimientoConEstado {
  readonly tipo: TipoConsentimiento;
  readonly estado: EstadoConsentimiento;
  readonly registro: ConsentimientoLocal | null;
}

/** Todas las firmas de una persona, en el orden contractual. */
export async function consentimientosDe(
  personaId: string,
  ollaId: string = OLLA_DEMO,
): Promise<readonly ConsentimientoLocal[]> {
  const filas = await baseDeOlla(ollaId)
    .consentimiento.where('personaId')
    .equals(personaId)
    .toArray();
  return ordenarConsentimientos(filas);
}

/** Estado visible de los dos permisos de una persona. */
export async function estadoDeConsentimiento(
  personaId: string,
  ollaId: string = OLLA_DEMO,
): Promise<readonly ConsentimientoConEstado[]> {
  const registros = await consentimientosDe(personaId, ollaId);
  return TIPOS_CONSENTIMIENTO.map((tipo) => ({
    tipo,
    estado: estadoConsentimiento(registros, tipo),
    registro: ultimoRegistro(registros, tipo),
  }));
}

/**
 * Firma (otorgar o revocar) dentro de una transacción que también encola el
 * evento. `otorgado = false` es una fila nueva, nunca un UPDATE: por eso dos
 * dispositivos sin red pueden firmar lo contrario y el orden lo decide el
 * `lamport`, no quién llegó último al servidor.
 */
async function firmar(
  personaId: string,
  tipo: TipoConsentimiento,
  otorgado: boolean,
  reloj: Reloj,
  ollaId: string,
): Promise<ConsentimientoLocal> {
  const base = baseDeOlla(ollaId);
  const ahora = reloj.ahora();
  /** El evento que la transacción deja en disco, si llega a confirmarse. */
  let confirmado: NuevoEvento | null = null;

  const fila = await base.transaction(
    'rw',
    base.consentimiento,
    base.meta,
    base.outbox,
    async () => {
      const lamport = await siguienteLamport(base);
      const lamportEvento = await siguienteLamport(base);

      const datos = {
        id: crypto.randomUUID(),
        personaId,
        tipo,
        firmadoEn: ahora,
        deviceId: DEVICE_DEMO,
        lamport,
      };
      const firma: RegistroConsentimiento = otorgado ? otorgar(datos) : revocar(datos);

      const local: ConsentimientoLocal = { ...firma, ollaId };
      await base.consentimiento.add(local);

      const eventUuid = idDeEvento(reloj);
      const evento: NuevoEvento = {
        eventUuid,
        idempotencyKey: eventUuid,
        lamport: lamportEvento,
        deviceId: DEVICE_DEMO,
        ollaId,
        entidad: 'consentimiento',
        // La revocación también es un upsert de una fila nueva, no un delete:
        // el servidor no puede borrar la firma anterior.
        op: 'upsert',
        payload: local,
        creadoEn: ahora,
      };
      await outboxDe(base).encolarEnTransaccion(evento, base.outbox);
      confirmado = evento;

      return local;
    },
  );

  // La transacción ya confirmó: recién ahora el evento es un pendiente que el
  // badge puede contar.
  if (confirmado !== null) outboxDe(base).registrarConfirmado(confirmado);

  return fila;
}

/** Otorga un permiso: la persona dijo "sí" en este dispositivo. */
export function otorgarConsentimiento(
  personaId: string,
  tipo: TipoConsentimiento,
  reloj: Reloj = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<ConsentimientoLocal> {
  return firmar(personaId, tipo, true, reloj, ollaId);
}

/**
 * Revoca un permiso. Se guarda al instante y corta el seguimiento aunque no
 * haya red: el estado se lee de Dexie y el outbox lo empuja cuando pueda.
 */
export function revocarConsentimiento(
  personaId: string,
  tipo: TipoConsentimiento,
  reloj: Reloj = relojGlobal,
  ollaId: string = OLLA_DEMO,
): Promise<ConsentimientoLocal> {
  return firmar(personaId, tipo, false, reloj, ollaId);
}
