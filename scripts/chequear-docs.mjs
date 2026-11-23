#!/usr/bin/env node
/**
 * `pnpm docs:chequear` — ¿el cambio vino con su documentación?
 *
 * Aplica la tabla de docs/PROCESO-DOCS.md §2 sobre el diff del PR: si tocaste el contrato, la
 * migración o una feature, el archivo de doc que le corresponde tiene que estar en el MISMO diff.
 *
 *   node scripts/chequear-docs.mjs                 # contra origin/main
 *   BASE_REF=origin/dev node scripts/chequear-docs.mjs
 *
 * No adivina contenido: verifica que el archivo exista en el diff. Un refactor sin cambio de
 * comportamiento se declara con el trailer `Doc-No-Aplica: <razón>` en el último commit.
 */
import { spawnSync } from 'node:child_process';

const RAIZ = process.cwd();
const BASE = process.env.BASE_REF ?? 'origin/main';

function git(args) {
  const r = spawnSync('git', args, {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

const cambio = git(['diff', '--name-only', `${BASE}...HEAD`]) ?? git(['diff', '--name-only', BASE]);
if (cambio === null) {
  console.log(`docs: no se pudo comparar con ${BASE}; se omite (no bloquea).`);
  process.exit(0);
}

// `.split(/\r?\n/)` y no `'\n'`: en Windows `git` devuelve CRLF y cada ruta quedaba con un `\r`
// final, asi que ningun patron (`/^AGENTS\.md$/`) volvia a matchear y el chequeo fallaba siempre.
const archivos = cambio
  .split(/\r?\n/)
  .map((f) => f.trim())
  .filter(Boolean);
if (archivos.length === 0) {
  console.log('docs: sin cambios respecto de la base.');
  process.exit(0);
}

const mensaje = git(['log', '-1', '--pretty=%B']) ?? '';
const escotilla = mensaje.match(/^Doc-No-Aplica:\s*(.+)$/m);
if (escotilla) {
  console.log(`docs: omitido por "Doc-No-Aplica: ${escotilla[1].trim()}".`);
  process.exit(0);
}

const esTest = (f) => /\.(test|spec)\.[tj]sx?$/.test(f) || /\/__tests__\//.test(f);
const toca = (patron) => archivos.filter((f) => patron.test(f) && !esTest(f));
const alguno = (patron) => archivos.some((f) => patron.test(f));

const faltantes = [];

/** Cada regla: qué se tocó, qué doc tiene que venir con eso. */
const REGLAS = [
  {
    nombre: 'contrato compartido',
    toca: /^packages\/contracts\/src\//,
    doc: 'docs/contracts/ o un DEC en docs/ids/REGISTRO.md',
    cumple: () => alguno(/^docs\/contracts\//) || alguno(/^docs\/ids\/REGISTRO\.md$/) || alguno(/^packages\/contracts\/AGENTS\.md$/),
  },
  {
    nombre: 'regla de negocio',
    toca: /^packages\/(domain|nutrition|sync)\/src\//,
    doc: 'docs/contracts/, el AGENTS.md del paquete o un DEC',
    cumple: () => alguno(/^docs\/contracts\//) || alguno(/^packages\/(domain|nutrition|sync)\/AGENTS\.md$/) || alguno(/^docs\/ids\/REGISTRO\.md$/),
  },
  {
    nombre: 'migración o función SQL',
    toca: /^supabase\/(migrations|functions)\//,
    doc: 'docs/contracts/ o supabase/AGENTS.md',
    cumple: () => alguno(/^docs\/contracts\//) || alguno(/^supabase\/AGENTS\.md$/),
  },
  {
    nombre: 'primitivo de UI',
    toca: /^packages\/ui\/src\//,
    doc: 'packages/ui/AGENTS.md',
    cumple: () => alguno(/^packages\/ui\/AGENTS\.md$/),
  },
  {
    nombre: 'agentes, comandos o skills',
    toca: /^\.opencode\/(agents|commands|skills)\//,
    doc: 'AGENTS.md o docs/AGENTES.md o docs/delegacion.md',
    cumple: () => alguno(/^AGENTS\.md$/) || alguno(/^docs\/AGENTES\.md$/) || alguno(/^docs\/delegacion\.md$/),
  },
  {
    nombre: 'comandos del repo',
    toca: /^package\.json$/,
    doc: 'AGENTS.md §4 (la tabla de comandos)',
    cumple: () => alguno(/^AGENTS\.md$/),
  },
  {
    nombre: 'herramientas de proceso',
    toca: /^scripts\/[^/]+\.(mjs|sh|ps1)$/,
    doc: 'AGENTS.md §4 o docs/PROCESO-DOCS.md',
    cumple: () => alguno(/^AGENTS\.md$/) || alguno(/^docs\/PROCESO-DOCS\.md$/),
  },
];

for (const regla of REGLAS) {
  const tocados = toca(regla.toca);
  if (tocados.length && !regla.cumple()) {
    faltantes.push({ nombre: regla.nombre, archivos: tocados, doc: regla.doc });
  }
}

// Una feature nueva: cada carpeta tocada necesita su README de 3 líneas.
const features = new Set();
for (const f of archivos) {
  const m = f.match(/^apps\/web\/src\/features\/([^/]+)\//);
  if (m && !esTest(f)) features.add(m[1]);
}
for (const feature of features) {
  if (!archivos.includes(`apps/web/src/features/${feature}/README.md`)) {
    faltantes.push({
      nombre: `feature web "${feature}"`,
      archivos: [`apps/web/src/features/${feature}/`],
      doc: `apps/web/src/features/${feature}/README.md (qué hace, qué lee, qué escribe)`,
    });
  }
}

if (faltantes.length === 0) {
  console.log(`docs: ${archivos.length} archivos en el diff, todo con su documentación.`);
  process.exit(0);
}

console.error('docs: falta documentación en este cambio.\n');
for (const f of faltantes) {
  console.error(`  ✗ ${f.nombre}`);
  console.error(`    tocaste: ${f.archivos.slice(0, 4).join(', ')}${f.archivos.length > 4 ? '…' : ''}`);
  console.error(`    falta:   ${f.doc}\n`);
}
console.error('Si de verdad no aplica, agregá al último commit:');
console.error('  Doc-No-Aplica: <razón en una línea>\n');
console.error('Orden y ejemplos: docs/PROCESO-DOCS.md §2.');
process.exit(1);
