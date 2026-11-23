import { describe, expect, it } from 'vitest';

import type { Centimos } from '@hackods/contracts';

import { formatearCentimos } from './formato.js';

const c = (valor: number): Centimos => valor as Centimos;

describe('formatearCentimos', () => {
  it('una sola coma decimal, sin separador de miles', () => {
    const tabla: ReadonlyArray<readonly [number, string]> = [
      [0, 'S/ 0,00'],
      [5, 'S/ 0,05'],
      [99, 'S/ 0,99'],
      [100, 'S/ 1,00'],
      [123_456, 'S/ 1234,56'],
      [1_000_000, 'S/ 10000,00'],
    ];
    for (const [centimos, esperado] of tabla) {
      expect(formatearCentimos(c(centimos))).toBe(esperado);
    }
  });

  it('nunca produce dos comas', () => {
    for (const valor of [123_456, 1_000_000, 12_345_678]) {
      const texto = formatearCentimos(c(valor));
      expect(texto.split(',').length - 1).toBe(1);
    }
  });

  it('respeta el signo negativo', () => {
    expect(formatearCentimos(c(-2_450))).toBe('-S/ 24,50');
  });
});