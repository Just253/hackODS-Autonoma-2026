export type Operacion = 'upsert' | 'delete';

export type EntidadSincronizable = 'personas' | 'raciones' | 'movimientos' | 'solicitudes';

/**
 * Una mutacion local pendiente de enviar. El `id` lo genera el dispositivo:
 * reenviar el mismo id no duplica (idempotencia por id de cliente).
 */
export interface Mutacion {
  readonly id: string;
  readonly entidad: EntidadSincronizable;
  readonly entidadId: string;
  readonly op: Operacion;
  readonly payload: unknown;
  readonly createdAt: string;
  readonly baseVersion: number;
  intentos: number;
  ultimoError: string | null;
}

export type NuevaMutacion = Omit<Mutacion, 'intentos' | 'ultimoError'>;

export interface Outbox {
  encolar(mutacion: NuevaMutacion): void;
  pendientes(): readonly Mutacion[];
  total(): number;
  marcarEnviada(id: string): void;
  marcarError(id: string, error: string): void;
}

/**
 * Stub en memoria del outbox. La version real persiste en Dexie y sobrevive
 * recarga (M5). La interfaz es la que no cambia.
 */
export class OutboxMemoria implements Outbox {
  private readonly items = new Map<string, Mutacion>();

  encolar(mutacion: NuevaMutacion): void {
    if (this.items.has(mutacion.id)) {
      return;
    }
    this.items.set(mutacion.id, { ...mutacion, intentos: 0, ultimoError: null });
  }

  pendientes(): readonly Mutacion[] {
    return [...this.items.values()];
  }

  total(): number {
    return this.items.size;
  }

  marcarEnviada(id: string): void {
    this.items.delete(id);
  }

  marcarError(id: string, error: string): void {
    const item = this.items.get(id);
    if (item === undefined) {
      return;
    }
    item.intentos += 1;
    item.ultimoError = error;
  }
}
