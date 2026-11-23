import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { EventoEnviado } from '@hackods/sync';

import { aplicarEventos } from './aplicar-pull.js';
import { baseDeOlla, cerrarBases, nombreBase } from './base.js';

/**
 * Aplicacion del pull a Dexie, sin red. Un evento de otra olla, uno invalido y
 * uno de una entidad que no tiene tabla local: cada uno se cuenta como
 * corresponde y ninguno rompe la pantalla.
 */

const OLLA = 'olla-pull-01';

function evento(over: Partial<EventoEnviado> = {}): EventoEnviado {
  return {
    eventUuid: '11111111-1111-4111-8111-111111111111',
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    lamport: 1,
    deviceId: 'device-a',
    ollaId: OLLA,
    entidad: 'personas',
    op: 'upsert',
    payload: {},
    creadoEn: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

const PERSONA = {
  codigoP: 'P-AAAA',
  ollaId: OLLA,
  anioNacimiento: 1990,
  sexo: 'F',
  categoria: 'adulto',
  consentimientoSeguimiento: false,
  anemia: 'sin_dato',
  pesoKg: null,
  tallaCm: null,
  notas: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deletedAt: null,
  deviceId: 'device-a',
  lamport: 1,
};

const MOVIMIENTO = {
  id: 'mov-1',
  ollaId: OLLA,
  insumoId: 'arroz',
  delta: -500,
  motivo: 'salida',
  autor: 'demo',
  at: '2026-11-01T10:00:00.000Z',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
  deletedAt: null,
  deviceId: 'device-a',
  lamport: 1,
};

const PRECIO = {
  id: 'precio-1',
  insumoId: 'arroz',
  canal: 'mayorista',
  unidad: 'g',
  precio: 420000,
  fecha: '2026-11-01',
  fuente: 'demo',
  url: null,
};

beforeEach(async () => {
  cerrarBases();
  await Dexie.delete(nombreBase(OLLA));
});

afterEach(async () => {
  cerrarBases();
  await Dexie.delete(nombreBase(OLLA));
});

describe('aplicarEventos', () => {
  it('escribe personas, movimientos y precios validados', async () => {
    const base = baseDeOlla(OLLA);

    const resumen = await aplicarEventos(base, OLLA, [
      evento({ payload: PERSONA }),
      evento({
        eventUuid: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
        entidad: 'movimientos',
        payload: MOVIMIENTO,
      }),
      evento({
        eventUuid: '33333333-3333-4333-8333-333333333333',
        idempotencyKey: '33333333-3333-4333-8333-333333333333',
        entidad: 'precios',
        payload: PRECIO,
      }),
    ]);

    expect(resumen).toEqual({ aplicados: 3, ignorados: 0, invalidos: 0 });
    expect(await base.personas.get('P-AAAA')).toMatchObject({ categoria: 'adulto' });
    expect(await base.movimientos.get('mov-1')).toMatchObject({ delta: -500 });
    expect(await base.precios.get('precio-1')).toMatchObject({ precio: 420000 });
  });

  it('es idempotente: el mismo evento dos veces deja una sola fila', async () => {
    const base = baseDeOlla(OLLA);
    const uno = evento({ payload: PERSONA });

    await aplicarEventos(base, OLLA, [uno]);
    await aplicarEventos(base, OLLA, [uno]);

    expect(await base.personas.count()).toBe(1);
  });

  it('ignora otra olla, deletes y entidades sin tabla local', async () => {
    const base = baseDeOlla(OLLA);

    const resumen = await aplicarEventos(base, OLLA, [
      evento({ ollaId: 'otra-olla', payload: PERSONA }),
      evento({ op: 'delete', payload: PERSONA }),
      evento({ entidad: 'raciones', payload: { personaCodigoP: 'P-AAAA' } }),
    ]);

    expect(resumen).toEqual({ aplicados: 0, ignorados: 3, invalidos: 0 });
    expect(await base.personas.count()).toBe(0);
  });

  it('un payload que no cumple el contrato no se guarda: se cuenta invalido', async () => {
    const base = baseDeOlla(OLLA);

    const resumen = await aplicarEventos(base, OLLA, [
      evento({ payload: { ...PERSONA, categoria: 'marciano' } }),
    ]);

    expect(resumen).toEqual({ aplicados: 0, ignorados: 0, invalidos: 1 });
    expect(await base.personas.count()).toBe(0);
  });
});
