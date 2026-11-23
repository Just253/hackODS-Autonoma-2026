/**
 * Pasa un precio por unidad base (microcentésimos del repo) a soles visibles.
 * No hace cuentas de negocio: solo formatea un entero. 1 sol = 1 000 000 micro;
 * 1 céntimo = 1 000 micro (convención de `packages/domain`, comprobantes §8.5).
 *
 * Deriva de su test de tabla (formatoPrecio.test.ts): el test manda.
 */
const MICRO_POR_SOL = 1_000_000;
const MICRO_POR_CENTIMO = 10_000;

/** Redondeo mitad hacia arriba en enteros positivos. */
function redondearMitadArribaPositivo(numerador: number, denominador: number): number {
  return Math.floor((numerador + Math.floor(denominador / 2)) / denominador);
}

/** Microcentésimos por unidad base -> "S/ 1,40". `null` -> "sin dato". */
export function formatearPrecioSoles(micro: number | null): string {
  if (micro === null) {
    return 'sin dato';
  }
  const negativo = micro < 0;
  const abs = Math.abs(Math.trunc(micro));
  const soles = Math.floor(abs / MICRO_POR_SOL);
  const resto = abs % MICRO_POR_SOL;
  const centimos = redondearMitadArribaPositivo(resto, MICRO_POR_CENTIMO);
  // Un redondeo en el borde puede empujar a 100 céntimos.
  const solesFinal = centimos === 100 ? soles + 1 : soles;
  const centimosFinal = centimos === 100 ? 0 : centimos;
  const signo = negativo ? '-' : '';
  return `${signo}S/ ${solesFinal},${String(centimosFinal).padStart(2, '0')}`;
}
