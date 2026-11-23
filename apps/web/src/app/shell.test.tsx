import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearRouterDePrueba } from './router.js';
import { CLAVE_MODO, MODO_INICIAL, leerModo } from './modo.js';
import { destinosDeBarra, destinosDeMas } from './navegacion.js';
import { reiniciarEstadoSync } from './sync.js';

/**
 * Cascaron movil (Shell): modo simple/avanzado, navegacion inferior y estado
 * de sincronizacion honesto. La red esta apagada desde `test/setup.ts`: si el
 * header o el cambio de modo hicieran `fetch`, el test rompe.
 *
 * Lo que se prueba es el comportamiento, no el CSS: cuantos destinos hay, cual
 * es el texto de cada estado y que la eleccion sobreviva a una recarga.
 */

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/** Destinos de la barra inferior, por nombre accesible. */
function enlacesDeBarra(): readonly HTMLElement[] {
  const barra = screen.getByRole('navigation', { name: 'Secciones' });
  return within(barra).getAllByRole('link');
}

beforeEach(() => {
  window.localStorage.clear();
  reiniciarEstadoSync();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('cascaron movil', () => {
  it('arranca en modo simple con tres destinos en la barra y el resto en "Más"', () => {
    expect(MODO_INICIAL).toBe('simple');
    montarApp('/padron');

    const barra = enlacesDeBarra();
    // La regla del modo simple: la barra no pasa de tres destinos.
    expect(barra).toHaveLength(3);
    expect(barra.map((a) => a.textContent)).toEqual(['Padrón', 'Servir', 'Boleta']);

    // "Más" es un boton, no un destino: abre lo que simple esconde.
    const mas = screen.getByRole('button', { name: /Más/i });
    expect(mas).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(mas);
    expect(mas).toHaveAttribute('aria-expanded', 'true');

    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    const nombres = within(hoja)
      .getAllByRole('link')
      .map((a) => a.textContent ?? '');
    // Cada enlace concatena `descripcion` + `tarea` sin espacio entre ambos:
    // "Presupuesto de la ollaVer cuánto hay...". Por eso se compara con includes.
    expect(nombres.some((t) => t.includes('Presupuesto de la olla'))).toBe(true);
    expect(nombres.some((t) => t.includes('Precio del pollo'))).toBe(true);
    expect(nombres.some((t) => t.includes('Entre ollas'))).toBe(true);
    expect(nombres.some((t) => t.includes('Reporte entre ollas'))).toBe(true);
  });

  it('el modo avanzado muestra cuatro destinos y persiste tras recargar, sin red', () => {
    const { unmount } = montarApp('/padron');

    fireEvent.click(screen.getByRole('button', { name: /Más/i }));
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    const avanzado = within(hoja).getByRole('button', { name: 'Avanzado' });
    expect(avanzado).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(avanzado);

    // Se guardo donde tiene que guardarse: preferencia local, no Dexie.
    expect(window.localStorage.getItem(CLAVE_MODO)).toBe('avanzado');
    expect(document.documentElement.dataset.modo).toBe('avanzado');
    expect(enlacesDeBarra()).toHaveLength(4);

    // Recarga: se desmonta la app entera y se vuelve a abrir.
    unmount();
    montarApp('/padron');

    // Se lee de localStorage al montar: sigue en avanzado.
    expect(leerModo()).toBe('avanzado');
    expect(document.documentElement.dataset.modo).toBe('avanzado');
    expect(enlacesDeBarra()).toHaveLength(4);
    // Avanzado sigue teniendo un "Más" para precios, entre ollas y reporte.
    fireEvent.click(screen.getByRole('button', { name: /Más/i }));
    const hojas = within(screen.getByRole('navigation', { name: 'Más secciones' })).getAllByRole(
      'link',
    );
    expect(hojas).toHaveLength(3);

    // Nada de esto salio a la red.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('volver a simple desde ajustes deja la barra en tres, aunque habia cuatro', () => {
    window.localStorage.setItem(CLAVE_MODO, 'avanzado');
    montarApp('/padron');
    expect(enlacesDeBarra()).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: /Más/i }));
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    act(() => {
      fireEvent.click(within(hoja).getByRole('button', { name: 'Simple' }));
    });

    expect(window.localStorage.getItem(CLAVE_MODO)).toBe('simple');
    expect(enlacesDeBarra()).toHaveLength(3);
  });

  it('el header dice "En este dispositivo", nunca que ya sincronizo', () => {
    montarApp('/padron');

    // Lo que importa: el texto no promete sincronizacion.
    expect(screen.getByText('En este dispositivo')).toBeInTheDocument();
    expect(screen.queryByText(/sincronizado|al día|al dia/i)).toBeNull();
  });

  it('las reglas de navegacion no dejan crecer la barra simple', () => {
    // Contrato del modelo, sin DOM: si alguien agrega un cuarto diario, esto falla.
    expect(destinosDeBarra('simple').length).toBeLessThanOrEqual(3);
    expect(destinosDeBarra('avanzado')).toHaveLength(4);
    // En simple, todo destino de la barra tambien existe una sola vez.
    const barra = destinosDeBarra('simple').map((d) => d.a);
    expect(new Set(barra).size).toBe(barra.length);
    // Y lo que esconde "Más" no repite la barra.
    expect(destinosDeMas('simple').some((d) => barra.includes(d.a))).toBe(false);
  });
});
