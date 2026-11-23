import { describe, expect, it } from 'vitest';

import { formatearPrecioSoles } from './formato-precio';

describe('formatearPrecioSoles', () => {
  const casos: ReadonlyArray<[input: number | null, esperado: string]> = [
    [1_400_000, 'S/ 1,40'],
    [14_000, 'S/ 0,01'],
    [0, 'S/ 0,00'],
    [1_000_000, 'S/ 1,00'],
    [220_000, 'S/ 0,22'],
    [2_200_000, 'S/ 2,20'],
    [1_250_000, 'S/ 1,25'],
    [99_999, 'S/ 0,10'],
    [null, 'sin dato'],
  ];

  for (const [entrada, esperado] of casos) {
    it(`${String(entrada)} micro -> "${esperado}"`, () => {
      expect(formatearPrecioSoles(entrada)).toBe(esperado);
    });
  }
});
