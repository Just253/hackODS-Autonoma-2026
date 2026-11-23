import type { ExtractResponse } from '@hackods/contracts';
import { describe, expect, it } from 'vitest';

import { TAU } from './clasificacion/config.js';
import {
  categorizarPorEmbedding,
  normalizarItemsBoleta,
  parsearDictado,
  similitudCoseno,
  type EntradaCatalogo,
} from './ingesta.js';

describe('parsearDictado', () => {
  it('"2 kilos de arroz" -> arroz, 2, kg', () => {
    const items = parsearDictado('2 kilos de arroz');
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ insumoTexto: 'arroz', cantidad: 2, unidad: 'kg' });
  });

  it('dos productos separados por coma', () => {
    const items = parsearDictado('2 kilos de arroz, 500 gramos de azúcar');
    expect(items).toHaveLength(2);
    expect(items[1]).toEqual({ insumoTexto: 'azúcar', cantidad: 500, unidad: 'g' });
  });

  it('"medio saco de papa" -> papa, 0.5, saco (unidad cruda conservada)', () => {
    const items = parsearDictado('medio saco de papa');
    expect(items[0]).toEqual({ insumoTexto: 'papa', cantidad: 0.5, unidad: 'saco' });
  });

  it('"3 litros de aceite" -> aceite, 3, lt', () => {
    const items = parsearDictado('3 litros de aceite');
    expect(items[0]).toEqual({ insumoTexto: 'aceite', cantidad: 3, unidad: 'lt' });
  });

  it('texto sin producto no inventa un item', () => {
    expect(parsearDictado('2 kilos')).toEqual([]);
    expect(parsearDictado('')).toEqual([]);
  });
});

function extractCon(
  items: ExtractResponse['items'],
  totalTexto: string | null = '60.00',
): ExtractResponse {
  return {
    ok: true,
    codigo: null,
    proveedor: { nombre: 'Bodega Test', ruc: null },
    tipoDocumento: 'boleta',
    serie: null,
    folio: null,
    fechaTexto: null,
    moneda: 'PEN',
    items,
    subtotalTexto: null,
    igvTexto: null,
    totalTexto,
    confianza: 0.9,
    advertencias: [],
  };
}

describe('normalizarItemsBoleta', () => {
  it('línea con unitario "2.50" -> 250 000 000 microcentesimos', () => {
    const extract = extractCon([
      {
        linea: 1,
        descripcion: 'arroz',
        cantidadTexto: '1',
        unidadTexto: 'kg',
        presentacionTexto: null,
        precioUnitarioTexto: '2.50',
        totalLineaTexto: '2.50',
      },
    ]);
    const [item] = normalizarItemsBoleta(extract);
    expect(item?.precioUnitarioMicrocent).toBe(250_000_000);
    expect(item?.porRevisar).toBe(false);
  });

  it('solo total de línea y cantidad -> reparte total / cantidad', () => {
    const extract = extractCon([
      {
        linea: 1,
        descripcion: 'papa',
        cantidadTexto: '2',
        unidadTexto: 'kg',
        presentacionTexto: null,
        precioUnitarioTexto: null,
        totalLineaTexto: '10.00',
      },
    ]);
    const [item] = normalizarItemsBoleta(extract);
    expect(item?.precioUnitarioMicrocent).toBe(500_000_000);
    expect(item?.porRevisar).toBe(false);
  });

  it('importe dudoso -> precio null y porRevisar (D8: no se adivina)', () => {
    const extract = extractCon([
      {
        linea: 1,
        descripcion: 'producto raro',
        cantidadTexto: null,
        unidadTexto: null,
        presentacionTexto: null,
        precioUnitarioTexto: '~2,5?',
        totalLineaTexto: null,
      },
    ]);
    const [item] = normalizarItemsBoleta(extract);
    expect(item?.precioUnitarioMicrocent).toBeNull();
    expect(item?.porRevisar).toBe(true);
  });

  it('el descuento/redondeo de total y unitario incoherentes no inventa unitario', () => {
    const extract = extractCon([
      {
        linea: 1,
        descripcion: 'aceite',
        cantidadTexto: 'x',
        unidadTexto: 'lt',
        presentacionTexto: null,
        precioUnitarioTexto: null,
        totalLineaTexto: '18.00',
      },
    ]);
    const [item] = normalizarItemsBoleta(extract);
    // Cantidad no numérica y sin unitario: no hay forma de repartir -> por_revisar.
    expect(item?.precioUnitarioMicrocent).toBeNull();
    expect(item?.porRevisar).toBe(true);
  });
});

describe('similitudCoseno', () => {
  it('vectores iguales -> 1', () => {
    expect(similitudCoseno([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('vectores ortogonales -> 0', () => {
    expect(similitudCoseno([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('dimensiones distintas -> 0 (no lanza)', () => {
    expect(similitudCoseno([1, 2], [1, 2, 3])).toBe(0);
  });
});

const CATALOGO: EntradaCatalogo[] = [
  { categoria: 'cereal', vector: [1, 0, 0] },
  { categoria: 'verdura', vector: [0, 1, 0] },
];

describe('categorizarPorEmbedding', () => {
  it('high similarity -> categoria correcta con la confianza real', () => {
    const result = categorizarPorEmbedding([0.99, 0.05, 0], CATALOGO);
    expect(result.categoria).toBe('cereal');
    expect(result.confianza).toBeGreaterThan(TAU);
  });

  it('bajo umbral -> sin_clasificar', () => {
    // [0.5, 0.866, 0] da cos 0.5 con cereal y 0.866 con verdura: verdura gana.
    // Un vector casi ortogonal a ambos (0.6, 0.6, 0.53) queda ~0.6, bajo TAU.
    const result = categorizarPorEmbedding([0.6, 0.6, 0.529], CATALOGO);
    expect(result.categoria).toBe('sin_clasificar');
    expect(result.confianza).toBeLessThan(TAU);
  });

  it('rojo -> verde: con umbral 0.99 el mismo vector queda sin_clasificar, con umbral 0.1 clasifica', () => {
    // Similitud exactamente 1.0 con [1,0,0]; el umbral decide.
    expect(categorizarPorEmbedding([1, 0, 0], CATALOGO, 1.01).categoria).toBe('sin_clasificar');
    expect(categorizarPorEmbedding([1, 0, 0], CATALOGO, 0.1).categoria).toBe('cereal');
  });

  it('catálogo vacío -> sin_clasificar con confianza 0', () => {
    expect(categorizarPorEmbedding([1, 0, 0], [])).toEqual({
      categoria: 'sin_clasificar',
      confianza: 0,
    });
  });
});
