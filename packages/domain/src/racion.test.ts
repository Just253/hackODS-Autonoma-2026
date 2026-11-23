import { describe, expect, it } from 'vitest';

import type { Insumo, Movimiento, MotivoMovimiento } from '@hackods/contracts';

import { stockPorInsumo, saldoDespensa, urgenciaVencimiento } from './racion.js';

/**
 * Despensa append-only (DEC-2026-0004): el saldo NUNCA se guarda, se deriva de
 * los movimientos. Estos casos fijan las tres cosas que rompen una despensa:
 * signos, insumos mezclados y redondeo.
 */

function movimiento(
  id: string,
  insumoId: string,
  delta: number,
  motivo: MotivoMovimiento = 'entrada',
): Movimiento {
  const at = '2026-11-10T09:00:00.000Z';
  return {
    id,
    ollaId: 'olla-demo-01',
    insumoId,
    delta,
    motivo,
    autor: 'cocinera',
    at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    deviceId: 'dispositivo-demo-01',
    lamport: 1,
  };
}

function insumo(id: string, stockMinimo: number): Insumo {
  return {
    id,
    denominacion: id,
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo,
    perecedero: false,
    alergenos: [],
  };
}

describe('saldoDespensa: suma de deltas por insumo', () => {
  it('sin movimientos no hay saldo inventado: devuelve un objeto vacio', () => {
    expect(saldoDespensa([])).toEqual({});
  });

  it('entrada, salida y merma del mismo insumo se suman con su signo', () => {
    const saldo = saldoDespensa([
      movimiento('m1', 'arroz', 5000),
      movimiento('m2', 'arroz', -1500, 'salida'),
      movimiento('m3', 'arroz', -200, 'merma'),
    ]);

    expect(saldo).toEqual({ arroz: 3300 });
  });

  it('no mezcla insumos: cada clave es independiente', () => {
    const saldo = saldoDespensa([
      movimiento('m1', 'arroz', 5000),
      movimiento('m2', 'pollo', 3000),
      movimiento('m3', 'pollo', -1000, 'salida'),
    ]);

    expect(saldo.arroz).toBe(5000);
    expect(saldo.pollo).toBe(2000);
  });

  it('una transferencia resta en el origen y suma en el destino', () => {
    const saldo = saldoDespensa([
      movimiento('m1', 'arroz', -2000, 'transferencia'),
      movimiento('m2', 'arroz', 2000, 'transferencia'),
    ]);

    // Conservacion: mover no crea stock.
    expect(saldo.arroz).toBe(0);
  });

  it('un ajuste negativo corrige el saldo sin borrar el movimiento anterior', () => {
    const saldo = saldoDespensa([
      movimiento('m1', 'aceite', 1000),
      movimiento('m2', 'aceite', -400, 'ajuste'),
    ]);

    expect(saldo.aceite).toBe(600);
  });

  it('suma con el redondeo a dos decimales de la columna de la base (numeric 12,2)', () => {
    const saldo = saldoDespensa([movimiento('m1', 'queso', 1.005), movimiento('m2', 'queso', 0.005)]);

    expect(saldo.queso).toBe(1.01);
    expect(saldo.queso).not.toBe(1.0100000000000002);
  });
});

describe('stockPorInsumo: saldo derivado y minimo en una sola fila', () => {
  it('un insumo sin movimientos queda en cero y bajo minimo si el minimo es mayor que cero', () => {
    const filas = stockPorInsumo([insumo('arroz', 5000)], []);

    expect(filas).toEqual([{ insumoId: 'arroz', saldo: 0, stockMinimo: 5000, bajoMinimo: true }]);
  });

  it('con saldo justo en el minimo NO esta bajo minimo (el limite es inclusivo)', () => {
    const filas = stockPorInsumo(
      [insumo('arroz', 5000)],
      [movimiento('m1', 'arroz', 5000)],
    );

    expect(filas[0]?.bajoMinimo).toBe(false);
  });

  it('con saldo por debajo del minimo avisa', () => {
    const filas = stockPorInsumo(
      [insumo('arroz', 5000)],
      [movimiento('m1', 'arroz', 4000)],
    );

    expect(filas[0]).toMatchObject({ saldo: 4000, stockMinimo: 5000, bajoMinimo: true });
  });

  it('ignora movimientos de insumos que no estan en el catalogo', () => {
    const filas = stockPorInsumo(
      [insumo('arroz', 0)],
      [movimiento('m1', 'arroz', 1000), movimiento('m2', 'insumo-que-no-existe', 999)],
    );

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ insumoId: 'arroz', saldo: 1000, bajoMinimo: false });
  });
});

describe('urgenciaVencimiento: 3 / 7 / 15 dias o sin dato', () => {
  const HOY = '2026-11-23';

  it('sin fecha de vencimiento es "sin dato": no se supone que dure para siempre', () => {
    expect(urgenciaVencimiento(null, HOY)).toBe('sin_dato');
  });

  it('una fecha anterior a hoy esta vencida', () => {
    expect(urgenciaVencimiento('2026-11-22', HOY)).toBe('vencido');
  });

  it('vence hoy o dentro de 3 dias avisa con la urgencia mayor', () => {
    expect(urgenciaVencimiento('2026-11-23', HOY)).toBe('vence_3');
    expect(urgenciaVencimiento('2026-11-26', HOY)).toBe('vence_3');
  });

  it('entre 4 y 7 dias es la urgencia media', () => {
    expect(urgenciaVencimiento('2026-11-27', HOY)).toBe('vence_7');
    expect(urgenciaVencimiento('2026-11-30', HOY)).toBe('vence_7');
  });

  it('entre 8 y 15 dias es la urgencia baja', () => {
    expect(urgenciaVencimiento('2026-12-01', HOY)).toBe('vence_15');
    expect(urgenciaVencimiento('2026-12-08', HOY)).toBe('vence_15');
  });

  it('a mas de 15 dias esta vigente', () => {
    expect(urgenciaVencimiento('2026-12-09', HOY)).toBe('vigente');
  });
});
