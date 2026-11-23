#!/usr/bin/env node
/**
 * Chequeo de pre-commit: rápido (< 2 s) y sólo sobre lo que se está commiteando.
 *
 * Tres cosas que no admiten "después": identificadores que no existen, términos que se retiraron y
 * secretos. Los tests y el build van en pre-push (`pnpm verificar`), porque un hook lento se saltea.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { SECRETO } from './patrones-secretos.mjs';

function git(args) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return r.status === 0 ? r.stdout : '';
}

const problemas = [];

// 1. Identificadores (el registro completo, es barato).
const ids = spawnSync('node', ['scripts/chequear-ids.mjs'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (ids.status !== 0) {
  problemas.push(`identificadores:\n${(ids.stderr || ids.stdout).trim()}`);
}

// 2. Diff staged: secretos y términos muertos (la lista vive en scripts/terminos-muertos.json).
const diff = git(['diff', '--cached', '--unified=0']);
const MUERTOS = JSON.parse(readFileSync('scripts/terminos-muertos.json', 'utf8')).terminos;
// El patrón de secreto es el mismo que usa `pnpm verificar` (scripts/patrones-secretos.mjs).

let archivoActual = '';
let linea = 0;
for (const l of diff.split('\n')) {
  if (l.startsWith('+++ b/')) {
    archivoActual = l.slice(6);
    continue;
  }
  // El archivo que define la lista de términos no se escanea a sí mismo.
  if (archivoActual.endsWith('terminos-muertos.json')) continue;
  if (l.startsWith('@@')) {
    const m = l.match(/\+(\d+)/);
    if (m) linea = Number(m[1]);
    continue;
  }
  if (!l.startsWith('+') || l.startsWith('+++')) continue;
  const texto = l.slice(1);
  for (const muerto of MUERTOS) {
    if (texto.includes(muerto)) {
      problemas.push(`término retirado "${muerto}" en ${archivoActual}:${linea}`);
    }
  }
  if (SECRETO.test(texto)) {
    problemas.push(`posible secreto en ${archivoActual}:${linea}`);
  }
  linea++;
}

// 3. Doc de la feature: si hay una carpeta nueva sin README, se avisa (no bloquea).
const nuevas = git(['diff', '--cached', '--name-only', '--diff-filter=A'])
  .split('\n')
  .filter(Boolean)
  .filter((f) => f.startsWith('apps/web/src/features/') && f.endsWith('.tsx'));
for (const f of nuevas) {
  const carpeta = f.split('/').slice(0, 5).join('/');
  if (!existsSync(`${carpeta}/README.md`)) {
    console.log(`· aviso: ${carpeta}/README.md no existe todavía (docs/PROCESO-DOCS.md §2).`);
  }
}

// 4. Nada de archivos prohibidos.
const prohibidos = git(['diff', '--cached', '--name-only'])
  .split('\n')
  .filter((f) => /(^|\/)\.env(\.|$)|service_role|\.pem$|\.keystore$/.test(f));
for (const f of prohibidos) problemas.push(`archivo prohibido en el commit: ${f}`);

if (problemas.length) {
  console.error('\npre-commit: no se commitea así.\n');
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error('\nArreglá lo de arriba. Si es un falso positivo de secreto, cambialo por una constante de ejemplo.');
  console.error('Para saltear el hook (queda en el historial): git commit --no-verify\n');
  process.exit(1);
}

console.log('pre-commit: ids, términos y secretos ok.');
