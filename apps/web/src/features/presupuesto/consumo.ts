/**
 * El consumo del presupuesto dicho como lo diria una cocinera.
 *
 * El dominio entrega puntos base enteros (10 000 = 100 %). Ese porcentaje crudo
 * no le dice nada a quien cocina: "84,2 %" obliga a hacer la cuenta mental.
 * Aca se traduce a "84 de cada 100 soles", un entero al que se llega redondeando
 * al mas cercano (`medio arriba`, la misma regla que usa el dominio para el
 * dinero).
 *
 * Lo que NO se hace:
 * - no se recalcula el consumo: el numero sale de `resultado.consumoBp`;
 * - no se miente con el redondeo: si 84,2 se muestra como 84, la frase lo dice
 *   ("casi"); si 84,6 se muestra como 85, dice "(un poco m\u00e1s)". quien lee sabe
 *   de que lado cae el numero real.
 *
 * El monto en soles sale de la propia definicion de puntos base (el asignado
 * son los 100 soles de referencia), asi la frase es exacta aunque el presupuesto
 * no sea de 100 soles: en un presupuesto de S/ 1 800, 84 bp por cada 100 son
 * S/ 84, y 8 421 bp son S/ 151,58... redondeado, S/ 152.
 */

/** Cuantos puntos base son el 100 %: el presupuesto asignado completo. */
const PUNTOS_BASE_POR_ENTERO = 100;

/** `Math.round` de un no negativo: 84,4 -> 84; 84,5 -> 85; 84,6 -> 85. */
function redondearAlEntero(bp: number): number {
  return Math.round(bp / PUNTOS_BASE_POR_ENTERO);
}

/**
 * Cual de las dos cifras redondeadas miente, y para que lado.
 *
 * `casi` cuando la cifra mostrada queda por debajo del consumo real,
 * `un poco mas` cuando queda por encima, `exacto` cuando el consumo cae justo
 * en el entero.
 */
export type PrecisionConsumo = 'exacto' | 'casi' | 'un-poco-mas';

export interface ConsumoEnPalabras {
  /** Entero 0..100 de soles de cada 100 ya usados (el mismo que la barra). */
  readonly deCadaCien: number;
  /** Lo gastado en soles enteros, a la escala del asignado. */
  readonly solesUsados: number | null;
  readonly precision: PrecisionConsumo;
}

export function consumoEnPalabras(
  consumoBp: number | null,
  asignadoCentimos: number,
): ConsumoEnPalabras | null {
  if (consumoBp === null) {
    return null;
  }
  const deCadaCien = Math.min(100, redondearAlEntero(consumoBp));
  const real = consumoBp / PUNTOS_BASE_POR_ENTERO;
  const precision: PrecisionConsumo =
    real === deCadaCien ? 'exacto' : real > deCadaCien ? 'casi' : 'un-poco-mas';
  // El asignado completo son los 10 000 bp: consumo / 10 000 x asignado. En
  // centimos queda `asignado * bp / 10 000`; recien al final a soles enteros.
  const solesUsados =
    asignadoCentimos > 0 ? Math.round((asignadoCentimos * consumoBp) / 10_000 / 100) : null;
  return { deCadaCien, solesUsados, precision };
}

/**
 * "Ya se gast\u00f3 84 de cada 100 soles del mes."
 *
 * Con presupuesto de mas de S/ 100 agrega la cifra en soles; con el redondeo
 * inexacto, agrega de que lado cae el numero real. `null` = sin consumo todavia.
 */
export function fraseConsumo(
  consumo: ConsumoEnPalabras | null,
  asignadoCentimos: number,
): string {
  if (consumo === null) {
    return 'sin dato \u2014 todav\u00eda no hay dinero asignado';
  }
  const base = `Ya se gast\u00f3 ${consumo.deCadaCien} de cada 100 soles del mes`;
  const matiz =
    consumo.precision === 'casi'
      ? ' (un poco m\u00e1s)'
      : consumo.precision === 'un-poco-mas'
        ? ' (casi)'
        : '';
  const soles =
    asignadoCentimos > 100_00 && consumo.solesUsados !== null
      ? `: S/ ${consumo.solesUsados} de S/ ${Math.round(asignadoCentimos / 100)}`
      : '';
  return `${base}${matiz}${soles}.`;
}
