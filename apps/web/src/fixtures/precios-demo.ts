/**
 * Serie del pollo para el demo y los tests: dos ventanas con medianas
 * 1 250 000 y 1 400 000 microcent/kg -> +12,00 % contra la mediana.
 * Cada ventana trae 7 observaciones, que es la `n` de la mediana móvil.
 * La última observación de la ventana actual es un outlier de unidad (x10).
 *
 * Ficticio: ningún proveedor ni persona real.
 */
import type { Microcentesimos } from '@hackods/contracts';

export interface ObsDemo {
  readonly id: string;
  readonly valor: Microcentesimos;
  readonly fecha: string;
}

const micro = (valor: number): Microcentesimos => valor as Microcentesimos;

/**
 * Ventana previa (mediana 1 250 000): 7 observaciones semanales, como pide la
 * mediana móvil de 7. Los valores son simétricos alrededor de 1 250 000
 * (1 170/200/230 < 250 < 280/300/330, en miles). Con 7 valores impares la
 * mediana es el cuarto ordenado, 1 250 000 exacto, sin promediar dos centros.
 */
export const POLLO_PREVIA: readonly ObsDemo[] = [
  { id: 'pollo_prev_1', valor: micro(1_170_000), fecha: '2026-09-17' },
  { id: 'pollo_prev_2', valor: micro(1_200_000), fecha: '2026-09-24' },
  { id: 'pollo_prev_3', valor: micro(1_230_000), fecha: '2026-10-01' },
  { id: 'pollo_prev_4', valor: micro(1_250_000), fecha: '2026-10-08' },
  { id: 'pollo_prev_5', valor: micro(1_280_000), fecha: '2026-10-15' },
  { id: 'pollo_prev_6', valor: micro(1_300_000), fecha: '2026-10-22' },
  { id: 'pollo_prev_7', valor: micro(1_330_000), fecha: '2026-10-29' },
];

/**
 * Ventana actual (mediana 1 400 000 tras quitar el outlier): seis valores
 * válidos y un error de unidad al final (x10) que el MAD debe excluir.
 */
export const POLLO_ACTUAL: readonly ObsDemo[] = [
  { id: 'pollo_act_1', valor: micro(1_390_000), fecha: '2026-11-01' },
  { id: 'pollo_act_2', valor: micro(1_395_000), fecha: '2026-11-04' },
  { id: 'pollo_act_3', valor: micro(1_400_000), fecha: '2026-11-07' },
  { id: 'pollo_act_4', valor: micro(1_400_000), fecha: '2026-11-10' },
  { id: 'pollo_act_5', valor: micro(1_405_000), fecha: '2026-11-13' },
  { id: 'pollo_act_6', valor: micro(1_410_000), fecha: '2026-11-16' },
  { id: 'pollo_act_7', valor: micro(14_000_000), fecha: '2026-11-19' },
];

export const FUENTE_DEMO = 'Boletas del mercado mayorista, canal mayorista';
export const PRODUCTO_DEMO = 'pollo';
export const UNIDAD_DEMO = 'kg';