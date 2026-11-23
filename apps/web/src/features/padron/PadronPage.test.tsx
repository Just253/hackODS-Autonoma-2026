import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { guardarSesion } from '../../app/sesion.js';
import { ProveedorRemoto } from '../../data/ProveedorRemoto.js';
import type { ClienteDatos } from '../../data/cliente-remoto.js';
import { clienteFalso } from '../../test/cliente-falso.js';
import { PadronPage } from './PadronPage.js';

/**
 * Padrón contra Supabase (doble de cliente, sin red).
 *
 * Lo que importa: sin sesión NO hay datos de ejemplo; con sesión se listan las
 * filas reales de ESA olla y el conteo sale de la misma lista; un error se dice
 * como error y no se disfraza de padrón vacío.
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

function montar(cliente: ClienteDatos | null) {
  return render(
    <ProveedorRemoto cliente={cliente}>
      <PadronPage />
    </ProveedorRemoto>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('PadronPage (datos remotos)', () => {
  it('sin sesión pide conectar Supabase y no muestra ninguna persona de ejemplo', () => {
    montar(clienteFalso({}).cliente);

    expect(screen.getByText('Conecta Supabase para ver el padrón')).toBeInTheDocument();
    expect(screen.queryByText(/^P-[A-Z0-9]{4}$/)).toBeNull();
    expect(screen.queryByLabelText(/en el padrón/)).toBeNull();
  });

  it('con sesión lista las personas de la olla y cuenta la misma lista', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({
      personas: [
        { codigo_p: 'P-0001', categoria: 'gestante', olla_id: OLLA },
        { codigo_p: 'P-0002', categoria: 'adulto_mayor', olla_id: OLLA },
      ],
    });

    montar(cliente);

    expect(await screen.findByText('P-0001')).toBeInTheDocument();
    expect(screen.getByText('P-0002')).toBeInTheDocument();
    expect(screen.getByText('Gestante')).toBeInTheDocument();
    expect(screen.getByText('Adulto mayor')).toBeInTheDocument();
    expect(screen.getByLabelText('2 personas en el padrón')).toHaveTextContent('2');
  });

  it('una sola persona se anuncia en singular', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({
      personas: [{ codigo_p: 'P-0001', categoria: 'adulto', olla_id: OLLA }],
    });

    montar(cliente);

    expect(await screen.findByLabelText('1 persona en el padrón')).toHaveTextContent('1');
    expect(screen.queryByText('1 personas')).toBeNull();
  });

  it('un error de red/RLS se dice como error y no cae a datos de ejemplo', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({ personas: { error: 'permission denied' } });

    montar(cliente);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudieron leer las personas de la olla.',
    );
    expect(screen.queryByText(/^P-[A-Z0-9]{4}$/)).toBeNull();
    // El reintento existe: el error no es un callejon.
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('una olla sin personas lo dice vacío, sin inventar filas', async () => {
    conSesionNube();
    const { cliente } = clienteFalso({ personas: [] });

    montar(cliente);

    expect(await screen.findByText(/Todavía no hay personas cargadas en esta olla/i)).toBeInTheDocument();
    expect(screen.queryByText(/^P-[A-Z0-9]{4}$/)).toBeNull();
  });
});
