import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router-dom';

import { CORTE_DEMO, MOVIMIENTOS_DEMO } from '../fixtures/demo.js';
import { FUENTE_PRECIOS_DEMO, PRODUCTO_DESTACADO, PRODUCTOS_DEMO } from '../fixtures/precios-productos.js';
import { PreciosPantalla } from '../features/precios/PreciosPantalla.js';
import { PresupuestoPantalla } from '../features/presupuesto/PresupuestoPantalla.js';
import { Shell } from './Shell.js';
import { ComprobantePage } from '../features/comprobante/ComprobantePage.js';
import { PadronPage } from '../features/padron/PadronPage.js';
import { ServicioPage } from '../features/servicio/ServicioPage.js';
import { SolicitudPantalla } from '../features/solicitud/SolicitudPantalla.js';
import { AHORA_DEMO, NUEVA_SOLICITUD_DEMO } from '../features/solicitud/fixtures.js';
import { ReportePantalla } from '../features/reporte/ReportePantalla.js';
import { MOVIMIENTOS_ENTRE_OLLAS, PERIODO_DEMO } from '../features/reporte/fixtures.js';
import { RecetasPage } from '../features/recetas/RecetasPage.js';
import { ConsentimientoPage } from '../features/consentimiento/ConsentimientoPage.js';

/**
 * Una ruta por feature, con lazy() cuando exista.
 * Archivo caliente: cambios por el dueno de `area:web` (docs/PROTOCOL.md 5).
 *
 * Las rutas de B y C que todavía no tienen pantalla quedan vacías a propósito: existen para que el
 * guion de la demo tenga el camino completo y para que cada dueño reemplace su archivo sin editar
 * este.
 */
export const rutas = [
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/padron" replace /> },
      { path: 'padron', element: <PadronPage /> },
      { path: 'servicio', element: <ServicioPage /> },
      // Track A · comprobante (lo tomó A al quedar libre el issue #9)
      { path: 'comprobante', element: <ComprobantePage /> },
      { path: 'presupuesto', element: <PresupuestoPantalla movimientos={MOVIMIENTOS_DEMO} corte={CORTE_DEMO} /> },
      {
        path: 'precios',
        element: (
          <PreciosPantalla
            productos={PRODUCTOS_DEMO}
            fuente={FUENTE_PRECIOS_DEMO}
            productoInicial={PRODUCTO_DESTACADO}
          />
        ),
      },
      // Track C · entre ollas y folio
      { path: 'solicitud', element: <SolicitudPantalla nueva={NUEVA_SOLICITUD_DEMO} ahora={AHORA_DEMO} /> },
      { path: 'reporte', element: <ReportePantalla movimientos={MOVIMIENTOS_ENTRE_OLLAS} periodo={PERIODO_DEMO} /> },
      // Recetario: producir descuenta despensa (#72).
      { path: 'recetas', element: <RecetasPage /> },
      // #74 · consentimiento: dos permisos separados del plato. Al final para minimizar conflictos.
      { path: 'consentimiento', element: <ConsentimientoPage /> },
    ],
  },
];

/** El navegador no tiene url de barra en jsdom: el test usa `crearRouterDePrueba`. */
export const router = createBrowserRouter(rutas);

export function crearRouterDePrueba(rutaInicial = '/padron') {
  return createMemoryRouter(rutas, { initialEntries: [rutaInicial] });
}
