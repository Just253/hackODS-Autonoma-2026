/**
 * Entorno de test de `apps/web`.
 *
 * - `fake-indexeddb` reemplaza `IDBFactory` para que Dexie funcione en jsdom.
 * - La red queda apagada a proposito: el esqueleto no debe hacer `fetch`.
 *   Si un test la necesita, la enciende y lo dice en el nombre del caso.
 */
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';

import { afterEach, beforeEach, vi } from 'vitest';

const sinRed = (): never => {
  throw new Error('la red esta apagada: ninguna pantalla debe usar fetch');
};

beforeEach(() => {
  // Supabase apagado por defecto: un `.env` en la raiz no puede cambiar el
  // resultado de los tests. Cada test que necesite configuracion la stubea.
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
  // El plan B del compute tampoco puede activarse desde el `.env` de la maquina:
  // sin esto, los botones de captura quedan habilitados y los tests salen a red.
  vi.stubEnv('VITE_COMPUTE_URL', '');
  vi.stubEnv('VITE_COMPUTE_KEY', '');
  vi.stubEnv('VITE_COMPUTE_TOKEN', '');
  vi.stubGlobal('fetch', vi.fn(sinRed));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
