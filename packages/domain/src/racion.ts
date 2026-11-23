import type { Insumo, Movimiento, Servicio } from '@hackods/contracts';

import { diasEntre, redondearMitadArriba } from './aritmetica.js';
import { NoImplementado } from './errors.js';

/**
 * Servicios vigentes de una fecha. Una racion entregada no se edita: se anula
 * con otro registro, y el servicio se filtra por `deletedAt === null`.
 *
 * TODO(M1): filtrar por olla y fecha, ordenando por hora.
 */
export function serviciosDelDia(
  servicios: readonly Servicio[],
  fecha: string,
): readonly Servicio[] {
  void servicios;
  void fecha;
  throw new NoImplementado('serviciosDelDia');
}

/**
 * Saldo de despensa derivado de movimientos append-only (D4, DEC-2026-0004).
 * El saldo NUNCA se escribe a mano: si hace falta un numero, se deriva de los
 * movimientos que ya estan en la base.
 *
 * Reglas:
 * - Se suma `delta` con su signo; `motivo` no altera la aritmetica (una
 *   `transferencia` ya viene con signo en el origen y en el destino).
 * - No se filtra por `deletedAt`: un movimiento append-only no se borra. Si
 *   alguien borrara uno, el error estaria antes, en la escritura.
 * - Se redondea una sola vez al final a dos decimales, que es la precision de
 *   la columna `movimientos.delta numeric(12,2)`. Sin eso, `0,1 + 0,2` da
 *   `0,30000000000000004` y la pantalla muestra un saldo que no existe.
 */
export function saldoDespensa(
  movimientos: readonly Movimiento[],
): Readonly<Record<string, number>> {
  const acumulado = new Map<string, number>();
  for (const movimiento of movimientos) {
    acumulado.set(
      movimiento.insumoId,
      (acumulado.get(movimiento.insumoId) ?? 0) + movimiento.delta,
    );
  }

  const saldo: Record<string, number> = {};
  for (const [insumoId, valor] of acumulado) {
    saldo[insumoId] = redondearMitadArriba(valor * 100) / 100;
  }
  return saldo;
}

/** Una fila de la despensa: el saldo derivado y el minimo que lo juzga. */
export interface FilaStock {
  readonly insumoId: string;
  readonly saldo: number;
  readonly stockMinimo: number;
  readonly bajoMinimo: boolean;
}

/**
 * Stock por insumo del catalogo, en la unidad base del insumo.
 *
 * El limite es inclusivo: con el saldo justo en el minimo todavia no hay
 * alerta; la alerta empieza cuando el saldo queda por debajo. Un insumo sin
 * movimientos vale cero (no `sin dato`): la despensa vacia es un hecho, no una
 * falta de calculo.
 */
export function stockPorInsumo(
  insumos: readonly Insumo[],
  movimientos: readonly Movimiento[],
): readonly FilaStock[] {
  const saldos = saldoDespensa(movimientos);
  return insumos.map((insumo) => {
    const saldo = saldos[insumo.id] ?? 0;
    return {
      insumoId: insumo.id,
      saldo,
      stockMinimo: insumo.stockMinimo,
      bajoMinimo: saldo < insumo.stockMinimo,
    };
  });
}

/**
 * Urgencia de vencimiento de un lote (issue #69): 3 / 7 / 15 dias.
 *
 * `null` es `sin_dato`, no "no vence": el contrato no permite suponer que un
 * insumo dura para siempre. La fecha de hoy entra como parametro (el dominio no
 * lee el reloj del sistema).
 */
export type UrgenciaVencimiento =
  | 'vencido'
  | 'vence_3'
  | 'vence_7'
  | 'vence_15'
  | 'vigente'
  | 'sin_dato';

export function urgenciaVencimiento(
  fechaVencimiento: string | null,
  hoy: string,
): UrgenciaVencimiento {
  if (fechaVencimiento === null) {
    return 'sin_dato';
  }
  // Vence hoy (0 dias) ya es urgente: hay que cocinarlo hoy o perderlo.
  const dias = diasEntre(hoy, fechaVencimiento);
  if (dias < 0) {
    return 'vencido';
  }
  if (dias <= 3) {
    return 'vence_3';
  }
  if (dias <= 7) {
    return 'vence_7';
  }
  if (dias <= 15) {
    return 'vence_15';
  }
  return 'vigente';
}

/**
 * Un menu solo se sirve si esta `publicado` y su sello es verificable.
 * Implementado en `servicio.ts` (cierra el TODO M3): necesita el contenido del dia
 * para verificar el hash, por eso la firma recibe `platos`.
 * No evalua nutricion: eso es `packages/nutrition`.
 */
