/**
 * Conciliacion de un comprobante: la suma de items contra el total del papel.
 *
 * Referencia: `docs/contracts/comprobantes.md` §1.2 y §6.3.
 * - El total **nunca** se recalcula desde los items: es el dato del papel.
 * - ±1 centimo por redondeo de linea es tolerable; mas que eso bloquea confirmar.
 */
import type { Centimos } from '@hackods/contracts';

export interface ItemConciliable {
  /** Importe bruto pagado por la linea (`totalNetoConIgvCentavos` en el SQL). */
  readonly totalCentavos: Centimos;
}

export type EstadoConciliacion = 'cuadra' | 'faltante' | 'sobrante';

export interface ResultadoConciliacion {
  readonly sumaCentavos: Centimos;
  readonly totalCentavos: Centimos;
  /** total - suma: positivo = faltante, negativo = sobrante. */
  readonly diferenciaCentavos: Centimos;
  readonly faltanteCentavos: Centimos;
  readonly sobranteCentavos: Centimos;
  readonly toleranciaCentimos: Centimos;
  readonly estado: EstadoConciliacion;
  /** Solo se confirma con diferencia dentro de la tolerancia. */
  readonly confirmable: boolean;
}

const TOLERANCIA = 1 as Centimos;

export function conciliarComprobante(
  items: readonly ItemConciliable[],
  total: Centimos,
): ResultadoConciliacion {
  const suma = items.reduce((acumulado, item) => acumulado + Number(item.totalCentavos), 0);
  const diferencia = Number(total) - suma;
  const absoluta = Math.abs(diferencia);

  const estado: EstadoConciliacion =
    absoluta <= Number(TOLERANCIA) ? 'cuadra' : diferencia > 0 ? 'faltante' : 'sobrante';

  return {
    sumaCentavos: suma as Centimos,
    totalCentavos: total,
    diferenciaCentavos: diferencia as Centimos,
    faltanteCentavos: (diferencia > 0 ? diferencia : 0) as Centimos,
    sobranteCentavos: (diferencia < 0 ? -diferencia : 0) as Centimos,
    toleranciaCentimos: TOLERANCIA,
    estado,
    confirmable: absoluta <= Number(TOLERANCIA),
  };
}
