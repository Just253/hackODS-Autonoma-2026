#!/usr/bin/env node
/**
 * `pnpm ids:nuevo` — emite el ID de un problema, decision o spike.
 *
 *   node scripts/nuevo-id.mjs --tipo PRB --categoria dinero --titulo "Boleta duplicada"
 *
 * Formato: <TIPO>-<AAAAMMDD>-<HHMM>-<6hex> en America/Lima.
 *
 * No usa contador ni `git fetch`: la hora mas 6 hex aleatorios no choca entre maquinas que
 * trabajan al mismo tiempo (docs/ids/REGISTRO.md §1).
 *
 * Crea el archivo desde su plantilla, agrega la fila al registro e imprime el ID. No commitea.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const RAIZ = resolve(import.meta.dirname, '..');
const REGISTRO = join(RAIZ, 'docs/ids/REGISTRO.md');
const SECCION_NUEVOS = '## 4. Identificadores vigentes (nuevos)';

const CATEGORIAS = [
  'dominio',
  'datos',
  'offline',
  'backend',
  'web',
  'nutricion',
  'dinero',
  'seguridad',
  'docs',
  'infra',
];

/** Donde vive el cuerpo de cada tipo y de que plantilla sale. */
const UBICACION = {
  PRB: { plantilla: 'docs/problemas/_plantilla.md', carpeta: (c) => `docs/problemas/${c}` },
  DEC: { plantilla: 'docs/decisiones/_plantilla.md', carpeta: () => 'docs/decisiones' },
  SPK: { plantilla: 'docs/spikes/_plantilla.md', carpeta: () => 'docs/spikes' },
};

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function salir(mensaje) {
  console.error(`ids:nuevo — ${mensaje}`);
  process.exit(1);
}

/** Hora de Peru (UTC-5, sin horario de verano). */
export function ahoraLima(fecha = new Date()) {
  const lima = new Date(fecha.getTime() - 5 * 60 * 60 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const y = lima.getUTCFullYear();
  const m = p(lima.getUTCMonth() + 1);
  const d = p(lima.getUTCDate());
  const h = p(lima.getUTCHours());
  const min = p(lima.getUTCMinutes());
  return { compacta: `${y}${m}${d}-${h}${min}`, iso: `${y}-${m}-${d}T${h}:${min}:${p(lima.getUTCSeconds())}-05:00` };
}

const tipo = (arg('tipo') ?? 'PRB').toUpperCase();
const ubicacion = UBICACION[tipo];
if (!ubicacion) salir(`tipo invalido "${tipo}". Usar PRB, DEC o SPK.`);

const titulo = arg('titulo')?.trim();
if (!titulo || titulo.length < 8) salir('falta --titulo (minimo 8 caracteres).');
if (titulo.includes('|')) salir('el titulo no puede tener "|" (rompe la tabla del registro).');

let categoria;
if (tipo === 'PRB') {
  categoria = (arg('categoria') ?? '').toLowerCase();
  if (!CATEGORIAS.includes(categoria)) {
    salir(`categoria invalida "${categoria ?? ''}". Validas: ${CATEGORIAS.join(', ')}.`);
  }
}

const autor = arg('autor') ?? process.env.USERNAME ?? process.env.USER ?? 'desconocido';
const stamp = ahoraLima();
const registro = readFileSync(REGISTRO, 'utf8');
const carpeta = join(RAIZ, ubicacion.carpeta(categoria));
mkdirSync(carpeta, { recursive: true });

let id;
let ruta;
for (let intento = 0; intento < 16; intento++) {
  const candidato = `${tipo}-${stamp.compacta}-${randomBytes(3).toString('hex')}`;
  const candidataRuta = join(carpeta, `${candidato}.md`);
  if (!existsSync(candidataRuta) && !registro.includes(candidato)) {
    id = candidato;
    ruta = candidataRuta;
    break;
  }
}
if (!id) salir('no se pudo generar un ID libre en 16 intentos.');

const cuerpo = readFileSync(join(RAIZ, ubicacion.plantilla), 'utf8')
  .replaceAll('{{ID}}', id)
  .replaceAll('{{TITULO}}', titulo)
  .replaceAll('{{CATEGORIA}}', categoria ?? '')
  .replaceAll('{{AHORA}}', stamp.iso)
  .replaceAll('{{AUTOR}}', autor);
writeFileSync(ruta, cuerpo, 'utf8');

const relativo = ruta.slice(RAIZ.length + 1).replaceAll('\\', '/');
const fila = `| ${id} | ${tipo} | ${titulo} | abierto | ${stamp.iso} | ${autor} | \`${relativo.replace(/^docs\//, '')}\` | — |`;

// La fila va despues de la ultima fila de la tabla de la §4.
const lineas = registro.split('\n');
const inicioSeccion = lineas.findIndex((l) => l.startsWith(SECCION_NUEVOS));
if (inicioSeccion === -1) salir(`no encuentro "${SECCION_NUEVOS}" en docs/ids/REGISTRO.md.`);

let finTabla = inicioSeccion;
let ultimaFila = -1;
for (let i = inicioSeccion; i < lineas.length; i++) {
  if (!lineas[i].startsWith('|')) {
    if (ultimaFila > -1) break;
    continue;
  }
  ultimaFila = i;
  finTabla = i;
}
if (ultimaFila === -1) salir(`la seccion "${SECCION_NUEVOS}" no tiene tabla.`);

lineas.splice(finTabla + 1, 0, fila);
writeFileSync(REGISTRO, lineas.join('\n'), 'utf8');

console.log(id);
console.log(relativo);
console.log('Fila agregada a docs/ids/REGISTRO.md. Falta completar el cuerpo y commitear.');
