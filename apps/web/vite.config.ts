/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const desdeAqui = (ruta: string): string => fileURLToPath(new URL(ruta, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      // Exactos a proposito: `@hackods/ui/tokens.css` debe resolver por package exports.
      { find: /^@hackods\/contracts$/, replacement: desdeAqui('../../packages/contracts/src/index.ts') },
      { find: /^@hackods\/ui$/, replacement: desdeAqui('../../packages/ui/src/index.ts') },
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
