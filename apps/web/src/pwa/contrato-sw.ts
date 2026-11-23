/**
 * Contrato del service worker: una sola fuente de verdad para el script que
 * escribe el build y para el test que lo verifica.
 *
 * Vive en `src/` (y no en `public/`) para que Vitest pueda importarlo sin red:
 * `public/` es estático y no se transforma.
 *
 * Lo que se escribe en el SW generado:
 *   - `CACHE_ACTUAL` con el hash del bundle real (anti build-viejo, riesgo R4).
 *   - `PRECACHE` con las URLs con hash que Vite emite + el manifest + los iconos.
 *   - `VERSION` / `BUILD_ID` visibles en el pie de la app.
 *
 * IMPORTANTE: este módulo lo importa `vite.config.ts` (Node) y `vitest`, pero
 * también comparte `ARCHIVO_SW` con `registro-sw.ts` (browser). Por eso NO
 * importa `node:crypto` a nivel de módulo: el hash por defecto lo hace el
 * plugin de Vite y acá se usa un fallback sin dependencias de Node.
 */
/**
 * FNV-1a de 64 bits en hex, sin Node ni Web Crypto: este módulo también lo
 * carga el navegador (vía `registro-sw.ts`). No es criptográfico — solo tiene
 * que cambiar cuando cambia el bundle, que es lo que evita el build viejo.
 */
export function hashDeContenido(texto: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= BigInt(texto.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Lo mínimo que se mira de `generateBundle` (Vite 8 usa Rolldown y no
 * re-exporta `OutputBundle`). Estructural: no arrastra un paquete nuevo.
 */
export type BundleDeBuild = Readonly<Record<string, { type: 'asset' | 'chunk'; fileName: string }>>;

/** Nombre público del SW. Debe coincidir con `registerServiceWorker`. */
export const ARCHIVO_SW = 'sw.js';

/** Ruta que resuelve a `index.html` con el historial del router. */
export const SHELL_HTML = 'index.html';

/** Sin red y sin shell cacheado, el SW devuelve esta respuesta mínima. */
export const PAGINA_SIN_CONEXION = `<!doctype html>
<html lang="es-PE">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sin conexión · Ollas comunes</title></head>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#111827;background:#ffffff">
    <h1 style="font-size:1.25rem">Sin conexión</h1>
    <p>Esta copia de la app no terminó de guardarse. Conéctate una vez y vuelve a abrirla.</p>
  </body>
</html>
`;

/**
 * URLs que se precachean además de los assets del bundle.
 * `manifest.webmanifest` e `icons/**` viajan desde `public/` sin hash.
 */
export const PRECACHE_FIJO = [
  `/${SHELL_HTML}`,
  '/manifest.webmanifest',
  '/icons/icono-192.png',
  '/icons/icono-512.png',
  '/icons/icono-maskable-512.png',
] as const;

/** Los archivos de entrada no se precachean aparte: ya están en `index.html`. */
const NO_PRECACHEAR = /\.html$/;

export interface ContratoSw {
  /** Versión corta del build; se muestra en el pie. */
  version: string;
  /** Nombre del `Cache`: se prefija con `hackods-shell-`. */
  nombreCache: string;
  /** Rutas con `/` inicial; todas son GET y de la app. */
  precache: string[];
  /** `true` si `index.html` está en el precache (fallback de navegación). */
  shellPrecacheado: boolean;
}

/**
 * Deriva versión, cache y precache a partir de lo que produjo Vite.
 * Determinista: mismo bundle → misma versión.
 */
export function construirContrato(
  bundle: BundleDeBuild,
  hashContenido: (texto: string) => string = hashDeContenido,
): ContratoSw {
  const assets = Object.keys(bundle)
    // Solo archivos, no `type: 'chunk'` de entrada ni assets duplicados.
    .filter((nombre) => !NO_PRECACHEAR.test(nombre))
    .map((nombre) => `/${nombre.replace(/^\/+/, '')}`)
    .sort();

  const precache = [...new Set([...assets, ...PRECACHE_FIJO])];
  const version = hashContenido(precache.join('\n')).slice(0, 12);

  return {
    version,
    nombreCache: `hackods-shell-${version}`,
    precache,
    shellPrecacheado: precache.includes(`/${SHELL_HTML}`),
  };
}

/** Escapa un valor de JS para insertarlo como literal de array/string. */
const literal = (valor: unknown): string => JSON.stringify(valor).replaceAll('</', '<\\/');

/** El SW final: precache del build real, sin red = shell desde caché. */
export function escribirServiceWorker(contrato: ContratoSw): string {
  return `/* Generado por vite.config.ts (apps/web). No editar a mano. */
/* Contrato: src/pwa/contrato-sw.ts — versión ${contrato.version} */

const CACHE = ${literal(contrato.nombreCache)};
const VERSION = ${literal(contrato.version)};
const PRECACHE = ${literal(contrato.precache)};

const SHELL = ${literal(`/${SHELL_HTML}`)};
const OFFLINE = ${literal('/offline.html')};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Sin red y sin completar el precache, no se activa: el shell viejo sigue vivo.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const pedido = event.request;
  if (pedido.method !== 'GET') {
    return;
  }

  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // La app se actualiza sola: el HTML y el propio SW van a la red primero.
  if (pedido.mode === 'navigate' || url.pathname.endsWith('/sw.js')) {
    event.respondWith(networkFirst(pedido));
    return;
  }

  // Assets del build: no cambian sin cambiar la versión del cache.
  event.respondWith(cacheFirst(pedido));
});

async function cacheFirst(pedido) {
  const hit = await caches.match(pedido);
  if (hit) {
    return hit;
  }
  const respuesta = await fetch(pedido);
  if (respuesta.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(pedido, respuesta.clone());
  }
  return respuesta;
}

async function networkFirst(pedido) {
  try {
    const respuesta = await fetch(pedido);
    if (respuesta.ok && respuesta.type === 'basic') {
      const cache = await caches.open(CACHE);
      await cache.put(pedido, respuesta.clone());
    }
    return respuesta;
  } catch {
    // Recarga offline: cualquier ruta devuelve el shell precacheado.
    const shell = await caches.match(SHELL);
    if (shell) {
      return shell;
    }
    const offline = await caches.match(OFFLINE);
    return offline ?? new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' });
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'HACKODS_VERSION' && event.source) {
    event.source.postMessage({ tipo: 'HACKODS_VERSION', version: VERSION });
  }
});
`;
}
