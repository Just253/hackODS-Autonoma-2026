/**
 * Test de la regla que decide si un diff es "sólo documentación".
 *
 * Existe porque `scripts/` no es un paquete del monorepo: `turbo run test` no lo mira, y sin esto la
 * regla que salta typecheck/tests/build se probaría a mano. Corre con el runner nativo de Node:
 *
 *   node --test scripts/cambios.test.mjs
 *
 * `pnpm verificar` lo ejecuta como un paso más.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PATRON_CODIGO, soloDocumentacion } from './cambios.mjs';

test('sólo documentación: los .md no disparan los pasos pesados', () => {
  assert.equal(soloDocumentacion(['docs/casos-de-uso/README.md']), true);
  assert.equal(soloDocumentacion(['README.md', 'AGENTS.md']), true);
  assert.equal(soloDocumentacion(['docs/a.md', 'README.md', 'AGENTS.md']), true);
  assert.equal(soloDocumentacion(['.github/ISSUE_TEMPLATE/tarea.yml']), true);
});

test('código: cualquier carpeta de código dispara la puerta completa', () => {
  assert.equal(soloDocumentacion(['apps/web/src/main.tsx']), false);
  assert.equal(soloDocumentacion(['packages/domain/src/precios/serie.ts']), false);
  assert.equal(soloDocumentacion(['supabase/seed.sql']), false);
  assert.equal(soloDocumentacion(['scripts/verificar.mjs']), false);
});

test('configuración que compila o instala también es código', () => {
  assert.equal(soloDocumentacion(['pnpm-lock.yaml']), false);
  assert.equal(soloDocumentacion(['package.json']), false);
  assert.equal(soloDocumentacion(['turbo.json']), false);
  assert.equal(soloDocumentacion(['tsconfig.base.json']), false);
  assert.equal(soloDocumentacion(['.github/workflows/ci.yml']), false);
  assert.equal(soloDocumentacion(['.githooks/pre-push']), false);
});

test('un archivo de configuración suelto no se toma por documentación', () => {
  // El caso que faltaba: un diff de sólo `.nvmrc` cambiaba la versión de Node y saltaba los tests.
  assert.equal(soloDocumentacion(['.nvmrc']), false);
  assert.equal(soloDocumentacion(['.node-version']), false);
  assert.equal(soloDocumentacion(['Dockerfile']), false);
  assert.equal(soloDocumentacion(['docker-compose.yml']), false);
  assert.equal(soloDocumentacion(['vitest.config.ts']), false);
  assert.equal(soloDocumentacion(['eslint.config.mjs']), false);
  assert.equal(soloDocumentacion(['.github/actions/setup/action.yml']), false);
});

test('sin diff calculable se corre todo: el lado seguro', () => {
  assert.equal(soloDocumentacion([]), false);
});

test('el patrón no se come documentación ni deja pasar código', () => {
  assert.equal(PATRON_CODIGO.test('docs/adr/0004-escala-precios.md'), false);
  assert.equal(PATRON_CODIGO.test('apps/web/src/data/base.ts'), true);
  // Un archivo suelto en la raíz no es código por sí solo; los que importan están en la lista.
  assert.equal(PATRON_CODIGO.test('LICENSE'), false);
});
