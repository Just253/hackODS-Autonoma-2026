#!/usr/bin/env node
/**
 * `pnpm arranque` — ¿esta máquina está lista para delegar y reclamar issues?
 *
 * Corre en 10 segundos y contesta una sola pregunta: GO o NO-GO, y si es NO-GO, qué comando lo
 * arregla. Se corre una vez por persona, antes de abrir la sesión lead.
 *
 *   pnpm arranque
 *
 * No modifica nada: sólo lee.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const RAIZ = process.cwd();
const filas = [];

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    cwd: RAIZ,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
};

const paso = (nombre, fn) => {
  try {
    const r = fn();
    filas.push({ nombre, estado: r.estado ?? 'ok', detalle: r.detalle, arreglo: r.arreglo });
  } catch (e) {
    filas.push({ nombre, estado: 'FALLA', detalle: e.message, arreglo: e.arreglo });
  }
};

// 1. Entorno ------------------------------------------------------------------
paso('entorno', () => {
  const mayor = Number(process.versions.node.split('.')[0]);
  if (mayor < 22) {
    const e = new Error(`Node ${process.versions.node}`);
    e.arreglo = 'instalá Node 22 LTS';
    throw e;
  }
  const pnpm = run('pnpm', ['--version']);
  if (pnpm.status !== 0) {
    const e = new Error('pnpm no está en el PATH');
    e.arreglo = 'corepack enable && corepack prepare pnpm@10.18.2 --activate';
    throw e;
  }
  return { detalle: `node ${process.versions.node} · pnpm ${pnpm.out}` };
});

// 2. Cuenta de GitHub ---------------------------------------------------------
let login = null;
paso('cuenta gh', () => {
  const r = run('gh', ['api', 'user', '--jq', '.login']);
  if (r.status !== 0) {
    const e = new Error('gh sin autenticar');
    e.arreglo = 'gh auth login';
    throw e;
  }
  login = r.out;
  return { detalle: `@${login}` };
});

// 3. Permiso de escritura en el repo -----------------------------------------
paso('permiso de push', () => {
  const remoto = run('git', ['remote', 'get-url', 'origin']);
  if (remoto.status !== 0) {
    const e = new Error('sin remote origin');
    e.arreglo = 'git remote add origin <url>';
    throw e;
  }
  const m = remoto.out.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!m) {
    const e = new Error(`remote no reconocido: ${remoto.out}`);
    e.arreglo = 'revisá el remote';
    throw e;
  }
  const repo = `${m[1]}/${m[2]}`;
  const r = run('gh', ['api', `repos/${repo}`, '--jq', '.permissions.push']);
  if (r.status !== 0) {
    const e = new Error(`sin acceso a ${repo}`);
    e.arreglo = `pedile a @${login ?? 'el admin'} que te invite con write`;
    throw e;
  }
  if (r.out !== 'true') {
    const e = new Error(`lectura sí, escritura no (${repo})`);
    e.arreglo = `gh api -X PUT repos/${repo}/collaborators/<usuario> -f permission=push`;
    throw e;
  }
  return { detalle: `${repo} · write` };
});

// 4. Hooks de git -------------------------------------------------------------
paso('hooks', () => {
  const r = run('git', ['config', 'core.hooksPath']);
  if (r.out !== '.githooks') {
    const e = new Error(r.out ? `apuntan a ${r.out}` : 'no están instalados');
    e.arreglo = 'pnpm hooks:install';
    throw e;
  }
  return { detalle: 'pre-commit + pre-push activos' };
});

// 5. Agentes y comandos del repo ---------------------------------------------
paso('agentes y comandos', () => {
  const agentes = readdirSync('.opencode/agents').filter((f) => f.endsWith('.md')).length;
  const comandos = readdirSync('.opencode/commands').filter((f) => f.endsWith('.md')).length;
  const skills = readdirSync('.opencode/skills').length;
  if (agentes < 8 || comandos < 6) {
    const e = new Error(`${agentes} agentes, ${comandos} comandos`);
    e.arreglo = 'git pull: faltan archivos de .opencode/';
    throw e;
  }
  return { detalle: `${agentes} agentes · ${comandos} comandos · ${skills} skills` };
});

// 6. La puerta de calidad -----------------------------------------------------
paso('puerta local', () => {
  const r = run('node', ['scripts/verificar.mjs', '--rapido']);
  if (r.status !== 0) {
    const e = new Error('pnpm verificar --rapido en rojo');
    e.arreglo = 'mirá la salida de `pnpm verificar --rapido`';
    throw e;
  }
  const resumen = r.out.split('\n').filter((l) => l.includes('tests'));
  return { detalle: resumen[0]?.replace(/^[✓·✗]\s*/, '').replace(/\s+/g, ' ') ?? 'verde' };
});

// 7. Backlog reclamable -------------------------------------------------------
paso('backlog', () => {
  const r = run('gh', ['issue', 'list', '--state', 'open', '--json', 'number,labels']);
  if (r.status !== 0) {
    const e = new Error('no se pudieron leer los issues');
    e.arreglo = 'gh auth status';
    throw e;
  }
  const issues = JSON.parse(r.out);
  const con = (label) => issues.filter((i) => i.labels.some((l) => l.name === label));
  const listos = con('status:ready');
  const bloqueados = con('status:blocked');
  const tomados = con('status:claimed');
  if (listos.length === 0) {
    const e = new Error(`${bloqueados.length} bloqueados, ${tomados.length} en curso, 0 listos`);
    e.arreglo = 'no se reclama: pedí que se acote uno nuevo';
    throw e;
  }
  return {
    detalle: `${listos.length} listos (#${listos.map((i) => i.number).join(', #')}) · ${bloqueados.length} bloqueados`,
  };
});

// 8. Base de datos (no bloquea el demo) --------------------------------------
paso('base de datos', () => {
  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  const cli = run('npx', ['--no-install', 'supabase', '--version']);
  if (docker.status !== 0 || cli.status !== 0) {
    return {
      estado: 'aviso',
      detalle: 'sin Docker/supabase: issues de RLS y seed quedan bloqueados',
      arreglo: 'MODO-6H §2: el demo es local (IndexedDB)',
    };
  }
  return { detalle: `docker ${docker.out.slice(0, 12)} · supabase ok` };
});

// --- Salida ------------------------------------------------------------------
const ancho = Math.max(...filas.map((f) => f.nombre.length));
let noGo = 0;
for (const f of filas) {
  const marca = f.estado === 'ok' ? '✓' : f.estado === 'aviso' ? '·' : '✗';
  if (f.estado === 'FALLA') noGo++;
  console.log(`${marca} ${f.nombre.padEnd(ancho)}  ${f.detalle}`);
  if (f.arreglo) console.log(`  ${' '.repeat(ancho)}  → ${f.arreglo}`);
}

console.log('');
if (noGo > 0) {
  console.log(`NO-GO: ${noGo} cosa(s) por resolver. Arriba está el comando exacto.`);
  process.exit(1);
}
console.log('GO: esta máquina puede delegar, reclamar y mergear.');
console.log('  Lead: docs/ORQUESTACION.md §3 (brief) · docs/MODO-6H.md (reglas de la ventana)');
