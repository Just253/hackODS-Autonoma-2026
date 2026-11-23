/*
 * Respaldo de desarrollo — NO es el SW de producción.
 *
 * El SW real lo genera `vite build` (plugin `hackods-sw-precache` en
 * vite.config.ts) a partir de src/pwa/contrato-sw.ts: precachea los assets
 * del build real, con hash. En dev, Vite sirve este archivo desde `public/`.
 *
 * Lo escribe src/pwa/contrato-sw.test.ts: si lo editás a mano, el test falla.
 *
 * La lista fija anterior (5 URLs sin hash) era el motivo del riesgo R4:
 * tras `vite build` los assets no estaban en caché y la recarga offline rompía.
 */
const CACHE = 'hackods-shell-dev';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
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

// En dev no se intercepta: Vite sirve con HMR y no hay build que precachear.
self.addEventListener('fetch', () => {});
