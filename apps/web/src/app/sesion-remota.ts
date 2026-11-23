import { OLLAS_DEMO, ROLES } from './sesion.js';
import type { Rol, Sesion } from './sesion.js';

/**
 * De donde sale la sesion cuando `modo: 'cloud'` (issue #62).
 *
 * La verdad de quien sos, en que olla y con que rol la tiene Postgres:
 *
 * - `app.mis_ollas()` -> `setof uuid`. Las ollas del usuario del JWT, via
 *   `devices.user_id = auth.uid()` con `revoked_at is null`. Un device revocado
 *   o un JWT sin enrolar devuelve 0 filas.
 * - `app.mi_rol(p_olla_id uuid)` -> `text` con uno de los cuatro valores de
 *   `olla_members.rol` (`organizadora`, `cocinera`, `nutricionista`, `admin`), o
 *   `null` si esa olla no es del usuario.
 *
 * ## Por que un PUERTO y no un cliente Supabase
 *
 * `apps/web` no tiene `@supabase/supabase-js`: agregarlo es decision de bundle
 * (AGENTS.md §2, apps/web/AGENTS.md regla 6). Por eso este modulo NO habla
 * HTTP: define la forma de lo que el servidor ya devuelve y recibe funciones
 * inyectables. El adaptador real se conecta cuando el lead lo apruebe; mientras
 * tanto `SESION_REMOTA_PENDIENTE` es el puerto "no conectado" y lo dice.
 *
 * ## Reglas que NO se negocian
 *
 * - Nunca se fabrica una sesion si la RPC falla: se devuelve `null` con motivo
 *   y la UI sigue con la sesion local (`demo`). Sin red no se asciende a nadie.
 * - Un rol que no esta en `ROLES` no se mapea "al mas parecido": `null` con
 *   motivo visible. DEC-20261123-1349-d04467 separa admin GLOBAL de rol por
 *   olla; `app.es_admin_global()` todavia NO existe en la base, y cuando exista
 *   el adaptador lo reporta como `admin` (ya uno de los cuatro). Cualquier otro
 *   texto sigue siendo `null`.
 * - `memberId` sale de `members` bajo RLS, no del body.
 */

/** Lo que el adaptador devuelve de `mis_ollas()` (`setof uuid`, ya como array). */
export interface RespuestaOllas {
  readonly ollas: readonly string[];
}

/** Lo que el adaptador devuelve de `mi_rol($1)`: `text` o `null`. */
export interface RespuestaRol {
  readonly rol: string | null;
}

/** Lo que el adaptador aporta de `members`/`ollas`, bajo RLS. */
export interface DatosOllaDelServidor {
  readonly memberId: string;
  readonly nombreOlla: string;
}

/**
 * Puerto `mis_ollas()`. Si la RPC o la red fallan, DEBE rechazar.
 */
export type ListarOllas = () => Promise<RespuestaOllas>;

/**
 * Puerto `mi_rol(ollaId)`. `null` = la RPC corrio y la olla no es tuya; un
 * rechazo = no se pudo preguntar (red/permiso). Son motivos distintos.
 */
export type ConsultarRol = (ollaId: string) => Promise<RespuestaRol>;

/** Puerto de datos de la olla. Opcional: sin el no se inventa un memberId. */
export type DatosOlla = (ollaId: string) => Promise<DatosOllaDelServidor>;

/** Puertos completos de la sesion remota. */
export interface PuertosSesionRemota {
  readonly listarOllas: ListarOllas;
  readonly consultarRol: ConsultarRol;
  readonly datosOlla?: DatosOlla;
}

/** Por que no hubo sesion remota. Se muestra o se registra; no es un secreto. */
export type MotivoSinSesionRemota =
  | 'sin_ollas'
  | 'sin_rol'
  | 'rol_desconocido'
  | 'error_rpc'
  | 'puerto_no_conectado';

export type ResultadoSesionRemota =
  | { readonly sesion: Sesion }
  | {
      readonly sesion: null;
      readonly motivo: MotivoSinSesionRemota;
      readonly detalle?: string;
    };

/**
 * El puerto sin conectar. El TODO(#62) que vivia en `sesion.ts` se cierra como
 * esto: una funcion que lo dice en vez de un comentario que promete.
 */
export const SESION_REMOTA_PENDIENTE: PuertosSesionRemota = {
  listarOllas: () =>
    Promise.reject(new Error('el adaptador de Supabase no esta conectado (issue #62)')),
  consultarRol: () =>
    Promise.reject(new Error('el adaptador de Supabase no esta conectado (issue #62)')),
};

/**
 * Un rol del servidor -> rol de la UI, sin inventar. `app.mi_rol()` solo puede
 * devolver los cuatro del CHECK de `olla_members.rol`; cualquier otra cosa (una
 * base mas nueva, un `text` libre) es `null`: no se aproxima `'root'` a `admin`
 * ni `'administradora'` a `organizadora`.
 */
export function mapearRol(rolDelServidor: unknown): Rol | null {
  if (typeof rolDelServidor !== 'string') return null;
  return (ROLES as readonly string[]).includes(rolDelServidor) ? (rolDelServidor as Rol) : null;
}

/**
 * Arma la sesion `cloud`: `mis_ollas()` -> elegir olla -> `mi_rol()` ->
 * mapear. Nunca lanza: todo error se traduce a `null` con motivo, para que el
 * llamador no tenga que `try/catch` y la UI no se rompa.
 *
 * @param ollaPreferida olla guardada en el dispositivo; si no esta en la lista
 *   de `mis_ollas()`, se usa la primera. No filtra: la lista es del servidor.
 */
export async function cargarSesionRemota(
  puertos: PuertosSesionRemota = SESION_REMOTA_PENDIENTE,
  ollaPreferida?: string,
): Promise<ResultadoSesionRemota> {
  let ollas: readonly string[];
  try {
    ollas = (await puertos.listarOllas()).ollas;
  } catch (error) {
    return { sesion: null, motivo: 'error_rpc', detalle: mensajeDe(error) };
  }

  if (ollas.length === 0) {
    // Device revocado, JWT sin enrolar o cuenta sin olla: no hay sesion que
    // fabricar.
    return { sesion: null, motivo: 'sin_ollas' };
  }

  const ollaId =
    ollaPreferida !== undefined && ollas.includes(ollaPreferida) ? ollaPreferida : ollas[0]!;

  let rolCrudo: unknown;
  try {
    rolCrudo = (await puertos.consultarRol(ollaId)).rol;
  } catch (error) {
    return { sesion: null, motivo: 'error_rpc', detalle: mensajeDe(error) };
  }

  if (rolCrudo === null || rolCrudo === undefined) {
    return { sesion: null, motivo: 'sin_rol' };
  }

  const rol = mapearRol(rolCrudo);
  if (rol === null) {
    // No se aproxima: si el servidor dice algo que la UI no conoce, no se pinta
    // un rol cualquiera. El detalle lleva el valor crudo recortado (no es PII).
    return { sesion: null, motivo: 'rol_desconocido', detalle: String(rolCrudo).slice(0, 40) };
  }

  let memberId = ollaId;
  let nombreOlla = nombreDeOllaConocida(ollaId);
  if (puertos.datosOlla !== undefined) {
    try {
      const datos = await puertos.datosOlla(ollaId);
      memberId = datos.memberId;
      nombreOlla = datos.nombreOlla;
    } catch (error) {
      return { sesion: null, motivo: 'error_rpc', detalle: mensajeDe(error) };
    }
  }

  return {
    sesion: {
      memberId,
      ollaId,
      nombreOlla,
      rol,
      modo: 'cloud',
    },
  };
}

/** Nombre corto si la olla es una demo; si no, el id (no se inventa). */
function nombreDeOllaConocida(ollaId: string): string {
  return OLLAS_DEMO.find((olla) => olla.ollaId === ollaId)?.nombreOlla ?? ollaId;
}

function mensajeDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Texto humano del motivo, para que la UI no lo repita ni lo improvise. */
export const MOTIVO_SIN_SESION_REMOTA: Readonly<Record<MotivoSinSesionRemota, string>> = {
  sin_ollas: 'Tu cuenta no tiene ninguna olla asignada todavía. Se sigue en modo demo.',
  sin_rol: 'No pudimos leer tu rol en esta olla. Se sigue en modo demo.',
  rol_desconocido: 'El rol que devuelve el servidor no está entre los cuatro conocidos.',
  error_rpc: 'No hay conexión con la nube. Se sigue con la sesión local.',
  puerto_no_conectado: 'La conexión con la nube todavía no está activa (issue #62).',
} as const;