import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { INSUMOS_DEMO, TEXTO_ENTRADA_DEMO } from '../../fixtures/inventario-demo.js';
import { baseDeOlla, cerrarBases } from '../../data/base.js';
import {
  listarLotes,
  listarMovimientos,
  registrarMovimiento,
  sembrarInsumos,
} from '../../data/inventario.js';
import { outboxDe } from '../../data/outbox-repo.js';
import { OLLA_DEMO } from '../../data/repositorio.js';
import { InventarioPantalla, prepararEntrada, urlDeDictado } from './InventarioPantalla.js';

/**
 * Issue #69: entrada por texto con revisión previa, dictado solo si hay
 * endpoint y una despensa que funciona con la red apagada (`src/test/setup.ts`).
 *
 * Lo que el test NO repite: las cuentas. El stock y la urgencia de vencimiento
 * son de `@hackods/domain` (tests propios en `packages/domain/src/racion.test.ts`).
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

function enDias(dias: number): string {
  const fecha = new Date();
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

/** Espera a que la pantalla termine de leer Dexie. */
async function abrirPantalla() {
  render(<InventarioPantalla />);
  await screen.findByText('Insumos de la olla');
}

beforeEach(async () => {
  await borrarBase();
  await sembrarInsumos(INSUMOS_DEMO, OLLA_DEMO);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  cleanup();
  await borrarBase();
});

describe('prepararEntrada: caso feliz', () => {
  it('"arroz 5 kg 24.50, pollo 3 kg 14.00" son dos entradas listas para confirmar', () => {
    const propuesta = prepararEntrada(TEXTO_ENTRADA_DEMO, INSUMOS_DEMO);

    expect(propuesta.filas).toHaveLength(2);
    expect(propuesta.bloquea).toBe(false);
    expect(propuesta.registrables).toBe(2);
    expect(propuesta.filas.map((fila) => fila.insumoId)).toEqual(['arroz', 'pollo']);
    // 5 kg y 3 kg se convierten a gramos, la unidad base del catálogo.
    expect(propuesta.filas.map((fila) => fila.cantidadBase)).toEqual([5000, 3000]);
    expect(propuesta.filas.map((fila) => fila.unidadBase)).toEqual(['g', 'g']);
    expect(propuesta.filas.map((fila) => fila.precioTotalCentavos)).toEqual([2450, 1400]);
    expect(propuesta.filas.map((fila) => fila.motivoSinDato)).toEqual([null, null]);
  });
});

describe('prepararEntrada: caso ambiguo', () => {
  it('un monto suelto para dos productos no se reparte: bloquea y no inventa precio', () => {
    const propuesta = prepararEntrada('arroz 5 kg, pollo 3 kg, 30 soles', INSUMOS_DEMO);

    expect(propuesta.filas).toHaveLength(2);
    expect(propuesta.bloquea).toBe(true);
    expect(propuesta.filas.every((fila) => fila.precioTotalCentavos === null)).toBe(true);
    expect(propuesta.avisos.join(' ')).toMatch(/no se reparte solo/i);
  });

  it('un producto fuera del catálogo queda sin dato y no se registra', () => {
    const propuesta = prepararEntrada('arroz 5 kg, caviar 2 kg', INSUMOS_DEMO);

    const caviar = propuesta.filas.find((fila) => fila.descripcion === 'caviar');
    expect(caviar?.insumoId).toBeNull();
    expect(caviar?.cantidadBase).toBeNull();
    expect(caviar?.motivoSinDato).toBe('no está en el catálogo');
    expect(propuesta.registrables).toBe(1);
  });

  it('un producto sin cantidad dice sin dato: no se supone un kilo', () => {
    const propuesta = prepararEntrada('arroz', INSUMOS_DEMO);

    expect(propuesta.filas).toHaveLength(1);
    expect(propuesta.filas[0]?.cantidadBase).toBeNull();
    expect(propuesta.filas[0]?.motivoSinDato).toBe('no dice cuánto');
    expect(propuesta.registrables).toBe(0);
  });
});

describe('pantalla de despensa', () => {
  it('muestra el stock derivado de los movimientos y marca el insumo bajo el mínimo', async () => {
    await registrarMovimiento(
      { insumoId: 'arroz', delta: 5000, motivo: 'entrada', autor: 'cocinera' },
      undefined,
      OLLA_DEMO,
    );
    await abrirPantalla();

    const lista = within(screen.getByRole('region', { name: 'Insumos y stock' }));
    const arroz = lista.getByText('arroz').closest('li');
    expect(arroz?.getAttribute('data-estado')).toBe('stock-ok');
    expect(arroz?.textContent).toContain('5 kg');

    // huevo no tiene movimientos: stock 0, mínimo 30 => alerta.
    const huevo = lista.getByText('huevo').closest('li');
    expect(huevo?.getAttribute('data-estado')).toBe('stock-bajo');
    expect(screen.getByText(/están bajo el mínimo|está bajo el mínimo/)).toBeInTheDocument();
  });

  it('avisa el vencimiento próximo de un lote con fecha', async () => {
    await registrarMovimiento(
      {
        insumoId: 'pollo',
        delta: 3000,
        motivo: 'entrada',
        autor: 'cocinera',
        nuevoLote: { fechaVencimiento: enDias(2) },
      },
      undefined,
      OLLA_DEMO,
    );
    await abrirPantalla();

    expect(screen.getByText(/pollo: vence en 3 días o menos/)).toBeInTheDocument();
  });

  it('sin lote con fecha, el insumo dice sin dato de vencimiento', async () => {
    await abrirPantalla();

    const lista = within(screen.getByRole('region', { name: 'Insumos y stock' }));
    expect(lista.getAllByText(/sin dato de vencimiento/).length).toBeGreaterThan(0);
  });

  it('registra un movimiento desde el formulario y actualiza el stock derivado', async () => {
    await abrirPantalla();

    fireEvent.change(screen.getByLabelText('Insumo'), { target: { value: 'arroz' } });
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: '2000' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Alta de movimiento' }));

    await screen.findByText(/Movimiento guardado en este dispositivo/);
    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(1);

    const lista = within(screen.getByRole('region', { name: 'Insumos y stock' }));
    await waitFor(() => expect(lista.getByText('arroz').closest('li')?.textContent).toContain('2 kg'));
  });

  it('una salida se puede imputar al lote con fecha del insumo', async () => {
    const entrada = await registrarMovimiento(
      {
        insumoId: 'pollo',
        delta: 3000,
        motivo: 'entrada',
        autor: 'cocinera',
        nuevoLote: { fechaVencimiento: enDias(20) },
      },
      undefined,
      OLLA_DEMO,
    );
    await abrirPantalla();

    fireEvent.change(screen.getByLabelText('Insumo'), { target: { value: 'pollo' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'salida' } });
    fireEvent.change(screen.getByLabelText(/Cantidad/), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText(/^Lote/), { target: { value: entrada.loteId } });
    fireEvent.submit(screen.getByRole('form', { name: 'Alta de movimiento' }));

    await screen.findByText(/Movimiento guardado en este dispositivo/);
    const movimientos = await listarMovimientos(OLLA_DEMO);
    const salida = movimientos.find((movimiento) => movimiento.motivo === 'salida');
    expect(salida?.delta).toBe(-1000);
    expect(salida?.loteId).toBe(entrada.loteId);
  });

  it('la entrada por texto se revisa antes de confirmar y escribe en el outbox', async () => {
    await abrirPantalla();

    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: TEXTO_ENTRADA_DEMO } });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar texto' }));

    // Antes de confirmar: la propuesta visible y nada guardado todavía.
    expect(screen.getByText('Antes de confirmar')).toBeInTheDocument();
    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrada \(2\)/ }));

    await screen.findByText(/Se registraron 2 entradas en este dispositivo/);
    const movimientos = await listarMovimientos(OLLA_DEMO);
    expect(movimientos.map((m) => m.delta).sort((a, b) => a - b)).toEqual([3000, 5000]);

    const outbox = outboxDe(baseDeOlla(OLLA_DEMO));
    await outbox.cargar();
    expect(outbox.pendientes().filter((e) => e.entidad === 'movimientos')).toHaveLength(2);
  });

  it('una línea sin dato se muestra como tal y no se guarda', async () => {
    await abrirPantalla();

    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'arroz 5 kg 24.50, caviar 2 kg' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Revisar texto' }));

    expect(screen.getByText(/sin dato — no está en el catálogo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirmar entrada \(1\)/ }));
    await screen.findByText(/Se registraron 1 entrada en este dispositivo/);
    expect(await listarMovimientos(OLLA_DEMO)).toHaveLength(1);
    expect(await listarLotes(OLLA_DEMO)).toHaveLength(0);
  });

  it('el dictado no configurado deja el botón deshabilitado y lo explica', async () => {
    expect(urlDeDictado()).toBeNull();
    await abrirPantalla();

    expect(screen.getByRole('button', { name: 'Dictar' })).toBeDisabled();
    // Lo que ve la cocinera es "sin dictado", no "dictado no configurado": ese
    // último describía la falta de una variable del equipo, no la pantalla.
    expect(screen.getByText(/sin dictado/)).toBeInTheDocument();
  });

  it('con VITE_COMPUTE_URL, un dictado que falla cae al cuadro de texto sin bloquear', async () => {
    vi.stubEnv('VITE_COMPUTE_URL', 'https://compute.invalid/');
    expect(urlDeDictado()).toBe('https://compute.invalid');

    await abrirPantalla();
    expect(screen.getByRole('button', { name: 'Dictar' })).toBeEnabled();

    const archivo = new File(['sonido'], 'nota.webm', { type: 'audio/webm' });
    fireEvent.change(screen.getByLabelText('Archivo de audio para dictar'), {
      target: { files: [archivo] },
    });

    // `fetch` esta apagado en el setup del paquete: el fallo se maneja, no explota.
    expect(await screen.findByText(/No se pudo transcribir el audio/)).toBeInTheDocument();
    expect(screen.getByLabelText('Texto')).toBeInTheDocument();
  });
});
