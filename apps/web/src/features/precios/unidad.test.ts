import { describe, expect, it } from 'vitest';

import { unidadLegible } from './unidad';

describe('unidad legible del precio', () => {
  it('g se dice kg, ml se dice L y unidad se queda en unidad', () => {
    expect(unidadLegible('g')).toBe('kg');
    expect(unidadLegible('ml')).toBe('L');
    expect(unidadLegible('unidad')).toBe('unidad');
  });

  it('la unidad que ya se ve bien no se toca', () => {
    expect(unidadLegible('kg')).toBe('kg');
    expect(unidadLegible('')).toBe('');
  });
});
