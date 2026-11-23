import { describe, expect, it } from 'vitest';

import type { Centimos } from '@hackods/contracts';

import { totalDeLineasConfirmadas, totalDelPapel, type LineaConTotal } from './totales.js';

const linea = (centimos: number): LineaConTotal => ({ totalLineaCentavos: centimos as Centimos });

describe('totales de la boleta', () => {
  it('sin lineas confirmadas el total es 0', () => {
    expect(totalDeLineasConfirmadas([])).toBe(0);
  });

  it('suma las lineas confirmadas en centimos enteros', () => {
    expect(totalDeLineasConfirmadas([linea(2_450), linea(1_320)])).toBe(3_770);
  });

  it('el total del papel suma todo lo leido', () => {
    const items = [linea(2_450), linea(1_320), linea(3_315), linea(3_045), linea(2_670), linea(1_680)];
    expect(totalDelPapel(items)).toBe(14_480);
  });

  it('el orden de las lineas no cambia el total', () => {
    const items = [linea(2_450), linea(3_315), linea(1_680)];
    const alReves = [...items].reverse();
    expect(totalDeLineasConfirmadas(items)).toBe(totalDeLineasConfirmadas(alReves));
  });

  it('nunca devuelve un flotante', () => {
    const total = totalDeLineasConfirmadas([linea(1), linea(2), linea(3)]);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('un total grande no pierde centimos', () => {
    expect(totalDelPapel([linea(123_456), linea(1_000_000)])).toBe(1_123_456);
  });
});