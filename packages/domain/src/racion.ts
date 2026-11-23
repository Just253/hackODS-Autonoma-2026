import type { Movimiento, Servicio } from '@hackods/contracts';

import { ErrorDominio, NoImplementado } from './errors.js';

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
 * Suma todos los deltas del insumo: `entrada`, `salida`, `merma`, `ajuste` y
 * `transferencia` ya traen su signo (una transferencia que entra es positiva).
 * Las bajas logicas (`deletedAt !== null`) no cuentan: en una tabla append-only
 * no deberia haberlas, pero si aparecen no pueden mover el stock en silencio.
 *
 * El llamador pasa los movimientos de UNA olla (y del periodo que quiera
 * mostrar); esta funcion no filtra por `ollaId` para no esconder un error de
 * alcance detras de una suma vacia.
 */
export function saldoDespensa(
  movimientos: readonly Movimiento[],
): Readonly<Record<string, number>> {
  const saldo: Record<string, number> = {};

  for (const movimiento of movimientos) {
    if (movimiento.deletedAt !== null) continue;
    if (!Number.isFinite(movimiento.delta)) {
      throw new ErrorDominio(
        `movimiento ${movimiento.id}: delta no numerico ("${movimiento.delta}")`,
      );
    }
    saldo[movimiento.insumoId] = (saldo[movimiento.insumoId] ?? 0) + movimiento.delta;
  }

  return saldo;
}

/**
 * Un menu solo se sirve si esta `publicado` y su sello es verificable.
 * Implementado en `servicio.ts` (cierra el TODO M3): necesita el contenido del dia
 * para verificar el hash, por eso la firma recibe `platos`.
 * No evalua nutricion: eso es `packages/nutrition`.
 */
