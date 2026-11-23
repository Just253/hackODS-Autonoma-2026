import { useCallback, useEffect, useState } from 'react';

/**
 * Tamano de letra de la app.
 *
 * Tres pasos, no un deslizador: en la olla se elige una vez, de pie, y despues
 * no se vuelve a tocar. Los valores existen en `tokens.css`
 * (`html[data-texto='grande' | 'enorme']`): la base pasa de 18 a 22 y a 26 px.
 * No es una preferencia estetica: es la diferencia entre leer el total de la
 * boleta al sol o pedirle a alguien que lo lea.
 *
 * Persistencia: `localStorage`, no la tabla `meta` de Dexie. Es preferencia de
 * interfaz de ESTE dispositivo, no dato de negocio de la olla; exportar un
 * respaldo JSON no tiene por que mudar el tamano de letra a otra tablet.
 * `localStorage` es sincrono, sobrevive a la recarga y no necesita red.
 */
export type TamanoTexto = 'normal' | 'grande' | 'enorme';

export const TEXTO_INICIAL: TamanoTexto = 'normal';

/**
 * La clave lleva prefijo de la app y version: si el modelo de tamanos cambia,
 * la clave cambia y no se lee un valor viejo con otro significado.
 */
export const CLAVE_TEXTO = 'hackods:texto:v1';

function esTamano(valor: unknown): valor is TamanoTexto {
  return valor === 'normal' || valor === 'grande' || valor === 'enorme';
}

/**
 * Lee el tamano guardado. Nunca lanza: `localStorage` puede estar bloqueado
 * (modo privado, politicas de la tablet, cuota) y una preferencia de interfaz
 * jamas puede impedir que la app abra.
 */
export function leerTexto(almacen: Pick<Storage, 'getItem'> | null = almacenSeguro()): TamanoTexto {
  if (almacen === null) return TEXTO_INICIAL;
  try {
    const guardado = almacen.getItem(CLAVE_TEXTO);
    return esTamano(guardado) ? guardado : TEXTO_INICIAL;
  } catch {
    return TEXTO_INICIAL;
  }
}

/** Guarda el tamano. Devuelve `false` si el dispositivo no dejo; no es fatal. */
export function guardarTexto(
  tamano: TamanoTexto,
  almacen: Pick<Storage, 'setItem'> | null = almacenSeguro(),
): boolean {
  if (almacen === null) return false;
  try {
    almacen.setItem(CLAVE_TEXTO, tamano);
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

/**
 * Espeja el tamano en el `<html>` para que el CSS lo vea. `normal` borra el
 * atributo en vez de escribir `data-texto="normal"`: el estado por defecto no
 * se declara, se hereda de `:root`.
 */
function aplicarAtributo(tamano: TamanoTexto): void {
  if (typeof document === 'undefined') return;
  if (tamano === 'normal') {
    delete document.documentElement.dataset.texto;
    return;
  }
  document.documentElement.dataset.texto = tamano;
}

/**
 * El tamano vigente y su cambio. El cambio se escribe de inmediato: no hay
 * boton "guardar" para una preferencia que se elige una vez.
 */
export function useTexto(): readonly [TamanoTexto, (siguiente: TamanoTexto) => void] {
  const [tamano, setTamano] = useState<TamanoTexto>(() => leerTexto());

  useEffect(() => {
    aplicarAtributo(tamano);
  }, [tamano]);

  const cambiar = useCallback((siguiente: TamanoTexto) => {
    guardarTexto(siguiente);
    setTamano(siguiente);
  }, []);

  return [tamano, cambiar] as const;
}
