import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseDeOlla, cerrarBases } from './base.js';
import {
  consentimientosDe,
  estadoDeConsentimiento,
  otorgarConsentimiento,
  revocarConsentimiento,
} from './consentimiento-repo.js';
import { outboxDe } from './outbox-repo.js';
import { OLLA_DEMO } from './repositorio.js';

/**
 * Consentimiento local (#74) con la red apagada (`test/setup.ts` deja `fetch`
 * tirando): otorgar y revocar se guardan en Dexie, se encolan en el outbox y la
 * revocación corta el seguimiento al instante. El reloj se inyecta; además,
 * otorgar y revocar en el mismo instante prueba que el orden lo decide el
 * `lamport` y no la fecha.
 */

const RELOJ = {
  ahora: () => '2026-11-23T10:00:00.000Z',
  azar: () => 0.1,
} as const;

const PERSONA = 'P-2ABC';

function borrarBase(): Promise<void> {
  cerrarBases();
  return new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: conexion abierta'));
  });
}

beforeEach(async () => {
  await borrarBase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await borrarBase();
});

describe('consentimiento en Dexie', () => {
  it('sin firmas, los dos permisos están en "sin registro" (no en "revocado")', async () => {
    const estados = await estadoDeConsentimiento(PERSONA);

    expect(estados.map((e) => [e.tipo, e.estado])).toEqual([
      ['seguimiento', 'sin_registro'],
      ['estadisticas', 'sin_registro'],
    ]);
    expect(estados.every((e) => e.registro === null)).toBe(true);
  });

  it('otorgar guarda la firma y encola un evento `consentimiento` en la misma transacción', async () => {
    await otorgarConsentimiento(PERSONA, 'seguimiento', RELOJ);

    const filas = await consentimientosDe(PERSONA);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      personaId: PERSONA,
      tipo: 'seguimiento',
      otorgado: true,
      revocadoEn: null,
      deviceId: 'dispositivo-demo-01',
      ollaId: OLLA_DEMO,
    });

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    const [evento] = outbox.pendientes();
    expect(outbox.total()).toBe(1);
    expect(evento?.entidad).toBe('consentimiento');
    expect(evento?.op).toBe('upsert');
    expect(evento?.eventUuid).toBe(evento?.idempotencyKey);
    // Lo que viaja es la firma, sin nombre ni alias (D2): el payload es la fila.
    expect(evento?.payload).toEqual(filas[0]);
    expect(JSON.stringify(evento?.payload)).not.toContain('nombre');
  });

  it('los dos permisos son independientes: otorgar uno no marca el otro', async () => {
    await otorgarConsentimiento(PERSONA, 'estadisticas', RELOJ);

    const estados = await estadoDeConsentimiento(PERSONA);
    expect(estados).toEqual([
      expect.objectContaining({ tipo: 'seguimiento', estado: 'sin_registro' }),
      expect.objectContaining({ tipo: 'estadisticas', estado: 'otorgado' }),
    ]);
  });

  it('revocar sin red corta el seguimiento al instante y deja la revocación en el outbox', async () => {
    await otorgarConsentimiento(PERSONA, 'seguimiento', RELOJ);
    // Mismo instante a propósito: el `lamport` es lo que ordena, no la fecha.
    await revocarConsentimiento(PERSONA, 'seguimiento', RELOJ);

    const estados = await estadoDeConsentimiento(PERSONA);
    const seguimiento = estados.find((e) => e.tipo === 'seguimiento');
    expect(seguimiento?.estado).toBe('revocado');
    expect(seguimiento?.registro?.otorgado).toBe(false);
    expect(seguimiento?.registro?.revocadoEn).not.toBeNull();

    // Append-only: la firma anterior sigue ahí; la revocación es otra fila.
    expect(await consentimientosDe(PERSONA)).toHaveLength(2);

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    expect(outbox.total()).toBe(2);
    expect(
      outbox.pendientes().every((e) => e.entidad === 'consentimiento' && e.op === 'upsert'),
    ).toBe(true);
  });

  it('volver a otorgar después de revocar devuelve el permiso, sin borrar la revocación', async () => {
    await otorgarConsentimiento(PERSONA, 'seguimiento', RELOJ);
    await revocarConsentimiento(PERSONA, 'seguimiento', RELOJ);
    await otorgarConsentimiento(PERSONA, 'seguimiento', {
      ...RELOJ,
      ahora: () => '2026-11-23T10:05:00.000Z',
    });

    const estados = await estadoDeConsentimiento(PERSONA);
    expect(estados[0]?.estado).toBe('otorgado');
    expect(await consentimientosDe(PERSONA)).toHaveLength(3);
  });

  it('la revocación sobrevive a reabrir la base (no depende de la sesión en memoria)', async () => {
    await otorgarConsentimiento(PERSONA, 'seguimiento', RELOJ);
    await revocarConsentimiento(PERSONA, 'seguimiento', RELOJ);

    cerrarBases();

    const estados = await estadoDeConsentimiento(PERSONA);
    expect(estados[0]?.estado).toBe('revocado');
    expect(await baseDeOlla(OLLA_DEMO).consentimiento.count()).toBe(2);
  });

  it('no mezcla personas: las firmas de una no tocan el estado de la otra', async () => {
    await otorgarConsentimiento(PERSONA, 'seguimiento', RELOJ);
    await otorgarConsentimiento('P-9XYZ', 'estadisticas', RELOJ);

    const deOtra = await estadoDeConsentimiento('P-9XYZ');
    expect(deOtra[0]?.estado).toBe('sin_registro');
    expect(deOtra[1]?.estado).toBe('otorgado');
  });
});
