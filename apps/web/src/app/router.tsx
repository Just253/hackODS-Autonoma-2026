import { createBrowserRouter } from 'react-router-dom';

import { SaludoPage } from '../pages/SaludoPage.js';

/**
 * Una ruta por feature, con lazy() cuando exista. Hoy solo el esqueleto.
 * Archivo caliente: cambios por el dueno de `area:web` (docs/PROTOCOL.md 5).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <SaludoPage />,
  },
]);
