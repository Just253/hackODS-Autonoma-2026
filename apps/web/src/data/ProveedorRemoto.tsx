/**
 * Inyeccion del cliente de lectura para las pantallas.
 *
 * En produccion no hay provider y `useClienteRemoto()` devuelve el cliente real
 * (`clienteDeDatos()`), que es `null` si el build no trae `VITE_SUPABASE_URL` y
 * `VITE_SUPABASE_ANON_KEY`. En tests se envuelve la pantalla con
 * `<ProveedorRemoto cliente={doble}>` y se prueba el camino de datos sin red.
 *
 * No es un store ni un cache: solo transporta el puerto `ClienteDatos` para que
 * el componente no importe el SDK (y el test no tenga que simular fetch).
 */
import { createContext, useContext, type ReactNode } from 'react';

import type { ClienteDatos } from './cliente-remoto.js';
import { clienteDeDatos } from './supabase.js';

/** `undefined` = no hay provider; `null` = provider que declara "sin cliente". */
const ContextoClienteRemoto = createContext<ClienteDatos | null | undefined>(undefined);

export function ProveedorRemoto({
  cliente,
  children,
}: {
  readonly cliente: ClienteDatos | null;
  readonly children: ReactNode;
}) {
  return (
    <ContextoClienteRemoto.Provider value={cliente}>{children}</ContextoClienteRemoto.Provider>
  );
}

export function useClienteRemoto(): ClienteDatos | null {
  const inyectado = useContext(ContextoClienteRemoto);
  if (inyectado !== undefined) return inyectado;
  return clienteDeDatos();
}
