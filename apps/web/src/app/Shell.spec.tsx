import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearRouterDePrueba } from './router.js';
import { TEXTO_SINCRONIZADO_LOCAL, textoPendientes } from './Shell.js';
import { baseDeOlla, cerrarBases } from '../data/base.js';
import { outboxDe } from '../data/outbox-repo.js';
import { DEVICE_DEMO, OLLA_DEMO } from '../data/repositorio.js';

/**
 * Badge honesto del header (issue #19).
 *
 * Los textos son exactos a proposito: "N cambios pendientes de sincronizar
 * (local)" y "Sincronizado (local)". Nunca "Sincronizado" a secas: no hay
 * Supabase en la demo y fingir red seria peor que no mostrar nada.
 * `fetch` esta apagado por `test/setup.ts`, asi que si algo toca la red, rompe.
 */

function borrarBase(): Promise<void> {
  cerrarBases();
  return new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: conexion abierta'));
  });
}

function montar() {
  return render(<RouterProvider router={crearRouterDePrueba('/padron')} />);
}

beforeEach(async () => {
  await borrarBase();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await borrarBase();
});

describe('badge de sincronizacion local', () => {
  it('sin pendientes muestra "Sincronizado (local)", nunca "Sincronizado" a secas', async () => {
    montar();
    const badge = await screen.findByText(TEXTO_SINCRONIZADO_LOCAL);
    expect(badge).toBeInTheDocument();
    expect(screen.queryByText(/^Sincronizado$/)).not.toBeInTheDocument();
  });

  it('con pendientes muestra el conteo exacto con "(local)"', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    outbox.encolar({
      eventUuid: 'ev-1',
      idempotencyKey: 'ev-1',
      lamport: 1,
      deviceId: DEVICE_DEMO,
      ollaId: OLLA_DEMO,
      entidad: 'personas',
      op: 'upsert',
      payload: { codigoP: 'P-2345' },
      creadoEn: '2026-11-23T10:00:00.000Z',
    });
    await outbox.asentar();

    montar();
    expect(await screen.findByText(textoPendientes(1))).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SINCRONIZADO_LOCAL)).not.toBeInTheDocument();
  });

  it('un push local pasa de "1 cambio pendiente" a "Sincronizado (local)"', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    outbox.encolar({
      eventUuid: 'ev-2',
      idempotencyKey: 'ev-2',
      lamport: 1,
      deviceId: DEVICE_DEMO,
      ollaId: OLLA_DEMO,
      entidad: 'raciones',
      op: 'upsert',
      payload: { personaCodigoP: 'P-2345' },
      creadoEn: '2026-11-23T10:00:00.000Z',
    });
    await outbox.asentar();

    montar();
    await screen.findByText(textoPendientes(1));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora \(local\)/i }));
    });

    await waitFor(() => {
      expect(screen.getByText(TEXTO_SINCRONIZADO_LOCAL)).toBeInTheDocument();
    });
  });
});