import { describe, expect, it } from 'vitest';

import { formatearPuntosBase, formatearVariacionBp } from '../presupuesto/formato';

describe('formatearPuntosBase', () => {
  const casos: ReadonlyArray<[bp: number, esperado: string]> = [
    [8_000, '80,00 %'],
    [8_907, '89,07 %'],
    [10_000, '100,00 %'],
    [0, '0,00 %'],
  ];

  for (const [bp, esperado] of casos) {
    it(`${bp} bp -> "${esperado}"`, () => {
      expect(formatearPuntosBase(bp)).toBe(esperado);
    });
  }

  // MEDIA 7: `Math.trunc(-0.5)` es -0 y se perdía el signo.
  it('-50 bp conserva el signo negativo explícito', () => {
    expect(formatearPuntosBase(-50)).toBe('\u22120,50 %');
  });
});

describe('formatearVariacionBp (tabla del issue: -1, -50, -1200, 0, +1200)', () => {
  const tabla: ReadonlyArray<[bp: number, esperado: string]> = [
    [-1, '\u22120,01 %'],
    [-50, '\u22120,50 %'],
    [-1_200, '\u221212,00 %'],
    [0, '0,00 %'],
    [1_200, '+12,00 %'],
  ];

  for (const [bp, esperado] of tabla) {
    it(`${bp} bp -> "${esperado}"`, () => {
      expect(formatearVariacionBp(bp)).toBe(esperado);
    });
  }

  it('+50 bp lleva signo positivo explícito', () => {
    expect(formatearVariacionBp(50)).toBe('+0,50 %');
  });
});
