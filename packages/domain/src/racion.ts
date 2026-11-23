import type { Movimiento, Persona, RacionSugerida, Servicio } from '@hackods/contracts';

import { NoImplementado } from './errors.js';

/** Todo lo que la funcion necesita entra por parametro: sin IO, sin reloj global. */
export interface ContextoRacion {
  /** Saldo derivado por insumoId, en unidad base. */
  readonly stock: Readonly<Record<string, number>>;
  /** Version de la tabla de requerimientos usada. */
  readonly versionTabla: string;
  /** ISO 8601 UTC. Inyectado para que el calculo sea determinista. */
  readonly ahora: string;
}

/**
 * Racion sugerida para una persona con explicacion legible.
 *
 * TODO(M3): implementar. Debe ser pura, determinista y traer >= 2 razones en espanol.
 * Sin valores nutricionales hardcodeados: el aporte entra por proveedor (packages/nutrition).
 */
export function calcularRacion(
  persona: Persona,
  contexto: ContextoRacion,
): RacionSugerida {
  void persona;
  void contexto;
  throw new NoImplementado('calcularRacion');
}

/**
 * Raciones vigentes de una fecha. La racha se anula con otro registro, nunca se edita.
 *
 * TODO(M1): filtrar por olla, fecha y `deletedAt === null`, ordenando por hora.
 */
export function racionesDelDia(
  servicios: readonly Servicio[],
  fecha: string,
): readonly Servicio[] {
  void servicios;
  void fecha;
  throw new NoImplementado('racionesDelDia');
}

/**
 * Saldo de despensa derivado de movimientos append-only.
 * Regla del proyecto: el saldo NUNCA se escribe a mano (docs/ARQUITECTURA.md 4.3).
 *
 * TODO(M2): sumar deltas por insumoId. No existe un campo "saldo" persistido.
 */
export function saldoDespensa(
  movimientos: readonly Movimiento[],
): Readonly<Record<string, number>> {
  void movimientos;
  throw new NoImplementado('saldoDespensa');
}
