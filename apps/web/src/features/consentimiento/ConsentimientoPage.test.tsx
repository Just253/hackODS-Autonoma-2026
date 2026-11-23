import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { baseDeOlla, cerrarBases } from '../../data/base.js';
import { consentimientosDe } from '../../data/consentimiento-repo.js';
import { outboxDe } from '../../data/outbox-repo.js';
import { OLLA_DEMO, altaPersona } from '../../data/repositorio.js';
import { ConsentimientoPage } from './ConsentimientoPage.js';

/**
 * Pantalla de consentimiento (#74) con la red apagada (`test/setup.ts` deja
 * `fetch` tirando) y datos ficticios creados en el test: el foco es que las dos
 * casillas estén separadas, que el estado se lea en palabras y que la
 * revocación corte sin red.
 */

const RELOJ = {
  ahora: () => '2026-11-23T10:00:00.000Z',
  azar: () => 0.1,
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

const dibujar = () =>
  render(
    <MemoryRouter>
      <ConsentimientoPage />
    </MemoryRouter>,
  );

beforeEach(async () => {
  await borrarBase();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await borrarBase();
});

describe('ConsentimientoPage', () => {
  it('sin personas en el padrón manda al padrón en vez de mostrar casillas vacías', async () => {
    dibujar();

    expect(await screen.findByText('Todavía no hay personas en el padrón')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir al padrón' })).toHaveAttribute('href', '/padron');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('con una persona muestra las dos casillas separadas, en "Sin registro"', async () => {
    const { persona } = await altaPersona(
      { anioNacimiento: 1990, sexo: 'F', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );

    dibujar();

    const seguimiento = await screen.findByRole('checkbox', { name: 'Seguimiento de salud' });
    const estadisticas = screen.getByRole('checkbox', { name: 'Estadísticas' });

    expect(seguimiento).not.toBe(estadisticas);
    expect(seguimiento).not.toBeChecked();
    expect(estadisticas).not.toBeChecked();
    // El código llega del padrón; el nombre no existe en esta pantalla (D2).
    expect(screen.getByRole('combobox', { name: /Persona/ })).toHaveValue(persona.codigoP);
    expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument();
    await screen.findAllByText(/Sin registro/);
  });

  it('otorgar el seguimiento lo deja "Otorgado", encola el cambio y no toca estadísticas', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'M', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );

    dibujar();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seguimiento de salud' }));

    await waitFor(() => expect(screen.getByText('Otorgado')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Seguimiento de salud' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Estadísticas' })).not.toBeChecked();
    expect(screen.getAllByText(/Sin registro/)).toHaveLength(1);

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    // El alta dejó su evento `personas`; el consentimiento suma el suyo.
    await waitFor(() => expect(outbox.total()).toBe(2));
    expect(outbox.pendientes().some((e) => e.entidad === 'consentimiento')).toBe(true);
  });

  it('el botón de revocar corta el seguimiento al instante, sin red', async () => {
    const { persona } = await altaPersona(
      { anioNacimiento: 1990, sexo: 'F', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );

    dibujar();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seguimiento de salud' }));
    await waitFor(() => expect(screen.getByText('Otorgado')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Revocar el seguimiento' }));

    await waitFor(() => expect(screen.getByText(/Revocado/)).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Seguimiento de salud' })).not.toBeChecked();
    expect(screen.queryByText('Otorgado')).not.toBeInTheDocument();
    expect(screen.getByText(/Permiso revocado\./)).toBeInTheDocument();

    // Append-only: quedan las dos firmas y las dos esperan en el outbox.
    expect(await consentimientosDe(persona.codigoP)).toHaveLength(2);
    const enEspera = outboxDe(baseDeOlla(OLLA_DEMO))
      .pendientes()
      .filter((e) => e.entidad === 'consentimiento');
    expect(enEspera).toHaveLength(2);
  });

  it('explica cómo se retira el permiso y que el plato no se toca', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'F', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ,
    );

    dibujar();

    expect(await screen.findByText('Cómo se retira el permiso')).toBeInTheDocument();
    expect(screen.getByText(/El plato no se toca en ningún caso\./)).toBeInTheDocument();
    expect(await screen.findByText(/al menos 10/)).toBeInTheDocument();
  });
});
