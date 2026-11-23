#!/usr/bin/env node
/**
 * `pnpm verificar` — una sola puerta antes de pushear o de devolver un encargo.
 *
 * Corre, en orden, todo lo que se rompe en silencio: entorno, identificadores,
 * tipos, tests, build, términos muertos, links y secretos en el diff.
 *
 * Es la misma secuencia que usa CI, así que "en mi máquina anda" deja de significar algo.
 *
 *   node scripts/verificar.mjs            # todo
 *   node scripts/verificar.mjs --rapido   # sin build (para iterar)
 *
 * Sale con código 1 si algo falla: un push con esto en rojo se revierte.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const RAPIDO = process.argv.includes('--rapido');

const resultados = [];

function paso(nombre, fn, { omitir = false } = {}) {
  if (omitir) {
    resultados.push({ nombre, estado: 'omitido', detalle: '--rapido' });
    return;
  }
  const inicio = Date.now();
  try {
    const detalle = fn();
    resultados.push({ nombre, estado: 'ok', detalle: detalle ?? '', ms: Date.now() - inicio });
  } catch (e) {
    const salida = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`.trim();
    resultados.push({ nombre, estado: 'FALLA', detalle: salida.split('\n').slice(-12).join('\n') });
  }
}

function correr(cmd, args, cwd = RAIZ) {
  // spawnSync con las dos salidas: turbo escribe los tests en stderr.
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    // En Windows pnpm es un .cmd y no se resuelve sin shell.
    shell: process.platform === 'win32',
  });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    const error = new Error(`${cmd} ${args.join(' ')} → exit ${r.status}`);
    error.stdout = salida;
    throw error;
  }
  return salida;
}

/** Recorre el repo sin entrar en lo que no es fuente. */
const OMITIR = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', 'historical']);
function* archivos(dir, filtro) {
  for (const entrada of readdirSync(dir)) {
    if (OMITIR.has(entrada)) continue;
    const ruta = join(dir, entrada);
    const st = statSync(ruta);
    if (st.isDirectory()) yield* archivos(ruta, filtro);
    else if (filtro(entrada)) yield ruta;
  }
}

// 1. Entorno -------------------------------------------------------------------
paso('entorno', () => {
  const node = process.versions.node;
  const mayor = Number(node.split('.')[0]);
  if (mayor < 22) throw new Error(`Node ${node}: el repo exige >= 22`);
  let pnpm = 'ausente';
  try {
    pnpm = correr('pnpm', ['--version']).trim();
  } catch {
    throw new Error('pnpm no está en el PATH');
  }
  return `node ${node} · pnpm ${pnpm}`;
});

// 2. Identificadores -----------------------------------------------------------
paso('ids', () => correr('node', ['scripts/chequear-ids.mjs']).trim().split('\n').pop());

// 3. Tipos ---------------------------------------------------------------------
paso('typecheck', () => {
  correr('pnpm', ['typecheck']);
  return 'sin errores de tipos';
});

// 4. Tests ---------------------------------------------------------------------
paso('tests', () => {
  // vitest colorea; sin limpiar los ANSI, "Tests 3 passed" no matchea.
  const limpio = correr('pnpm', ['test']).replace(/\u001b\[[0-9;]*m/g, '');
  const lineas = limpio.split('\n').filter((l) => /Tests\s+\d+ (passed|failed)/.test(l));
  const fallos = lineas.filter((l) => /failed/.test(l));
  if (fallos.length) throw new Error(fallos.join('\n'));
  const total = lineas.reduce((n, l) => n + Number(l.match(/Tests\s+(\d+) passed/)[1]), 0);
  if (total === 0) throw new Error('no se encontró ningún test: la suite no corrió');
  return `${total} tests verdes`;
});

// 5. Build ---------------------------------------------------------------------
paso(
  'build',
  () => {
    correr('pnpm', ['build']);
    return 'build de producción ok';
  },
  { omitir: RAPIDO },
);

// 6. Términos muertos ----------------------------------------------------------
// Palabras que ya se retiraron de una decisión y no deben volver al corpus vigente.
const MUERTOS = [
  'calcularRacion',
  'LWW',
  'UUIDv4',
  'personas.nombre',
  'ProveedorRequerimientos',
];
paso('términos muertos', () => {
  const hallados = [];
  for (const ruta of archivos(RAIZ, (n) => /\.(md|ts|tsx|mjs|json|ya?ml)$/.test(n))) {
    const rel = relative(RAIZ, ruta).replaceAll('\\', '/');
    if (rel === 'scripts/verificar.mjs') continue;
    if (rel === 'docs/ids/REGISTRO.md') continue;
    const texto = readFileSync(ruta, 'utf8');
    for (const muerto of MUERTOS) {
      const i = texto.indexOf(muerto);
      if (i === -1) continue;
      const linea = texto.slice(0, i).split('\n').length;
      hallados.push(`${rel}:${linea} → ${muerto}`);
    }
  }
  if (hallados.length) throw new Error(hallados.slice(0, 10).join('\n'));
  return `${MUERTOS.length} términos en cero`;
});

// 7. Links internos de la documentación ---------------------------------------
paso('links', () => {
  const rotos = [];
  let revisados = 0;
  for (const ruta of archivos(RAIZ, (n) => n.endsWith('.md'))) {
    const rel = relative(RAIZ, ruta).replaceAll('\\', '/');
    const texto = readFileSync(ruta, 'utf8');
    for (const m of texto.matchAll(/\]\(([^)\s]+\.md)(#[^)\s]*)?\)/g)) {
      const destino = m[1];
      if (/^https?:/.test(destino)) continue;
      revisados++;
      const absoluto = destino.startsWith('/')
        ? join(RAIZ, destino)
        : resolve(join(ruta, '..'), destino);
      if (!existsSync(absoluto)) rotos.push(`${rel} → ${destino}`);
    }
  }
  if (rotos.length) throw new Error(rotos.slice(0, 10).join('\n'));
  return `${revisados} links, 0 roto`;
});

// 8. Secretos en el diff contra main ------------------------------------------
paso('secretos', () => {
  let diff;
  try {
    diff = correr('git', ['diff', 'origin/main...HEAD']);
  } catch {
    return 'sin origin/main: no se revisó (push a main directo)';
  }
  const patron = /(api[_-]?key|secret|token|passw|BEGIN .*PRIVATE)/i;
  const sospechosas = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++') && patron.test(l));
  if (sospechosas.length) throw new Error(sospechosas.slice(0, 5).join('\n'));
  return 'diff limpio';
});

// --- Salida -------------------------------------------------------------------
const ancho = Math.max(...resultados.map((r) => r.nombre.length));
for (const r of resultados) {
  const marca = r.estado === 'ok' ? '✓' : r.estado === 'omitido' ? '·' : '✗';
  const ms = r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : '';
  console.log(`${marca} ${r.nombre.padEnd(ancho)}  ${r.estado.padEnd(7)} ${r.detalle}${ms}`);
}

const fallas = resultados.filter((r) => r.estado === 'FALLA');
if (fallas.length) {
  console.error(`\n${fallas.length} paso(s) en rojo. No se pushea así.`);
  process.exit(1);
}
console.log('\nTodo verde. Se puede pushear.');
