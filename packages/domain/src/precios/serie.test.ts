import { describe, expect, it } from 'vitest';

import type { Microcentesimos } from '@hackods/contracts';

import { mediana } from '../aritmetica.js';
import { medianaMovil, type ObservacionPrecio } from './serie.js';

const micro = (valor: number): Microcentesimos => valor as Microcentesimos;

function serie(valores: readonly number[]): ObservacionPrecio[] {
  return valores.map((valor, indice) => ({
    id: `obs_${indice + 1}`,
    valor: micro(valor),
    fecha: `2026-11-0${indice + 1}`,
  }));
}

describe('medianaMovil', () => {
  it('excluye el outlier de la serie de papa de §8.5 y conserva la mediana', () => {
    const resultado = medianaMovil(serie([210_000, 215_000, 220_000, 225_000, 230_000, 220_000, 2_200_000]));

    expect(resultado.mediana).toBe(220_000);
    expect(resultado.mad).toBe(5_000);
    expect(resultado.minimo).toBe(210_000);
    expect(resultado.maximo).toBe(230_000);
    expect(resultado.muestraInsuficiente).toBe(false);

    const ultima = resultado.evaluadas.at(-1);
    expect(ultima?.excluida).toBe(true);
    expect(ultima?.motivo).toBe('mad');
    expect(ultima?.z).toBeGreaterThan(3.5);
  });

  it('aplica la guarda P50/3..3xP50 antes del MAD', () => {
    const resultado = medianaMovil(
      serie([210_000, 215_000, 220_000, 225_000, 230_000, 220_000, 2_200_000]),
      { p50Referencia: micro(220_000) },
    );

    const ultima = resultado.evaluadas.at(-1);
    expect(ultima?.excluida).toBe(true);
    expect(ultima?.motivo).toBe('fuera_de_rango');
    expect(resultado.p50Referencia).toBe(220_000);
  });

  it('con menos de 3 observaciones no publica mediana', () => {
    const resultado = medianaMovil(serie([100_000, 101_000]));

    expect(resultado.muestraInsuficiente).toBe(true);
    expect(resultado.mediana).toBeNull();
    expect(resultado.evaluadas).toHaveLength(2);
  });

  it('si MAD es 0 usa la regla de respaldo |x - mediana| > 3xmediana', () => {
    const resultado = medianaMovil(serie([100_000, 100_000, 100_000, 500_000]));

    expect(resultado.mad).toBe(0);
    expect(resultado.evaluadas.at(-1)?.motivo).toBe('mad');
    expect(resultado.mediana).toBe(100_000);
    expect(resultado.evaluadas.at(-1)?.z).toBeNull();
  });

  it('tolera una serie vacia sin lanzar', () => {
    const resultado = medianaMovil([]);

    expect(resultado.evaluadas).toHaveLength(0);
    expect(resultado.mediana).toBeNull();
    expect(resultado.muestraInsuficiente).toBe(true);
  });
});

describe('mediana (aritmetica)', () => {
  it('con cantidad par promedia y redondea mitad hacia arriba', () => {
    expect(mediana([100, 101])).toBe(101);
    expect(mediana([100, 100, 101, 102])).toBe(101);
    expect(mediana([])).toBeNull();
  });
});
