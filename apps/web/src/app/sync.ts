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

/** Como termino la ultima sincronizacion REAL (nunca se afirma sin respuesta). */
export type TonoResultadoSync = 'enviado' | 'error' | 'conflicto';

export interface ResultadoSync {
  readonly tono: TonoResultadoSync;
  /** Texto corto para el detalle de la pastilla. */
  readonly detalle: string | null;
}

export interface EstadoSync {
  readonly tono: TonoSync;
  /** Texto corto de la pastilla del header. */
  readonly texto: string;
  /** Detalle en linea aparte, opcional. */
  readonly detalle: string | null;
  /** Ultimo resultado de push/pull. `null` = todavia no se intento. */
  readonly resultado: ResultadoSync | null;
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
let resultado: ResultadoSync | null = null;

/**
 * Resultado de la ultima sincronizacion contra el backend. Lo llama `Shell`
 * despues de `SyncRemoto.push()`/`pull()` y solo con lo que el servidor
 * confirmo. `null` borra el aviso (vuelve a "En este dispositivo").
 */
export function fijarResultadoSync(siguiente: ResultadoSync | null): void {
  if (
    resultado === siguiente ||
    (resultado !== null &&
      siguiente !== null &&
      resultado.tono === siguiente.tono &&
      resultado.detalle === siguiente.detalle)
  ) {
    return;
  }
  resultado = siguiente;
  avisar();
}

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

function componer(red: boolean, n: number, ultimo: ResultadoSync | null): EstadoSync {
  if (!red) {
    return {
      tono: 'sin-conexion',
      texto: 'Sin conexión',
      detalle: 'Se guarda en este dispositivo',
      resultado: ultimo,
    };
  }
  return {
    tono: 'local',
    texto: 'En este dispositivo',
    detalle: n === 0 ? null : `${n} ${n === 1 ? 'persona' : 'personas'}`,
    resultado: ultimo,
  };
}

/**
 * Snapshot estable: `useSyncExternalStore` compara por identidad y un objeto
 * nuevo en cada render provocaria un bucle. Se recompone solo si cambio algo.
 */
let cache: {
  readonly red: boolean;
  readonly n: number;
  readonly resultado: ResultadoSync | null;
  readonly valor: EstadoSync;
} = {
  red: true,
  n: -1,
  resultado: null,
  valor: componer(true, 0, null),
};

function snapshot(): EstadoSync {
  const red = hayRed();
  if (cache.red === red && cache.n === personas && cache.resultado === resultado) {
    return cache.valor;
  }
  cache = { red, n: personas, resultado, valor: componer(red, personas, resultado) };
  return cache.valor;
}

export function useEstadoSync(): EstadoSync {
  return useSyncExternalStore(suscribir, snapshot, snapshot);
}

/** Solo para tests: deja el contador y el resultado de sync en cero. */
export function reiniciarEstadoSync(): void {
  personas = 0;
  resultado = null;
  cache = { red: true, n: -1, resultado: null, valor: componer(true, 0, null) };
}
