/**
 * Lecturas de Supabase para las pantallas. Sin logica de negocio: traen filas,
 * las nombran en el idioma del cliente y devuelven `ResultadoRemoto` (no lanzan).
 *
 * Por que aca y no en el componente: la pantalla no sabe de tablas, columnas ni
 * RLS (`apps/web/AGENTS.md`). Si una fila no aparece, se devuelve lo que hay; el
 * "sin dato" lo decide quien pinta. Nunca se completa con fixtures.
 *
 * Que ve cada consulta lo decide el servidor: todas las tablas tienen RLS por
 * `app.mis_ollas()` (`supabase/migrations/20261123150000_modelo_base.sql`). Sin
 * JWT de `authenticated` estas queries vuelven vacias aunque el cliente exista;
 * por eso el login es parte del flujo.
 *
 * Salud (peso, talla, anemia, consentimiento) NO se pide: el padron muestra
 * codigo y categoria (DEC-2026-0002). La columna se elige a mano, no con `*`.
 */
import {
  sinConfigurar,
  type ClienteDatos,
  type ConsultaFilas,
  type ResultadoRemoto,
} from './cliente-remoto.js';
import { clienteDeDatos } from './supabase.js';

/* --- Columnas: una por una, para que "sin salud" no dependa de la memoria --- */
const COLUMNAS_OLLA = 'id, titulo, distrito';
const COLUMNAS_PERSONA = 'codigo_p, categoria, olla_id';
const COLUMNAS_PRECIO = 'olla_id, insumo_id, canal, unidad, precio, fecha';
const COLUMNAS_INSUMO = 'id, denominacion';
const COLUMNAS_MOVIMIENTO = 'olla_id, insumo_id, delta, motivo, at';
const COLUMNAS_DISPOSITIVO = 'member_id';
const COLUMNAS_MEMBRESIA = 'member_id, olla_id, rol';

/* --- Lo que consume la UI (camelCase, sin columnas internas) -------------- */

export interface OllaRemota {
  readonly id: string;
  readonly titulo: string;
  readonly distrito: string | null;
}

export interface PersonaRemota {
  readonly codigoP: string;
  readonly categoria: string;
  readonly ollaId: string;
}

export interface PrecioRemoto {
  readonly insumoId: string;
  /** Denominacion del catalogo de la olla; si falta la fila, el id. */
  readonly insumo: string;
  readonly canal: string;
  readonly unidad: string;
  /** El valor tal como esta en la base (entero; la conversion es de la pantalla). */
  readonly precio: number;
  /** `AAAA-MM-DD`. */
  readonly fecha: string;
}

export interface MovimientoRemoto {
  readonly insumoId: string;
  readonly insumo: string;
  readonly delta: number;
  readonly motivo: string;
  /** ISO 8601 del movimiento. */
  readonly at: string;
}

export type RolRemoto = 'cocinera' | 'organizadora' | 'nutricionista' | 'admin';

/**
 * Membresia del usuario autenticado. `nombreOlla` ya viene sin el prefijo
 * "Olla ": el divisor del cascaron lo agrega (`app/sesion.ts`).
 */
export interface MembresiaRemota {
  readonly memberId: string;
  readonly ollaId: string;
  readonly nombreOlla: string;
  readonly rol: RolRemoto;
}

/* --- Filas crudas de PostgREST -------------------------------------------- */

interface FilaOlla {
  readonly id: string;
  readonly titulo: string;
  readonly distrito: string | null;
}

interface FilaPersona {
  readonly codigo_p: string;
  readonly categoria: string;
  readonly olla_id: string;
}

interface FilaPrecio {
  readonly insumo_id: string;
  readonly canal: string;
  readonly unidad: string;
  readonly precio: number | string;
  readonly fecha: string;
}

interface FilaInsumo {
  readonly id: string;
  readonly denominacion: string;
}

interface FilaMovimiento {
  readonly insumo_id: string;
  readonly delta: number | string;
  readonly motivo: string;
  readonly at: string;
}

interface FilaDispositivo {
  readonly member_id: string;
}

interface FilaMembresia {
  readonly member_id: string;
  readonly olla_id: string;
  readonly rol: string;
}

/* --- Utilidades ----------------------------------------------------------- */

/**
 * Ejecuta una consulta ya armada. Un rechazo (sin red, DNS, CORS) y un `error`
 * de PostgREST terminan en el MISMO resultado: la pantalla no distingue "no
 * hay red" de "el servidor dijo no"; en los dos casos no hay dato y no se
 * inventa.
 */
async function leerFilas<Fila>(
  consulta: ConsultaFilas<Fila>,
): Promise<ResultadoRemoto<readonly Fila[]>> {
  try {
    const { data, error } = await consulta;
    if (error !== null) {
      return { ok: false, motivo: 'error', mensaje: error.message };
    }
    return { ok: true, datos: data ?? [] };
  } catch (fallo) {
    return {
      ok: false,
      motivo: 'error',
      mensaje: fallo instanceof Error ? fallo.message : 'No hubo respuesta del servidor.',
    };
  }
}

const ROLES_VALIDOS: readonly RolRemoto[] = [
  'cocinera',
  'organizadora',
  'nutricionista',
  'admin',
] as const;

function esRol(valor: string): valor is RolRemoto {
  return (ROLES_VALIDOS as readonly string[]).includes(valor);
}

/** "Olla Demo Ate" -> "Demo Ate". Solo el prefijo que agrega el divisor. */
export function sinPrefijoOlla(titulo: string): string {
  return titulo.replace(/^olla\s+/i, '').trim();
}

function numero(valor: number | string): number {
  return typeof valor === 'number' ? valor : Number(valor);
}

/* --- Queries -------------------------------------------------------------- */

/** Las ollas que el JWT puede ver (RLS: `app.mis_ollas()`). */
export async function listarOllas(
  cliente: ClienteDatos | null = clienteDeDatos(),
): Promise<ResultadoRemoto<readonly OllaRemota[]>> {
  if (cliente === null) return sinConfigurar();
  const filas = await leerFilas<FilaOlla>(
    cliente.from('ollas').select<FilaOlla>(COLUMNAS_OLLA).order('titulo'),
  );
  if (!filas.ok) return filas;
  return {
    ok: true,
    datos: filas.datos.map((fila) => ({
      id: fila.id,
      titulo: fila.titulo,
      distrito: fila.distrito,
    })),
  };
}

/** El padron de una olla: codigo P y categoria. Sin columnas de salud. */
export async function listarPersonas(
  ollaId: string,
  cliente: ClienteDatos | null = clienteDeDatos(),
): Promise<ResultadoRemoto<readonly PersonaRemota[]>> {
  if (cliente === null) return sinConfigurar();
  const filas = await leerFilas<FilaPersona>(
    cliente.from('personas').select<FilaPersona>(COLUMNAS_PERSONA).eq('olla_id', ollaId).order('codigo_p'),
  );
  if (!filas.ok) return filas;
  return {
    ok: true,
    datos: filas.datos.map((fila) => ({
      codigoP: fila.codigo_p,
      categoria: fila.categoria,
      ollaId: fila.olla_id,
    })),
  };
}

/**
 * Serie de precios de la olla: una fila por observacion, con la denominacion del
 * insumo resuelta contra `insumos`. Dos viajes en vez de un `select` anidado:
 * cada tabla tiene su policy y asi el test puede dar una tabla por vez.
 *
 * Si la fila de `insumos` no aparece, el nombre cae al id (dato real, no
 * inventado): mejor "papa" que una observacion sin nombre.
 */
export async function seriePrecios(
  ollaId: string,
  cliente: ClienteDatos | null = clienteDeDatos(),
): Promise<ResultadoRemoto<readonly PrecioRemoto[]>> {
  if (cliente === null) return sinConfigurar();
  const precios = await leerFilas<FilaPrecio>(
    cliente.from('precios').select<FilaPrecio>(COLUMNAS_PRECIO).eq('olla_id', ollaId).order('fecha'),
  );
  if (!precios.ok) return precios;
  const insumos = await leerFilas<FilaInsumo>(
    cliente.from('insumos').select<FilaInsumo>(COLUMNAS_INSUMO).eq('olla_id', ollaId),
  );
  if (!insumos.ok) return insumos;
  const nombre = new Map(insumos.datos.map((fila) => [fila.id, fila.denominacion]));
  return {
    ok: true,
    datos: precios.datos.map((fila) => ({
      insumoId: fila.insumo_id,
      insumo: nombre.get(fila.insumo_id) ?? fila.insumo_id,
      canal: fila.canal,
      unidad: fila.unidad,
      precio: numero(fila.precio),
      fecha: fila.fecha,
    })),
  };
}

/** Los ultimos movimientos de despensa de la olla, del mas nuevo al mas viejo. */
export async function ultimosMovimientos(
  ollaId: string,
  cliente: ClienteDatos | null = clienteDeDatos(),
  cantidad = 20,
): Promise<ResultadoRemoto<readonly MovimientoRemoto[]>> {
  if (cliente === null) return sinConfigurar();
  const movimientos = await leerFilas<FilaMovimiento>(
    cliente
      .from('movimientos')
      .select<FilaMovimiento>(COLUMNAS_MOVIMIENTO)
      .eq('olla_id', ollaId)
      .order('at', { ascending: false })
      .limit(cantidad),
  );
  if (!movimientos.ok) return movimientos;
  const insumos = await leerFilas<FilaInsumo>(
    cliente.from('insumos').select<FilaInsumo>(COLUMNAS_INSUMO).eq('olla_id', ollaId),
  );
  if (!insumos.ok) return insumos;
  const nombre = new Map(insumos.datos.map((fila) => [fila.id, fila.denominacion]));
  return {
    ok: true,
    datos: movimientos.datos.map((fila) => ({
      insumoId: fila.insumo_id,
      insumo: nombre.get(fila.insumo_id) ?? fila.insumo_id,
      delta: numero(fila.delta),
      motivo: fila.motivo,
      at: fila.at,
    })),
  };
}

/**
 * La sesion real del usuario autenticado: `devices` -> `olla_members` -> `ollas`.
 *
 * Tres consultas, no una, porque cada policy filtra una cosa: `devices` solo
 * devuelve MI fila (`user_id = auth.uid()`) y eso da el `member_id`; sin ese
 * paso, `olla_members_select` devuelve todos los miembros de mis ollas y
 * tomaria el rol de otra persona. Con varias ollas se elige la primera por
 * `olla_id` (determinista); el resto queda para cuando exista el cambio de olla.
 *
 * Devuelve `null` si el usuario no esta enrolado o si la olla no se puede leer:
 * ahi la UI dice que falta asignacion, no inventa un rol.
 */
export async function membresiaDelUsuario(
  cliente: ClienteDatos | null = clienteDeDatos(),
): Promise<MembresiaRemota | null> {
  if (cliente === null) return null;

  const dispositivos = await leerFilas<FilaDispositivo>(
    cliente.from('devices').select<FilaDispositivo>(COLUMNAS_DISPOSITIVO),
  );
  const memberId = dispositivos.ok ? dispositivos.datos[0]?.member_id : undefined;
  if (memberId === undefined) return null;

  const membresias = await leerFilas<FilaMembresia>(
    cliente.from('olla_members').select<FilaMembresia>(COLUMNAS_MEMBRESIA).eq('member_id', memberId).order('olla_id'),
  );
  if (!membresias.ok) return null;
  const primera = membresias.datos.find((fila) => esRol(fila.rol));
  if (primera === undefined) return null;
  const rol = primera.rol;
  if (!esRol(rol)) return null;

  const ollas = await leerFilas<FilaOlla>(
    cliente.from('ollas').select<FilaOlla>(COLUMNAS_OLLA).eq('id', primera.olla_id),
  );
  const olla = ollas.ok ? ollas.datos[0] : undefined;
  if (olla === undefined) return null;

  return {
    memberId: primera.member_id,
    ollaId: primera.olla_id,
    nombreOlla: sinPrefijoOlla(olla.titulo),
    rol,
  };
}
