import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NuevoEvento } from '@hackods/sync';

import { baseDeOlla, cerrarBases } from '../data/base.js';
import { outboxDe } from '../data/outbox-repo.js';
import { altaPersona, DEVICE_DEMO, OLLA_DEMO } from '../data/repositorio.js';
import { crearRouterDePrueba } from './router.js';
import { pildoraDeSync, textoPendientes } from './Shell.js';
import { reiniciarEstadoSync } from './sync.js';
import type { EstadoSync } from './sync.js';

/**
 * Badge del outbox en el cascaron nuevo (#61) y su reactividad (issue #19).
 *
 * Dos cosas distintas viven en el header y no se pisan:
 *
 * - "En este dispositivo" (personas guardadas) lo alimenta `app/sync.ts`;
 * - "N cambios pendientes de sincronizar (local)" lo alimenta el outbox.
 *
 * Cuando hay pendientes manda el outbox; cuando no, el header vuelve a "En este
 * dispositivo". Nunca un "Sincronizado" a secas: no hay Supabase en la demo.
 * `fetch` esta apagado por `test/setup.ts`, asi que si algo toca la red, rompe.
 */

const RELOJ = {
  ahora: () => '2026-11-23T10:00:00.000Z',
  azar: () => 0.1,
  idEvento: () => 'ev-alta-1',
} as const;

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

/** El header tiene dos distribuciones; el badge vive en el `<header>`. */
function encabezado(): HTMLElement {
  return screen.getByRole('banner');
}

function evento(over: Partial<NuevoEvento> = {}): NuevoEvento {
  const eventUuid = over.eventUuid ?? 'ev-1';
  return {
    eventUuid,
    idempotencyKey: eventUuid,
    lamport: 1,
    deviceId: DEVICE_DEMO,
    ollaId: OLLA_DEMO,
    entidad: 'personas',
    op: 'upsert',
    payload: { codigoP: 'P-2345' },
    creadoEn: '2026-11-23T10:00:00.000Z',
    ...over,
  };
}

beforeEach(async () => {
  reiniciarEstadoSync();
  window.localStorage.clear();
  await borrarBase();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await borrarBase();
});

describe('badge del outbox', () => {
  it('sin pendientes el header dice "En este dispositivo" y no ofrece sincronizar', async () => {
    montar();

    await waitFor(() => {
      expect(within(encabezado()).getByText('En este dispositivo')).toBeInTheDocument();
    });
    expect(within(encabezado()).queryByRole('button', { name: /Guardar ahora/i })).toBeNull();
    // Nunca "Sincronizado" a secas: no hay red que lo respalde.
    expect(screen.queryByText(/^Sincronizado$/)).not.toBeInTheDocument();
  });

  it('con pendientes previos muestra el conteo exacto con "(local)" y el boton', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    outbox.encolar(evento({ eventUuid: 'ev-1' }));
    await outbox.asentar();

    montar();

    expect(await within(encabezado()).findByText(textoPendientes(1))).toBeInTheDocument();
    expect(within(encabezado()).getByRole('button', { name: /Guardar ahora/i })).toBeEnabled();
    expect(within(encabezado()).queryByText('En este dispositivo')).toBeNull();
  });

  it('sin backend configurado el boton no marca nada como enviado', async () => {
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    outbox.encolar(evento({ eventUuid: 'ev-2' }));
    await outbox.asentar();

    montar();
    await within(encabezado()).findByText(textoPendientes(1));

    await act(async () => {
      fireEvent.click(within(encabezado()).getByRole('button', { name: /Guardar ahora/i }));
    });

    // No hubo servidor que confirme: el evento sigue pendiente y el outbox en 1.
    expect(within(encabezado()).getByText(textoPendientes(1))).toBeInTheDocument();
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(1);
  });

  it('el badge pasa de 0 a 1 con un alta real y no se vacia sin backend', async () => {
    // El defecto de #45: el conteo se leia una sola vez al montar, asi que
    // despues de un alta el badge seguia en el estado anterior.
    montar();
    await waitFor(() => {
      expect(within(encabezado()).getByText('En este dispositivo')).toBeInTheDocument();
    });

    // Alta real: persona + evento en la misma transaccion (`altaPersona`).
    await act(async () => {
      await altaPersona(
        {
          anioNacimiento: 1958,
          sexo: 'F',
          categoria: 'adulto_mayor',
          nombreLocal: 'NOMBRE-LOCAL',
          alias: 'ALIAS-PRIVADO',
        },
        RELOJ,
      );
    });

    // Sin desmontar ni recargar: el outbox aviso y el header ya lo dice.
    expect(await within(encabezado()).findByText(textoPendientes(1))).toBeInTheDocument();
    const boton = within(encabezado()).getByRole('button', { name: /Guardar ahora/i });

    await act(async () => {
      fireEvent.click(boton);
    });

    // Sin backend no hay confirmacion: el pendiente sigue a la vista.
    expect(await within(encabezado()).findByText(textoPendientes(1))).toBeInTheDocument();
    expect(await baseDeOlla(OLLA_DEMO).outbox.count()).toBe(1);
  });
});

/**
 * Contrato de la pastilla, sin DOM ni backend. Lo importante: `Sincronizado`
 * SOLO aparece cuando el servidor confirmo. Un error no se muestra como exito.
 */
describe('pastilla del sync (contrato)', () => {
  const base: EstadoSync = {
    tono: 'local',
    texto: 'En este dispositivo',
    detalle: null,
    resultado: null,
  };

  it('sin intento de sync dice "En este dispositivo"', () => {
    expect(pildoraDeSync(0, base)).toMatchObject({
      tono: 'local',
      texto: 'En este dispositivo',
    });
  });

  it('con el servidor confirmando dice "Sincronizado" y el detalle real', () => {
    expect(
      pildoraDeSync(0, {
        ...base,
        resultado: { tono: 'enviado', detalle: '2 enviado(s) · 1 recibido(s)' },
      }),
    ).toMatchObject({ texto: 'Sincronizado', detalle: '2 enviado(s) · 1 recibido(s)' });
  });

  it('un error dice "Sin confirmar", nunca "Sincronizado"', () => {
    const pildora = pildoraDeSync(0, {
      ...base,
      resultado: { tono: 'error', detalle: 'No se pudo enviar' },
    });

    expect(pildora).toMatchObject({ tono: 'pendiente', texto: 'Sin confirmar' });
    expect(pildora.texto).not.toMatch(/sincronizado/i);
  });

  it('un rechazo del servidor se lee como conflicto', () => {
    expect(
      pildoraDeSync(0, {
        ...base,
        resultado: { tono: 'conflicto', detalle: '1 cambio(s) rechazado(s)' },
      }),
    ).toMatchObject({ tono: 'pendiente', texto: 'Cambios con conflicto' });
  });

  it('con pendientes manda el conteo, aunque el ultimo intento haya fallado', () => {
    expect(
      pildoraDeSync(3, {
        ...base,
        resultado: { tono: 'error', detalle: 'No se pudo enviar' },
      }),
    ).toMatchObject({ tono: 'pendiente', texto: textoPendientes(3) });
  });

  it('sin red se dice antes que cualquier resultado', () => {
    expect(
      pildoraDeSync(0, {
        tono: 'sin-conexion',
        texto: 'Sin conexión',
        detalle: 'Se guarda en este dispositivo',
        resultado: { tono: 'enviado', detalle: '2 enviado(s)' },
      }),
    ).toMatchObject({ tono: 'sin-conexion', texto: 'Sin conexión' });
  });
});
