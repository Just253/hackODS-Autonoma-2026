/**
 * Cuenta de Supabase: entrar, salir y traducir la sesion real a `Sesion` (modo
 * `cloud`).
 *
 * El login vive en la hoja de ajustes del `Shell` y usa las cuentas demo fijas
 * (`cuentas-demo.ts`): no hay inputs de contrasena porque no son cuentas de
 * produccion, son cuentas de la demo publica del repo.
 *
 * Cadena completa, una sola vez por sesion:
 *
 *   signInWithPassword -> Supabase Auth guarda la sesion (localStorage del SDK)
 *   -> `membresiaDelUsuario()` (devices -> olla_members -> ollas, con RLS)
 *   -> `Sesion` en modo cloud (ollaId y rol REALES) -> `fijarSesionRemota()`
 *
 * Si el usuario no esta enrolado no se inventa un rol: se avisa y la app vuelve
 * al modo demo, donde las pantallas que leen Supabase dicen "no configurado" en
 * vez de mostrar filas de otra olla.
 *
 * Sin `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` no hay cliente, no hay
 * `getSession` y no hay `fetch`: el estado es `sin_configurar`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { mensajeDeError } from '../data/funciones-supabase.js';
import { membresiaDelUsuario } from '../data/remoto.js';
import {
  clienteSupabase,
  destinoBackend,
  estadoConexion,
  marcarSesionVista,
  type DestinoBackend,
  type EstadoConexion,
} from '../data/supabase.js';
import type { CuentaDemo } from './cuentas-demo.js';
import { fijarSesionRemota, volverASesionDemo } from './sesion.js';

/** Datos del enrolamiento por PIN: son de `app.enroll`, no una cuenta fija. */
export interface Enrolamiento {
  readonly codigoOlla: string;
  readonly pin: string;
  readonly deviceId: string;
}

export interface ControlCuenta {
  readonly estado: EstadoConexion;
  /** A que backend apunta el build (`null` sin configurar). */
  readonly backend: DestinoBackend | null;
  /** Email de la sesion. `null` si nadie entro. */
  readonly email: string | null;
  /** `true` mientras se lee la sesion guardada al abrir la app. */
  readonly inicializando: boolean;
  /** `true` mientras corre un entrar/salir/enrolar. */
  readonly ocupado: boolean;
  /** Texto legible para la persona. Nunca el mensaje crudo del servidor. */
  readonly error: string | null;
  readonly entrar: (cuenta: CuentaDemo) => Promise<void>;
  /** Local no tiene cuentas demo: entra con codigo de olla + PIN (Edge `enroll`). */
  readonly enrolar: (datos: Enrolamiento) => Promise<void>;
  readonly salir: () => Promise<void>;
}

/** Mensaje de auth en palabras de la olla, sin jerga ni codigos HTTP. */
function traducirFallo(mensaje: string): string {
  const texto = mensaje.toLowerCase();
  if (texto.includes('invalid login') || texto.includes('invalid credentials')) {
    return 'El email o la contraseña de esa cuenta demo no coinciden.';
  }
  if (texto.includes('fetch') || texto.includes('network') || texto.includes('failed to')) {
    return 'No hay conexión con Supabase. Revisa la red de esta tablet.';
  }
  return 'No se pudo entrar con esa cuenta demo. Prueba otra vez.';
}

const SIN_OLLA =
  'Esa cuenta no tiene una olla asignada. Avisa a quien administra la demo.';
const SIN_SESION_GUARDADA = 'No se pudo leer la sesión guardada en esta tablet.';

export function useCuenta(): ControlCuenta {
  const cliente = clienteSupabase();
  const [estado, setEstado] = useState<EstadoConexion>(() => estadoConexion());
  const [email, setEmail] = useState<string | null>(null);
  const [inicializando, setInicializando] = useState(cliente !== null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // El handler de auth se registra una vez; la bandera evita escribir estado
  // despues de desmontar (cambio de pantalla durante el sign-in).
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (cliente === null) {
      setInicializando(false);
      return;
    }
    let vigente = true;

    const aplicar = async (sesion: Session | null): Promise<void> => {
      if (!vigente) return;
      if (sesion === null) {
        marcarSesionVista('anonimo');
        setEstado('anonimo');
        setEmail(null);
        volverASesionDemo();
        setInicializando(false);
        return;
      }

      // Hay JWT: la olla y el rol los decide el servidor, no la UI.
      marcarSesionVista('autenticado');
      setEstado('autenticado');
      setEmail(sesion.user.email ?? null);
      setInicializando(false);

      const membresia = await membresiaDelUsuario();
      if (!vigente) return;
      if (membresia === null) {
        // Autenticado pero sin olla visible: no se hereda la demo como si
        // fuera la suya. Se dice y se vuelve al punto de partida.
        volverASesionDemo();
        setError(SIN_OLLA);
        return;
      }
      fijarSesionRemota({ ...membresia, modo: 'cloud' });
      setError(null);
    };

    void cliente.auth
      .getSession()
      .then(({ data }) => aplicar(data.session))
      .catch(() => {
        if (!vigente) return;
        setInicializando(false);
        setError(SIN_SESION_GUARDADA);
      });

    // Cubre login, logout y refresh del token sin sondear.
    const { data } = cliente.auth.onAuthStateChange((_evento, sesion) => {
      void aplicar(sesion);
    });

    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, [cliente]);

  const entrar = useCallback(
    async (cuenta: CuentaDemo): Promise<void> => {
      if (cliente === null) {
        setError('Supabase no está configurado en este build.');
        return;
      }
      setOcupado(true);
      setError(null);
      try {
        const { error: fallo } = await cliente.auth.signInWithPassword({
          email: cuenta.email,
          password: cuenta.clave,
        });
        if (fallo !== null && montado.current) setError(traducirFallo(fallo.message));
      } catch {
        if (montado.current) setError('No hay conexión con Supabase. Revisa la red de esta tablet.');
      } finally {
        if (montado.current) setOcupado(false);
      }
    },
    [cliente],
  );

  const salir = useCallback(async (): Promise<void> => {
    if (cliente === null) return;
    setOcupado(true);
    setError(null);
    try {
      await cliente.auth.signOut();
    } catch {
      if (montado.current) setError('No se pudo cerrar la sesión. Prueba otra vez.');
    } finally {
      if (montado.current) setOcupado(false);
    }
  }, [cliente]);

  const enrolar = useCallback(
    async (datos: Enrolamiento): Promise<void> => {
      if (cliente === null) {
        setError('Supabase no está configurado en este build.');
        return;
      }
      setOcupado(true);
      setError(null);
      try {
        const { data, error } = await cliente.functions.invoke<{
          accessToken?: string | null;
          refreshToken?: string | null;
        }>('enroll', {
          body: {
            codigoOlla: datos.codigoOlla.trim(),
            pin: datos.pin.trim(),
            deviceId: datos.deviceId,
          },
        });

        if (error !== null) {
          // 401 = PIN que no valida, 422 = codigo inexistente. Se dice sin
          // distinguir "no existe" de "PIN mal": el servidor tampoco lo hace.
          const mensaje = await mensajeDeError(error);
          if (montado.current) {
            setError(
              mensaje.toLowerCase().includes('pin')
                ? 'El PIN no es el de esa olla. Revisa el papel del comedor.'
                : 'No se pudo enrolar esta tablet con ese código de olla.',
            );
          }
          return;
        }

        const accessToken = data?.accessToken ?? null;
        const refreshToken = data?.refreshToken ?? null;
        if (accessToken === null || refreshToken === null) {
          if (montado.current) {
            setError('El enrolamiento no devolvió una sesión. Avisa a quien administra la demo.');
          }
          return;
        }

        const { error: fallo } = await cliente.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (fallo !== null && montado.current) {
          setError('Se enroló la tablet, pero no se pudo abrir la sesión. Prueba otra vez.');
        }
        // `onAuthStateChange` resuelve la olla y el rol.
      } catch {
        if (montado.current) setError('No hay conexión con este backend. Revisa la red.');
      } finally {
        if (montado.current) setOcupado(false);
      }
    },
    [cliente],
  );

  return {
    estado,
    backend: destinoBackend(),
    email,
    inicializando,
    ocupado,
    error,
    entrar,
    enrolar,
    salir,
  };
}
