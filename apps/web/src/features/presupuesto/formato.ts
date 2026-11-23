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

/**
 * Puntos base enteros (10 000 = 100 %) a "89,07 %".
 *
 * El signo se arma sobre el valor ABSOLUTO: `Math.trunc` de -0,5 es -0 (y su
 * `String` es "0"), asi que `-50 bp` se perdia como "0,50 %". Un negativo se
 * publica con signo menos explícito ("−0,50 %"); un positivo queda sin signo
 * porque es un consumo, no una variación.
 */
export function formatearPuntosBase(bp: number): string {
  const entero = Math.trunc(bp);
  const abs = Math.abs(entero);
  const parte = Math.trunc(abs / 100);
  const dec = abs % 100;
  const signo = entero < 0 ? '\u2212' : '';
  return `${signo}${parte},${String(dec).padStart(2, '0')} %`;
}

/**
 * Variación en puntos base a "+0,50 %" / "−0,50 %" / "0,00 %".
 *
 * A diferencia de `formatearPuntosBase` (consumo), una variación publica el
 * signo POSITIVO explícito: "+12,00 %" y no "12,00 %".
 */
export function formatearVariacionBp(bp: number): string {
  const entero = Math.trunc(bp);
  if (entero > 0) {
    return `+${formatearPuntosBase(entero)}`;
  }
  return formatearPuntosBase(entero);
}
