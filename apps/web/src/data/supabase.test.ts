import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clienteSupabase,
  destinoBackend,
  estadoConexion,
  leerConfiguracion,
  marcarSesionVista,
} from './supabase.js';

/**
 * Configuracion del backend. Ningun caso usa red: `clienteSupabase()` construye
 * el cliente (no hace requests) y lo que se prueba es cuando hay y cuando NO.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  marcarSesionVista('anonimo');
});

describe('leerConfiguracion', () => {
  it('sin las dos variables no hay configuracion: nunca una URL por defecto', () => {
    expect(leerConfiguracion({})).toBeNull();
    expect(leerConfiguracion({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBeNull();
    expect(leerConfiguracion({ VITE_SUPABASE_ANON_KEY: 'clave-publicable' })).toBeNull();
    expect(
      leerConfiguracion({ VITE_SUPABASE_URL: '   ', VITE_SUPABASE_ANON_KEY: 'clave' }),
    ).toBeNull();
  });

  it('con las dos variables devuelve url + clave publicable, sin espacios', () => {
    expect(
      leerConfiguracion({
        VITE_SUPABASE_URL: ' https://x.supabase.co ',
        VITE_SUPABASE_ANON_KEY: ' clave-publicable ',
      }),
    ).toEqual({ url: 'https://x.supabase.co', claveAnonima: 'clave-publicable' });
  });
});

describe('clienteSupabase y estadoConexion', () => {
  it('sin env: no hay cliente, el estado es sin_configurar y no se toca la red', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    expect(clienteSupabase()).toBeNull();
    expect(estadoConexion()).toBe('sin_configurar');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('con env: hay cliente, arranca anonimo y pasa a autenticado con sesion', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publicable-de-prueba');

    expect(clienteSupabase()).not.toBeNull();
    expect(estadoConexion()).toBe('anonimo');

    marcarSesionVista('autenticado');
    expect(estadoConexion()).toBe('autenticado');

    // Crear el cliente no dispara requests.
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el cliente se reusa mientras la configuracion no cambie', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publicable-de-prueba');

    expect(clienteSupabase()).toBe(clienteSupabase());
  });
});

describe('destinoBackend', () => {
  it('sin configuracion no hay destino', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    expect(destinoBackend()).toBeNull();
  });

  it.each([
    'http://127.0.0.1:54321',
    'http://localhost:54321',
    'http://[::1]:54321',
  ])('un host de loopback es local: %s', (url) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publicable-de-prueba');
    expect(destinoBackend()).toBe('local');
  });

  it('un host publico es remoto', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proyecto-de-prueba.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publicable-de-prueba');
    expect(destinoBackend()).toBe('remoto');
  });

  it('una URL invalida no adivina el destino', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'no-es-una-url');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'clave-publicable-de-prueba');
    expect(destinoBackend()).toBeNull();
  });
});
