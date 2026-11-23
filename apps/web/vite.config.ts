/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import {
  ARCHIVO_SW,
  PAGINA_SIN_CONEXION,
  construirContrato,
  escribirServiceWorker,
} from './src/pwa/contrato-sw.js';

const desdeAqui = (ruta: string): string => fileURLToPath(new URL(ruta, import.meta.url));

/**
 * El SW con el precache del build real, no una lista fija.
 *
 * Se emite en `generateBundle` (con los hashes ya calculados) y viaja como
 * asset del build: en dev el `vite.config` lee `public/sw.js` como respaldo.
 */
function serviceWorkerPwa(): Plugin {
  let version = '';
  return {
    name: 'hackods-sw-precache',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const contrato = construirContrato(bundle);
      version = contrato.version;
      this.emitFile({ type: 'asset', fileName: ARCHIVO_SW, source: escribirServiceWorker(contrato) });
      this.emitFile({ type: 'asset', fileName: 'offline.html', source: PAGINA_SIN_CONEXION });
    },
    /**
     * El build que se sirve queda en el `<meta>` del HTML. `config()` corre
     * antes de conocer los hashes, así que la versión se inyecta acá.
     */
    transformIndexHtml(html) {
      return html.replaceAll('%BUILD_ID%', version || 'dev');
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPwa()],
  resolve: {
    alias: [
      // Exactos a proposito: `@hackods/ui/tokens.css` debe resolver por package exports.
      { find: /^@hackods\/contracts$/, replacement: desdeAqui('../../packages/contracts/src/index.ts') },
      { find: /^@hackods\/ui$/, replacement: desdeAqui('../../packages/ui/src/index.ts') },
      { find: /^@hackods\/domain$/, replacement: desdeAqui('../../packages/domain/src/index.ts') },
    ],
  },
  server: {
    port: 5173,
  },
  test: {
    // Entorno de DOM + IndexedDB falsa: el offline se prueba sin red y sin navegador.
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
