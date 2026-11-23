import { useSyncExternalStore } from 'react';

/**
 * Estado de sincronizacion para el header.
 *
 * Honestidad ante todo (skill `pwa-offline`): `navigator.onLine` MIENTE y esta
 * app todavia no tiene adaptador remoto conectado — lo que se guarda queda en
 * Dexie y nada sale a la red. Por eso el header NO dice "sincronizado" ni
 * "al dia": dice "En este dispositivo", que es exactamente cierto.
 *
 * Si el navegador dice que no hay red, tambien se dice: es informacion util
 * para la cocinera ("la red no hizo falta"), no una excusa para bloquear nada.
 *
 * El conteo llega de `Shell`, que ya lee el padron en su efecto
 * (`fijarPersonasGuardadas`): asi el header no abre una segunda conexion a
 * Dexie que competiria con la pantalla. No hay `fetch` en ningun camino.
 */

export type TonoSync = 'local' | 'sin-conexion';

export interface EstadoSync {
  readonly tono: TonoSync;
  /** Texto corto de la pastilla del header. */
  readonly texto: string;
  /** Detalle en linea aparte, opcional. */
  readonly detalle: string | null;
}

function hayRed(): boolean {
  // En jsdom `onLine` puede faltar: sin dato, no se afirma que falte.
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/* --- Suscripcion ---------------------------------------------------------- */

const escuchas = new Set<() => void>();

function avisar(): void {
  for (const escucha of escuchas) escucha();
}

function suscribir(escucha: () => void): () => void {
  escuchas.add(escucha);
  const alCambiarRed = (): void => avisar();
  if (typeof window !== 'undefined') {
    window.addEventListener('online', alCambiarRed);
    window.addEventListener('offline', alCambiarRed);
  }
  return () => {
    escuchas.delete(escucha);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', alCambiarRed);
      window.removeEventListener('offline', alCambiarRed);
    }
  };
}

/* --- Estado --------------------------------------------------------------- */

let personas = 0;

/**
 * Lo llama la pantalla despues de leer o escribir el padron. Es la unica via
 * de entrada del conteo: el header no consulta IndexedDB por su cuenta.
 */
export function fijarPersonasGuardadas(cantidad: number): void {
  if (cantidad === personas) return;
  personas = cantidad;
  avisar();
}

/**
 * Una escritura local (alta, racion) movio el padron. `Shell` recomputa el
 * conteo en su efecto al cambiar de ruta; este aviso cubre el caso de una alta
 * sin cambio de ruta, que es cuando la cifra del header se quedaria vieja.
 */
export function avisarCambioLocal(): void {
  avisar();
}

/**
 * Suscribe a los avisos de escritura local (no a los de red). Devuelve como
 * desuscribirse. Lo usa `Shell` para volver a contar el padron.
 */
export function alAvisarCambio(escucha: () => void): () => void {
  escuchas.add(escucha);
  return () => {
    escuchas.delete(escucha);
  };
}

/** Cuantas personas reporto el ultimo conteo (para quien quiera el numero). */
export function personasGuardadas(): number {
  return personas;
}

function componer(red: boolean, n: number): EstadoSync {
  if (!red) {
    return { tono: 'sin-conexion', texto: 'Sin conexión', detalle: 'Se guarda en este dispositivo' };
  }
  return {
    tono: 'local',
    texto: 'En este dispositivo',
    detalle: n === 0 ? null : `${n} ${n === 1 ? 'persona' : 'personas'}`,
  };
}

/**
 * Snapshot estable: `useSyncExternalStore` compara por identidad y un objeto
 * nuevo en cada render provocaria un bucle. Se recompone solo si cambio algo.
 */
let cache: { readonly red: boolean; readonly n: number; readonly valor: EstadoSync } = {
  red: true,
  n: -1,
  valor: componer(true, 0),
};

function snapshot(): EstadoSync {
  const red = hayRed();
  if (cache.red === red && cache.n === personas) return cache.valor;
  cache = { red, n: personas, valor: componer(red, personas) };
  return cache.valor;
}

export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(suscribir, snapshot, snapshot);
}

/** Solo para tests: deja el contador en cero. */
export function reiniciarEstadoSync(): void {
  personas = 0;
  cache = { red: true, n: -1, valor: componer(true, 0) };
}
