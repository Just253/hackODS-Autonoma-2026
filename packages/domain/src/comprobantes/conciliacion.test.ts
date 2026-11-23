import { describe, expect, it } from 'vitest';

import type { Centimos } from '@hackods/contracts';

import { conciliarComprobante, type ItemConciliable } from './conciliacion.js';

const centimos = (valor: number): Centimos => valor as Centimos;

function item(total: number): ItemConciliable {
  return { totalCentavos: centimos(total) };
}

describe('conciliarComprobante', () => {
  it('cuadra exacto y es confirmable', () => {
    const resultado = conciliarComprobante([item(30_000), item(25_330)], centimos(55_330));

    expect(resultado.sumaCentavos).toBe(55_330);
    expect(resultado.diferenciaCentavos).toBe(0);
    expect(resultado.estado).toBe('cuadra');
    expect(resultado.confirmable).toBe(true);
  });

  it('tolera ±1 centimo de redondeo por linea', () => {
    const resultado = conciliarComprobante([item(55_329)], centimos(55_330));

    expect(resultado.diferenciaCentavos).toBe(1);
    expect(resultado.faltanteCentavos).toBe(1);
    expect(resultado.sobranteCentavos).toBe(0);
    expect(resultado.estado).toBe('cuadra');
    expect(resultado.confirmable).toBe(true);
  });

  it('mas de 1 centimo de faltante bloquea la confirmacion', () => {
    const resultado = conciliarComprobante([item(55_300)], centimos(55_330));

    expect(resultado.faltanteCentavos).toBe(30);
    expect(resultado.estado).toBe('faltante');
    expect(resultado.confirmable).toBe(false);
  });

  it('detecta sobrante y no lo confirma', () => {
    const resultado = conciliarComprobante([item(55_340)], centimos(55_330));

    expect(resultado.sobranteCentavos).toBe(10);
    expect(resultado.faltanteCentavos).toBe(0);
    expect(resultado.estado).toBe('sobrante');
    expect(resultado.confirmable).toBe(false);
  });

  it('sin items todo el total falta', () => {
    const resultado = conciliarComprobante([], centimos(5_000));

    expect(resultado.sumaCentavos).toBe(0);
    expect(resultado.faltanteCentavos).toBe(5_000);
    expect(resultado.confirmable).toBe(false);
  });
});
