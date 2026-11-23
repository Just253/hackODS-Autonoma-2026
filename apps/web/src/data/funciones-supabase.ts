/**
 * Adaptador real de las Edge Functions de sync (`sync-push` / `sync-pull`).
 *
 * Es el UNICO modulo que habla con las funciones: el resto de la app usa el
 * puerto `FuncionesSync` (`SyncRemoto`), y los tests lo reemplazan por un doble
 * sin red. Asi no hay `fetch` suelto en componentes (apps/web/AGENTS.md §2).
 *
 * - `push`: `supabase.functions.invoke('sync-push', { body: { eventos } })`.
 *   El JWT de la sesion lo pone el SDK; la funcion valida el lote (1..100).
 * - `pull`: `GET /functions/v1/sync-pull?since=…&since_device=…` con `fetch`,
 *   porque `functions.invoke` no arma query string en esta version del SDK y el
 *   contrato del endpoint es GET. Va con `apikey` + el mismo Bearer del cliente.
 *
 * Nunca se usa `service_role`: lo que viaja es la clave publicable y el JWT del
 * usuario, y la RLS decide las filas.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventoSaliente, ResultadoPull, ResultadoPush } from '@hackods/sync';

import { leerConfiguracion } from './supabase.js';

export interface RespuestaFuncion<T> {
  readonly datos: T | null;
  readonly error: string | null;
}

/** Lo que `SyncRemoto` necesita del backend. Un doble de test implementa esto. */
export interface FuncionesSync {
  push(eventos: readonly EventoSaliente[]): Promise<RespuestaFuncion<ResultadoPush>>;
  pull(cursor: { readonly lamport: number; readonly deviceId: string }): Promise<
    RespuestaFuncion<ResultadoPull>
  >;
}

/** Campos del contrato que viajan; `intentos`/`ultimoError` son locales. */
function aEventoDeRed(evento: EventoSaliente): unknown {
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
  };
}

/** El cuerpo `{ error }` de una Edge Function es el mensaje util, no el status. */
export async function mensajeDeError(error: unknown): Promise<string> {
  if (error instanceof Error) {
    const contexto = (error as { context?: Response }).context;
    if (contexto !== undefined && typeof contexto.clone === 'function') {
      try {
        const cuerpo = (await contexto.clone().json()) as { error?: unknown };
        if (typeof cuerpo.error === 'string' && cuerpo.error !== '') return cuerpo.error;
      } catch {
        /* respuesta sin JSON: queda el mensaje del SDK */
      }
    }
    return error.message;
  }
  return 'sin respuesta del servidor';
}

export function funcionesSupabase(cliente: SupabaseClient): FuncionesSync {
  return {
    async push(eventos) {
      try {
        const { data, error } = await cliente.functions.invoke('sync-push', {
          body: { eventos: eventos.map(aEventoDeRed) },
        });
        if (error !== null) return { datos: null, error: await mensajeDeError(error) };
        return { datos: data as ResultadoPush, error: null };
      } catch (fallo) {
        return { datos: null, error: await mensajeDeError(fallo) };
      }
    },

    async pull(cursor) {
      const config = leerConfiguracion();
      if (config === null) return { datos: null, error: 'Supabase no configurado' };

      const { data: sesion } = await cliente.auth.getSession();
      const token = sesion.session?.access_token;
      if (token === undefined) return { datos: null, error: 'Sesión no iniciada' };

      const url = new URL(`${config.url.replace(/\/$/, '')}/functions/v1/sync-pull`);
      url.searchParams.set('since', String(cursor.lamport));
      if (cursor.deviceId !== '') url.searchParams.set('since_device', cursor.deviceId);

      try {
        const respuesta = await fetch(url, {
          method: 'GET',
          headers: { apikey: config.claveAnonima, Authorization: `Bearer ${token}` },
        });
        const cuerpo = (await respuesta.json()) as ResultadoPull & { error?: string };
        if (!respuesta.ok) {
          return { datos: null, error: cuerpo.error ?? `HTTP ${respuesta.status}` };
        }
        return { datos: cuerpo, error: null };
      } catch (fallo) {
        return { datos: null, error: await mensajeDeError(fallo) };
      }
    },
  };
}
