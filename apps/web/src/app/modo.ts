import { useCallback, useEffect, useState } from 'react';

/**
 * Los dos modos de la app.
 *
 * - `simple`: lo que se hace todos los dias, un objetivo por pantalla, letra
 *   grande y un boton abajo. Sirve de guion de demo: padron → servicio →
 *   comprobante → presupuesto.
 * - `avanzado`: todo lo demas (precios, entre ollas, reporte) tambien en la
 *   barra inferior, y los atajos tecnicos visibles.
 *
 * NO es una preferencia estetica: cambia que destinos existen en la barra.
 * En `simple` la barra tiene 3 destinos como maximo; en `avanzado`, 4 + "Mas".
 */
export type Modo = 'simple' | 'avanzado';

export const MODO_INICIAL: Modo = 'simple';

/**
 * Persistencia: `localStorage`, no la tabla `meta` de Dexie.
 *
 * Razon: el modo es preferencia de interfaz de ESTE dispositivo, no dato de
 * negocio de la olla. Dexie guarda lo que se sincroniza o lo que pertenece al
 * padron/servicio; meter una preferencia de UI mezcla dos vidas utiles (una
 * base que se borra al re-sembrar se llevaria el modo, y un respaldo JSON
 * exportado lo mandaria a otra tablet que no lo pidio). `localStorage` es
 * sincrono, sobrevive a la recarga y es exactamente lo que es: una eleccion
 * local. No son datos de negocio (skill pwa-offline: prohibido `localStorage`
 * para eso; aca no lo es).
 *
 * La clave lleva prefijo de la app y version: si el modelo de modos cambia,
 * la clave cambia y no se lee un valor viejo con otro significado.
 */
export const CLAVE_MODO = 'hackods:modo:v1';

function esModo(valor: unknown): valor is Modo {
  return valor === 'simple' || valor === 'avanzado';
}

/**
 * Lee el modo guardado. Nunca lanza: `localStorage` puede estar bloqueado
 * (modo privado, politicas de la tablet, cuota) y una preferencia de UI jamas
 * puede impedir que la app abra.
 */
export function leerModo(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): Modo {
  if (almacen === null) return MODO_INICIAL;
  try {
    const guardado = almacen.getItem(CLAVE_MODO);
    return esModo(guardado) ? guardado : MODO_INICIAL;
  } catch {
    return MODO_INICIAL;
  }
}

/** Guarda el modo. Devuelve `false` si el dispositivo no dejo; no es fatal. */
export function guardarModo(
  modo: Modo,
  almacen: Pick<Storage, 'setItem'> | null = almacenSeguro(),
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(CLAVE_MODO, modo);
    return true;
  } catch {
    return false;
  }
}

/** `localStorage` en jsdom y en el navegador; `null` si el acceso tira. */
function almacenSeguro(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Espeja el modo en el `<html>` para que el CSS y el lector lo vean. */
function aplicarAtributo(modo: Modo): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.modo = modo;
}

/**
 * El modo vigente y su cambio. El cambio se escribe de inmediato: no hay
 * boton "guardar" para una preferencia que se elige una vez.
 */
export function useModo(): readonly [Modo, (siguiente: Modo) => void] {
  const [modo, setModo] = useState<Modo>(() => leerModo());

  useEffect(() => {
    aplicarAtributo(modo);
  }, [modo]);

  const cambiar = useCallback((siguiente: Modo) => {
    guardarModo(siguiente);
    setModo(siguiente);
  }, []);

  return [modo, cambiar] as const;
}
