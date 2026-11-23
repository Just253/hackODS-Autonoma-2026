/**
 * Catálogo de insumos FICTICIO de la demo (issue #69).
 *
 * Nada de esto es un dato real: ni precios, ni proveedores, ni existencias de
 * una olla concreta. Los id y las denominaciones coinciden con las palabras que
 * el parser de captura (`packages/domain/src/captura/parser.ts`) ya reconoce,
 * para que "arroz 5 kg" se pueda registrar sin inventar una equivalencia.
 *
 * `stockMinimo` va en la unidad base del insumo (`g`, `ml`, `unidad`), igual
 * que `movimientos.delta`. Los mínimos son de ejemplo: cada olla los corrige.
 */
import type { Insumo } from '@hackods/contracts';

export const INSUMOS_DEMO: readonly Insumo[] = [
  {
    id: 'arroz',
    denominacion: 'arroz',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 5000,
    perecedero: false,
    alergenos: [],
  },
  {
    id: 'pollo',
    denominacion: 'pollo',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 3000,
    perecedero: true,
    alergenos: [],
  },
  {
    id: 'papa',
    denominacion: 'papa',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 8000,
    perecedero: true,
    alergenos: [],
  },
  {
    id: 'cebolla',
    denominacion: 'cebolla',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 2000,
    perecedero: true,
    alergenos: [],
  },
  {
    id: 'cebolla-china',
    denominacion: 'cebolla china',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 500,
    perecedero: true,
    alergenos: [],
  },
  {
    id: 'fideos',
    denominacion: 'fideos',
    unidadBase: 'g',
    gramosPorUnidad: null,
    stockMinimo: 2500,
    perecedero: false,
    alergenos: ['gluten'],
  },
  {
    id: 'aceite',
    denominacion: 'aceite',
    unidadBase: 'ml',
    gramosPorUnidad: null,
    stockMinimo: 1000,
    perecedero: false,
    alergenos: [],
  },
  {
    id: 'huevo',
    denominacion: 'huevo',
    unidadBase: 'unidad',
    gramosPorUnidad: null,
    stockMinimo: 30,
    perecedero: true,
    alergenos: ['huevo'],
  },
];

/** Texto de ejemplo para el cuadro de entrada: se ve, no se registra solo. */
export const TEXTO_ENTRADA_DEMO = 'arroz 5 kg 24.50, pollo 3 kg 14.00';
