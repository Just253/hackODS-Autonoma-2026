import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Movimiento } from '@hackods/contracts';
import { saldoDespensa } from '@hackods/domain';

import { baseDeOlla, cerrarBases } from '../../data/base.js';
import { outboxDe } from '../../data/outbox-repo.js';
import { OLLA_DEMO } from '../../data/repositorio.js';
import { RecetasPage } from './RecetasPage.js';

/**
 * Componente del recetario con IndexedDB real (fake-indexeddb) y red apagada
 * por `test/setup.ts`: si la pantalla intenta `fetch`, el test falla solo.
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

async function montar(): Promise<void> {
  render(<RecetasPage />);
  // La despensa se siembra con movimientos de demo y se derivada al leer.
  await waitFor(() => {
    expect(screen.getByTestId('stock-arroz')).toHaveAttribute('data-valor', '20000');
  });
}

function elegirReceta(nombre: RegExp): void {
  fireEvent.click(screen.getByRole('button', { name: nombre }));
}

function cambiarComensales(grupo: string, cantidad: number): void {
  fireEvent.change(screen.getByLabelText(grupo), { target: { value: String(cantidad) } });
}

async function movimientosDeLaBase(): Promise<readonly Movimiento[]> {
  return baseDeOlla(OLLA_DEMO).movimientos.toArray();
}

beforeEach(async () => {
  localStorage.clear();
  await borrarBase();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await borrarBase();
});

describe('RecetasPage', () => {
  it('muestra el recetario con 4 recetas y los gramos por porción', async () => {
    await montar();

    expect(screen.getByRole('heading', { name: 'Recetario' })).toBeInTheDocument();
    for (const titulo of [
      /Arroz con quinua/,
      /Guiso de lentejas/,
      /Sangrecita con papa/,
      /Crema de quinua/,
    ]) {
      expect(screen.getByRole('button', { name: titulo })).toBeInTheDocument();
    }
    expect(screen.getByText('70 g por ración')).toBeInTheDocument();
    expect(screen.getByText('30 g por ración')).toBeInTheDocument();
  });

  it('con un faltante muestra la sustitución aprobada y recién la aplica si se elige', async () => {
    await montar();
    elegirReceta(/Crema de quinua/);
    cambiarComensales('Adultos', 1);

    const faltante = await screen.findByTestId('faltante-leche_evaporada');
    expect(faltante).toHaveTextContent(/Faltan 60 g/);
    expect(screen.getByLabelText(/Quinua.*factor 1,20/)).toBeInTheDocument();

    const registrar = screen.getByRole('button', { name: /Registrar servicio/ });
    expect(registrar).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Quinua.*factor 1,20/));
    fireEvent.click(screen.getByLabelText(/Confirmo que se cocinó a 75 °C/));

    await waitFor(() => expect(registrar).toBeEnabled());
    fireEvent.click(registrar);

    await screen.findByText('Servicio registrado');

    const movimientos = await movimientosDeLaBase();
    const salidas = movimientos
      .filter((m) => m.motivo === 'salida')
      .sort((a, b) => a.insumoId.localeCompare(b.insumoId));
    // 45 g de quinua de la receta + 60 g x 1,20 de la leche sustituida.
    expect(salidas.map((m) => [m.insumoId, m.delta])).toEqual([['quinua', -117]]);
    expect(salidas.some((m) => m.insumoId === 'leche_evaporada')).toBe(false);

    const servicio = await baseDeOlla(OLLA_DEMO).serviciosCocidos.toArray();
    expect(servicio[0]?.sustituciones[0]?.insumoOrigenId).toBe('leche_evaporada');
    expect(servicio[0]?.cocidoA75C).toBe(true);
  });

  it('sin sustitución aprobada dice "sin sustituto" y no inventa equivalencias', async () => {
    await montar();
    elegirReceta(/Sangrecita con papa/);

    const faltante = await screen.findByTestId('faltante-sangrecita');
    expect(faltante).toHaveTextContent('sin sustituto');
    expect(faltante).toHaveTextContent(/Faltan 20 g/);
    // Solo queda la salida explicita (comprar); no se ofrece ninguna equivalencia.
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    expect(screen.queryByText(/factor/)).not.toBeInTheDocument();
  });

  it('producir genera salidas, deriva el stock y calcula costo total y por ración', async () => {
    await montar();
    // La receta inicial (arroz con quinua) con 2 adultos no tiene faltantes.
    cambiarComensales('Adultos', 2);
    fireEvent.click(screen.getByLabelText(/Confirmo que se cocinó a 75 °C/));
    const registrar = screen.getByRole('button', { name: /Registrar servicio/ });
    await waitFor(() => expect(registrar).toBeEnabled());
    fireEvent.click(registrar);

    await screen.findByText('Servicio registrado');

    const movimientos = await movimientosDeLaBase();
    const salidas = movimientos
      .filter((m) => m.motivo === 'salida')
      .sort((a, b) => a.insumoId.localeCompare(b.insumoId));
    expect(salidas.map((m) => [m.insumoId, m.delta])).toEqual([
      ['arroz', -140],
      ['papa', -120],
      ['quinua', -60],
    ]);

    // El stock se DERIVA de los movimientos; nadie lo escribe.
    expect(saldoDespensa(movimientos)).toMatchObject({
      arroz: 19_860,
      quinua: 1_940,
      papa: 7_880,
    });

    await waitFor(() => {
      expect(screen.getByTestId('stock-arroz')).toHaveAttribute('data-valor', '19860');
    });
    expect(screen.getByTestId('costo-total')).toHaveTextContent('S/ 1,23');
    expect(screen.getByTestId('costo-por-racion')).toHaveTextContent('S/ 0,62');

    // Cada salida entra al outbox; nada sale a la red.
    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    expect(outbox.pendientes().filter((e) => e.entidad === 'movimientos')).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin red el servicio se guarda en la tablet y lo dice', async () => {
    await montar();
    cambiarComensales('Adultos', 2);
    fireEvent.click(screen.getByLabelText(/Confirmo que se cocinó a 75 °C/));
    fireEvent.click(screen.getByRole('button', { name: /Registrar servicio/ }));

    await screen.findByText('Servicio registrado');
    expect(
      screen.getByText(/Guardado en esta tablet\. La red no hizo falta\./),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
