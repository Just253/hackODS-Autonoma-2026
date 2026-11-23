import Dexie from 'dexie';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OLLA_DEMO, altaPersona, contarPersonas } from '../../data/repositorio.js';
import { nombreBase } from '../../data/base.js';
import { PadronPage } from './PadronPage';

/**
 * Tests de la pantalla real (`PadronPage`), no de una copia.
 *
 * El conteo llega en un efecto, asi que el render estatico no lo ve: se monta
 * con `createRoot` y se deja correr el efecto con `await act`. IndexedDB es
 * `fake-indexeddb` (ver `src/test/setup.ts`) y la red no participa.
 */

let contenedor: HTMLDivElement;
let raiz: Root;

/** `act` de React 19 fuera de jsdom requiere esta bandera. */
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await Dexie.delete(nombreBase(OLLA_DEMO));
  contenedor = document.createElement('div');
  document.body.append(contenedor);
});

afterEach(() => {
  if (raiz !== undefined) act(() => raiz.unmount());
  contenedor.remove();
  vi.unstubAllGlobals();
});

async function montar(): Promise<void> {
  raiz = createRoot(contenedor);
  await act(async () => {
    raiz.render(<PadronPage />);
  });
  // El efecto abre Dexie y cuenta. En vez de dormir un tiempo fijo (que se
  // rompe en una maquina lenta o sobra en una rapida), se espera a que la
  // pantalla deje de estar "cargando": ese es el contrato, no el reloj.
  await waitFor(() => {
    expect(contenedor.textContent).not.toContain('Leyendo el padrón guardado');
  });
}

async function altaDeUnaPersona(): Promise<void> {
  await altaPersona({
    anioNacimiento: 1958,
    sexo: 'F',
    categoria: 'adulto_mayor',
    nombreLocal: null,
    alias: null,
  });
}

describe('PadronPage', () => {
  it('padrón vacío: dice que todavía no hay personas, sin cifra', async () => {
    await montar();

    expect(contenedor.querySelector('[data-estado="vacio"]')).not.toBeNull();
    expect(contenedor.querySelector('[aria-label$="en el padrón"]')).toBeNull();
  });

  it('una sola persona se anuncia en singular: "1 persona", no "1 personas"', async () => {
    await altaDeUnaPersona();
    await montar();

    const cifra = contenedor.querySelector('[aria-label$="en el padrón"]');
    expect(cifra?.getAttribute('aria-label')).toBe('1 persona en el padrón');
    expect(cifra?.textContent).toBe('1');
    expect(contenedor.textContent).not.toContain('1 personas');
  });

  it('dos personas siguen en plural', async () => {
    await altaDeUnaPersona();
    await altaDeUnaPersona();
    await montar();

    expect(
      contenedor.querySelector('[aria-label="2 personas en el padrón"]')?.textContent,
    ).toBe('2');
  });

  it('sin red, el alta real se guarda en el dispositivo y no hace fetch', async () => {
    const fetchFalso = vi.fn(() => {
      throw new Error('sin red: no debería haber fetch');
    });
    vi.stubGlobal('fetch', fetchFalso);

    await altaDeUnaPersona();

    expect(await contarPersonas()).toBe(1);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});
