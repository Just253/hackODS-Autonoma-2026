import { describe, expect, it } from 'vitest';

import { consumoEnPalabras, fraseConsumo } from './consumo';

/**
 * El mapeo de puntos base a frase. Se prueba aparte de la pantalla porque el
 * fixture de demo no tiene un consumo exacto: 84,2 % (8 421 bp) no es un
 * codigo entero y el redondeo hay que verlo con casos elegidos, no con el demo.
 */
describe('consumo en palabras', () => {
  it('84,2 % se dice "84 de cada 100" y avisa que es un poco más', () => {
    const consumo = consumoEnPalabras(8_421, 180_000);

    expect(consumo).toEqual({ deCadaCien: 84, solesUsados: 1516, precision: 'casi' });
    expect(fraseConsumo(consumo, 180_000)).toBe(
      'Ya se gastó 84 de cada 100 soles del mes (un poco más): S/ 1516 de S/ 1800.',
    );
  });

  it('84,6 % redondea al entero más cercano (85) y dice "casi"', () => {
    const consumo = consumoEnPalabras(8_460, 100_00);

    expect(consumo?.deCadaCien).toBe(85);
    expect(consumo?.precision).toBe('un-poco-mas');
    expect(fraseConsumo(consumo, 100_00)).toBe(
      'Ya se gastó 85 de cada 100 soles del mes (casi).',
    );
  });

  it('punto medio: 84,5 % sube a 85, como el dinero del dominio', () => {
    expect(consumoEnPalabras(8_450, 100_00)).toEqual({
      deCadaCien: 85,
      solesUsados: 85,
      precision: 'un-poco-mas',
    });
  });

  it('redondeo exacto: 84,0 % se dice sin matiz', () => {
    const consumo = consumoEnPalabras(8_400, 100_00);

    expect(consumo).toEqual({ deCadaCien: 84, solesUsados: 84, precision: 'exacto' });
    expect(fraseConsumo(consumo, 100_00)).toBe('Ya se gastó 84 de cada 100 soles del mes.');
  });

  it('sin consumo (sin asignado) no inventa un número', () => {
    expect(consumoEnPalabras(null, 0)).toBeNull();
    expect(fraseConsumo(null, 0)).toBe('sin dato — todavía no hay dinero asignado');
  });

  it('no pasa de 100 aunque el dominio entregue un excedente', () => {
    expect(consumoEnPalabras(12_300, 100_00)?.deCadaCien).toBe(100);
  });
});
