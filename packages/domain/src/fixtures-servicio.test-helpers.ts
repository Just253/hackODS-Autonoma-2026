/**
 * Espejo del modelo del seed (`supabase/seed.sql`), firmado con la funcion real.
 *
 * Plantilla 301 (general, opcion A, `publicado`), dia 1 (2026-11-23), plato
 * "Guiso demo de lentejas" con porciones adulto 280 g / menor_5 180 g / gestante 320 g,
 * y la sustitucion aprobada leche_evaporada -> quinua x1.20, que en el seed pertenece
 * a la plantilla 302 (`template_id`). El padron es P-0001..P-0006, con P-0006 dado de
 * baja logica.
 *
 * El sello se firma con la funcion real (`sha256Hex(serializarContenido(...))`), NO
 * copiando la salida del serializador: el test valida el algoritmo contra sha256,
 * no contra si mismo.
 *
 * NOTA: el hash demo del seed (`encode(digest('menu-demo-general-A'),'hex')`) no
 * corresponde al contenido real de esa plantilla. Con la validacion correcta ese menu
 * demo quedaria RECHAZADO hasta que `seed.sql` firme de verdad (fix de seed fuera de
 * este PR).
 */
import type { MenuTemplate, Persona, Portion, Substitution } from '@hackods/contracts';

import { sha256Hex } from './crypto/sha256.js';
import { serializarContenido, type MenuDelDia, type PlatoServicio } from './servicio.js';

/** Plantilla 302 del seed: la sustitucion 901 le pertenece a ELLA, no a la 301. */
export const TEMPLATE_302 = '00000000-0000-4000-8000-000000000302';

const sello = {
  nutricionista: 'Nutricionista Demo',
  cnp: 'CNP-DEMO-0001',
  fecha: '2026-11-01T10:00:00Z',
  version: 1,
  hash: '',
};

function porcion(
  id: string,
  dishId: string,
  grupo: Portion['grupo'],
  cantidad: number,
): Portion {
  return {
    id,
    dishId,
    grupo,
    cantidad,
    unidad: 'g',
    version: 1,
    hash: `hash-${id}`,
  };
}

const DISH = '00000000-0000-4000-8000-000000000501';

/** Platos del dia 1, tal como salen de `dish`/`ingredient`/`portion`. */
export function platosDelDia(): readonly PlatoServicio[] {
  return [
    {
      id: DISH,
      momento: 'almuerzo',
      titulo: 'Guiso demo de lentejas',
      insumos: ['lentejas', 'papa'],
      porciones: [
        porcion('00000000-0000-4000-8000-000000000701', DISH, 'adulto', 280),
        porcion('00000000-0000-4000-8000-000000000702', DISH, 'menor_5', 180),
        porcion('00000000-0000-4000-8000-000000000703', DISH, 'gestante', 320),
      ],
    },
  ];
}

/** Plantilla 301 firmada. El hash se sella sobre el contenido real. */
export function plantillaGeneralA(
  platos: readonly PlatoServicio[] = platosDelDia(),
): MenuTemplate {
  const base: MenuTemplate = {
    id: '00000000-0000-4000-8000-000000000301',
    ollaId: '00000000-0000-4000-8000-000000000001',
    perfil: 'general',
    opcion: 'A',
    estado: 'publicado',
    sello: null,
    version: 1,
    hash: '',
  };
  const hash = sha256Hex(serializarContenido(base, platos));
  return { ...base, hash, sello: { ...sello, hash } };
}

/**
 * Sustitucion aprobada del seed: leche evaporada por quinua. En el seed pertenece a
 * la plantilla 302; `menuDelSeed` la filtra fuera de la 301 (que es lo correcto).
 */
export function sustitucionesDelSeed(): readonly Substitution[] {
  return [
    {
      id: '00000000-0000-4000-8000-000000000901',
      templateId: TEMPLATE_302,
      insumoOrigenId: 'leche_evaporada',
      insumoDestinoId: 'quinua',
      factor: 1.2,
      aprobadaPor: 'CNP-DEMO-0001',
      version: 1,
      hash: 'hash-subs-leche-quinua',
    },
  ];
}

export function menuDelSeed(
  template: MenuTemplate = plantillaGeneralA(),
): MenuDelDia {
  return { template, platos: platosDelDia(), sustituciones: sustitucionesDelSeed() };
}

function persona(
  codigoP: string,
  categoria: Persona['categoria'],
  deletedAt: string | null = null,
): Persona {
  return {
    codigoP,
    ollaId: '00000000-0000-4000-8000-000000000001',
    anioNacimiento: 1990,
    sexo: 'F',
    categoria,
    anemia: 'sin_dato',
    pesoKg: null,
    tallaCm: null,
    consentimientoSeguimiento: false,
    notas: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    deletedAt,
    deviceId: 'device_demo_01',
    lamport: 0,
  };
}

/**
 * Padron del seed: gestante, menor de 5, adulto mayor, adulto y lactante, mas una
 * baja logica (P-0006). Vigentes = 5.
 */
export function padronDelSeed(): readonly Persona[] {
  return [
    persona('P-0001', 'gestante'),
    persona('P-0002', 'nino'),
    persona('P-0003', 'adulto_mayor'),
    persona('P-0004', 'adulto'),
    persona('P-0005', 'lactante'),
    persona('P-0006', 'adulto', '2026-11-20T10:00:00Z'),
  ];
}
