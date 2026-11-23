import { describe, expect, it } from 'vitest';

import { embedRequestSchema } from './compute.js';
import {
  alertaSchema,
  aCentimos,
  centimosSchema,
  estadoComprobanteSchema,
  presupuestoSchema,
} from './finanzas.js';

describe('dinero branded', () => {
  it('acepta enteros y rechaza floats, strings y NaN', () => {
    expect(centimosSchema.safeParse(1234).success).toBe(true);
    expect(centimosSchema.safeParse(12.5).success).toBe(false);
    expect(centimosSchema.safeParse('1234').success).toBe(false);
    expect(centimosSchema.safeParse(Number.NaN).success).toBe(false);
    expect(Number(aCentimos(55330))).toBe(55_330);
  });
});

describe('presupuesto', () => {
  it('valida el presupuesto con montos enteros y estado literal', () => {
    const base = {
      id: 'pp_01',
      ollaId: 'olla_demo',
      ambito: 'mensual',
      periodoDesde: '2026-11-01',
      periodoHasta: '2026-11-30',
      moneda: 'PEN',
      montoAsignadoInicialCentavos: 180_000,
      estado: 'vigente',
      version: 1,
      nota: null,
      createdAt: '2026-11-01T09:00:00Z',
      updatedAt: '2026-11-01T09:00:00Z',
      deletedAt: null,
      deviceId: 'device_demo',
      lamport: 1,
    };

    expect(presupuestoSchema.parse(base).montoAsignadoInicialCentavos).toBe(180_000);
    expect(presupuestoSchema.safeParse({ ...base, ambito: 'semanal' }).success).toBe(false);
    expect(presupuestoSchema.safeParse({ ...base, montoAsignadoInicialCentavos: 1800.5 }).success).toBe(
      false,
    );
  });
});

describe('estados y alertas', () => {
  it('un estado de comprobante es una union literal, no un string suelto', () => {
    expect(estadoComprobanteSchema.safeParse('asentado').success).toBe(true);
    expect(estadoComprobanteSchema.safeParse('asentadoo').success).toBe(false);
  });

  it('una alerta acepta payload nulo y conserva su clave de deduplicacion', () => {
    const alerta = alertaSchema.parse({
      id: 'al_01',
      ollaId: 'olla_demo',
      tipo: 'presupuesto_80',
      severidad: 'atencion',
      estado: 'abierta',
      claveDedup: 'presupuesto_80:pp_01',
      entidad: 'presupuesto',
      entidadId: 'pp_01',
      payload: null,
      creadaEn: '2026-11-18T15:00:00Z',
      vistaEn: null,
      resueltaEn: null,
      resueltaPorRef: null,
      silenciadaHasta: null,
    });

    expect(alerta.claveDedup).toBe('presupuesto_80:pp_01');
  });
});

describe('compute', () => {
  it('limita /embed a 64 textos y body minimo', () => {
    const base = { idempotencyKey: 'idem_01', requestId: 'req_01', modeloEsperado: 'bge-m3' };

    expect(embedRequestSchema.safeParse({ ...base, textos: ['papa'] }).success).toBe(true);
    expect(embedRequestSchema.safeParse({ ...base, textos: [] }).success).toBe(false);
    expect(
      embedRequestSchema.safeParse({
        ...base,
        textos: Array.from({ length: 65 }, () => 'papa'),
      }).success,
    ).toBe(false);
  });
});
