import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { insumoSchema, ollaSchema, personaSchema, precioSchema } from './domain.js';

/**
 * Paridad seed ↔ contratos.
 *
 * El seed es la unica copia de los datos de demo (skill testing-fixtures: un dataset
 * canonico, no se duplica). Aca se lee `supabase/seed.sql` y se validan sus filas
 * contra los schemas Zod. Si el seed y el contrato se separan, esto se pone rojo.
 */
const seed = readFileSync(join(import.meta.dirname, '../../../supabase/seed.sql'), 'utf8');

/** Filas de un `insert into <tabla> (...) values (...)` del seed. */
function filas(tabla: string): Record<string, string>[] {
  const cabecera = new RegExp(`insert into ${tabla}\\s*\\(([^)]+)\\)\\s*values`, 'i');
  const m = cabecera.exec(seed);
  if (!m) throw new Error(`el seed no tiene filas de ${tabla}`);
  const columnas = m[1]!.split(',').map((c) => c.trim());
  const resto = seed.slice(m.index + m[0].length);
  const fin = resto.search(/on conflict|;/i);
  const cuerpo = resto.slice(0, fin);

  const tuplas: string[] = [];
  let actual = '';
  let dentro = false;
  let comillas = false;
  for (const ch of cuerpo) {
    if (ch === "'") comillas = !comillas;
    if (ch === '(' && !comillas) dentro = true;
    if (ch === ')' && !comillas) dentro = false;
    actual += ch;
    if (ch === ')' && !dentro && !comillas) {
      tuplas.push(actual.trim());
      actual = '';
    }
  }

  return tuplas
    .filter((t) => t.startsWith('('))
    .map((t) => {
      const valores = t
        .slice(1, -1)
        .split(',')
        .map((v) => v.trim());
      if (valores.length !== columnas.length) {
        throw new Error(
          `fila de ${tabla} con ${valores.length} valores y ${columnas.length} columnas: coma dentro de un texto`,
        );
      }
      return Object.fromEntries(columnas.map((c, i) => [c, valores[i]!]));
    });
}

/** Valor SQL -> valor TS. Solo lo que usa el seed: texto, numero, null, boolean, array. */
function valor(v: string): unknown {
  if (/^null$/i.test(v)) return null;
  if (/^true$/i.test(v)) return true;
  if (/^false$/i.test(v)) return false;
  if (/^'.*'$/s.test(v)) {
    const dentro = v.slice(1, -1);
    // `'{a,b}'` es un array de texto en SQL.
    if (/^\{.*\}$/s.test(dentro)) {
      const items = dentro.slice(1, -1).trim();
      if (!items) return [];
      return items.split(',').map((x) => x.trim().replace(/^'(.*)'$/s, '$1'));
    }
    return dentro;
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

describe('paridad seed ↔ contracts', () => {
  it('las ollas del seed tienen codigo de 6 caracteres sin ambiguedad', () => {
    const ollas = filas('ollas');
    expect(ollas.length).toBeGreaterThan(0);
    for (const o of ollas) {
      const parseada = ollaSchema.parse({
        id: valor(o['id']!),
        titulo: valor(o['titulo']!),
        codigo: valor(o['codigo']!),
        tipo: valor(o['tipo']!),
        distrito: valor(o['distrito']!),
        creadaEn: '2026-11-01T00:00:00Z',
      });
      // Misma regex que el check `ollas_codigo_check` de la migracion del modelo;
      // `ollaSchema` ya la exige (Zod lanza si no cuadra), no hace falta re-asertar.
    }
  });

  it('las personas del seed validan contra personaSchema (sin identidad)', () => {
    const personas = filas('personas');
    expect(personas.length).toBeGreaterThan(0);
    for (const p of personas) {
      const parseada = personaSchema.parse({
        codigoP: valor(p['codigo_p']!),
        ollaId: valor(p['olla_id']!),
        anioNacimiento: valor(p['anio_nacimiento']!),
        sexo: valor(p['sexo']!),
        categoria: valor(p['categoria']!),
        anemia: valor(p['anemia']!),
        pesoKg: valor(p['peso_kg']!),
        tallaCm: valor(p['talla_cm']!),
        consentimientoSeguimiento: valor(p['consentimiento_seguimiento']!),
        notas: valor(p['notas']!),
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
        deletedAt: null,
        deviceId: valor(p['device_id']!),
        lamport: 0,
      });
      expect(parseada).not.toHaveProperty('nombreLocal');
    }
  });

  it('los insumos del seed validan contra insumoSchema', () => {
    const insumos = filas('insumos');
    expect(insumos.length).toBeGreaterThan(0);
    for (const i of insumos) {
      insumoSchema.parse({
        id: valor(i['id']!),
        denominacion: valor(i['denominacion']!),
        unidadBase: valor(i['unidad_base']!),
        gramosPorUnidad: valor(i['gramos_por_unidad']!),
        stockMinimo: valor(i['stock_minimo']!),
        perecedero: valor(i['perecedero']!),
        alergenos: valor(i['alergenos']!),
      });
    }
  });

  it('los precios del seed validan contra precioSchema (fecha, canal, fuente)', () => {
    const precios = filas('precios');
    expect(precios.length).toBeGreaterThan(0);
    for (const p of precios) {
      precioSchema.parse({
        id: valor(p['id']!),
        insumoId: valor(p['insumo_id']!),
        canal: valor(p['canal']!),
        unidad: valor(p['unidad']!),
        precio: valor(p['precio']!),
        fecha: valor(p['fecha']!),
        fuente: valor(p['fuente']!),
        url: valor(p['url']!),
      });
    }
  });

  it('el seed no usa now() (fechas fijas)', () => {
    const sinComentarios = seed
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    expect(sinComentarios).not.toMatch(/\bnow\s*\(\)/i);
  });
});
