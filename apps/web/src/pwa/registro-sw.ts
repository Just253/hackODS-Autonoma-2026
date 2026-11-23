/**
 * Registro del service worker y estado de la versión.
 *
 * Regla del paquete: el SW nuevo **no** toma control a la fuerza. Se muestra
 * "hay una version nueva" y se aplica cuando la persona recarga.
 */
import { ARCHIVO_SW } from './contrato-sw.js';

/** Ruta pública del SW. En dev Vite lo sirve desde `public/sw.js`. */
export const URL_SW = `/${ARCHIVO_SW}`;

export interface EstadoSw {
  soportado: boolean;
  /** `true` si hay un SW nuevo esperando el "recargar". */
  versionNueva: boolean;
}

/** Pide al SW activo la versión con la que se está sirviendo este shell. */
export function pedirVersionSw(contenedor: ServiceWorkerContainer): Promise<string | null> {
  return new Promise((resolver) => {
    const activo = contenedor.controller;
    if (activo === null) {
      resolver(null);
      return;
    }
    const canal = new MessageChannel();
    const lista = setTimeout(() => resolver(null), 2000);
    canal.port1.onmessage = (evento: MessageEvent<unknown>) => {
      clearTimeout(lista);
      const dato = evento.data;
      if (typeof dato === 'object' && dato !== null && 'version' in dato) {
        const { version } = dato as { version: unknown };
        resolver(typeof version === 'string' ? version : null);
        return;
      }
      resolver(null);
    };
    activo.postMessage('HACKODS_VERSION', [canal.port2]);
  });
}

/**
 * Registra el SW en dev y en prod (antes solo se registraba en prod, y por eso
 * el modo avión solo fallaba en la demo). Devuelve la registración para que
 * los tests la esperen; nunca rechaza: un SW caído no puede tumbar la app.
 */
export function registrarServiceWorker(
  contenedor: ServiceWorkerContainer | undefined = globalThis.navigator?.serviceWorker,
  alCambiar: (estado: EstadoSw) => void = () => {},
): Promise<ServiceWorkerRegistration | null> {
  if (contenedor === undefined) {
    alCambiar({ soportado: false, versionNueva: false });
    return Promise.resolve(null);
  }

  const avisar = (versionNueva: boolean): void => {
    alCambiar({ soportado: true, versionNueva });
  };

  // Sin esperar `load`: si se espera, la primera visita puede irse antes de
  // que el precache termine y la recarga offline no encuentra el shell.
  return contenedor
    .register(URL_SW)
    .then((registro) => {
      // Ya había una versión esperando de una visita anterior.
      if (registro.waiting !== null) {
        avisar(true);
      }
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing;
        if (nuevo === null) {
          return;
        }
        nuevo.addEventListener('statechange', () => {
          if (nuevo.state === 'installed' && contenedor.controller !== null) {
            avisar(true);
          }
        });
      });
      return registro;
    })
    .catch((error: unknown) => {
      console.warn('No se pudo registrar el service worker', error);
      avisar(false);
      return null;
    });
}
