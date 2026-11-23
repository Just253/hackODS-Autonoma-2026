/**
 * Aritmetica entera y fechas de negocio (`America/Lima`), sin reloj del sistema.
 *
 * Regla del proyecto: el dinero se redondea **una sola vez** por linea, con
 * `round_half_up`; nunca `toFixed` sobre floats (docs/contracts/comprobantes.md §1.2).
 */

/** Redondeo mitad hacia arriba, tambien para negativos (mitad fuera de cero). */
export function redondearMitadArriba(valor: number): number {
  if (!Number.isFinite(valor)) {
    return valor;
  }
  return Math.sign(valor) * Math.round(Math.abs(valor));
}

/** Mediana en enteros; con cantidad par promedia y redondea al entero mas cercano. */
export function mediana(valores: readonly number[]): number | null {
  if (valores.length === 0) {
    return null;
  }
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  const centro = orden[medio];
  if (centro === undefined) {
    return null;
  }
  if (orden.length % 2 === 1) {
    return centro;
  }
  const anterior = orden[medio - 1] ?? centro;
  return redondearMitadArriba((anterior + centro) / 2);
}

/** Dias calendario entre dos fechas ISO `YYYY-MM-DD` (b - a). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`fecha ISO invalida: ${desde} / ${hasta}`);
  }
  return Math.round((b - a) / 86_400_000);
}

/** Compara dos instantes ISO; ambos deben ser validos. */
export function instanteAnteriorOIgual(a: string, b: string): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) {
    throw new Error(`instante ISO invalido: ${a} / ${b}`);
  }
  return ta <= tb;
}
