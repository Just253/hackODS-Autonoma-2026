#!/usr/bin/env node
/**
 * `pnpm ids:chequear` — coherencia de identificadores. Corre en CI.
 *
 * Verifica:
 *  1. Formato: todo `DEC-`, `PRB-` o `SPK-` tiene la forma <TIPO>-AAAAMMDD-HHMM-<6hex>
 *     (mas los DEC-2026-000N del legado congelado, que son una lista cerrada).
 *  2. Registro: todo ID citado en la documentacion existe como fila en docs/ids/REGISTRO.md.
 *  3. Disco: todo archivo de problema/decision/spike esta en el registro.
 *  4. Fila: todo ID del registro tiene su archivo.
 *  5. Duplicados: ningun ID aparece dos veces en el registro.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const RAIZ = resolve(import.meta.dirname, '..');
const REGISTRO = join(RAIZ, 'docs/ids/REGISTRO.md');

const VIGENTE = /\b(DEC|PRB|SPK)-(\d{8})-(\d{4})-([0-9a-f]{6})\b/g;
const LEGADO = /\bDEC-2026-000([1-9])\b/g;
const INTENTO = /\b(?:DEC|PRB|SPK)-[A-Za-z0-9-]*\b/g;

const errores = [];
const omitir = new Set(['node_modules', '.git', 'dist', 'coverage', '.turbo', 'historical']);

function* archivos(dir) {
  for (const entrada of readdirSync(dir)) {
    if (omitir.has(entrada)) continue;
    const ruta = join(dir, entrada);
    const st = statSync(ruta);
    if (st.isDirectory()) yield* archivos(ruta);
    else if (/\.(md|mjs|ts|tsx|json|yml|yaml)$/.test(entrada)) yield ruta;
  }
}

// --- 1. El registro: filas, duplicados y forma ---------------------------------
const lineasRegistro = readFileSync(REGISTRO, 'utf8').split('\n');
const filas = lineasRegistro.filter((l) => /^\|\s*(DEC|PRB|SPK)-\S+\s*\|/.test(l));
const enRegistro = new Map();

for (const fila of filas) {
  const celdas = fila.split('|').map((c) => c.trim());
  const id = celdas[1];
  if (enRegistro.has(id)) errores.push(`registro: ${id} aparece dos veces (fila duplicada).`);
  enRegistro.set(id, celdas);

  const esLegado = /^DEC-2026-000[1-9]$/.test(id);
  if (!esLegado && !/^(DEC|PRB|SPK)-\d{8}-\d{4}-[0-9a-f]{6}$/.test(id)) {
    errores.push(`registro: "${id}" no tiene formato TIPO-AAAAMMDD-HHMM-6hex.`);
  }
  if (esLegado && !['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(id.slice(-1))) {
    errores.push(`registro: "${id}" fuera de la lista legado cerrada (0001..0009).`);
  }
  if (celdas.length < 9) errores.push(`registro: la fila ${id} no tiene 8 columnas.`);
}

// --- 2 y 3. Citas en la documentacion y archivos en disco ----------------------
const citados = new Map(); // id -> primer archivo donde aparece

for (const ruta of archivos(RAIZ)) {
  const rel = relative(RAIZ, ruta).replaceAll('\\', '/');
  if (rel === 'docs/ids/REGISTRO.md') continue;
  // El propio script declara los patrones; no se cita a si mismo.
  if (rel === 'scripts/chequear-ids.mjs') continue;

  const texto = readFileSync(ruta, 'utf8');

  for (const m of texto.matchAll(VIGENTE)) {
    const id = m[0];
    if (!citados.has(id)) citados.set(id, rel);
    if (!enRegistro.has(id)) errores.push(`cita: ${id} en ${rel} no esta en el registro.`);
  }

  for (const m of texto.matchAll(LEGADO)) {
    const id = m[0];
    if (!citados.has(id)) citados.set(id, rel);
    if (!enRegistro.has(id)) errores.push(`cita: ${id} en ${rel} no esta en el registro.`);
  }

  // Formato mal escrito: algo que empieza como ID pero no cumple la forma.
  for (const m of texto.matchAll(INTENTO)) {
    const id = m[0];
    if (id.endsWith('-')) continue; // "DEC-" suelto en prosa
    if (/^(DEC|PRB|SPK)-\d{8}-\d{4}-[0-9a-f]{6}$/.test(id)) continue;
    if (/^DEC-2026-000[1-9]$/.test(id)) continue;
    if (/^ADR-/.test(id)) continue;
    errores.push(`formato: "${id}" en ${rel} no es un ID valido (docs/ids/REGISTRO.md §2).`);
  }
}

// Todo archivo de cuerpo debe tener fila en el registro.
for (const carpeta of ['docs/problemas', 'docs/decisiones', 'docs/spikes']) {
  const base = join(RAIZ, carpeta);
  let entradas;
  try {
    entradas = readdirSync(base, { recursive: true, withFileTypes: true });
  } catch {
    continue; // la carpeta puede no existir todavia
  }
  for (const entrada of entradas) {
    if (!entrada.isFile()) continue;
    if (!/^(DEC|PRB|SPK)-\d{8}-\d{4}-[0-9a-f]{6}\.md$/.test(entrada.name)) continue;
    const id = entrada.name.replace(/\.md$/, '');
    if (!enRegistro.has(id)) errores.push(`archivo: ${carpeta}/**/${entrada.name} no esta en el registro.`);
  }
}

// Toda fila del registro debe tener su archivo.
for (const [id, celdas] of enRegistro) {
  const destino = (celdas[7] ?? '').replaceAll('`', '').trim().split('#')[0];
  if (!destino) {
    errores.push(`registro: ${id} no declara archivo.`);
    continue;
  }
  // Rutas relativas a docs/ (p. ej. `DECISIONES.md#d5` o `problemas/dinero/PRB-….md`).
  try {
    statSync(join(RAIZ, 'docs', destino));
  } catch {
    errores.push(`registro: ${id} apunta a docs/${destino}, que no existe.`);
  }
}

// --- Resultado ----------------------------------------------------------------
if (errores.length) {
  for (const e of errores) console.error(`  ✗ ${e}`);
  console.error(`\n${errores.length} problema(s) de identificadores. Ver docs/ids/REGISTRO.md.`);
  process.exit(1);
}

console.log(`ids: ${enRegistro.size} en el registro, ${citados.size} citados, 0 problemas.`);
