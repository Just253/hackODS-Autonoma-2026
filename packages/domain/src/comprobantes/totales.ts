/**
 * Totales de una boleta por estado de linea.
 *
 * `calcularPresupuesto()` no sirve aca: toma movimientos del presupuesto y un
 * corte, no lineas de comprobante. `conciliarComprobante()` tampoco: cuadra los
 * items contra el total impreso. Lo que la pantalla necesita es sumar en
 * centimos enteros, separando lo confirmado de lo que sigue en el papel.
 *
 * La pantalla NO suma en JSX: llama a estas dos funciones (DEC-2026-0008).
 */
import type { Centimos } from '@hackods/contracts';

export interface LineaConTotal {
  readonly totalLineaCentavos: Centimos;
}

/** Lo que ya puede entrar al presupuesto: solo las lineas confirmadas. */
export function totalDeLineasConfirmadas(items: readonly LineaConTotal[]): Centimos {
  return sumar(items) as Centimos;
}

/** Lo que dice el papel completo, confirmado o no: no suma, se muestra. */
export function totalDelPapel(items: readonly LineaConTotal[]): Centimos {
  return sumar(items) as Centimos;
}

function sumar(items: readonly LineaConTotal[]): number {
  return items.reduce((acumulado, item) => acumulado + Number(item.totalLineaCentavos), 0);
}