/**
 * Umbrales de clasificacion de productos (docs/contracts/clasificacion.md §4.3).
 *
 * Estos valores son **de arranque**, no una verdad: salen de una calibracion con
 * el set etiquetado de 100 items. Para cambiarlos no se toca codigo: se corre el
 * benchmark y se reemplazan aca. Calibrar con `11-ollama-embeddings.md`.
 *
 * El umbral es del **modelo**, no del producto: si se cambia de embeddings
 * (por ejemplo bge-m3 1024 dim por embeddinggemma-2 768 dim), hay que recalibrar.
 */

/** Similitud minima del top-1 para sugerencia fuerte. */
export const TAU = 0.62;

/** Separacion minima `s1 - s2` para no quedar empatado. */
export const MARGEN = 0.04;

/** Debajo de este piso el item queda `desconocido`, sin sugerencia. */
export const PISO = 0.45;

/** Observaciones de la mediana movil de precios (P1). */
export const N_MEDIANA = 7;

/** Umbral del z modificado sobre MAD (P3, Iglewicz-Hoaglin). */
export const MAD_Z = 3.5;

/** Minimo de observaciones para publicar una tendencia (P1). */
export const N_MINIMO_MEDIANA = 3;

/** Guarda de cordura de precio: fuera de `[P50/3, 3xP50]` es sospechoso (P4). */
export const RANGO_PRECIO_FACTOR = 3;

export const CONFIG_CLASIFICACION = {
  tau: TAU,
  margen: MARGEN,
  piso: PISO,
  nMediana: N_MEDIANA,
  madZ: MAD_Z,
  nMinimoMediana: N_MINIMO_MEDIANA,
  rangoPrecioFactor: RANGO_PRECIO_FACTOR,
} as const;

export type ConfiguracionClasificacion = typeof CONFIG_CLASIFICACION;
