import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { crearRouterDePrueba } from './router.js';
import {
  CLAVE_SESION,
  ETIQUETA_ROL,
  OLLAS_DEMO,
  ROLES,
  SESION_INICIAL,
  cambiarOlla,
  cambiarRol,
  leerSesion,
  parsearSesion,
  textoDivisor,
} from './sesion.js';
import { reiniciarEstadoSync } from './sync.js';

/**
 * Sesion de contexto y divisor visible (FE-01, DEC-20261123-1358-8feaf9).
 *
 * La red esta apagada desde `test/setup.ts`: si el header o el selector
 * hicieran `fetch`, el test rompe. Lo que se prueba es comportamiento y texto
 * legible, no color: el divisor tiene que leerse con la palabra del rol.
 */

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/** El header de la app: la unica `banner`. */
function encabezado(): HTMLElement {
  return screen.getByRole('banner');
}

/** El divisor de contexto del header (por su atributo estable). */
function divisor(): HTMLElement {
  const elemento = encabezado().querySelector('[data-divisor-contexto]');
  if (elemento === null) throw new Error('el header no tiene divisor de contexto');
  return elemento as HTMLElement;
}

/** Hoja de ajustes del telefono: abre con "Más". */
function abrirHojaMas(): void {
  fireEvent.click(screen.getByRole('button', { name: /Más/i }));
}

beforeEach(() => {
  window.localStorage.clear();
  reiniciarEstadoSync();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('sesion (modelo, sin DOM)', () => {
  it('sin nada guardado arranca en demo, cocinera y olla demo', () => {
    const sesion = leerSesion(window.localStorage);
    expect(sesion).toEqual(SESION_INICIAL);
    expect(sesion.modo).toBe('demo');
    expect(sesion.rol).toBe('cocinera');
    expect(sesion.ollaId).toBe('olla-demo-01');
  });

  it('un rol inventado en el almacen no entra: cae a la sesion inicial entera', () => {
    // Mitad a medias: no se mezcla, no se "arregla" a mano.
    expect(parsearSesion({ memberId: 'x', ollaId: 'y', nombreOlla: 'Z', rol: 'rey', modo: 'demo' }))
      .toBe(SESION_INICIAL);
    expect(parsearSesion('basura')).toBe(SESION_INICIAL);
    expect(parsearSesion(null)).toBe(SESION_INICIAL);
  });

  it('en modo cloud el rol no cambia aunque se pida', () => {
    const nube = { ...SESION_INICIAL, modo: 'cloud' as const };
    expect(cambiarRol(nube, 'admin')).toBe(nube);
    expect(cambiarOlla(nube, 'olla-demo-02')).toBe(nube);
  });

  it('el texto del divisor nombra olla y rol, no solo un color', () => {
    const texto = textoDivisor(SESION_INICIAL);
    expect(texto).toBe(`Olla San Juan · ${ETIQUETA_ROL.cocinera}`);
    // Las cuatro etiquetas existen: el divisor nunca queda con un rol vacio.
    for (const rol of ROLES) {
      expect(ETIQUETA_ROL[rol]).toBeTruthy();
    }
  });
});

describe('sesion (cascaron)', () => {
  it('sin sesion guardada el header arranca en demo con cocinera', () => {
    montarApp('/padron');
    expect(divisor()).toHaveTextContent('Olla San Juan · Cocinera');
    expect(divisor()).toHaveTextContent(/cocinera/i);
  });

  it('cambiar de rol en demo lo persiste y el divisor cambia de texto', () => {
    montarApp('/padron');

    // El selector vive en la hoja de ajustes (telefono), se abre con "Más".
    abrirHojaMas();
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    const organizadora = within(hoja).getByRole('button', { name: 'Organizadora' });
    expect(organizadora).toHaveAttribute('aria-pressed', 'false');

    act(() => {
      fireEvent.click(organizadora);
    });

    // El divisor del header cambia de texto, no solo de color.
    expect(divisor()).toHaveTextContent('Olla San Juan · Organizadora');
    // La eleccion sobrevive a la recarga: se guardo en el almacen de la app.
    const guardado = window.localStorage.getItem(CLAVE_SESION);
    expect(guardado).not.toBeNull();
    expect(JSON.parse(guardado!).rol).toBe('organizadora');
    expect(leerSesion(window.localStorage).rol).toBe('organizadora');
  });

  it('cambiar de olla en demo la persiste y el divisor lo refleja', () => {
    montarApp('/padron');
    abrirHojaMas();
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    const santaRosa = within(hoja).getByRole('button', {
      name: `Olla ${OLLAS_DEMO[1]!.nombreOlla}`,
    });

    act(() => {
      fireEvent.click(santaRosa);
    });

    expect(divisor()).toHaveTextContent(`Olla ${OLLAS_DEMO[1]!.nombreOlla} · Cocinera`);
    expect(leerSesion(window.localStorage).ollaId).toBe(OLLAS_DEMO[1]!.ollaId);
  });

  it('en modo cloud el selector de rol NO se ofrece y se dice el motivo', () => {
    // Sesion ya en la nube: la app la lee del almacen al montar.
    window.localStorage.setItem(
      CLAVE_SESION,
      JSON.stringify({ ...SESION_INICIAL, modo: 'cloud', rol: 'organizadora' }),
    );

    montarApp('/padron');
    // El divisor dice el rol de la nube.
    expect(divisor()).toHaveTextContent('Olla San Juan · Organizadora');

    abrirHojaMas();
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    // No hay botones de rol dentro del contexto.
    for (const rol of ROLES) {
      expect(within(hoja).queryByRole('button', { name: ETIQUETA_ROL[rol] })).toBeNull();
    }
    // Y se explica por que no se puede cambiar.
    expect(within(hoja).getByText(/el rol y la olla salen de tu cuenta/i)).toBeInTheDocument();
    // Lo guardado no se pisa: sigue en cloud.
    expect(leerSesion(window.localStorage).modo).toBe('cloud');
  });

  it('el divisor se lee por texto y ninguna pantalla tocó la red', () => {
    montarApp('/padron');
    // Contenido textual (no un `aria-label` ni solo un color).
    expect(divisor().textContent).toMatch(/^Olla .+ · .+$/);
    expect(divisor()).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});
