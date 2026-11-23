/**
 * Puerto de lectura remota: lo MINIMO que usan las queries de `remoto.ts` y lo
 * que un test puede reemplazar sin red ni SDK.
 *
 * Por que un puerto y no `SupabaseClient` a secas: la pantalla y sus tests no
 * tienen que cargar el SDK ni saber de PostgREST. El cliente real lo adapta
 * `supabase.ts` (`clienteDeDatos`); en tests se inyecta un doble que devuelve
 * filas fijas o un error, y asi se prueba el camino de datos sin tocar la red.
 *
 * Es SOLO lectura: `select`, filtro por igualdad, orden y limite. Las escrituras
 * de la PWA siguen yendo por el outbox (`apps/web/AGENTS.md` §1).
 */

/** Respuesta minima de PostgREST: filas o error, nunca las dos. */
export interface RespuestaFilas<Fila> {
  readonly data: Fila[] | null;
  readonly error: { readonly message: string } | null;
}

/**
 * Consulta en construccion. Es `PromiseLike` (se `await`ea igual que la del SDK)
 * y encadena igual que PostgREST.
 */
export interface ConsultaFilas<Fila> extends PromiseLike<RespuestaFilas<Fila>> {
  eq(columna: string, valor: string): ConsultaFilas<Fila>;
  order(columna: string, opciones?: { readonly ascending?: boolean }): ConsultaFilas<Fila>;
  limit(cantidad: number): ConsultaFilas<Fila>;
}

export interface ClienteDatos {
  from(tabla: string): {
    select: <Fila>(columnas: string) => ConsultaFilas<Fila>;
  };
}

/** Por que una lectura no trajo datos. */
export type MotivoFallo = 'sin_configurar' | 'error';

/**
 * Resultado de una lectura remota. No se lanza: la pantalla tiene que poder
 * decir "sin dato" sin que un rechazo se lleve el render. `error` es un fallo
 * real (red, RLS, respuesta invalida); `sin_configurar` es que este build no
 * trae `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
 */
export type ResultadoRemoto<T> =
  | { readonly ok: true; readonly datos: T }
  | { readonly ok: false; readonly motivo: MotivoFallo; readonly mensaje: string };

/** Atajo para el caso "no hay cliente": no es un error de red. */
export function sinConfigurar<T>(): ResultadoRemoto<T> {
  return {
    ok: false,
    motivo: 'sin_configurar',
    mensaje: 'Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en este build.',
  };
}
