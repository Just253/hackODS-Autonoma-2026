/**
 * Cierre de la trampa de falso verde (PR #26, ALTA 1).
 *
 * El fixture de `servicio.test.ts` se autofirma, asi que por si solo no prueba que
 * el menu del SEED se pueda servir. Este test lee `supabase/seed.sql` de verdad:
 * - comprueba que el literal de la columna `hash` de las plantillas 301 y 302 es
 *   `^[0-9a-f]{64}$` (no `digest('...')`);
 * - reconstruye el `MenuDelDia` espejo de esas filas y afirma que el hash del seed
 *   coincide con `sha256Hex(serializarContenido(...))` y que `esMenuServible` da true.
 *
 * Lee el SQL por ruta relativa al repo para documentar exactamente que se firmo.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import type { MenuTemplate } from '@hackods/contracts';

import {
  HASH_SEED_301,
  HASH_SEED_302,
  TEMPLATE_301,
  TEMPLATE_302,
  padronDelSeed,
  platosDelDia,
} from './fixtures-servicio.test-helpers.js';
import { sha256Hex } from './crypto/sha256.js';
import { esMenuServible, serializarContenido, servirDelDia } from './servicio.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SEED = readFileSync(resolve(RAIZ, 'supabase/seed.sql'), 'utf8');

/** Hash literal de cada plantilla del seed, tal como esta en `menu_template`. */
function hashEnSeed(templateId: string): string {
  // `('id', 'olla', 'perfil', 'opcion', 'estado', 'nutricionista', 'cnp', 'fecha', v, <hash>)`
  const bloque = new RegExp(
    `\\('${templateId}',[^)]*?,\\s*1,\\s*\\n\\s*'([0-9a-f]{64})'\\)`,
  ).exec(SEED);
  expect(bloque, `no se encontro el hash de la plantilla ${templateId} en seed.sql`).not.toBeNull();
  return bloque![1]!;
}

const sello = {
  nutricionista: 'Nutricionista Demo',
  cnp: 'CNP-DEMO-0001',
  fecha: '2026-11-01T10:00:00Z',
  version: 1,
};

function templateDelSeed(
  id: string,
  perfil: MenuTemplate['perfil'],
  opcion: MenuTemplate['opcion'],
  estado: MenuTemplate['estado'],
  hash: string,
): MenuTemplate {
  return {
    id,
    ollaId: '00000000-0000-4000-8000-000000000001',
    perfil,
    opcion,
    estado,
    sello: { ...sello, hash },
    version: 1,
    hash,
  };
}

describe('seed.sql: el menu del seed es servible con el hash real', () => {
  it('la columna hash de 301 y 302 es sha256 hex (no digest literal)', () => {
    expect(hashEnSeed(TEMPLATE_301)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEnSeed(TEMPLATE_302)).toMatch(/^[0-9a-f]{64}$/);
    // El hash viejo era un `digest('menu-demo-general-A')`; ya no debe estar.
    expect(SEED).not.toMatch(/digest\('menu-demo-(general|especial)-A', 'sha256'\)/);
  });

  it('el hash del seed 301 = sha256 del contenido canonico del plato del seed', () => {
    const platos = platosDelDia();
    const template = templateDelSeed(TEMPLATE_301, 'general', 'A', 'publicado', hashEnSeed(TEMPLATE_301));

    expect(sha256Hex(serializarContenido(template, platos))).toBe(hashEnSeed(TEMPLATE_301));
    expect(hashEnSeed(TEMPLATE_301)).toBe(HASH_SEED_301);
  });

  it('el hash del seed 302 = sha256 del contenido canonico (sin platos)', () => {
    const template = templateDelSeed(TEMPLATE_302, 'especial', 'A', 'aprobado', hashEnSeed(TEMPLATE_302));

    expect(sha256Hex(serializarContenido(template, []))).toBe(hashEnSeed(TEMPLATE_302));
    expect(hashEnSeed(TEMPLATE_302)).toBe(HASH_SEED_302);
  });

  it('esMenuServible da true para el menu del seed 301 (no se autofirma el fixture)', () => {
    const template = templateDelSeed(TEMPLATE_301, 'general', 'A', 'publicado', hashEnSeed(TEMPLATE_301));

    expect(esMenuServible(template, platosDelDia())).toBe(true);
  });

  it('servirDelDia sirve el 301 real del seed: 5 raciones, 780 g', () => {
    const template = templateDelSeed(TEMPLATE_301, 'general', 'A', 'publicado', hashEnSeed(TEMPLATE_301));
    const [opcion] = servirDelDia(
      [{ template, platos: platosDelDia(), sustituciones: [] }],
      padronDelSeed(),
    ).opciones;

    expect(opcion?.total).toBe(5);
    expect(opcion?.totalGramos).toBe(780);
    // Porciones del seed: adulto 280, menor_5 180, gestante 320.
    expect(opcion?.porGrupo.map((f) => `${f.grupo}:${f.raciones}`)).toEqual([
      'adulto:280',
      'menor_5:180',
      'gestante:320',
    ]);
  });

  // Vectores de sanity: el sha256 del serializador coincide con un valor publicado.
  it('sanity: sha256("abc") sigue siendo el vector de FIPS 180-4', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
