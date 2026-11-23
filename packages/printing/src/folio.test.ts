import { describe, expect, it } from 'vitest';

import { generarFolio, validarFolio } from './folio.js';

describe('folio', () => {
  it('es determinista para el mismo id', () => {
    expect(generarFolio('0190f2c8-7d1a-7c3e-9b5f-2a4c6e8f0a1b')).toBe(
      generarFolio('0190f2c8-7d1a-7c3e-9b5f-2a4c6e8f0a1b'),
    );
  });

  it('tiene 8 caracteres utiles y 2 de verificacion', () => {
    expect(generarFolio('abc-123')).toMatch(/^[A-Z0-9]{8}-[A-Z0-9]{2}$/);
  });

  it('detecta un folio alterado', () => {
    const folio = generarFolio('pedido-demo-01');
    expect(validarFolio(folio)).toBe(true);
    const alterado = `${folio.slice(0, -1)}${folio.endsWith('A') ? 'B' : 'A'}`;
    expect(validarFolio(alterado)).toBe(false);
  });
});
