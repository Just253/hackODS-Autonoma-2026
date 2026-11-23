/**
 * Tendencia del precio contra la MEDIANA de dos ventanas (D8, contrato §8.2).
 *
 *   M_actual = mediana de las últimas N observaciones válidas de la ventana actual
 *   M_previa = mediana de las últimas N observaciones válidas de la ventana previa
 *   var_pct  = (M_actual - M_previa) / M_previa * 100      (si M_previa > 0)
 *
 * La mediana y el filtro MAD salen de `@hackods/domain` (`medianaMovil`,
 * `mediana`). Aquí NO se promedia: un solo error de unidad mueve el promedio
 * (ver el outlier del pollo). Si falta una ventana, es `sin_dato`.
 */
import {
  mediana,
  medianaMovil,
  redondearMitadArriba,
  type ObservacionPrecio,
  type ResultadoSerie,
} from './dominio';

export interface OpcionesTendencia {
  /** Observaciones de la ventana actual (más recientes). */
  readonly ventanaActual: readonly ObservacionPrecio[];
  /** Observaciones de la ventana previa (las anteriores). */
  readonly ventanaPrevia: readonly ObservacionPrecio[];
  /** N de la mediana móvil (default del dominio: 7). */
  readonly n?: number;
}

export type MotivoSinDato = 'ventana_actual_insuficiente' | 'ventana_previa_insuficiente' | 'sin_previa';

export interface Tendencia {
  readonly serieActual: ResultadoSerie;
  readonly seriePrevia: ResultadoSerie;
  readonly medianaActual: number | null;
  readonly medianaPrevia: number | null;
  /** Variación en puntos base (10000 = 100 %). `null` si no hay tendencia. */
  readonly variacionBp: number | null;
  /** `true` cuando se debe mostrar "sin dato" en vez de una flecha. */
  readonly sinDato: boolean;
  readonly motivo: MotivoSinDato | null;
}

/** Calcula la tendencia por mediana. Nunca interpola: si falta, `sinDato`. */
export function calcularTendencia(opciones: OpcionesTendencia): Tendencia {
  const serieActual = medianaMovil(opciones.ventanaActual, { n: opciones.n });
  const seriePrevia = medianaMovil(opciones.ventanaPrevia, { n: opciones.n });

  const medianaActual = serieActual.mediana === null ? null : Number(serieActual.mediana);
  const medianaPrevia = seriePrevia.mediana === null ? null : Number(seriePrevia.mediana);

  if (serieActual.muestraInsuficiente || medianaActual === null) {
    return {
      serieActual,
      seriePrevia,
      medianaActual,
      medianaPrevia,
      variacionBp: null,
      sinDato: true,
      motivo: 'ventana_actual_insuficiente',
    };
  }
  if (opciones.ventanaPrevia.length === 0) {
    return {
      serieActual,
      seriePrevia,
      medianaActual,
      medianaPrevia,
      variacionBp: null,
      sinDato: true,
      motivo: 'sin_previa',
    };
  }
  if (seriePrevia.muestraInsuficiente || medianaPrevia === null || medianaPrevia <= 0) {
    return {
      serieActual,
      seriePrevia,
      medianaActual,
      medianaPrevia,
      variacionBp: null,
      sinDato: true,
      motivo: 'ventana_previa_insuficiente',
    };
  }

  // (M_actual - M_previa) / M_previa * 100, en puntos base, redondeo entero.
  const variacionBp = redondearMitadArriba((10_000 * (medianaActual - medianaPrevia)) / medianaPrevia);
  return {
    serieActual,
    seriePrevia,
    medianaActual,
    medianaPrevia,
    variacionBp,
    sinDato: false,
    motivo: null,
  };
}

/** Promedio descartado a propósito; sólo existe para demostrar el rojo→verde. */
export function promedioParaPrueba(valores: readonly number[]): number | null {
  if (valores.length === 0) {
    return null;
  }
  return redondearMitadArriba(valores.reduce((a, b) => a + b, 0) / valores.length);
}

/** Mediana reutilizada (reexport por claridad en el test). */
export { mediana };
