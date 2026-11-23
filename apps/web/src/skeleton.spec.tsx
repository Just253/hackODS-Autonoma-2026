import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cerrarBases } from './data/base.js';
import {
  OLLA_DEMO,
  altaPersona,
  identidadDe,
  listarPersonas,
  racionDe,
} from './data/repositorio.js';
import { crearRouterDePrueba } from './app/router.js';

/**
 * Prueba exigida por el issue #1: alta -> desmontar -> remontar -> la racion
 * sigue. Simula el modo avion: `fetch` esta apagado desde `test/setup.ts`, asi
 * que si algun camino lo llama, el test rompe en vez de "pasar con red".
 */

const AZAR_FIJO = (): number => 0.1; // indice entero en el alfabeto: 'D', estable

const RELOJ_FIJO = { ahora: () => '2026-11-23T10:00:00.000Z', azar: AZAR_FIJO } as const;

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/**
 * Borra la base del demo entre tests.
 *
 * Se borra por nombre directo y NO con `indexedDB.databases()`: esa API no
 * siempre lista las bases creadas, y una base que sobrevive deja personas de
 * otro test y un `codigoP` que no es el esperado. `onblocked` no es exito: si
 * queda una conexion abierta, el borrado no ocurre y el test mentiria.
 */
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
  // Codigo P-DDDD predecible en cada corrida.
  vi.spyOn(Math, 'random').mockReturnValue(AZAR_FIJO());
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await limpiarBaseDePrueba();
});

describe('esqueleto offline', () => {
  it('alta P-XXXX -> desmontar -> remontar -> la racion sigue en pantalla', async () => {
    // 1. Alta de una persona ficticia desde el padron, sin red.
    const { unmount } = montarApp('/padron');
    await screen.findByText(/Todavía no hay personas/i);

    fireEvent.change(screen.getByLabelText(/Año de nacimiento/i), {
      target: { value: '1958' },
    });
    fireEvent.change(screen.getByLabelText(/Alias/i), {
      target: { value: 'Alias ficticio' },
    });

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: /Alta de persona/i }));
    });

    const avisoAlta = await screen.findByText(/Alta guardada: P-/i);
    const codigoP = avisoAlta.textContent?.match(/P-[A-Z0-9]{4}/)?.[0];
    expect(codigoP).toBe('P-DDDD');
    expect(screen.getByText(/Pendiente de sincronizar/i)).toBeInTheDocument();

    // 2. Racion con dos razones.
    unmount();
    montarApp('/servicio');
    await screen.findByText(/raciones registradas/i);

    fireEvent.change(screen.getByLabelText(/^Razón 1$/i), {
      target: { value: 'Porción por grupo de edad según el menú firmado' },
    });
    fireEvent.change(screen.getByLabelText(/^Razón 2$/i), {
      target: { value: 'Equivalencia aprobada de insumo agotado' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Servir ración/i }));
    });

    expect(await screen.findByText(/Ración de P-DDDD guardada/i)).toBeInTheDocument();

    // 3. Recarga con la red apagada: se desmonta la app entera y se vuelve a abrir.
    unmount();
    montarApp('/servicio');

    // 4. La racion sigue en pantalla, leida de IndexedDB, sin una sola request.
    expect(
      await screen.findByText(/Ración registrada · pendiente de sincronizar/i),
    ).toBeInTheDocument();
    // El codigo aparece en la fila y en el resumen: basta con que este presente.
    expect(screen.getAllByText(codigoP!).length).toBeGreaterThan(0);
    expect(fetch).not.toHaveBeenCalled();

    // 5. Detras del DOM, el contrato se cumple: >= 2 razones y sin PII.
    //
    // La comprobacion de PII mira las DOS entidades que algun dia saldrian del
    // dispositivo (`persona` y `racion`) y el objeto que NO debe salir
    // (`identidadLocal`). Mirar solo `racion` seria vacuo: el alias nunca entra
    // a su construccion, asi que esa asercion pasaria con el producto roto.
    // Aca, si `altaPersona` filtrara el alias hacia `persona` o si el
    // serializador lo metiera en la racion, el test falla.
    const [persona] = await listarPersonas();
    expect(persona?.codigoP).toBe(codigoP);

    const racion = await racionDe('P-DDDD');
    expect(racion?.razones).toHaveLength(2);
    expect(racion?.razones.every((r) => r.trim() !== '')).toBe(true);

    const identidad = await identidadDe('P-DDDD');
    expect(identidad?.localOnly).toBe(true);
    expect(identidad?.alias).toBe('Alias ficticio');

    // Lo sincronizable no lleva el alias; lo local saido si, y nada mas.
    expect(JSON.stringify(persona)).not.toContain('Alias ficticio');
    expect(JSON.stringify(racion)).not.toContain('Alias ficticio');
  });

  it('rechaza la racion con una sola razon y no escribe nada', async () => {
    await altaPersona(
      {
        anioNacimiento: 1990,
        sexo: 'F',
        categoria: 'adulto',
        nombreLocal: null,
        alias: null,
      },
      RELOJ_FIJO,
    );

    montarApp('/servicio');
    await screen.findByText(/raciones registradas/i);
    fireEvent.change(screen.getByLabelText(/^Razón 1$/i), {
      target: { value: 'Una sola razon no alcanza' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Servir ración/i }));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/faltan razones/i);
    await waitFor(async () => {
      expect(await racionDe('P-DDDD')).toBeUndefined();
    });
  });
});
