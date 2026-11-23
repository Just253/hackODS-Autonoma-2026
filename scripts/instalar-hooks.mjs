#!/usr/bin/env node
/**
 * `pnpm hooks:install` — activa los hooks del repo. Una vez por máquina, después de clonar.
 *
 * Los hooks no se versionan en `.git/hooks`, así que se guardan en `.githooks/` y se apunta
 * `core.hooksPath` ahí. Sin esto, `git commit` no chequea nada y la regla sólo existe en el papel.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const git = (args) => spawnSync('git', args, { encoding: 'utf8', shell: process.platform === 'win32' });

if (!existsSync('.githooks')) {
  console.error('No existe .githooks/. Corré esto desde la raíz del repo.');
  process.exit(1);
}

const r = git(['config', 'core.hooksPath', '.githooks']);
if (r.status !== 0) {
  console.error(`No se pudo configurar core.hooksPath:\n${r.stderr}`);
  process.exit(1);
}

// En Windows/MSYS hace falta el bit de ejecución para que git los corra.
if (process.platform !== 'win32') {
  for (const hook of ['pre-commit', 'pre-push']) {
    spawnSync('chmod', ['+x', `.githooks/${hook}`]);
  }
}

const actual = git(['config', 'core.hooksPath']).stdout?.trim();
console.log(`hooks activos: core.hooksPath = ${actual}`);
console.log('  pre-commit  ids + términos retirados + secretos (rápido)');
console.log('  pre-push    pnpm verificar + pnpm docs:chequear');
console.log('\nSaltear uno: git commit --no-verify / git push --no-verify (queda en tu historial local).');
