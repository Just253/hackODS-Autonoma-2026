/**
 * Formato para pantalla. Solo lee enteros de centimos; nunca hace cuentas con
 * floats. `185430` -> "S/ 1 854,30".
 *
 * Sin `Intl` para el separador de miles: su salida depende del locale del
 * runtime (NBSP vs espacio) y rompe tests deterministas. Agrupamos a mano.
 */
import type { Centimos } from '@hackods/contracts';

/** "1800" -> "1 800". Agrupa de derecha a izquierda en bloques de 3. */
export function agruparMiles(entero: number): string {
  const digitos = String(Math.trunc(Math.abs(entero)));
  let salida = '';
  for (let i = 0; i < digitos.length; i += 1) {
    const desdeFin = digitos.length - i;
    salida += digitos[i];
    if (desdeFin > 1 && desdeFin % 3 === 1) {
      salida += ' ';
    }
  }
  return salida;
}

/** Centimos enteros a "S/ 1 854,30". Negativo se muestra con signo explicito. */
export function formatearCentimos(valor: Centimos | number): string {
  const entero = Math.trunc(Number(valor));
  const signo = entero < 0 ? '-' : '';
  const abs = Math.abs(entero);
  const soles = Math.trunc(abs / 100);
  const cent = abs % 100;
  return `${signo}S/ ${agruparMiles(soles)},${String(cent).padStart(2, '0')}`;
}

/** Puntos base (10 000 = 100 %) a "89,07 %". */
export function formatearPuntosBase(bp: number): string {
  const entero = Math.trunc(bp);
  const parte = Math.trunc(entero / 100);
  const dec = Math.abs(entero % 100);
  return `${parte},${String(dec).padStart(2, '0')} %`;
}
