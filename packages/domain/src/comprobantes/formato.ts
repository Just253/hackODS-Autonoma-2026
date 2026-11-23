/**
 * Centimos -> soles para mostrar. Una sola coma decimal, sin separador de
 * miles: la cocinera lee "S/ 1234,56", no "S/ 1.234,56".
 *
 * El bug original agregaba la coma encima de lo que toLocaleString ya habia
 * separado ("1.234" + "," + "56"), dando "S/ 1,234,56". Aca los soles se
 * arman desde un entero con String(), que no separa nada.
 */
import type { Centimos } from '@hackods/contracts';

export function formatearCentimos(centimos: Centimos | number): string {
  const signo = centimos < 0 ? '-' : '';
  const absoluto = Math.abs(centimos);
  const soles = String(Math.trunc(absoluto / 100));
  const resto = String(absoluto % 100).padStart(2, '0');
  return `${signo}S/ ${soles},${resto}`;
}