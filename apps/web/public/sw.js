/*
 * Service worker minimo del esqueleto: precachea el shell y responde desde cache.
 * La estrategia definitiva (y su versionado anti-build-viejo) es M0/M6: ver
 * docs/ARQUITECTURA.md 4 y el riesgo R4 del plan.
 */
const CACHE = 'hackods-shell-v1';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icons/icono-192.png',
  '/icons/icono-512.png',
  '/icons/icono-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== CACHE).map((clave) => caches.delete(clave)))),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((hit) => hit ?? fetch(event.request)),
  );
});
