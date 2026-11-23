import { act, cleanup, render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearRouterDePrueba, AVISO_SIN_ACCESO } from './router.js';
import { MATRIZ_ROL, RUTA_INICIAL, TODOS, rutaInicial } from './navegacion.js';
import { CLAVE_SESION, ROLES, SESION_INICIAL } from './sesion.js';
import type { Rol } from './sesion.js';
import { reiniciarEstadoSync } from './sync.js';

/**
 * MATRIZ DE ROLES × RUTAS (FE-02, DEC-20261123-1358-8feaf9).
 *
 * Es el criterio literal de la DEC: "Matriz de 4 roles × 7 rutas: cada uno ve
 * solo lo suyo; llamar a una ruta prohibida devuelve 42501 o redirige". Aca se
 * prueba el lado de la UI: la ruta prohibida REDIRIGE a la inicial del rol con
 * un aviso (no muestra la pantalla). El 42501 lo prueba el lado del servidor
 * (pgTAP), no esto: la UI nunca es la unica barrera.
 *
 * Las siete rutas reales: padron, servicio, comprobante, presupuesto, precios,
 * solicitud, reporte (ver `TODOS` en `navegacion.ts`).
 *
 * Se recorre el producto cartesiano de `ROLES` × `TODOS`, asi que si mañana
 * aparece una ruta o un rol sin fila en `MATRIZ_ROL`, el test lo atrapa.
 * La red esta apagada desde `test/setup.ts`.
 */

const RUTAS = TODOS.map((destino) => destino.a);

/** Monta la app con la sesion ya guardada en el rol pedido. */
function montarComo(rol: Rol, ruta: string) {
  window.localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...SESION_INICIAL, rol }));
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

/** Titulo del destino en el header (la pantalla actual), o el generico. */
function seccionEnHeader(): string {
  const header = screen.getByRole('banner');
  // El header repite "Olla X · Rol" en el divisor y luego el nombre de seccion.
  const textos = within(header)
    .getAllByText(/.+/)
    .map((nodo) => nodo.textContent?.trim() ?? '');
  // El nombre de seccion es el que NO es el divisor ni el separador.
  const divisor = header.querySelector('[data-divisor-contexto]')?.textContent?.trim();
  return textos.find((t) => t !== divisor && t !== '/' && t.length > 0) ?? '';
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

describe('matriz de roles × rutas', () => {
  // Por cada rol, cada ruta: permitida o prohibida, nunca "a veces".
  for (const rol of ROLES) {
    for (const ruta of RUTAS) {
      const permitida = MATRIZ_ROL[rol].includes(ruta);
      const destino = TODOS.find((d) => d.a === ruta)!;

      if (permitida) {
        it(`${rol} SÍ entra a ${ruta}`, () => {
          montarComo(rol, ruta);

          // La pantalla se pinta: el header nombra la seccion.
          expect(seccionEnHeader()).toBe(destino.descripcion);
          // Y no hubo redireccion por rol.
          expect(screen.queryByText(AVISO_SIN_ACCESO)).toBeNull();
        });
      } else {
        it(`${rol} NO entra a ${ruta}: redirige a ${RUTA_INICIAL[rol]} con aviso`, () => {
          montarComo(rol, ruta);

          // La pantalla prohibida no se muestra: el header ya no nombra esa seccion.
          expect(seccionEnHeader()).not.toBe(destino.descripcion);
          // Aterriza en la inicial del rol (la pantalla que SI le sirve).
          const destinoInicial = TODOS.find((d) => d.a === RUTA_INICIAL[rol])!;
          expect(seccionEnHeader()).toBe(destinoInicial.descripcion);
          // Y se le dice por que, con texto legible (no solo un redirect mudo).
          expect(screen.getByText(AVISO_SIN_ACCESO)).toBeInTheDocument();
        });
      }
    }
  }
});

describe('coherencia de la matriz', () => {
  it('cada rol tiene al menos una ruta o el producto se queda sin salida', () => {
    // Si esto falla, es una deuda de PRODUCTO (p. ej. nutricionista sin
    // pantalla de menu), no un bug de la rama: se documenta, no se fuerza.
    for (const rol of ROLES) {
      expect(MATRIZ_ROL[rol].length).toBeGreaterThan(0);
    }
  });

  it('la ruta inicial de cada rol esta en su propia fila (no aterriza en un redirect)', () => {
    for (const rol of ROLES) {
      expect(MATRIZ_ROL[rol]).toContain(rutaInicial({ rol }));
    }
  });

  it('toda ruta del menu tiene al menos un rol: ninguna queda huerfana', () => {
    for (const destino of TODOS) {
      expect(destino.roles.length).toBeGreaterThan(0);
    }
  });

  it('admin ve todas las rutas', () => {
    expect([...MATRIZ_ROL.admin].sort()).toEqual([...RUTAS].sort());
  });
});

describe('cambio de rol en vivo (sin recargar)', () => {
  it('la guarda lee el rol nuevo: lo que era permitido deja de pasar', async () => {
    // Cocinera entra a comprobante (suya). Desde Ajustes se cambia a
    // nutricionista, que NO ve comprobante. Sin recargar, la guarda tiene que
    // aplicar el rol nuevo: antes leia la sesion una sola vez y dejaba pasar.
    const router = crearRouterDePrueba('/comprobante');
    render(<RouterProvider router={router} />);
    expect(router.state.location.pathname).toBe('/comprobante');

    window.localStorage.setItem(
      CLAVE_SESION,
      JSON.stringify({ ...SESION_INICIAL, rol: 'nutricionista' }),
    );

    await act(async () => {
      await router.navigate('/comprobante');
    });

    expect(router.state.location.pathname).toBe(RUTA_INICIAL.nutricionista);
    expect(screen.getByText(AVISO_SIN_ACCESO)).toBeInTheDocument();
  });
});
