import { describe, expect, it } from 'vitest';

import { LOTE_MAXIMO, OutboxMemoria, type NuevoEvento } from './outbox.js';

function evento(lamport: number, deviceId: string): NuevoEvento {
  const sufijo = deviceId.endsWith('a') ? 'a' : 'b';
  const uuid = `00000000-0000-4000-8000-${String(lamport).padStart(11, '0')}${sufijo}`;
  return {
    eventUuid: uuid,
    idempotencyKey: uuid,
    lamport,
    deviceId,
    ollaId: 'olla_demo',
    entidad: 'movimientos',
    op: 'upsert',
    payload: {},
    creadoEn: '2026-11-23T10:00:00Z',
  };
}

describe('outbox', () => {
  it('ordena por (lamport, deviceId) y nunca por reloj de pared', () => {
    const outbox = new OutboxMemoria();
    outbox.encolar(evento(5, 'dev_b'));
    outbox.encolar(evento(2, 'dev_z'));
    outbox.encolar(evento(5, 'dev_a'));

    expect(outbox.pendientes().map((e) => `${e.lamport}:${e.deviceId}`)).toEqual([
      '2:dev_z',
      '5:dev_a',
      '5:dev_b',
    ]);
  });

  it('no acepta un idempotencyKey distinto del eventUuid', () => {
    const outbox = new OutboxMemoria();
    const base = evento(1, 'dev_a');
    expect(() =>
      outbox.encolar({ ...base, idempotencyKey: '00000000-0000-4000-8000-000000000099' }),
    ).toThrow();
  });

  it('nunca entrega mas de 100 eventos por lote', () => {
    const outbox = new OutboxMemoria();
    for (let i = 0; i < 120; i += 1) {
      outbox.encolar(evento(i, 'dev_a'));
    }
    expect(outbox.lote(500)).toHaveLength(LOTE_MAXIMO);
    expect(outbox.lote()).toHaveLength(LOTE_MAXIMO);
  });
});
