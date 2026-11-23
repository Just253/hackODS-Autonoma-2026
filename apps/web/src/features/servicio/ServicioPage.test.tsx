import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESION_INICIAL, cambiarRol, guardarSesion } from '../../app/sesion.js';
import { cerrarBases } from '../../data/base.js';
import {
  OLLA_DEMO,
  altaPersona,
  listarPersonas,
  racionDe,
  servicioDelDia,
} from '../../data/repositorio.js';
import { TEMPLATE_DEMO_301, menusDelDiaDemo, padronDemo } from '../../fixtures/servicio-demo.js';
import { menuDelDia } from './menu-del-dia.js';
import { ServicioPage } from './ServicioPage.js';

/**
 * Rojo->verde del issue #90.
 *
 * Antes: la racion se guardaba con `servicioId: null` y el resumen pintaba
 * `menusDelDiaDemo()` por su cuenta. El test comprueba lo que se esperaba:
 *  1. el `servicioId` guardado ES el id del menu que se mostro (hoy `null`);
 *  2. tras remontar la pantalla, el resumen sigue mostrando ESE mismo menu
 *     (hoy vuelve al fixture) y la racion sigue marcada;
 *  3. sin menu firmado del dia, no se registra y la pantalla lo dice.
 *
 * La red queda apagada por `src/test/setup.ts`: si algun camino intentara
 * sincronizar, el test rompe en vez de "pasar con red". `fake-indexeddb` corre
 * el outbox de verdad.
 */

const AZAR_FIJO = (): number => 0.1;
const RELOJ_FIJO = { ahora: () => '2026-11-23T10:00:00.000Z', azar: AZAR_FIJO } as const;

async function limpiarBaseDePrueba(): Promise<void> {
  cerrarBases();
  await new Promise<void>((listo, falla) => {
    const pedido = indexedDB.deleteDatabase(`hackods-${OLLA_DEMO}`);
    pedido.onsuccess = () => listo();
    pedido.onerror = () => falla(pedido.error ?? new Error('no se pudo borrar la base'));
    pedido.onblocked = () => falla(new Error('borrado bloqueado: hay una conexion abierta'));
  });
}

beforeEach(async () => {
  await limpiarBaseDePrueba();
  guardarSesion(cambiarRol(SESION_INICIAL, 'cocinera'));
  vi.spyOn(Math, 'random').mockReturnValue(AZAR_FIJO());
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await limpiarBaseDePrueba();
  localStorage.clear();
});

async function servirLaPrimeraRacion() {
  fireEvent.change(screen.getByLabelText(/^Razón 1$/i), {
    target: { value: 'Porción por grupo de edad según el menú firmado' },
  });
  fireEvent.change(screen.getByLabelText(/^Razón 2$/i), {
    target: { value: 'Equivalencia aprobada de insumo agotado' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Servir ración/i }));
  });
}

describe('ServicioPage · la racion se liga al menu que se muestra (#90)', () => {
  it('guarda la racion con el id del menu mostrado y, al remontar, el resumen muestra ese mismo menu', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'F', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ_FIJO,
    );

    const menu = menuDelDia();
    // El id NO es el del reloj: es el de la plantilla firmada que se sirve.
    expect(menu.servicioId).toBe(TEMPLATE_DEMO_301);
    expect(menu.servicioId).not.toBe(servicioDelDia(RELOJ_FIJO));

    const { unmount } = render(<ServicioPage />);
    expect(await screen.findByText(/raciones registradas/i)).toBeInTheDocument();
    // El resumen pinta el mismo menu que da el id: su sello esta a la vista.
    expect(screen.getByLabelText('Menú firmado del día')).toHaveTextContent('Nutricionista Demo');
    const menuEnPantalla = screen.getByLabelText('Menú firmado del día').innerHTML;

    await servirLaPrimeraRacion();
    expect(await screen.findByText(/Ración de P-DDDD guardada/i)).toBeInTheDocument();

    // 1 · Detras del DOM: la racion tiene el `servicioId` del menu mostrado.
    //     Con el bug esto se queda buscando una racion que no existe: la que se
    //     guardo tenia `servicioId: null`.
    const [persona] = await listarPersonas();
    const racion = await racionDe(persona!.codigoP, OLLA_DEMO, menu.servicioId!);
    expect(racion).toBeDefined();
    expect(racion?.servicioId).toBe(menu.servicioId);
    // Y ya no queda una racion "sin servicio" (ese era el bug).
    expect(await racionDe(persona!.codigoP, OLLA_DEMO, servicioDelDia(RELOJ_FIJO))).toBeUndefined();

    // 2 · Remontar: el resumen sigue mostrando el mismo menu y la fila sigue marcada.
    unmount();
    render(<ServicioPage />);
    expect(await screen.findByText(/Ración registrada · guardada en esta tablet/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Menú firmado del día').innerHTML).toBe(menuEnPantalla);

    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin menu firmado del dia: lo dice y NO registra la racion', async () => {
    await altaPersona(
      { anioNacimiento: 1990, sexo: 'F', categoria: 'adulto', nombreLocal: null, alias: null },
      RELOJ_FIJO,
    );

    // Un dia sin menu: la fuente devuelve una lista vacia.
    render(<ServicioPage leerMenu={() => []} />);
    expect(await screen.findByText(/raciones registradas/i)).toBeInTheDocument();

    expect(
      await screen.findByText(/Sin menú firmado del día, no se registra servicio/i),
    ).toBeInTheDocument();
    const boton = screen.getByRole('button', { name: /Servir ración/i });
    expect(boton).toBeDisabled();

    // Nada escrito y ninguna racion con `null` escondida.
    expect(await racionDe('P-DDDD', OLLA_DEMO, servicioDelDia(RELOJ_FIJO))).toBeUndefined();
    expect(await racionDe('P-DDDD', OLLA_DEMO, 'null')).toBeUndefined();
  });

  it('el fixture sigue siendo la fuente de hoy, y su id es estable entre lecturas', () => {
    const primero = menuDelDia(menusDelDiaDemo);
    const segundo = menuDelDia(menusDelDiaDemo);
    expect(primero.servicioId).toBe(TEMPLATE_DEMO_301);
    expect(segundo.servicioId).toBe(primero.servicioId);
    // El padron demo no entra por aca: el id sale del menu, no de la pantalla.
    expect(padronDemo().length).toBeGreaterThan(0);
  });
});
