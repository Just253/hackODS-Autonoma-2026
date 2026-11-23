import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { NuevoEvento, ResultadoPull, ResultadoPush } from '@hackods/sync';

import { baseDeOlla, cerrarBases, nombreBase } from './base.js';
import { cursorEnMemoria } from './cursor-sync.js';
import type { FuncionesSync } from './funciones-supabase.js';
import { outboxDe } from './outbox-repo.js';
import { SyncRemoto } from './sync-remoto.js';

/**
 * Push/pull reales contra un doble de las Edge Functions. Sin red y sin
 * Supabase: lo que se prueba es que el outbox SOLO se vacia cuando el servidor
 * confirma, y que un fallo deja los eventos pendientes con su error.
 */

const OLLA = 'olla-sync-01';

function id(n: number): string {
  return `00000000-0000-4000-8000-00000000000${n}`;
}

function evento(n: number, over: Partial<NuevoEvento> = {}): NuevoEvento {
  return {
    eventUuid: id(n),
    idempotencyKey: id(n),
    lamport: n,
    deviceId: 'device-a',
    ollaId: OLLA,
    entidad: 'personas',
    op: 'upsert',
    payload: { codigoP: 'P-AAAA' },
    creadoEn: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

function funciones(over: Partial<FuncionesSync>): FuncionesSync {
  return {
    push: async () => ({ datos: null, error: 'no implementado' }),
    pull: async () => ({ datos: null, error: 'no implementado' }),
    ...over,
  };
}

beforeEach(async () => {
  cerrarBases();
  await Dexie.delete(nombreBase(OLLA));
});

afterEach(async () => {
  cerrarBases();
  await Dexie.delete(nombreBase(OLLA));
});

describe('SyncRemoto.push', () => {
  it('vacia solo lo que el servidor confirmo (aceptado o duplicado)', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA));
    outbox.encolar(evento(1));
    outbox.encolar(evento(2));
    await outbox.asentar();

    const aceptados: string[] = [];
    const sync = new SyncRemoto(
      outbox,
      funciones({
        push: async (lote) => {
          aceptados.push(...lote.map((e) => e.idempotencyKey));
          const respuesta: ResultadoPush = {
            aceptados: [id(1)],
            duplicados: [id(2)],
            rechazados: [],
            pendientes: 0,
          };
          return { datos: respuesta, error: null };
        },
      }),
      cursorEnMemoria(),
    );

    const resultado = await sync.push();

    expect(aceptados).toEqual([id(1), id(2)]);
    expect(resultado.aceptados).toEqual([id(1)]);
    expect(outbox.total()).toBe(0);
    expect(await baseDeOlla(OLLA).outbox.count()).toBe(0);
  });

  it('si no hay respuesta, no se marca nada como enviado y queda el error', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA));
    outbox.encolar(evento(1));
    await outbox.asentar();

    const sync = new SyncRemoto(
      outbox,
      funciones({ push: async () => ({ datos: null, error: 'sin red' }) }),
      cursorEnMemoria(),
    );

    const resultado = await sync.push();

    expect(resultado.error).toBe('sin red');
    expect(outbox.total()).toBe(1);
    expect(outbox.pendientes()[0]?.ultimoError).toBe('sin red');
  });

  it('un rechazado queda pendiente con su motivo: conflicto visible, no descarte', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA));
    outbox.encolar(evento(1));
    outbox.encolar(evento(2));
    await outbox.asentar();

    const sync = new SyncRemoto(
      outbox,
      funciones({
        push: async () => ({
          datos: {
            aceptados: [id(1)],
            duplicados: [],
            rechazados: [{ idempotencyKey: id(2), motivo: 'conflicto de version' }],
            pendientes: 1,
          },
          error: null,
        }),
      }),
      cursorEnMemoria(),
    );

    const resultado = await sync.push();

    expect(resultado.rechazados).toHaveLength(1);
    expect(outbox.total()).toBe(1);
    expect(outbox.pendientes()[0]?.eventUuid).toBe(id(2));
    expect(outbox.pendientes()[0]?.ultimoError).toBe('conflicto de version');
  });

  it('sin eventos no llama al servidor', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA));
    let llamadas = 0;
    const sync = new SyncRemoto(
      outbox,
      funciones({
        push: async () => {
          llamadas += 1;
          return { datos: null, error: 'no deberia' };
        },
      }),
      cursorEnMemoria(),
    );

    const resultado = await sync.push();

    expect(llamadas).toBe(0);
    expect(resultado.pendientes).toBe(0);
  });
});

describe('SyncRemoto.pull', () => {
  it('devuelve los eventos y guarda el cursor que mando el servidor', async () => {
    const cursor = cursorEnMemoria();
    const recibido: ResultadoPull = {
      eventos: [],
      cursor: { lamport: 7, deviceId: 'device-z' },
    };
    const sync = new SyncRemoto(
      outboxDe(baseDeOlla(OLLA)),
      funciones({ pull: async () => ({ datos: recibido, error: null }) }),
      cursor,
    );

    const resultado = await sync.pull();

    expect(resultado.eventos).toEqual([]);
    expect(cursor.leer()).toEqual({ lamport: 7, deviceId: 'device-z' });
  });

  it('si falla, deja el cursor donde estaba y lo informa', async () => {
    const cursor = cursorEnMemoria({ lamport: 3, deviceId: 'device-a' });
    const sync = new SyncRemoto(
      outboxDe(baseDeOlla(OLLA)),
      funciones({ pull: async () => ({ datos: null, error: 'sin red' }) }),
      cursor,
    );

    const resultado = await sync.pull();

    expect(resultado.error).toBe('sin red');
    expect(resultado.eventos).toEqual([]);
    expect(cursor.leer()).toEqual({ lamport: 3, deviceId: 'device-a' });
  });
});
