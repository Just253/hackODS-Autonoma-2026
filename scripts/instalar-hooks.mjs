#!/usr/bin/env node
/**
 * `pnpm hooks:install` — activa los hooks del repo. Una vez por máquina, después de clonar.
 *
 * Los hooks no se versionan en `.git/hooks`, así que se guardan en `.githooks/` y se apunta
 * `core.hooksPath` ahí. Sin esto, `git commit` no chequea nada y la regla sólo existe en el papel.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

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

// `.worktrees/` vive dentro del repo: sin esta línea, cada worktree de agente aparece como "sin
// trackear" en `git status` y alguien lo commitea por error. `.git/info/exclude` es local, así que
// se agrega una vez por clon y no viaja en el repo (a propósito: no ensucia el diff).
const rutaExclude = git(['rev-parse', '--git-path', 'info/exclude']).stdout?.trim();
if (rutaExclude) {
  const previo = existsSync(rutaExclude) ? readFileSync(rutaExclude, 'utf8') : '';
  const yaEsta = previo.split('\n').some((linea) => linea.trim() === '.worktrees/');
  if (!yaEsta) {
    const salto = previo === '' || previo.endsWith('\n') ? '' : '\n';
    appendFileSync(rutaExclude, `${salto}.worktrees/\n`);
    console.log('  .git/info/exclude  → .worktrees/ agregado');
  }
}

const actual = git(['config', 'core.hooksPath']).stdout?.trim();
console.log(`hooks activos: core.hooksPath = ${actual}`);
console.log('  pre-commit  ids + términos retirados + secretos (rápido)');
console.log('  pre-push    pnpm verificar + pnpm docs:chequear');
console.log('\nSaltear uno: git commit --no-verify / git push --no-verify (queda en tu historial local).');
