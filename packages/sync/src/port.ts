/**
 * Frontera de sincronizacion (docs/contracts/sync.md).
 * `push`/`pull` son el contrato de las Edge Functions; el paquete no hace red.
 */

export interface EventoEnviado {
  readonly eventUuid: string;
  readonly idempotencyKey: string;
  readonly lamport: number;
  readonly deviceId: string;
  readonly ollaId: string;
  readonly entidad: string;
  readonly op: 'upsert' | 'delete';
  readonly payload: unknown;
  readonly creadoEn: string;
}

export interface ResultadoPush {
  readonly aceptados: readonly string[];
  readonly duplicados: readonly string[];
  readonly rechazados: readonly { readonly idempotencyKey: string; readonly motivo: string }[];
  readonly pendientes: number;
  readonly error?: string;
}

export interface ResultadoPull {
  readonly eventos: readonly EventoEnviado[];
  /** Cursor compuesto para el proximo `GET /sync/pull?since=…&since_device=…`. */
  readonly cursor: { readonly lamport: number; readonly deviceId: string };
}

export interface EstadoSync {
  readonly pendientes: number;
  readonly ultimaSync?: string;
}

export interface SyncPort {
  push(): Promise<ResultadoPush>;
  pull(since?: number): Promise<ResultadoPull>;
  status(): EstadoSync;
}
