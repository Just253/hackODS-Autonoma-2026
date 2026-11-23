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

import { leerConfiguracion, clienteSupabase } from './supabase.js';

export interface RespuestaFuncion<T> {
  readonly datos: T | null;
  readonly error: string | null;
}

/** Un ítem que devuelve la Edge `ingest` (contrato `docs/contracts/ingesta.md`). */
export interface ItemIngest {
  readonly linea: number;
  readonly textoCrudo: string;
  readonly cantidad: number | null;
  readonly unidad: string | null;
  readonly precioUnitarioMicrocent: number | null;
}

export interface CapturaIngest {
  readonly capturaId: string;
  readonly estado: string;
  readonly texto: string;
  readonly categoria: string;
  readonly items: readonly ItemIngest[];
}

/**
 * Plan B: compute directo. Si `VITE_COMPUTE_URL` y `VITE_COMPUTE_TOKEN` están
 * configurados, la captura va derecho al compute y no depende de la Edge. La
 * URL es temporal y el token queda en el bundle: aceptado solo para la demo,
 * nunca para producción.
 */
interface ConfigDirecta {
  readonly url: string;
  readonly token: string;
}

function configDirecta(): ConfigDirecta | null {
  const entorno = import.meta.env as unknown as Record<string, string | undefined>;
  const url = entorno.VITE_COMPUTE_URL?.trim();
  const token = (entorno.VITE_COMPUTE_TOKEN ?? entorno.VITE_COMPUTE_KEY)?.trim();
  if (url === undefined || url === '' || token === undefined || token === '') return null;
  return { url: url.replace(/\/+$/, ''), token };
}

export function hayComputeDirecto(): boolean {
  return configDirecta() !== null;
}

async function capturarDirecto(
  archivo: File,
  tipo: 'audio' | 'boleta',
  config: ConfigDirecta,
): Promise<RespuestaFuncion<CapturaIngest>> {
  const ruta = tipo === 'audio' ? '/transcribe' : '/extract';
  try {
    const respuesta = await fetch(`${config.url}${ruta}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'content-type': archivo.type === '' ? 'application/octet-stream' : archivo.type,
      },
      body: archivo,
    });
    const cuerpo = (await respuesta.json()) as {
      texto?: unknown;
      items?: unknown;
    };
    if (!respuesta.ok) {
      return { datos: null, error: `el compute respondió ${respuesta.status}` };
    }
    const texto = typeof cuerpo.texto === 'string' ? cuerpo.texto : '';
    const crudos = Array.isArray(cuerpo.items) ? cuerpo.items : [];
    const items: ItemIngest[] = crudos.map((crudo, indice) => {
      const fila = crudo as Record<string, unknown>;
      const textoCrudo = String(fila.texto ?? fila.descripcion ?? fila.textoCrudo ?? '');
      return {
        linea: indice + 1,
        textoCrudo,
        cantidad: typeof fila.cantidad === 'number' ? fila.cantidad : null,
        unidad: typeof fila.unidad === 'string' ? fila.unidad : null,
        precioUnitarioMicrocent:
          typeof fila.precioUnitarioMicrocent === 'number' ? fila.precioUnitarioMicrocent : null,
      };
    });
    return {
      datos: {
        capturaId: 'directo',
        estado: 'extraida',
        texto,
        categoria: 'sin_clasificar',
        items,
      },
      error: null,
    };
  } catch (fallo) {
    return { datos: null, error: await mensajeDeError(fallo) };
  }
}

/**
 * Manda audio o foto a la Edge `ingest` con el JWT de la sesión. La función
 * guarda el binario en Storage, llama al compute con SU token y devuelve los
 * ítems. El navegador nunca ve `COMPUTE_URL` ni `COMPUTE_TOKEN`.
 */
export async function capturarConIngest(
  archivo: File,
  tipo: 'audio' | 'boleta',
): Promise<RespuestaFuncion<CapturaIngest>> {
  const directa = configDirecta();
  if (directa !== null) return capturarDirecto(archivo, tipo, directa);

  const cliente = clienteSupabase();
  if (cliente === null) return { datos: null, error: 'Supabase no configurado' };

  const formulario = new FormData();
  formulario.append('archivo', archivo);
  formulario.append('tipo', tipo);

  try {
    const { data, error } = await cliente.functions.invoke('ingest', { body: formulario });
    if (error !== null) return { datos: null, error: await mensajeDeError(error) };
    return { datos: data as CapturaIngest, error: null };
  } catch (fallo) {
    return { datos: null, error: await mensajeDeError(fallo) };
  }
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

/** El cuerpo `{ codigo, mensaje }` de una Edge Function es el mensaje util, no el status. */
export async function mensajeDeError(error: unknown): Promise<string> {
  if (error instanceof Error) {
    const contexto = (error as { context?: Response }).context;
    if (contexto !== undefined && typeof contexto.clone === 'function') {
      try {
        const cuerpo = (await contexto.clone().json()) as {
          error?: unknown;
          mensaje?: unknown;
          codigo?: unknown;
        };
        const detalle =
          typeof cuerpo.mensaje === 'string' && cuerpo.mensaje !== ''
            ? cuerpo.mensaje
            : typeof cuerpo.error === 'string' && cuerpo.error !== ''
              ? cuerpo.error
              : null;
        if (detalle !== null) {
          return typeof cuerpo.codigo === 'string' && cuerpo.codigo !== ''
            ? `${detalle} (${cuerpo.codigo})`
            : detalle;
        }
      } catch {
        /* respuesta sin JSON: queda el status o el mensaje del SDK */
      }
      if (typeof contexto.status === 'number' && contexto.status > 0) {
        return `la ingesta respondió ${contexto.status}`;
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
