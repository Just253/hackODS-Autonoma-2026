/**
 * Contrato del service worker, sin navegador ni red.
 *
 * Lo que se prueba (y el issue #3 exige, más allá de "compila"):
 *  1. El precache es el del build real: cada JS/CSS con hash que emite Vite
 *     está en la lista. Era exactamente lo que fallaba con la lista fija.
 *  2. Hay fallback a `index.html` con la red apagada (recarga de cualquier ruta).
 *  3. Tras un `vite build`, `dist/sw.js` trae en su precache los archivos que
 *     existen en `dist/` — la prueba de que no se quedó en un build viejo.
 *  4. `public/sw.js` (dev) coincide con lo escrito acá: no vuelve el precache fijo.
 *  5. El registro no depende de `import.meta.env.PROD`.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import type { BundleDeBuild } from './contrato-sw.js';
import { describe, expect, it, vi } from 'vitest';

import {
  ARCHIVO_SW,
  PAGINA_SIN_CONEXION,
  PRECACHE_FIJO,
  SHELL_HTML,
  construirContrato,
  escribirServiceWorker,
} from './contrato-sw.js';
import { URL_SW, pedirVersionSw, registrarServiceWorker } from './registro-sw.js';

const WEB = join(import.meta.dirname, '..', '..');
const DIST = join(WEB, 'dist');

/** Un bundle como el que emite Vite 8 con hashes de contenido. */
const bundleRealista = {
  'index.html': { type: 'asset', fileName: 'index.html', source: '<div id="root"></div>' },
  'assets/index-B1x9Qq7a.js': { type: 'chunk', fileName: 'assets/index-B1x9Qq7a.js' },
  'assets/vendor-R3mK2pLd.js': { type: 'chunk', fileName: 'assets/vendor-R3mK2pLd.js' },
  'assets/index-T4vN8sWc.css': { type: 'asset', fileName: 'assets/index-T4vN8sWc.css' },
} as unknown as BundleDeBuild;

const contrato = construirContrato(bundleRealista);
const sw = escribirServiceWorker(contrato);

describe('contrato del service worker', () => {
  it('precachea los assets del build real, con hash', () => {
    expect(contrato.precache).toEqual(
      expect.arrayContaining([
        '/assets/index-B1x9Qq7a.js',
        '/assets/vendor-R3mK2pLd.js',
        '/assets/index-T4vN8sWc.css',
      ]),
    );
  });

  it('el precache incluye el shell, el manifest y los iconos', () => {
    expect(contrato.shellPrecacheado).toBe(true);
    for (const fijo of PRECACHE_FIJO) {
      expect(contrato.precache).toContain(fijo);
    }
    expect(contrato.precache).toContain('/manifest.webmanifest');
    expect(contrato.precache.flatMap((u) => u.split('/'))).toEqual(
      expect.arrayContaining(['icono-192.png', 'icono-512.png', 'icono-maskable-512.png']),
    );
  });

  it('no precachea el HTML suelto ni URLs duplicadas', () => {
    expect(contrato.precache.filter((u) => u.endsWith('.html'))).toEqual([`/${SHELL_HTML}`]);
    expect(new Set(contrato.precache).size).toBe(contrato.precache.length);
  });

  it('el nombre del cache lleva la versión: un build nuevo no sirve el viejo (R4)', () => {
    const otro = construirContrato({
      ...bundleRealista,
      'assets/index-OTROhash1.js': { type: 'chunk', fileName: 'assets/index-OTROhash1.js' },
    } as unknown as BundleDeBuild);
    expect(otro.version).toHaveLength(12);
    expect(otro.nombreCache).toBe(`hackods-shell-${otro.version}`);
    expect(otro.nombreCache).not.toBe(contrato.nombreCache);
  });

  it('el SW generado tiene fallback a index.html para navegación offline', () => {
    expect(sw).toContain('self.addEventListener(\'fetch\'');
    // Navegación (recarga) va por network-first y cae al shell precacheado.
    expect(sw).toMatch(/pedido\.mode === 'navigate'[\s\S]*networkFirst\(pedido\)/);
    expect(sw).toMatch(/async function networkFirst[\s\S]*caches\.match\(SHELL\)/);
    // Y si no hay shell, un offline.html en vez de una página de error del navegador.
    expect(sw).toContain(`const OFFLINE = ${JSON.stringify('/offline.html')}`);
    expect(sw).toContain(`const SHELL = ${JSON.stringify(`/${SHELL_HTML}`)}`);
    expect(sw).toContain(`const CACHE = ${JSON.stringify(contrato.nombreCache)}`);
  });

  it('no cachea POST/PATCH: los cambios van por el outbox', () => {
    expect(sw).toMatch(/if \(pedido\.method !== 'GET'\) \{\s*return;\s*\}/);
  });

  it('el offline.html tiene lo mínimo para decir "sin conexión"', () => {
    expect(PAGINA_SIN_CONEXION).toContain('Sin conexión');
    expect(PAGINA_SIN_CONEXION).toContain('<html lang="es-PE">');
  });
});

describe('public/sw.js (dev) no puede volver a la lista fija', () => {
  const dev = readFileSync(join(WEB, 'public', ARCHIVO_SW), 'utf8');

  it('no precachea URLs sueltas ni una versión fija de cache', () => {
    expect(dev).not.toMatch(/^\s*'\/(icons|manifest)/m);
    expect(dev).not.toContain("'hackods-shell-v1'");
    expect(dev).toContain('hackods-shell-dev');
  });
});

describe('el SW que se sirve', () => {
  it(`/sw.js resuelve al archivo del contrato (${URL_SW})`, () => {
    expect(URL_SW).toBe(`/${ARCHIVO_SW}`);
  });

  // Corre solo si hay build: `pnpm --filter @hackods/web build` antes del test.
  it.skipIf(!existsSync(join(DIST, ARCHIVO_SW)))(
    'dist/sw.js tiene en su precache los assets que existen en dist/',
    () => {
      const generado = readFileSync(join(DIST, ARCHIVO_SW), 'utf8');
      const version = /const VERSION = "([0-9a-f]{12})"/.exec(generado)?.[1];
      expect(version, 'dist/sw.js sin VERSION: build viejo').toBeDefined();

      const precache = JSON.parse(/const PRECACHE = (\[[^\]]*\])/.exec(generado)?.[1] ?? '[]');
      expect(precache).toContain(`/${SHELL_HTML}`);

      // Todo asset de dist/ (salvo el propio SW, offline.html y el HTML) está precacheado.
      const archivos = readdirSync(join(DIST, 'assets'));
      const faltantes = archivos
        .map((nombre) => `/assets/${nombre}`)
        .filter((url) => !precache.includes(url));
      expect(faltantes).toEqual([]);
      expect(precache.some((url: string) => /-[A-Za-z0-9_-]{8}\.(js|css)$/.test(url))).toBe(true);

      expect(existsSync(join(DIST, 'offline.html'))).toBe(true);
      expect(existsSync(join(DIST, 'manifest.webmanifest'))).toBe(true);
      expect(readFileSync(join(DIST, 'index.html'), 'utf8')).toContain(
        `<meta name="version" content="${version ?? ''}"`,
      );
    },
  );
});

/** Un `ServiceWorkerContainer` de mentira: registra sin red ni navegador. */
function contenedorFalso(controlado: boolean) {
  const instalando = new EventTarget() as EventTarget & { state: string };
  const registro = {
    waiting: null,
    installing: instalando,
    addEventListener: vi.fn(),
  } as unknown as ServiceWorkerRegistration;
  const register = vi.fn<() => Promise<ServiceWorkerRegistration>>().mockResolvedValue(registro);
  const contenedor = { register, controller: controlado ? {} : null } as unknown as ServiceWorkerContainer;
  return { contenedor, register, instalando, registro };
}

describe('registro del service worker', () => {
  it('registra /sw.js sin depender de import.meta.env.PROD', async () => {
    const { contenedor, register } = contenedorFalso(false);
    const alCambiar = vi.fn();
    await registrarServiceWorker(contenedor, alCambiar);
    expect(register).toHaveBeenCalledWith('/sw.js');
    // Primera visita: hay control, no hay "versión nueva" que avisar.
    expect(alCambiar).not.toHaveBeenCalledWith(expect.objectContaining({ versionNueva: true }));
  });

  it('avisa "versión nueva" sin tomar control a la fuerza', async () => {
    const { contenedor, registro, instalando } = contenedorFalso(true);
    const alCambiar = vi.fn();
    await registrarServiceWorker(contenedor, alCambiar);
    const updatefound = (registro.addEventListener as unknown as { mock: { calls: [string, () => void][] } }).mock
      .calls.find(([evento]) => evento === 'updatefound')?.[1];
    expect(updatefound).toBeTypeOf('function');
    updatefound?.();
    instalando.state = 'installed';
    instalando.dispatchEvent(new Event('statechange'));
    expect(alCambiar).toHaveBeenLastCalledWith({ soportado: true, versionNueva: true });
  });

  it('si el navegador no lo soporta, la app sigue', async () => {
    const alCambiar = vi.fn();
    await expect(registrarServiceWorker(undefined, alCambiar)).resolves.toBeNull();
    expect(alCambiar).toHaveBeenCalledWith({ soportado: false, versionNueva: false });
  });

  it('un registro que falla no rompe el arranque', async () => {
    const contenedor = {
      register: vi.fn().mockRejectedValue(new Error('sin permiso')),
      controller: null,
    } as unknown as ServiceWorkerContainer;
    await expect(registrarServiceWorker(contenedor)).resolves.toBeNull();
  });

  it('sin SW controlando no se puede pedir versión (y no cuelga)', async () => {
    await expect(pedirVersionSw({ controller: null } as unknown as ServiceWorkerContainer)).resolves.toBeNull();
  });
});
