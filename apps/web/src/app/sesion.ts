import { useCallback, useEffect, useState } from 'react';

/**
 * Sesion de contexto (FE-01, DEC-20261123-1358-8feaf9).
 *
 * Toda pantalla vive dentro de una sesion `{memberId, ollaId, nombreOlla, rol}`.
 * Este modulo es SOLO eso: quien soy, en que olla y con que rol. La navegacion
 * por rol y las guardas de ruta/accion son FE-02: aca no se decide que se ve,
 * solo de donde se lee.
 *
 * Origen de la sesion:
 *
 * - `demo` → la elige la persona desde el selector de la hoja de ajustes y se
 *   persiste en `localStorage`, igual que el tamano de letra (`app/texto.ts`).
 *   El rol se puede cambiar sin red y sin sesion de servidor: es una demo.
 * - `cloud` → sale del JWT (`olla_members`), no de la UI. Mientras el
 *   enrolamiento no este conectado, `cloud` es solo un modo en el que el
 *   selector de rol NO se ofrece: no se puede "ascender" tocando un boton.
 *   TODO(#62): leer la sesion del JWT y poblar `memberId`, `ollaId` y `rol` en
 *   vez de la demo por defecto.
 *
 * Persistencia y por que `localStorage` y no Dexie:
 *
 * La sesion es una preferencia de ESTE dispositivo, como el tamano de letra:
 * exportar un respaldo de la olla no tiene por que mudarle el rol a otra
 * tablet, y una tablet nueva debe abrir en un estado sano aunque la base de
 * esa olla todavia no exista. Guardar la sesion en Dexie obligaria a abrir
 * IndexedDB antes de pintar el header y a migrar el esquema de cada olla para
 * un dato que no es de negocio. `localStorage` es sincrono, sobrevive la
 * recarga y no necesita red. El dato es ficticio: no hay PII ni token.
 */
export type Rol = 'cocinera' | 'organizadora' | 'nutricionista' | 'admin';
export type ModoSesion = 'demo' | 'cloud';

export interface Sesion {
  /** Id del miembro en `olla_members`. Ficticio en demo; del JWT en cloud. */
  readonly memberId: string;
  readonly ollaId: string;
  /** Nombre visible de la olla, sin el prefijo "Olla": el divisor lo agrega. */
  readonly nombreOlla: string;
  readonly rol: Rol;
  readonly modo: ModoSesion;
}

/**
 * Clave con prefijo y version, como `CLAVE_TEXTO`: si el modelo cambia, no se
 * lee un valor viejo con otro significado.
 */
export const CLAVE_SESION = 'hackods:sesion:v1';

export const ROLES: readonly Rol[] = ['cocinera', 'organizadora', 'nutricionista', 'admin'] as const;

/**
 * Opciones de olla del modo demo. Los ids y nombres son ficticios y estables:
 * el guion de la demo depende de que "Olla San Juan" exista siempre. La olla
 * canonica de la base es `OLLA_DEMO` (`data/repositorio.ts`).
 */
export const OLLAS_DEMO: readonly { readonly ollaId: string; readonly nombreOlla: string }[] = [
  { ollaId: 'olla-demo-01', nombreOlla: 'San Juan' },
  { ollaId: 'olla-demo-02', nombreOlla: 'Santa Rosa' },
] as const;

/**
 * Sesion por defecto cuando no hay nada guardado: cocinera en la olla demo.
 *
 * Es a proposito. La demo del guion arranca sin friccion: la primera pantalla
 * que ve el jurado es el padron de una cocinera, no un formulario de login que
 * la PWA todavia no tiene. Que quede explicito: esto NO es una autenticacion,
 * es el punto de partida del modo demo.
 */
export const SESION_INICIAL: Sesion = {
  memberId: 'miembro-demo-01',
  ollaId: 'olla-demo-01',
  nombreOlla: 'San Juan',
  rol: 'cocinera',
  modo: 'demo',
} as const;

/** Etiqueta legible del rol, la que se lee en el divisor y en el selector. */
export const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  cocinera: 'Cocinera',
  organizadora: 'Organizadora',
  nutricionista: 'Nutricionista',
  admin: 'Administración',
} as const;

function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor);
}

function esModo(valor: unknown): valor is ModoSesion {
  return valor === 'demo' || valor === 'cloud';
}

/**
 * Valida lo que salio del almacen. Un objeto a medias (otra version, edicion a
 * mano, cuota a medio escribir) no puede dejar la app sin rol: si falta un
 * campo, se cae a la sesion inicial entera en vez de mezclar mitades.
 */
export function parsearSesion(crudo: unknown): Sesion {
  if (typeof crudo !== 'object' || crudo === null) return SESION_INICIAL;
  const objeto = crudo as Record<string, unknown>;
  const { memberId, ollaId, nombreOlla, rol, modo } = objeto;
  if (
    typeof memberId !== 'string' ||
    typeof ollaId !== 'string' ||
    typeof nombreOlla !== 'string' ||
    !esRol(rol) ||
    !esModo(modo)
  ) {
    return SESION_INICIAL;
  }
  return { memberId, ollaId, nombreOlla, rol, modo };
}

/** `localStorage` en jsdom y en el navegador; `null` si el acceso tira. */
function almacenSeguro(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Lee la sesion guardada. Nunca lanza: una preferencia de contexto jamas puede
 * impedir que la app abra (mismo criterio que `leerTexto`).
 */
export function leerSesion(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Sesion {
  if (almacen === null) return SESION_INICIAL;
  try {
    const guardado = almacen.getItem(CLAVE_SESION);
    if (guardado === null) return SESION_INICIAL;
    return parsearSesion(JSON.parse(guardado));
  } catch {
    return SESION_INICIAL;
  }
}

/** Guarda la sesion. Devuelve `false` si el dispositivo no dejo; no es fatal. */
export function guardarSesion(
  sesion: Sesion,
  almacen: Pick<Storage, 'setItem'> | null = almacenSeguro(),
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(CLAVE_SESION, JSON.stringify(sesion));
    return true;
  } catch {
    return false;
  }
}

/* --- Sesion remota: la escribe `app/cuenta.ts`, no la UI ------------------ */

/**
 * Avisos de cambio de sesion. `useCuenta` resuelve la sesion de Supabase y la
 * guarda aca; el `Shell` y las pantallas se enteran por este canal, sin
 * recargar la pagina. Es el mismo patron que `app/sync.ts`.
 */
const oyentesSesion = new Set<() => void>();

function avisarSesion(): void {
  for (const oyente of oyentesSesion) oyente();
}

/** Desuscribirse. Solo lo usan `useSesion` y los tests. */
export function suscribirSesion(oyente: () => void): () => void {
  oyentesSesion.add(oyente);
  return () => {
    oyentesSesion.delete(oyente);
  };
}

/**
 * Fija la sesion que resolvio el servidor (`olla_members` + `ollas`) y la
 * persiste: al recargar, la app abre ya en la olla y el rol reales. La sesion
 * cloud manda sobre la demo: `cambiarRol`/`cambiarOlla` no la tocan.
 */
export function fijarSesionRemota(sesion: Sesion): void {
  guardarSesion(sesion);
  avisarSesion();
}

/**
 * Vuelve al punto de partida demo: borra la sesion guardada (no la pisa con un
 * rol inventado) y avisa. Lo llama `salir` y el caso "cuenta sin olla".
 */
export function volverASesionDemo(): void {
  const almacen = almacenSeguro();
  try {
    almacen?.removeItem(CLAVE_SESION);
  } catch {
    /* modo privado o cuota: igual se avisa y se relee */
  }
  avisarSesion();
}

/**
 * Cambia el rol. En `cloud` no se toca: la sesion la decide el servidor y la UI
 * no puede "ascender" a nadie. Devuelve la sesion resultante (la misma si el
 * modo es cloud), para que el llamador no crea que el cambio se aplico.
 */
export function cambiarRol(sesion: Sesion, rol: Rol): Sesion {
  if (sesion.modo === 'cloud') return sesion;
  return { ...sesion, rol };
}

/** Cambia la olla. Solo en demo: en cloud la olla sale del JWT. */
export function cambiarOlla(sesion: Sesion, ollaId: string): Sesion {
  if (sesion.modo === 'cloud') return sesion;
  const olla = OLLAS_DEMO.find((o) => o.ollaId === ollaId);
  if (olla === undefined) return sesion;
  return { ...sesion, ollaId: olla.ollaId, nombreOlla: olla.nombreOlla };
}

/**
 * Texto del divisor de contexto: `Olla San Juan · Cocinera`.
 *
 * La olla y el rol se leen como TEXTO, no solo como color: en una tablet al sol
 * el color no se distingue, y el lector de pantalla necesita la palabra.
 */
export function textoDivisor(sesion: Sesion): string {
  return `Olla ${sesion.nombreOlla} · ${ETIQUETA_ROL[sesion.rol]}`;
}

/**
 * La sesion vigente y su cambio. El cambio se escribe y se persiste de
 * inmediato: no hay boton "guardar" para un contexto que se elige una vez.
 *
 * En `cloud` las funciones de cambio son no-op (devuelven la misma sesion):
 * el selector de rol no se ofrece, y aunque se llamara, no cambia nada.
 */
export interface ControlSesion {
  readonly sesion: Sesion;
  readonly cambiarRol: (rol: Rol) => void;
  readonly cambiarOlla: (ollaId: string) => void;
  /** `false` si la sesion no se pudo persistir (cuota, modo privado). */
  readonly guardada: boolean;
}

export function useSesion(): ControlSesion {
  const [sesion, setSesion] = useState<Sesion>(() => leerSesion());
  const [guardada, setGuardada] = useState(true);

  useEffect(() => {
    setGuardada(guardarSesion(sesion));
  }, [sesion]);

  // La sesion tambien cambia por fuera de este hook: `app/cuenta.ts` la resuelve
  // de Supabase y avisa. Se relee del almacen (una sola fuente) en vez de
  // duplicar el estado en dos lugares.
  useEffect(() => {
    return suscribirSesion(() => setSesion(leerSesion()));
  }, []);

  const cambiarRolFn = useCallback((rol: Rol) => {
    setSesion((anterior) => cambiarRol(anterior, rol));
  }, []);

  const cambiarOllaFn = useCallback((ollaId: string) => {
    setSesion((anterior) => cambiarOlla(anterior, ollaId));
  }, []);

  return { sesion, cambiarRol: cambiarRolFn, cambiarOlla: cambiarOllaFn, guardada };
}
