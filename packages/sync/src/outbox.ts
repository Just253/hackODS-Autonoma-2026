export type Operacion = 'upsert' | 'delete';

/**
 * Evento del outbox: `idempotencyKey` SIEMPRE igual a `eventUuid`.
 * El orden de envio es `(lamport, deviceId)`; nunca `Date.now()`.
 */
export interface EventoSaliente {
  readonly eventUuid: string;
  readonly idempotencyKey: string;
  readonly lamport: number;
  readonly deviceId: string;
  readonly ollaId: string;
  readonly entidad:
    | 'personas'
    | 'raciones'
    | 'movimientos'
    | 'solicitudes'
    | 'precios'
    | 'menus'
    | 'consentimiento';
  readonly op: Operacion;
  readonly payload: unknown;
  readonly creadoEn: string;
  intentos: number;
  ultimoError: string | null;
}

export type NuevoEvento = Omit<EventoSaliente, 'intentos' | 'ultimoError'>;

export interface Outbox {
  encolar(evento: NuevoEvento): void;
  pendientes(): readonly EventoSaliente[];
  /** Primer lote (<= 100) ordenado por (lamport, deviceId). */
  lote(maximo?: number): readonly EventoSaliente[];
  total(): number;
  marcarEnviado(eventUuid: string): void;
  marcarError(eventUuid: string, error: string): void;
}

export const LOTE_MAXIMO = 100 as const;

/**
 * Stub en memoria del outbox. La version real persiste en Dexie y sobrevive
 * recarga (M5). La interfaz y el orden no cambian.
 */
export class OutboxMemoria implements Outbox {
  private readonly eventos = new Map<string, EventoSaliente>();

  encolar(evento: NuevoEvento): void {
    if (evento.idempotencyKey !== evento.eventUuid) {
      throw new Error('idempotencyKey debe ser igual a eventUuid');
    }
    if (this.eventos.has(evento.eventUuid)) {
      return;
    }
    this.eventos.set(evento.eventUuid, { ...evento, intentos: 0, ultimoError: null });
  }

  pendientes(): readonly EventoSaliente[] {
    return [...this.eventos.values()].sort(compararEventos);
  }

  lote(maximo: number = LOTE_MAXIMO): readonly EventoSaliente[] {
    const tope = Math.max(0, Math.min(maximo, LOTE_MAXIMO));
    return this.pendientes().slice(0, tope);
  }

  total(): number {
    return this.eventos.size;
  }

  marcarEnviado(eventUuid: string): void {
    this.eventos.delete(eventUuid);
  }

  marcarError(eventUuid: string, error: string): void {
    const evento = this.eventos.get(eventUuid);
    if (evento === undefined) {
      return;
    }
    evento.intentos += 1;
    evento.ultimoError = error;
  }
}

/** Orden contractual: lamport ascendente, desempate por deviceId. */
export function compararEventos(a: EventoSaliente, b: EventoSaliente): number {
  if (a.lamport !== b.lamport) {
    return a.lamport - b.lamport;
  }
  return a.deviceId.localeCompare(b.deviceId);
}
