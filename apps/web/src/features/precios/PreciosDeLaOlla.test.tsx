import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { guardarSesion } from '../../app/sesion.js';
import { ProveedorRemoto } from '../../data/ProveedorRemoto.js';
import type { ClienteDatos } from '../../data/cliente-remoto.js';
import { clienteFalso } from '../../test/cliente-falso.js';
import { PreciosDeLaOlla } from './PreciosDeLaOlla.js';

/**
 * Precios de la olla contra Supabase (doble, sin red).
 *
 * - Sin sesión: "Conectá Supabase", sin productos de ejemplo.
 * - Con sesión: las series reales, con la unidad de compra y "sin dato" cuando
 *   no hay ventana previa (el seed tiene una sola semana).
 * - Error: estado de error con reintento, sin fixtures.
 */

const OLLA = '00000000-0000-4000-8000-000000000001';

function conSesionNube(): void {
  guardarSesion({
    memberId: 'member-1',
    ollaId: OLLA,
    nombreOlla: 'Demo Ate',
    rol: 'organizadora',
    modo: 'cloud',
  });
}

function filasDelSeed(): readonly Record<string, unknown>[] {
  return ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map(
    (fecha, indice) => ({
      olla_id: OLLA,
      insumo_id: 'arroz',
      canal: 'mayorista',
      unidad: 'g',
      precio: 420000 + indice * 1000,
      fecha,
    }),
  );
}

function montar(cliente: ClienteDatos | null) {
  return render(
    <ProveedorRemoto cliente={cliente}>
      <PreciosDeLaOlla />
    </ProveedorRemoto>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('PreciosDeLaOlla', () => {
  it('sin sesión pide conectar Supabase y no muestra precios de ejemplo', () => {
    montar(clienteFalso({}).cliente);

    expect(screen.getByText('Conectá Supabase para ver los precios')).toBeInTheDocument();
    expect(screen.queryByText(/arroz/i)).toBeNull();
  });

  it('con sesión muestra la serie real con su unidad de compra', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({
      precios: filasDelSeed(),
      insumos: [{ id: 'arroz', denominacion: 'Arroz demo', olla_id: OLLA }],
    });

    montar(cliente);

    expect(await screen.findAllByText('Arroz demo (mayorista)')).not.toHaveLength(0);
    // 420000..426000 en la base: la mediana de la semana es S/ 4,23 por kg.
    expect(screen.getAllByText('S/ 4,23').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\/ kg/).length).toBeGreaterThan(0);
    // Una sola semana cargada: no hay ventana previa, no se dibuja variacion.
    expect(screen.getAllByText('sin dato').length).toBeGreaterThan(0);
  });

  it('un error de red/RLS muestra el estado de error, no las series de ejemplo', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({ precios: { error: 'permission denied' } });

    montar(cliente);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron leer las observaciones guardadas.',
    );
    expect(screen.queryByText('Arroz demo (mayorista)')).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('una olla sin precios lo dice vacío, sin catálogo de ejemplo', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({ precios: [], insumos: [] });

    montar(cliente);

    expect(await screen.findByText(/todavía no tiene compras registradas/i)).toBeInTheDocument();
  });
});
