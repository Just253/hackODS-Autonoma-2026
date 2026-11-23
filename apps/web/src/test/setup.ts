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
  vi.stubGlobal('fetch', vi.fn(sinRed));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
