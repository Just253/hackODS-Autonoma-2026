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
  toleranciaPorcion: null,
  umbralDesvioPorcion: null,
  maxSustitucionesPorPlato: null,
  maxPlatosPorMomento: null,
  frecuenciaMaxima: {},
  umbralesSeveridad: { critico: null, alto: null, moderado: null },
  coberturaMinimaPorComida: null,
  gruposObligatorios: ['adulto'],
};

const composicionVacia: ProveedorComposicion = {
  tablaId: 'sin_tabla',
  version: 'v0-borrador',
  aporte: () => null,
  retencion: () => 1,
};

const ids = { nuevo: () => 'id_de_prueba' };

describe('contrato del motor nutricional (menu firmado)', () => {
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
    expect(error?.campos).toContain('toleranciaPorcion');
    expect(error?.campos).toContain('coberturaMinimaPorComida');
  });

  it('rechaza una lista de grupos obligatorios vacia', () => {
    let error: ContratoInvalido | null = null;
    try {
      validarReglas({ ...reglasVacias, gruposObligatorios: [] });
    } catch (e) {
      error = e as ContratoInvalido;
    }
    expect(error?.campos).toContain('gruposObligatorios');
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
