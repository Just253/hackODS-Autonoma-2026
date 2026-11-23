import { describe, expect, it } from 'vitest';

import type { ProveedorComposicion, ReglasMotor } from './contrato.js';
import { ContratoInvalido } from './errors.js';
import { crearContexto, validarReglas } from './reglas.js';

/**
 * Reglas en blanco: TODOS los valores son `null` = [valor a confirmar].
 * Este fixture no recomienda nada; solo prueba que el motor rechaza un contrato incompleto.
 */
const reglasVacias: ReglasMotor = {
  version: '',
  coberturaDia: {
    desayuno: null,
    almuerzo: null,
    cena: null,
    refaccion: null,
    unico: null,
  },
  coberturaHierroComidaPrincipal: null,
  umbralDeficit: null,
  umbralesSeveridad: { critico: null, alto: null, moderado: null },
  pesos: {
    energia: null,
    proteina: null,
    hierro: null,
    zinc: null,
    vitaminaA: null,
    folato: null,
    vitaminaB12: null,
    calcio: null,
  },
  topesDePuntaje: [],
  bandasVeredicto: [],
  factorObjetivoAnemia: null,
  maxSugerencias: null,
  maxNutrientesAAjustar: null,
  escalonesGramos: [],
  maxFrecuenciaInsumo: {},
  umbralRepeticionOverride: null,
};

const composicionVacia: ProveedorComposicion = {
  tablaId: 'sin_tabla',
  version: 'v0-borrador',
  aporte: () => null,
  retencion: () => 1,
};

const ids = { nuevo: () => 'id_de_prueba' };

describe('contrato del motor nutricional', () => {
  it('rechaza ReglasMotor ausente', () => {
    expect(() => validarReglas(null)).toThrow(ContratoInvalido);
  });

  it('rechaza reglas con valores [a confirmar] y dice cuales faltan', () => {
    let error: ContratoInvalido | null = null;
    try {
      validarReglas(reglasVacias);
    } catch (e) {
      error = e as ContratoInvalido;
    }
    expect(error).toBeInstanceOf(ContratoInvalido);
    expect(error?.campos).toContain('version');
    expect(error?.campos).toContain('umbralDeficit');
    expect(error?.campos).toContain('pesos.energia');
  });

  it('no construye un Contexto con reglas incompletas', () => {
    expect(() =>
      crearContexto({
        ahora: '2026-11-23T10:00:00Z',
        reglas: reglasVacias,
        composicion: composicionVacia,
        ids,
      }),
    ).toThrow(ContratoInvalido);
  });
});
