import { describe, expect, it } from 'vitest';

import type { Movimiento } from '@hackods/contracts';

import {
  CATEGORIA_OTROS,
  OLLAS_DEMO,
  agregadoEntreOllas,
  type Periodo,
} from './reporte.js';

const PERIODO: Periodo = { desde: '2026-11-01', hasta: '2026-11-30' };

function movimiento(
  id: string,
  ollaId: string,
  insumoId: string,
  delta: number,
  at = '2026-11-10T09:00:00.000Z',
): Movimiento {
  return {
    id,
    ollaId,
    insumoId,
    delta,
    motivo: 'entrada',
    autor: 'test',
    at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    deviceId: 'dev',
    lamport: 1,
  };
}

/**
 * Fixture con identidades a proposito: un insumo nombrado como un codigo P y un
 * insumo que se llama como un alias de persona. Si el filtro de identidad se
 * cae, estos valores aparecen en la salida y el test de abajo las encuentra.
 */
const CON_IDENTIDADES: readonly Movimiento[] = [
  movimiento('m1', 'olla_1', 'arroz', 20000),
  movimiento('m2', 'olla_2', 'frijol', 5000),
  movimiento('m3', 'olla_3', 'P-ABCD', 7000),
  movimiento('m4', 'olla_3', 'Alias de Juana', 3000),
];

describe('agregadoEntreOllas: volumen por categoria y 3 ollas', () => {
  it('devuelve una fila por cada una de las 3 ollas ficticias', () => {
    const agregado = agregadoEntreOllas(CON_IDENTIDADES, PERIODO);
    expect(agregado.filas).toHaveLength(3);
    expect(agregado.filas.map((f) => f.ollaId)).toEqual(['olla_1', 'olla_2', 'olla_3']);
    expect(agregado.filas.map((f) => f.titulo)).toEqual(['Olla Norte', 'Olla Centro', 'Olla Sur']);
  });

  it('volumen por categoria: arroz -> granos, frijol -> granos', () => {
    const agregado = agregadoEntreOllas(CON_IDENTIDADES, PERIODO);
    const norte = agregado.filas.find((f) => f.ollaId === 'olla_1');
    const centro = agregado.filas.find((f) => f.ollaId === 'olla_2');
    expect(norte?.volumen.granos).toBe(20000);
    expect(centro?.volumen.granos).toBe(5000);
  });

  it('excluye movimientos fuera del periodo', () => {
    const fuera = movimiento('m9', 'olla_1', 'arroz', 99999, '2026-10-31T23:00:00.000Z');
    const agregado = agregadoEntreOllas([...CON_IDENTIDADES, fuera], PERIODO);
    const norte = agregado.filas.find((f) => f.ollaId === 'olla_1');
    expect(norte?.volumen.granos).toBe(20000);
  });
});

describe('agregadoEntreOllas: volumen movido, no saldo con signo', () => {
  it('un movimiento negativo (salida) sube el volumen, no lo baja', () => {
    const salida = movimiento('s1', 'olla_1', 'arroz', -20000);
    const entrada = movimiento('e1', 'olla_1', 'arroz', 5000);
    const agregado = agregadoEntreOllas([salida, entrada], PERIODO);
    const norte = agregado.filas.find((f) => f.ollaId === 'olla_1');
    // |−20000| + |5000| = 25000; un saldo con signo daria −15000.
    expect(norte?.volumen.granos).toBe(25000);
  });

  it('solo salidas dan volumen positivo, nunca negativo', () => {
    const agregado = agregadoEntreOllas([movimiento('s2', 'olla_2', 'frijol', -5000)], PERIODO);
    const centro = agregado.filas.find((f) => f.ollaId === 'olla_2');
    expect(centro?.volumen.granos).toBe(5000);
  });
});

/**
 * Criterio #4 del issue: el test se pone rojo si un `P-XXXX` o un alias
 * aparece en la salida. No basta mirar el texto: se serializa la estructura.
 */
describe('agregadoEntreOllas: sin identidades', () => {
  it('la salida NO contiene codigoP ni alias', () => {
    const agregado = agregadoEntreOllas(CON_IDENTIDADES, PERIODO);
    const serializado = JSON.stringify(agregado);

    expect(serializado).not.toMatch(/P-[A-Z0-9]{4}/); // ningun codigo P-XXXX
    expect(serializado).not.toContain('Alias de Juana'); // ningun alias
    expect(serializado.toLowerCase()).not.toContain('alias');
    // El insumo crudo con nombre de persona nunca entra como categoria.
    const categorias = agregado.categorias;
    expect(categorias).not.toContain('Alias de Juana');
    expect(categorias).not.toContain('P-ABCD');
  });

  it('un insumo con identidad cae en "otros", no se propaga', () => {
    const agregado = agregadoEntreOllas(CON_IDENTIDADES, PERIODO);
    const sur = agregado.filas.find((f) => f.ollaId === 'olla_3');
    // P-ABCD + Alias de Juana: ambos van a "otros", 7000 + 3000.
    expect(sur?.volumen[CATEGORIA_OTROS]).toBe(10000);
    expect(Object.keys(sur?.volumen ?? {})).toEqual([CATEGORIA_OTROS]);
  });

  it('solo expone categorias conocidas, nunca insumoId', () => {
    const agregado = agregadoEntreOllas(CON_IDENTIDADES, PERIODO);
    for (const categoria of agregado.categorias) {
      expect(['granos', 'grasas', 'tuberculos', 'proteinas', CATEGORIA_OTROS]).toContain(categoria);
    }
  });
});

describe('OLLAS_DEMO', () => {
  it('son 3 ollas ficticias con titulo publico', () => {
    expect(OLLAS_DEMO).toHaveLength(3);
    for (const olla of OLLAS_DEMO) {
      expect(olla.titulo.length).toBeGreaterThan(0);
    }
  });
});
