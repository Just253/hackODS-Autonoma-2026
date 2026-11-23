import { describe, expect, it } from 'vitest';

import {
  actaItemSchema,
  actaSchema,
  codigoActaSchema,
  estadoActaSchema,
  excedenteSchema,
  firmaActaSchema,
  hashActaSchema,
  matchExcedenteSchema,
} from './acta.js';

const HASH = 'a'.repeat(64);

const ACTA = {
  id: 'acta_1',
  origen: 'olla_1',
  destino: 'olla_2',
  estado: 'borrador',
  codigo: '0007',
  hash: HASH,
  items: [{ insumoId: 'arroz', lote: 'L-01', cantidad: 20, unidad: 'kg' }],
  firmas: [],
  firmadaEn: null,
  deviceId: 'dev-1',
  lamport: 3,
} as const;

const FIRMA = {
  ollaId: 'olla_1',
  rol: 'organizadora',
  llave: 'pub-1',
  firmadaEn: '2026-11-23T10:00:00.000Z',
} as const;

describe('actaSchema', () => {
  it('acepta un acta borrador valida (codigo 0007 con ceros)', () => {
    expect(actaSchema.parse(ACTA)).toMatchObject({ codigo: '0007' });
  });

  it('rechaza codigo que no es de 4 digitos', () => {
    expect(codigoActaSchema.safeParse('7').success).toBe(false);
    expect(codigoActaSchema.safeParse('12345').success).toBe(false);
    expect(codigoActaSchema.safeParse('12a4').success).toBe(false);
    expect(codigoActaSchema.safeParse('0012').success).toBe(true);
  });

  it('rechaza hash que no es SHA-256 hex', () => {
    expect(hashActaSchema.safeParse('deadbeef').success).toBe(false);
    expect(hashActaSchema.safeParse(HASH).success).toBe(true);
  });

  it('rechaza acta sin items', () => {
    expect(actaSchema.safeParse({ ...ACTA, items: [] }).success).toBe(false);
  });

  it('rechaza estado desconocido', () => {
    expect(estadoActaSchema.safeParse('firmada').success).toBe(true);
    expect(estadoActaSchema.safeParse('aprobada').success).toBe(false);
  });

  it('firma y actaItem: cantidad positiva, unidad del dominio, lote nullable', () => {
    expect(firmaActaSchema.safeParse(FIRMA).success).toBe(true);
    expect(actaItemSchema.safeParse({ insumoId: 'arroz', lote: null, cantidad: 1, unidad: 'g' }).success).toBe(true);
    expect(actaItemSchema.safeParse({ insumoId: 'arroz', lote: null, cantidad: 0, unidad: 'g' }).success).toBe(false);
  });
});

describe('excedenteSchema y matchExcedenteSchema', () => {
  it('excedente valido: vencimiento fecha ISO, cantidad positiva', () => {
    const excedente = {
      id: 'exc_1',
      ollaId: 'olla_1',
      insumoId: 'arroz',
      cantidad: 5,
      unidad: 'kg',
      vencimiento: '2026-12-01',
      publicadoEn: '2026-11-23T10:00:00.000Z',
    };
    expect(excedenteSchema.safeParse(excedente).success).toBe(true);
    expect(excedenteSchema.safeParse({ ...excedente, vencimiento: '01/12/2026' }).success).toBe(false);
  });

  it('match lleva score 0..1 y al menos una razon', () => {
    const match = {
      excedenteId: 'exc_1',
      necesidadOllaId: 'olla_2',
      insumoId: 'arroz',
      score: 0.87,
      razones: ['vence en 2 dias'],
    };
    expect(matchExcedenteSchema.safeParse(match).success).toBe(true);
    expect(matchExcedenteSchema.safeParse({ ...match, score: 1.4 }).success).toBe(false);
    expect(matchExcedenteSchema.safeParse({ ...match, razones: [] }).success).toBe(false);
  });
});
