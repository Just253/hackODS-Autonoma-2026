/**
 * Cliente de Supabase del navegador: UNO solo y, si falta configuracion, NINGUNO.
 *
 * Reglas que este modulo hace cumplir:
 *
 * - La app solo puede usar la clave publicable (`anon`/publishable). La
 *   `service_role` vive en el servidor y jamas en el bundle: lo que este archivo
 *   lee de `import.meta.env` es lo que Vite publica, y nada mas.
 * - Sin `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` no se crea cliente. No hay
 *   valores por defecto ni URL adivinada: la pantalla dice "no configurado" en
 *   vez de inventar datos o caer a fixtures.
 * - Las credenciales no se commitean: `apps/web/.env.example` solo nombra las
 *   variables, y `.env.local` esta ignorado por `.gitignore`.
 *
 * `estadoConexion()` responde con lo que se sabe en este instante:
 * `sin_configurar` (no hay env), `anonimo` (hay cliente pero nadie entro) o
 * `autenticado` (hay sesion de Supabase). La sesion la observa `app/cuenta.ts`;
 * este modulo solo guarda el ultimo estado visto.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { ClienteDatos } from './cliente-remoto.js';

/** Lo que Vite publica al bundle. Vacio o ausente = sin configurar. */
export interface EntornoVite {
  readonly VITE_SUPABASE_URL?: string;
  /** Nombre usado por el brief y el `.env` de la hackathon. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /**
   * Alias que usa `docs/decisiones/DEC-20261123-1349-9c5d5a.md` ("publishable
   * key"). Es la MISMA clave publica: se acepta cualquiera de los dos nombres
   * para no romper un `.env` escrito con el otro.
   */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export interface ConfiguracionSupabase {
  readonly url: string;
  readonly claveAnonima: string;
}

/**
 * `import.meta.env` tipado como `EntornoVite`. El tipo de Vite no declara las
 * variables propias, asi que el cast es el punto donde se nombran; sin el, un
 * error de tipeo en la variable (`VITE_SUPABASE_AN0N_KEY`) pasaria como `any`.
 */
function entornoDeVite(): EntornoVite {
  return import.meta.env as unknown as EntornoVite;
}

/**
 * Lee la configuracion del entorno. Se exporta para probarla sin crear cliente:
 * un test puede pasar un objeto literal en vez de tocar `import.meta.env`.
 */
export function leerConfiguracion(entorno: EntornoVite = entornoDeVite()): ConfiguracionSupabase | null {
  const url = (entorno.VITE_SUPABASE_URL ?? '').trim();
  const claveAnonima = (
    entorno.VITE_SUPABASE_ANON_KEY ??
    entorno.VITE_SUPABASE_PUBLISHABLE_KEY ??
    ''
  ).trim();
  // Las dos o ninguna: media configuracion es un error de build, no un modo.
  if (url === '' || claveAnonima === '') return null;
  return { url, claveAnonima };
}

/**
 * Un cliente por configuracion. Se reusa para no abrir un segundo pool de auth
 * en cada render; si el entorno cambia (tests con `vi.stubEnv`), se rehace.
 */
let cache: {
  readonly url: string;
  readonly clave: string;
  readonly cliente: SupabaseClient;
} | null = null;

export function clienteSupabase(): SupabaseClient | null {
  const config = leerConfiguracion();
  if (config === null) {
    cache = null;
    return null;
  }
  if (cache !== null && cache.url === config.url && cache.clave === config.claveAnonima) {
    return cache.cliente;
  }
  const cliente = createClient(config.url, config.claveAnonima, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Sin esto, un `#access_token` en la URL pisa la sesion: la PWA no usa
      // magic links, entra con las cuentas demo por password.
      detectSessionInUrl: false,
    },
  });
  cache = { url: config.url, clave: config.claveAnonima, cliente };
  return cliente;
}

/**
 * El cliente visto como puerto de lectura. El SDK cumple el contrato en runtime
 * (`from().select().eq().order().limit()` es la misma cadena); el cast existe
 * solo porque los genericos de PostgREST no se pueden expresar en el puerto.
 */
export function clienteDeDatos(): ClienteDatos | null {
  return clienteSupabase() as unknown as ClienteDatos | null;
}

/** Estado de conexion, tal cual lo puede leer una pantalla en render. */
export type EstadoConexion = 'sin_configurar' | 'anonimo' | 'autenticado';

/** Ultima sesion observada. Arranca anonimo: nadie entro todavia. */
let sesionVista: 'anonimo' | 'autenticado' = 'anonimo';

/** Lo llama `app/cuenta.ts` cuando Supabase Auth avisa. */
export function marcarSesionVista(estado: 'anonimo' | 'autenticado'): void {
  sesionVista = estado;
}

/**
 * Sin env siempre es `sin_configurar`, aunque haya un token viejo en el
 * almacen: sin URL no hay con que hablar.
 */
export function estadoConexion(): EstadoConexion {
  if (leerConfiguracion() === null) return 'sin_configurar';
  return sesionVista;
}

/** A que backend apunta este build. `null` = sin configurar. */
export type DestinoBackend = 'local' | 'remoto';

/**
 * Local o remoto se decide SOLO por el host de `VITE_SUPABASE_URL`, no por una
 * variable aparte: un mismo codigo sirve para los dos, y el panel dice a cual
 * esta hablando para que nadie confunda datos del seed local con los del
 * proyecto remoto.
 */
export function destinoBackend(): DestinoBackend | null {
  const config = leerConfiguracion();
  if (config === null) return null;
  try {
    const host = new URL(config.url).hostname.toLowerCase();
    return host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      host === '::1'
      ? 'local'
      : 'remoto';
  } catch {
    // URL con forma invalida: no se adivina el destino.
    return null;
  }
}
