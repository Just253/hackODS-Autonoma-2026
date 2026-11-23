/**
 * Seis productos de la olla, con dos ventanas de observaciones cada uno.
 *
 * Ficticio y determinista: ningun proveedor ni persona real. Las ventanas son
 * simetricas alrededor de la mediana que se quiere mostrar (7 valores, un paso
 * fijo), asi el resultado no depende del orden ni del azar y el test puede
 * afirmar la mediana y la variacion exactas. El pollo reusa la serie de
 * `precios-demo.ts` porque trae el atipico de unidad (x10) que el filtro MAD
 * debe excluir: es el caso que se muestra destacado.
 *
 * El calculo NO vive aca: la pantalla llama a `calcularTendencia`, que usa
 * `medianaMovil` de `@hackods/domain`.
 */
import type { Microcentesimos } from '@hackods/contracts';
import type { ObservacionPrecio } from '@hackods/domain';

import { POLLO_ACTUAL, POLLO_PREVIA } from './precios-demo.js';

/** Fechas de la ventana previa y de la actual (semanales, como la mediana de 7). */
const FECHAS_PREVIAS = [
  '2026-09-17',
  '2026-09-24',
  '2026-10-01',
  '2026-10-08',
  '2026-10-15',
  '2026-10-22',
  '2026-10-29',
] as const;

const FECHAS_ACTUALES = [
  '2026-11-01',
  '2026-11-04',
  '2026-11-07',
  '2026-11-10',
  '2026-11-13',
  '2026-11-16',
  '2026-11-19',
] as const;

/** Siete posiciones: la cuarta es la mediana exacta. */
const DELTAS = [-3, -2, -1, 0, 1, 2, 3] as const;

const micro = (valor: number): Microcentesimos => valor as Microcentesimos;

interface Reemplazo {
  readonly indice: number;
  readonly valor: number;
}

/**
 * Ventana de siete observaciones alrededor de `centro`. `paso` separa una de
 * otra; `reemplazo` mete un valor absurdo (el error de unidad del pollo) sin
 * mover la mediana, para que el filtro de atipicos tenga algo que sacar.
 */
function ventana(
  prefijo: string,
  fechas: readonly string[],
  centro: number,
  paso: number,
  reemplazo?: Reemplazo,
): readonly ObservacionPrecio[] {
  return DELTAS.map((delta, indice) => ({
    id: `${prefijo}_${indice + 1}`,
    valor: micro(reemplazo?.indice === indice ? reemplazo.valor : centro + delta * paso),
    fecha: fechas[indice] ?? fechas[fechas.length - 1] ?? '2026-11-01',
  }));
}

export interface ProductoPrecioDemo {
  readonly id: string;
  /** Como se nombra en la olla. Minusculas: la pantalla lo capitaliza. */
  readonly nombre: string;
  /** Unidad base del precio. */
  readonly unidad: string;
  readonly ventanaActual: readonly ObservacionPrecio[];
  readonly ventanaPrevia: readonly ObservacionPrecio[];
}

/**
 * Los seis del seed de la olla. El orden es el del catalogo; el pollo va
 * ultimo porque la pantalla arranca en el destacado, no porque valga mas.
 */
export const PRODUCTOS_DEMO: readonly ProductoPrecioDemo[] = [
  {
    id: 'arroz',
    nombre: 'arroz',
    unidad: 'kg',
    ventanaPrevia: ventana('arroz_prev', FECHAS_PREVIAS, 3_100_000, 30_000),
    ventanaActual: ventana('arroz_act', FECHAS_ACTUALES, 3_350_000, 30_000),
  },
  {
    id: 'lentejas',
    nombre: 'lentejas',
    unidad: 'kg',
    ventanaPrevia: ventana('lentejas_prev', FECHAS_PREVIAS, 6_000_000, 50_000),
    ventanaActual: ventana('lentejas_act', FECHAS_ACTUALES, 5_700_000, 50_000),
  },
  {
    id: 'papa',
    nombre: 'papa',
    unidad: 'kg',
    ventanaPrevia: ventana('papa_prev', FECHAS_PREVIAS, 1_800_000, 20_000),
    ventanaActual: ventana('papa_act', FECHAS_ACTUALES, 1_620_000, 20_000),
  },
  {
    id: 'huevo',
    nombre: 'huevo',
    unidad: 'kg',
    ventanaPrevia: ventana('huevo_prev', FECHAS_PREVIAS, 7_500_000, 60_000),
    ventanaActual: ventana('huevo_act', FECHAS_ACTUALES, 8_100_000, 60_000),
  },
  {
    id: 'quinua',
    nombre: 'quinua',
    unidad: 'kg',
    ventanaPrevia: ventana('quinua_prev', FECHAS_PREVIAS, 9_000_000, 80_000),
    ventanaActual: ventana('quinua_act', FECHAS_ACTUALES, 9_450_000, 80_000),
  },
  {
    id: 'pollo',
    nombre: 'pollo',
    unidad: 'kg',
    // Serie del demo: mediana previa 1,25 y actual 1,40 (+12,00 %) con el
    // atipico de unidad al final de la ventana actual.
    ventanaPrevia: POLLO_PREVIA,
    ventanaActual: POLLO_ACTUAL,
  },
] as const;

/** Producto que la pantalla abre por defecto: el caso destacado. */
export const PRODUCTO_DESTACADO = 'pollo';

/** De donde salen los precios, en palabras de la olla y sin prometer OCR. */
export const FUENTE_PRECIOS_DEMO = 'Boletas del mercado mayorista (canal mayorista)';
