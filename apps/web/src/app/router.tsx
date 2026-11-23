import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom';

import { CORTE_DEMO, MOVIMIENTOS_DEMO } from '../fixtures/demo.js';
import {
  FUENTE_DEMO,
  POLLO_ACTUAL,
  POLLO_PREVIA,
  PRODUCTO_DEMO,
  UNIDAD_DEMO,
} from '../fixtures/precios-demo.js';
import { PreciosPantalla } from '../features/precios/PreciosPantalla.js';
import { PresupuestoPantalla } from '../features/presupuesto/PresupuestoPantalla.js';
import { Shell } from './Shell.js';
import { PadronPage } from '../features/padron/PadronPage.js';
import { ServicioPage } from '../features/servicio/ServicioPage.js';
import { RutaVacia } from '../pages/RutaVacia.js';

/**
 * Una ruta por feature, con lazy() cuando exista.
 * Archivo caliente: cambios por el dueno de `area:web` (docs/PROTOCOL.md 5).
 *
 * Las rutas de B y C quedan vacias a proposito: existen para que el guion de la
 * demo tenga el camino completo y para que cada dueno reemplace su archivo sin
 * editar este.
 */
export const rutas = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/padron" replace /> },
      { path: 'padron', element: <PadronPage /> },
      { path: 'servicio', element: <ServicioPage /> },
      // Track B · comprobante y dinero
      { path: 'comprobante', element: <RutaVacia titulo="Comprobante" dueno="B" /> },
      { path: 'presupuesto', element: <PresupuestoPantalla movimientos={MOVIMIENTOS_DEMO} corte={CORTE_DEMO} /> },
      {
        path: 'precios',
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
      // Track C · entre ollas y folio
      { path: 'solicitud', element: <RutaVacia titulo="Entre ollas" dueno="C" /> },
      { path: 'reporte', element: <RutaVacia titulo="Reporte" dueno="C" /> },
    ],
  },
];

/** El navegador no tiene url de barra en jsdom: el test usa `crearRouterDePrueba`. */
export const router = createBrowserRouter(rutas);

export function crearRouterDePrueba(rutaInicial = '/padron') {
  return createMemoryRouter(rutas, { initialEntries: [rutaInicial] });
}
