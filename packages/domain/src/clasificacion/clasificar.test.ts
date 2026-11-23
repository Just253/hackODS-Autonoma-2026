import { describe, expect, it } from 'vitest';

import type { Clasificacion } from '@hackods/contracts';

import { PISO, TAU } from './config.js';
import {
  clasificarItem,
  sumaAlPresupuesto,
  type CandidatoConProducto,
  type ItemClasificable,
} from './clasificar.js';

/**
 * Regla de dos puertas + piso (docs/contracts/clasificacion.md 4.3) y la
 * invariante de DEC-2026-0008. Los numeros no se repiten: salen de config.ts.
 */

function item(id = 'item-01'): ItemClasificable {
  return { id, cantidadMilesimas: 5_000, unidadBase: 'g' };
}

function candidato(productoId: string, similitud: number): CandidatoConProducto {
  return { productoId, nombre: productoId, categoria: 'abarrotes', similitud };
}

function estadoDe(candidatos: readonly CandidatoConProducto[]): Clasificacion['estado'] {
  return clasificarItem(item(), candidatos).estado;
}

describe('clasificarItem', () => {
  it('confirma cuando supera tau y el margen', () => {
    const resultado = clasificarItem(item(), [candidato('a', 0.9), candidato('b', 0.5)]);
    expect(resultado.estado).toBe('confirmado');
    expect(resultado.motivo).toBe('similitud_alta');
    expect(resultado.productoId).toBe('a');
    expect(resultado.requiereRevision).toBe(false);
  });

  it('queda por revisar por margen insuficiente', () => {
    const resultado = clasificarItem(item(), [candidato('a', TAU + 0.001), candidato('b', TAU)]);
    expect(resultado.estado).toBe('por_revisar');
    expect(resultado.motivo).toBe('margen_insuficiente');
    expect(resultado.productoId).toBeNull();
  });

  it('queda por revisar si no alcanza tau pero supera el piso', () => {
    const resultado = clasificarItem(item(), [candidato('a', PISO + 0.01)]);
    expect(resultado.estado).toBe('por_revisar');
    expect(resultado.motivo).toBe('similitud_baja');
  });

  it('queda desconocido por debajo del piso', () => {
    expect(estadoDe([candidato('a', PISO - 0.01)])).toBe('desconocido');
  });

  it('queda desconocido sin candidatos', () => {
    const resultado = clasificarItem(item(), []);
    expect(resultado.estado).toBe('desconocido');
    expect(resultado.motivo).toBe('sin_catalogo');
    expect(resultado.confianza).toBe(0);
  });

  it('sin segundo candidato el margen es la similitud', () => {
    expect(estadoDe([candidato('a', 0.95)])).toBe('confirmado');
  });

  it('es deterministica: el orden de entrada no cambia el resultado', () => {
    const a = candidato('a', 0.9);
    const b = candidato('b', 0.5);
    expect(clasificarItem(item(), [a, b])).toEqual(clasificarItem(item(), [b, a]));
  });

  it('ordena y recorta a los 3 mejores candidatos', () => {
    const resultado = clasificarItem(item(), [
      candidato('d', 0.2),
      candidato('a', 0.9),
      candidato('c', 0.4),
      candidato('b', 0.5),
    ]);
    expect(resultado.candidatos.map((c) => c.productoId)).toEqual(['a', 'b', 'c']);
  });

  it('la cantidad base sale del item y no de un numero propio', () => {
    const resultado = clasificarItem(item(), [candidato('a', 0.9)]);
    expect(resultado.cantidadBase).toBe(5_000);
  });
});

describe('sumaAlPresupuesto', () => {
  it('solo es true para confirmado', () => {
    expect(sumaAlPresupuesto('confirmado')).toBe(true);
    expect(sumaAlPresupuesto('por_revisar')).toBe(false);
    expect(sumaAlPresupuesto('desconocido')).toBe(false);
  });
});