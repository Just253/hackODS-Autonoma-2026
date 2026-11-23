import type { MenuTemplate, Movimiento, Servicio } from '@hackods/contracts';

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
 * Saldo de despensa derivado de movimientos append-only.
 * Regla del proyecto: el saldo NUNCA se escribe a mano (docs/DECISIONES.md D4).
 *
 * TODO(M2): sumar deltas por insumoId, incluyendo `transferencia` entre ollas.
 */
export function saldoDespensa(
  movimientos: readonly Movimiento[],
): Readonly<Record<string, number>> {
  void movimientos;
  throw new NoImplementado('saldoDespensa');
}

/**
 * Un menu solo se sirve si esta `publicado` y su sello es verificable.
 * No evalua nutricion: eso es `packages/nutrition`.
 *
 * TODO(M3): verificar estado, sello y hash contra el contenido.
 */
export function esMenuServible(menu: MenuTemplate): boolean {
  void menu;
  throw new NoImplementado('esMenuServible');
}
