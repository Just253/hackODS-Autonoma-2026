#!/usr/bin/env node
/**
 * Servidor estático del preview, en un puerto fijo y sin dependencias.
 *
 * Sirve `apps/web/dist` con fallback SPA: toda ruta sin extensión devuelve
 * `index.html`, así el router de React Router funciona al recargar.
 *
 * No se cae cuando el build reemplaza `dist`: nunca cachea el directorio y lee
 * el archivo en cada request. Si un archivo falta justo en medio del build,
 * responde 503 con `Retry-After` en vez de morir (el túnel sigue vivo).
 *
 *   node scripts/preview/servir.mjs
 *   node scripts/preview/servir.mjs --puerto 4180 --dist apps/web/dist
 *
 * Un túnel = un puerto. Lo que cambia abajo del puerto es `dist`; el proceso
 * de este servidor y el de cloudflared no se reinician.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '../..');

function opcion(nombre, porDefecto) {
  const i = process.argv.indexOf(nombre);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return porDefecto;
}

const PUERTO = Number(opcion('--puerto', process.env.PREVIEW_PUERTO ?? '4173'));
const HOST = opcion('--host', '127.0.0.1');
const DIST = resolve(RAIZ, opcion('--dist', 'apps/web/dist'));
const VERBOSO = process.argv.includes('--verboso');
const ARRANQUE = Date.now();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const log = (...partes) => console.log('[servir]', ...partes);

/** Resuelve una ruta del request dentro de DIST, sin permitir salir de ahí. */
function dentro(rutaUrl) {
  const limpia = rutaUrl.replace(/\\/g, '/');
  const absoluta = resolve(DIST, '.' + limpia);
  if (absoluta !== DIST && !absoluta.startsWith(DIST + sep)) return null;
  return absoluta;
}

function estado() {
  let version = null;
  try {
    version = readFileSync(join(DIST, 'version.txt'), 'utf8').trim();
  } catch {
    version = null;
  }
  return {
    ok: true,
    servicio: 'hackods-preview',
    puerto: PUERTO,
    dist: DIST,
    distExiste: existsSync(DIST),
    pid: process.pid,
    desde: new Date(ARRANQUE).toISOString(),
    version,
  };
}

function responder(res, codigo, tipo, cuerpo, extra = {}) {
  const cabeceras = {
    'content-type': tipo,
    'content-length': Buffer.byteLength(cuerpo),
    'cache-control': 'no-store',
    'x-preview': 'hackods',
    ...extra,
  };
  res.writeHead(codigo, cabeceras);
  res.end(cuerpo);
}

const server = createServer((req, res) => {
  const inicio = Date.now();

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD');
    responder(res, 405, TIPOS['.txt'], 'Solo GET y HEAD\n');
    return;
  }

  let ruta;
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    ruta = decodeURIComponent(url.pathname);
    if (ruta === '/__preview/estado') {
      responder(res, 200, TIPOS['.json'], JSON.stringify(estado(), null, 2) + '\n');
      return;
    }
  } catch {
    responder(res, 400, TIPOS['.txt'], 'Ruta inválida\n');
    return;
  }

  const absoluta = dentro(ruta);
  if (!absoluta) {
    responder(res, 403, TIPOS['.txt'], 'Fuera del directorio servido\n');
    return;
  }

  let archivo = null;
  try {
    if (existsSync(absoluta)) {
      archivo = statSync(absoluta).isDirectory() ? join(absoluta, 'index.html') : absoluta;
    }
  } catch {
    archivo = null;
  }

  const pareceArchivo = extname(ruta) !== '';
  if (!archivo && pareceArchivo) {
    responder(res, 404, TIPOS['.txt'], `No existe: ${ruta}\n`);
    if (VERBOSO) log(`404 ${ruta} (${Date.now() - inicio} ms)`);
    return;
  }
  if (!archivo) archivo = join(DIST, 'index.html'); // fallback SPA

  let cuerpo;
  try {
    cuerpo = readFileSync(archivo);
  } catch {
    // Build en curso: el recurso desapareció entre el stat y el read.
    responder(res, 503, TIPOS['.html'], REINTENTO, { 'retry-after': '2' });
    log(`503 ${ruta} — dist en reconstrucción, sigo arriba`);
    return;
  }

  const tipo = TIPOS[extname(archivo).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': tipo,
    'content-length': cuerpo.length,
    'cache-control': 'no-store',
    'x-preview': 'hackods',
  });
  res.end(req.method === 'HEAD' ? undefined : cuerpo);

  if (VERBOSO) log(`200 ${ruta} (${Date.now() - inicio} ms)`);
});

const REINTENTO = `<!doctype html><meta charset="utf-8"><title>Reconstruyendo</title>
<body style="font-family:system-ui;padding:2rem"><h1>Reconstruyendo el preview</h1>
<p>El build está reemplazando <code>dist</code>. Recargá en unos segundos.</p></body>`;

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[servir] El puerto ${PUERTO} ya está ocupado. Si es este mismo preview, no hace falta arrancar otro; ` +
        `si es otro proceso, bajalo o usá --puerto <n>.`,
    );
    process.exit(1);
  }
  console.error('[servir] error del servidor:', error.message);
  process.exit(1);
});

server.listen(PUERTO, HOST, () => {
  log(`escuchando en http://${HOST}:${PUERTO}`);
  log(`sirviendo ${DIST}${existsSync(DIST) ? '' : ' (todavía no existe: falta el build)'}`);
  log(`estado: http://${HOST}:${PUERTO}/__preview/estado`);
});

for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    log('cerrando');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
