import { createBrowserRouter } from 'react-router-dom';

import { CORTE_DEMO, MOVIMIENTOS_DEMO } from '../fixtures/demo.js';
import {
  FUENTE_DEMO,
  POLLO_ACTUAL,
  POLLO_PREVIA,
  PRODUCTO_DEMO,
  UNIDAD_DEMO,
} from '../fixtures/precios-demo.js';
import { PresupuestoPantalla } from '../features/presupuesto/PresupuestoPantalla.js';
import { PreciosPantalla } from '../features/precios/PreciosPantalla.js';
import { SaludoPage } from '../pages/SaludoPage.js';

/**
 * Una ruta por feature, con lazy() cuando exista.
 * Archivo caliente: cambios por el dueno de `area:web` (docs/PROTOCOL.md 5).
 *
 * Presupuesto y precios se alimentan de los fixtures ficticios de la demo: cuando
 * la olla real cargue sus movimientos, el fixture se reemplaza por su repositorio
 * local y la pantalla no cambia.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <SaludoPage />,
  },
  {
    path: '/presupuesto',
    element: <PresupuestoPantalla movimientos={MOVIMIENTOS_DEMO} corte={CORTE_DEMO} />,
  },
  {
    path: '/precios',
    element: (
      <PreciosPantalla
        producto={PRODUCTO_DEMO}
        unidad={UNIDAD_DEMO}
        fuente={FUENTE_DEMO}
        ventanaActual={POLLO_ACTUAL}
        ventanaPrevia={POLLO_PREVIA}
      />
    ),
  },
]);
