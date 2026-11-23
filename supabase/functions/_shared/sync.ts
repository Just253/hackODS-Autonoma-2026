/** Tipos y validacion compartidos por las Edge Functions de sync. */

export const LOTE_MAXIMO = 100;
export const PULL_MAXIMO = 500;

export type EntidadSync =
  | 'personas'
  | 'raciones'
  | 'movimientos'
  | 'solicitudes'
  | 'precios'
  | 'menus'
  | 'consentimiento';

export interface EventoPush {
  readonly eventUuid: string;
  readonly idempotencyKey: string;
  readonly lamport: number;
  readonly deviceId: string;
  readonly ollaId: string;
  readonly entidad: EntidadSync;
  readonly op: 'upsert' | 'delete';
  readonly payload: unknown;
  readonly creadoEn: string;
}

export interface Rechazo {
  readonly idempotencyKey: string;
  readonly motivo: string;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const ENTIDADES: readonly EntidadSync[] = [
  'personas',
  'raciones',
  'movimientos',
  'solicitudes',
  'precios',
  'menus',
  'consentimiento',
];

function texto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim() !== '';
}

function lamportValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 0;
}

export function compararEventos(a: EventoPush, b: EventoPush): number {
  if (a.lamport !== b.lamport) {
    return a.lamport - b.lamport;
  }
  return a.deviceId.localeCompare(b.deviceId);
}

export type ResultadoValidacionLote =
  | { readonly ok: true; readonly eventos: readonly EventoPush[] }
  | { readonly ok: false; readonly motivo: string; readonly rechazados: readonly Rechazo[] };

/**
 * Valida el cuerpo de `POST /sync/push`:
 * - lote de 1..100 eventos;
 * - `idempotencyKey === eventUuid`;
 * - `lamport` entero >= 0, `deviceId` y `ollaId` presentes;
 * - entidad conocida.
 * Devuelve los eventos ordenados por `(lamport, deviceId)`.
 */
export function validarLote(cuerpo: unknown): ResultadoValidacionLote {
  if (cuerpo === null || typeof cuerpo !== 'object') {
    return { ok: false, motivo: 'cuerpo invalido: se esperaba un objeto', rechazados: [] };
  }

  const eventos = (cuerpo as { eventos?: unknown }).eventos;
  if (!Array.isArray(eventos)) {
    return { ok: false, motivo: 'falta el arreglo `eventos`', rechazados: [] };
  }
  if (eventos.length === 0) {
    return { ok: false, motivo: 'lote vacio', rechazados: [] };
  }
  if (eventos.length > LOTE_MAXIMO) {
    return {
      ok: false,
      motivo: `lote de ${eventos.length}; el maximo es ${LOTE_MAXIMO}`,
      rechazados: [],
    };
  }

  const rechazados: Rechazo[] = [];
  const validos: EventoPush[] = [];

  eventos.forEach((crudo, i) => {
    const e = crudo as Record<string, unknown>;
    const clave = typeof e?.idempotencyKey === 'string' ? e.idempotencyKey : `indice:${i}`;

    if (!texto(e?.eventUuid) || !UUID.test(e.eventUuid)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'eventUuid invalido' });
      return;
    }
    if (!texto(e?.idempotencyKey) || !UUID.test(e.idempotencyKey)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'idempotencyKey invalido' });
      return;
    }
    if (e.idempotencyKey !== e.eventUuid) {
      rechazados.push({ idempotencyKey: clave, motivo: 'idempotencyKey debe igualar eventUuid' });
      return;
    }
    if (!lamportValido(e?.lamport)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'lamport invalido' });
      return;
    }
    if (!texto(e?.deviceId)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'deviceId requerido' });
      return;
    }
    if (!texto(e?.ollaId)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'ollaId requerido' });
      return;
    }
    if (!texto(e?.entidad) || !ENTIDADES.includes(e.entidad as EntidadSync)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'entidad desconocida' });
      return;
    }
    if (e.op !== 'upsert' && e.op !== 'delete') {
      rechazados.push({ idempotencyKey: clave, motivo: 'op debe ser upsert|delete' });
      return;
    }
    if (!texto(e?.creadoEn)) {
      rechazados.push({ idempotencyKey: clave, motivo: 'creadoEn requerido' });
      return;
    }

    validos.push({
      eventUuid: e.eventUuid,
      idempotencyKey: e.idempotencyKey,
      lamport: e.lamport,
      deviceId: e.deviceId,
      ollaId: e.ollaId,
      entidad: e.entidad as EntidadSync,
      op: e.op,
      payload: e.payload ?? null,
      creadoEn: e.creadoEn,
    });
  });

  if (validos.length === 0) {
    return { ok: false, motivo: 'ningun evento valido en el lote', rechazados };
  }

  return { ok: true, eventos: validos.sort(compararEventos) };
}
