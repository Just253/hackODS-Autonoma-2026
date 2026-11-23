#!/usr/bin/env node
/**
 * Watcher del preview: si `origin/main` se mueve, deja `apps/web/dist` al día.
 *
 * Ciclo (cada 25 s por defecto):
 *   1. `git fetch origin main` y compara el SHA con el último que se construyó.
 *   2. Si cambió: `git merge --ff-only origin/main` (si no es fast-forward, lo
 *      reporta y sigue; nunca deja el repo a medias).
 *   3. `pnpm install --frozen-lockfile` solo si cambió el blob de `pnpm-lock.yaml`.
 *   4. `pnpm build`.
 *   5. Escribe `apps/web/dist/version.txt` con SHA y hora.
 *
 * No reinicia el servidor ni el túnel: solo reemplaza archivos de `dist`.
 * Todo evento va a `scripts/preview/preview.log`, una línea por ciclo.
 *
 *   node scripts/preview/actualizar.mjs
 *   node scripts/preview/actualizar.mjs --una-vez
 *   node scripts/preview/actualizar.mjs --intervalo 20 --verbose
 *
 * El build refleja HEAD. Si HEAD tiene commits que no están en `origin/main`
 * (estás en una rama), el log lo marca con `head_main=distinto`: para ver
 * exactamente main, el checkout tiene que estar en main o en una rama que
 * solo pueda avanzar por fast-forward.
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '../..');
const AQUI = import.meta.dirname;
const LOG = join(AQUI, 'preview.log');
const ESTADO = join(AQUI, '.estado.json');
const CANDADO = join(AQUI, 'actualizar.pid');
const VERSION = join(RAIZ, 'apps/web/dist/version.txt');
const DIST = join(RAIZ, 'apps/web/dist');

const WIN = process.platform === 'win32';

function opcion(nombre, porDefecto) {
  const i = process.argv.indexOf(nombre);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return porDefecto;
}

const UNA_VEZ = process.argv.includes('--una-vez');
const VERBOSO = process.argv.includes('--verbose') || process.argv.includes('--verboso');
const EXIGIR_MAIN = process.argv.includes('--exigir-main');
const INTERVALO = Math.max(5, Number(opcion('--intervalo', process.env.PREVIEW_INTERVALO ?? '25')));
const INICIO = Date.now();

const AHORA = () => new Date().toISOString();

function linea(campos) {
  const partes = [`ts=${AHORA()}`];
  for (const [clave, valor] of Object.entries(campos)) {
    const texto = String(valor ?? '')
      .replace(/[\r\n]+/g, ' / ')
      .replace(/"/g, "'");
    partes.push(`${clave}=${/\s/.test(texto) ? `"${texto}"` : texto}`);
  }
  const fila = partes.join(' ');
  appendFileSync(LOG, fila + '\n', 'utf8');
  return fila;
}

function correr(cmd, args, extra = {}) {
  const r = spawnSync(cmd, args, {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: WIN,
    maxBuffer: 32 * 1024 * 1024,
    timeout: extra.timeout ?? 0,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (VERBOSO && salida) console.log(salida);
  return { status: r.status ?? -1, salida, error: r.error?.message ?? null };
}

const git = (args, extra) => correr('git', args, extra);
const rev = (...args) => {
  const r = git(['rev-parse', ...args]);
  return r.status === 0 ? r.salida.split('\n').pop().trim() : null;
};

function ultimaLinea(resultado) {
  const lineas = resultado.salida.split('\n').filter(Boolean);
  return (lineas.slice(-2).join(' / ') || resultado.error || 'sin salida').slice(0, 400);
}

function leerEstado() {
  try {
    return JSON.parse(readFileSync(ESTADO, 'utf8'));
  } catch {
    return { sha: null, head: null };
  }
}

function guardarEstado(estado) {
  const temporal = `${ESTADO}.tmp`;
  writeFileSync(temporal, JSON.stringify(estado, null, 2) + '\n', 'utf8');
  renameSync(temporal, ESTADO);
}

function escribirVersion(datos) {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
  const texto =
    `sha=${datos.head}\n` +
    `main=${datos.main}\n` +
    `rama=${datos.rama}\n` +
    `hora=${datos.hora}\n` +
    `origen=scripts/preview/actualizar.mjs\n`;
  const temporal = join(DIST, '.version.txt.tmp');
  writeFileSync(temporal, texto, 'utf8');
  renameSync(temporal, VERSION); // atómico: nunca se sirve medio archivo
}

/** ¿El árbol tiene cambios en archivos versionados? (untracked no cuenta) */
function arbolSucio() {
  const r = git(['status', '--porcelain', '--untracked-files=no']);
  return r.status === 0 && r.salida.length > 0 ? r.salida.split('\n').slice(0, 3).join(' / ') : null;
}

function pidVivo(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function leerCandado() {
  try {
    return JSON.parse(readFileSync(CANDADO, 'utf8'));
  } catch {
    return null;
  }
}

/** El candado lleva latido: un PID reciclado por otro proceso no bloquea para siempre. */
function latir(fase = 'idle') {
  const latido = { pid: process.pid, inicio: INICIO, latido: Date.now(), fase };
  try {
    writeFileSync(`${CANDADO}.tmp`, JSON.stringify(latido), 'utf8');
    renameSync(`${CANDADO}.tmp`, CANDADO);
  } catch {
    /* sin latido el watcher sigue igual; solo pierde la marca de vida */
  }
}

function tomarCandado() {
  const previo = leerCandado();
  if (previo && pidVivo(previo.pid)) {
    const edad = Date.now() - Number(previo.latido ?? 0);
    // Un build tarda minutos y no late: mientras construye, el margen es amplio.
    const limite = previo.fase === 'construyendo' ? 20 * 60_000 : Math.max(90_000, INTERVALO * 4000);
    if (edad < limite) return previo.pid;
  }
  latir();
  return null;
}

function soltarCandado() {
  const previo = leerCandado();
  if (previo && previo.pid === process.pid) {
    try {
      unlinkSync(CANDADO);
    } catch {
      /* nada que soltar */
    }
  }
}

/** Un ciclo completo. Devuelve { resultado, ... } para el log y el stdout. */
function ciclo() {
  const inicio = Date.now();
  const estado = leerEstado();
  latir();

  const fetch = git(['fetch', '--quiet', 'origin', 'main'], { timeout: 120_000 });
  if (fetch.status !== 0) {
    const fila = linea({ evento: 'fetch', resultado: 'falla', detalle: ultimaLinea(fetch) });
    console.log(fila);
    return { resultado: 'falla', motivo: 'fetch' };
  }

  const main = rev('origin/main');
  if (!main) {
    const fila = linea({ evento: 'fetch', resultado: 'falla', detalle: 'origin/main no resuelve' });
    console.log(fila);
    return { resultado: 'falla', motivo: 'sin-origin-main' };
  }

  const headActual = rev('HEAD');
  if (estado.sha === main && estado.head === headActual && existsSync(VERSION)) {
    return { resultado: 'sin-cambios', main };
  }

  const rama = rev('--abbrev-ref', 'HEAD') ?? 'desconocida';
  // Un árbol sucio no bloquea: `git merge --ff-only` aborta solo si fuera a
  // pisar un archivo modificado, y ese aborto se reporta sin dejar nada a medias.
  const sucio = arbolSucio();

  const lockAntes = rev('HEAD:pnpm-lock.yaml');
  const merge = git(['merge', '--ff-only', 'origin/main'], { timeout: 120_000 });
  if (merge.status !== 0) {
    const fila = linea({
      evento: 'merge',
      sha: main.slice(0, 12),
      rama,
      resultado: 'falla',
      arbol: sucio ? 'con-cambios-locales' : 'limpio',
      detalle: ultimaLinea(merge),
    });
    console.log(fila);
    return { resultado: 'falla', motivo: 'merge-no-ff' };
  }

  const head = rev('HEAD');
  const headEsMain = head === main;
  if (!headEsMain) {
    console.log(
      `[actualizar] aviso: HEAD (${head?.slice(0, 8)}) tiene commits fuera de origin/main ` +
        `(${main.slice(0, 8)}). El preview muestra HEAD, no main.`,
    );
    if (EXIGIR_MAIN) {
      const fila = linea({
        evento: 'ciclo',
        sha: main.slice(0, 12),
        head: head?.slice(0, 12),
        rama,
        resultado: 'salteado',
        motivo: 'head-fuera-de-main',
      });
      console.log(fila);
      return { resultado: 'salteado', motivo: 'head-fuera-de-main' };
    }
  }

  const lockDespues = rev('HEAD:pnpm-lock.yaml');
  const lockCambio = Boolean(lockAntes) && Boolean(lockDespues) && lockAntes !== lockDespues;

  if (lockCambio) {
    const t = Date.now();
    const install = correr('pnpm', ['install', '--frozen-lockfile'], { timeout: 15 * 60_000 });
    if (install.status !== 0) {
      const fila = linea({
        evento: 'install',
        resultado: 'falla',
        duracion: `${((Date.now() - t) / 1000).toFixed(1)}s`,
        detalle: ultimaLinea(install),
      });
      console.log(fila);
      return { resultado: 'falla', motivo: 'install' };
    }
    console.log(`[actualizar] pnpm install --frozen-lockfile ok (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  }

  const tBuild = Date.now();
  latir('construyendo');
  const build = correr('pnpm', ['build'], { timeout: 20 * 60_000 });
  latir();
  const duracionBuild = ((Date.now() - tBuild) / 1000).toFixed(1);

  if (build.status !== 0) {
    const fila = linea({
      evento: 'build',
      sha: (head ?? '').slice(0, 12),
      rama,
      resultado: 'falla',
      duracion: `${duracionBuild}s`,
      detalle: ultimaLinea(build),
    });
    console.log(fila);
    return { resultado: 'falla', motivo: 'build' };
  }

  const hora = AHORA();
  try {
    escribirVersion({ head: head ?? 'desconocido', main, rama, hora });
  } catch (error) {
    const fila = linea({
      evento: 'version',
      sha: (head ?? '').slice(0, 12),
      resultado: 'falla',
      detalle: error.message,
    });
    console.log(fila);
    return { resultado: 'falla', motivo: 'version.txt' };
  }

  guardarEstado({ sha: main, head, hora, lock: lockDespues });
  const fila = linea({
    evento: 'ciclo',
    sha: main.slice(0, 12),
    head: (head ?? '').slice(0, 12),
    head_main: headEsMain ? 'igual' : 'distinto',
    rama,
    arbol: sucio ? 'con-cambios-locales' : 'limpio',
    lock: lockCambio ? 'instalado' : 'sin-cambio',
    resultado: 'ok',
    duracion: `${((Date.now() - inicio) / 1000).toFixed(1)}s`,
  });
  console.log(fila);
  return { resultado: 'ok', main, head, hora };
}

async function esperar(ms) {
  return new Promise((listo) => setTimeout(listo, ms));
}

async function principal() {
  if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });
  if (!existsSync(LOG)) writeFileSync(LOG, '', 'utf8');

  const dueno = tomarCandado();
  if (dueno) {
    console.error(`[actualizar] ya hay un watcher corriendo (PID ${dueno}). No arranco otro.`);
    process.exit(2);
  }
  process.on('exit', soltarCandado);
  for (const senal of ['SIGINT', 'SIGTERM']) {
    process.on(senal, () => {
      linea({ evento: 'fin', resultado: 'senal', senal });
      process.exit(0);
    });
  }

  const mainInicial = rev('origin/main');
  console.log(
    `[actualizar] ${RAIZ}\n[actualizar] cada ${INTERVALO}s · origin/main=${mainInicial?.slice(0, 12) ?? '?'} · log=${LOG}`,
  );

  if (UNA_VEZ) {
    const r = ciclo();
    if (r.resultado === 'falla') process.exit(1);
    return;
  }

  for (;;) {
    try {
      ciclo();
    } catch (error) {
      linea({ evento: 'ciclo', resultado: 'falla', detalle: error.message });
      console.error('[actualizar] error inesperado:', error.message);
    }
    await esperar(INTERVALO * 1000);
  }
}

principal().catch((error) => {
  linea({ evento: 'ciclo', resultado: 'falla', detalle: `fatal: ${error.message}` });
  console.error('[actualizar] fatal:', error.message);
  process.exit(1);
});
