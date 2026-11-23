import { useState } from 'react';
import {
  createBrowserRouter,
  createMemoryRouter,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';

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
import { destinoDeRuta, rutaInicial } from './navegacion.js';
import { leerSesion } from './sesion.js';

/**
 * Una ruta por feature, con lazy() cuando exista.
 * Archivo caliente: cambios por el dueno de `area:web` (docs/PROTOCOL.md 5).
 *
 * Las rutas de B y C que todavía no tienen pantalla quedan vacías a propósito: existen para que el
 * guion de la demo tenga el camino completo y para que cada dueño reemplace su archivo sin editar
 * este.
 *
 * ## Guardas por rol (FE-02, DEC-20261123-1358-8feaf9)
 *
 * Todo cuelga de `GuardaDeRol`, que es la UNICA puerta. Cada ruta ya declara sus
 * roles en `navegacion.ts` (`MATRIZ_ROL`); aca se vuelve a comprobar contra la
 * sesion, asi que escribir la url a mano NO abre una seccion prohibida. El
 * filtro de la barra es comodidad; la barrera es esta guarda (y, de verdad, el
 * servidor: `olla_members` responde 42501).
 *
 * Que se ve en una ruta prohibida: REDIRECCION a la ruta inicial del rol con un
 * aviso en `location.state`, no una pantalla 403. Por que:
 *  - un 403 deja a la persona en un callejon: no sabe a donde ir, y en una
 *    tablet sin teclado "atras" no es comodo;
 *  - el aviso dice la verdad ("Esa sección no es para tu rol") y la deja
 *    trabajando en la pantalla que SI le sirve, en un solo paso;
 *  - el estado "no tenés acceso" existe como texto del aviso, asi que nunca se
 *    queda en blanco.
 *
 * El aviso se pinta en `Shell` (header), no en la pantalla destino: la guarda
 * no toca ningun `feature/**`. La sesion la lee `leerSesion()`: misma fuente
 * que FE-01, sin duplicar reglas.
 */

/** Texto unico del aviso de acceso denegado. Se exporta para no duplicarlo. */
export const AVISO_SIN_ACCESO = 'Esa sección no es para tu rol.';

/**
 * Guarda de ruta. Lee la sesion persistida y redirige si el rol no esta en los
 * roles del destino. Usa `leerSesion` (no `useSesion`) para no re-montar el
 * arbol entero: la sesion cambia desde la hoja de ajustes, que remonta la ruta
 * de todos modos; aca solo hace falta "quien soy AHORA".
 */
function GuardaDeRol() {
  const ubicacion = useLocation();
  const [sesion] = useState(() => leerSesion());
  const destino = destinoDeRuta(ubicacion.pathname);

  // Ruta del menu: solo pasa quien esta en sus roles. Ruta desconocida (hoy,
  // ninguna) no tiene destino y no le toca a esta guarda: se deja pasar.
  if (destino === null || destino.roles.includes(sesion.rol)) {
    return <Outlet />;
  }

  // `replace`: "atras" no rebota de nuevo en la prohibida.
  return (
    <Navigate
      to={rutaInicial(sesion)}
      replace
      state={{ avisoAcceso: AVISO_SIN_ACCESO, desde: ubicacion.pathname }}
    />
  );
}

/**
 * A donde aterriza `/`: la ruta inicial del rol, no un `/padron` fijo. Antes la
 * raiz mandaba siempre a padron; una cocinera caia en una pantalla que no es
 * suya. Ahora cada rol empieza donde trabaja (FE-03 parcial).
 */
function RedirectInicio() {
  const [sesion] = useState(() => leerSesion());
  return <Navigate to={rutaInicial(sesion)} replace />;
}

export const rutas = [
  {
    path: '/',
    element: <Shell />,
    children: [
      {
        // La unica puerta: index y las siete pantallas cuelgan de aca.
        element: <GuardaDeRol />,
        children: [
          { index: true, element: <RedirectInicio /> },
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
        ],
      },
    ],
  },
];

/** El navegador no tiene url de barra en jsdom: el test usa `crearRouterDePrueba`. */
export const router = createBrowserRouter(rutas);

export function crearRouterDePrueba(rutaEntrada = '/') {
  return createMemoryRouter(rutas, { initialEntries: [rutaEntrada] });
}
