import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { crearRouterDePrueba } from './router.js';
import {
  CLAVE_SESION,
  SESION_INICIAL,
  cambiarOlla,
  cambiarRol,
  leerSesion,
} from './sesion.js';
import {
  MOTIVO_SIN_SESION_REMOTA,
  SESION_REMOTA_PENDIENTE,
  cargarSesionRemota,
  mapearRol,
} from './sesion-remota.js';
import type { PuertosSesionRemota } from './sesion-remota.js';
import { reiniciarEstadoSync } from './sync.js';

/**
 * Puerto `sesion-remota.ts` (issue #62): la sesion `cloud` sale de
 * `app.mis_ollas()` + `app.mi_rol()`, nunca de la UI.
 *
 * Todo se prueba con puertos FALSOS: son funciones, no HTTP. La red del
 * entorno sigue apagada (`test/setup.ts`), y el caso "sin red" lo comprueba
 * justo haciendo que el puerto rechace, que es lo que hace el adaptador real
 * cuando `fetch` falla.
 */

function puertosFalsos(opciones: {
  ollas?: readonly string[];
  rol?: (ollaId: string) => string | null;
  nombres?: Readonly<Record<string, string>>;
  fallaOllas?: boolean;
  fallaRol?: boolean;
}): PuertosSesionRemota {
  return {
    listarOllas: () =>
      opciones.fallaOllas === true
        ? Promise.reject(new Error('NetworkError: sin red'))
        : Promise.resolve({ ollas: opciones.ollas ?? [] }),
    consultarRol: (ollaId) =>
      opciones.fallaRol === true
        ? Promise.reject(new Error('sin red'))
        : Promise.resolve({ rol: opciones.rol === undefined ? null : opciones.rol(ollaId) }),
    datosOlla: (ollaId) =>
      Promise.resolve({ memberId: `miembro-${ollaId}`, nombreOlla: opciones.nombres?.[ollaId] ?? 'Olla X' }),
  };
}

function montarApp(ruta = '/padron') {
  return render(<RouterProvider router={crearRouterDePrueba(ruta)} />);
}

function divisor(): HTMLElement {
  const elemento = screen.getByRole('banner').querySelector('[data-divisor-contexto]');
  if (elemento === null) throw new Error('el header no tiene divisor de contexto');
  return elemento as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
  reiniciarEstadoSync();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('cargarSesionRemota', () => {
  it('arma la sesion de la primera de dos ollas y trae el rol del servidor', async () => {
    const puertos = puertosFalsos({
      ollas: ['olla-a', 'olla-b'],
      rol: (id) => (id === 'olla-a' ? 'organizadora' : 'cocinera'),
      nombres: { 'olla-a': 'San Juan' },
    });
    const resultado = await cargarSesionRemota(puertos);
    expect(resultado.sesion).toMatchObject({
      memberId: 'miembro-olla-a',
      ollaId: 'olla-a',
      nombreOlla: 'San Juan',
      rol: 'organizadora',
      modo: 'cloud',
    });
  });

  it('respeta la olla preferida si esta en mis_ollas (segunda olla) y su rol', async () => {
    const puertos = puertosFalsos({
      ollas: ['olla-a', 'olla-b'],
      rol: (id) => (id === 'olla-b' ? 'nutricionista' : 'organizadora'),
      nombres: { 'olla-b': 'Santa Rosa' },
    });
    const resultado = await cargarSesionRemota(puertos, 'olla-b');
    expect(resultado.sesion).toMatchObject({ ollaId: 'olla-b', rol: 'nutricionista', nombreOlla: 'Santa Rosa' });
  });

  it('sin ollas devuelve null con motivo, no una sesion inventada', async () => {
    const resultado = await cargarSesionRemota(puertosFalsos({ ollas: [] }));
    expect(resultado).toEqual({ sesion: null, motivo: 'sin_ollas' });
    expect(MOTIVO_SIN_SESION_REMOTA.sin_ollas).toMatch(/ninguna olla/i);
  });

  it('un rol fuera de los cuatro devuelve null con motivo y el valor crudo', async () => {
    const resultado = await cargarSesionRemota(
      puertosFalsos({ ollas: ['olla-a'], rol: () => 'superusuario' }),
    );
    expect(resultado.sesion).toBeNull();
    expect(resultado).toMatchObject({ motivo: 'rol_desconocido', detalle: 'superusuario' });
    // Sin aproximacion: "root" no se convierte en admin.
    expect(mapearRol('root')).toBeNull();
    expect(mapearRol('Administradora')).toBeNull();
    expect(mapearRol(null)).toBeNull();
    expect(mapearRol('admin')).toBe('admin');
  });

  it('mi_rol null (olla ajena al usuario) devuelve null con motivo sin_rol', async () => {
    const resultado = await cargarSesionRemota(
      puertosFalsos({ ollas: ['olla-a'], rol: () => null }),
    );
    expect(resultado).toEqual({ sesion: null, motivo: 'sin_rol' });
  });

  it('sin red: la RPC rechaza, devuelve null con motivo y NUNCA lanza', async () => {
    const resultado = await cargarSesionRemota(puertosFalsos({ fallaOllas: true }));
    expect(resultado).toMatchObject({ sesion: null, motivo: 'error_rpc' });
    expect(resultado.sesion).toBeNull();

    const resultadoRol = await cargarSesionRemota(
      puertosFalsos({ ollas: ['olla-a'], fallaRol: true }),
    );
    expect(resultadoRol).toMatchObject({ sesion: null, motivo: 'error_rpc' });
  });

  it('el puerto pendiente (adaptador no conectado) devuelve null, no rompe', async () => {
    const resultado = await cargarSesionRemota(SESION_REMOTA_PENDIENTE);
    expect(resultado).toMatchObject({ sesion: null, motivo: 'error_rpc' });
  });
});

describe('cambiarOlla en cloud (lo que asigna el servidor)', () => {
  it('acepta la olla que devolvio mis_ollas y conserva el rol', () => {
    const nube = { ...SESION_INICIAL, modo: 'cloud' as const, rol: 'organizadora' as const };
    expect(cambiarOlla(nube, 'olla-b', 'Santa Rosa')).toMatchObject({
      ollaId: 'olla-b',
      nombreOlla: 'Santa Rosa',
      rol: 'organizadora',
    });
    // Sin id no hay cambio: no se puede "volver" a una olla vacia.
    expect(cambiarOlla(nube, '')).toBe(nube);
    // El rol sigue sin poder cambiarse a mano (identidad exacta).
    expect(cambiarRol(nube, 'admin')).toBe(nube);
  });
});

describe('rojo -> verde: la guarda usa la sesion del puerto remoto', () => {
  it('un rol sin acceso a /padron es redirigido a su ruta inicial', async () => {
    // Cocinera segun el servidor: no puede ver /padron (MATRIZ_ROL).
    const resultado = await cargarSesionRemota(
      puertosFalsos({ ollas: ['olla-a'], rol: () => 'cocinera', nombres: { 'olla-a': 'San Juan' } }),
    );
    expect(resultado.sesion?.modo).toBe('cloud');
    expect(resultado.sesion?.rol).toBe('cocinera');

    act(() => {
      window.localStorage.setItem(CLAVE_SESION, JSON.stringify(resultado.sesion));
    });

    montarApp('/padron');
    // Redirigida a /servicio (ruta inicial de la cocinera) con el aviso.
    expect(divisor()).toHaveTextContent('Olla San Juan · Cocinera');
    expect(screen.getByText(/esa sección no es para tu rol/i)).toBeInTheDocument();
  });

  it('con la sesion del puerto, /padron SI abre para quien el servidor dice organizadora', async () => {
    const resultado = await cargarSesionRemota(
      puertosFalsos({ ollas: ['olla-a'], rol: () => 'organizadora', nombres: { 'olla-a': 'San Juan' } }),
    );
    act(() => {
      window.localStorage.setItem(CLAVE_SESION, JSON.stringify(resultado.sesion));
    });
    montarApp('/padron');
    expect(divisor()).toHaveTextContent('Olla San Juan · Organizadora');
    expect(screen.queryByText(/esa sección no es para tu rol/i)).toBeNull();
  });

  it('sin red la app sigue con la sesion local guardada (demo)', () => {
    window.localStorage.setItem(
      CLAVE_SESION,
      JSON.stringify({ ...SESION_INICIAL, rol: 'organizadora' }),
    );
    montarApp('/padron');
    expect(leerSesion(window.localStorage).modo).toBe('demo');
    expect(divisor()).toHaveTextContent('Olla San Juan · Organizadora');
    // El selector de demo sigue ofreciendose: no hay RPC que lo apague.
    fireEvent.click(screen.getByRole('button', { name: /Más/i }));
    const hoja = screen.getByRole('navigation', { name: 'Más secciones' });
    expect(within(hoja).getByRole('button', { name: 'Organizadora' })).toHaveAttribute('aria-pressed', 'true');
  });
});