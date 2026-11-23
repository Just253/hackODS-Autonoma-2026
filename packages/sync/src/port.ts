/**
 * Frontera de sincronizacion (docs/ARQUITECTURA.md 5.4).
 * Hoy la implementa un adapter; manana puede ser Supabase, D1 o ninguno (`NoRemote`).
 * El paquete no hace red: recibe el transporte inyectado.
 */
export interface ResultadoPush {
  readonly enviados: number;
  readonly pendientes: number;
  readonly error?: string;
}

export interface ResultadoPull {
  readonly aplicados: number;
  readonly cursor: string;
}

export interface EstadoSync {
  readonly pendientes: number;
  readonly ultimaSync?: string;
}

export interface SyncPort {
  push(): Promise<ResultadoPush>;
  pull(cursor?: string): Promise<ResultadoPull>;
  status(): EstadoSync;
}
