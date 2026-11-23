import { describe, expect, it } from 'vitest';

import type {
  Contexto,
  GrupoEtario,
  MenuSemanal,
  PlatoMenu,
  ProveedorComposicion,
  ReglasMotor,
  Restriccion,
} from './contrato.js';
import { ContratoInvalido } from './errors.js';
import { validarMenu } from './menu.js';
import { crearContexto } from './reglas.js';

/**
 * Fixtures sin una sola cifra nutricional: grupos, porciones y gramos son datos
 * estructurales del menu, no valores de referencia (packages/nutrition/AGENTS.md §1).
 */
const reglas: ReglasMotor = {
  version: 'reglas-test-1',
  toleranciaPorcion: 0.1,
  umbralDesvioPorcion: 20,
  maxSustitucionesPorPlato: 2,
  maxPlatosPorMomento: 2,
  frecuenciaMaxima: { lentejas: 3 },
  umbralesSeveridad: { critico: 3, alto: 2, moderado: 1 },
  coberturaMinimaPorComida: 0.9,
  gruposObligatorios: ['adulto', 'menor_5'],
};

const composicion: ProveedorComposicion = {
  tablaId: 'sin_tabla',
  version: 'composicion-test-1',
  aporte: () => null,
  retencion: () => 1,
};

const ctx: Contexto = crearContexto({
  ahora: '2026-11-23T10:00:00Z',
  reglas,
  composicion,
  ids: { nuevo: () => 'id_de_prueba' },
});

const plato: PlatoMenu = {
  id: 'plato-guiso',
  momento: 'almuerzo',
  titulo: 'Guiso de lentejas',
  ingredientes: [
    { insumoId: 'lentejas', gramos: 80, unidad: 'g' },
    { insumoId: 'papa', gramos: 120, unidad: 'g' },
  ],
  porciones: [
    { grupo: 'adulto', cantidad: 280, unidad: 'g' },
    { grupo: 'menor_5', cantidad: 180, unidad: 'g' },
  ],
};

const conMenu = (encima: Partial<MenuSemanal> = {}): MenuSemanal => ({
  id: 'menu-1',
  ollaId: 'olla-1',
  perfil: 'general',
  opcion: 'A',
  estado: 'aprobado',
  sello: {
    nutricionista: 'Nutricionista Demo',
    cnp: 'CNP-DEMO-0001',
    fecha: '2026-11-23T09:00:00Z',
    version: 1,
    hash: HASH_MENU,
  },
  dias: [{ diaSemana: 1, fecha: '2026-11-23', platos: [plato] }],
  version: 1,
  hash: HASH_MENU,
  ...encima,
});

/**
 * Hash canonico del fixture (una plantilla + el plato `plato-guiso`).
 *
 * El contenido se serializa con `serializarContenido` de `packages/domain`
 * (misma funcion que produce `menu_template.hash` en el seed):
 *   sha256Hex('menu:menu-1|perfil:general|opcion:A|plato-guiso|almuerzo|Guiso de lentejas|adulto:280:g,menor_5:180:g')
 * Literal fijo a proposito: si cambia la serializacion o el SHA-256 del paquete,
 * este test lo dice (un cambio de formato de firma es breaking).
 */
const HASH_MENU = 'cd21a0d5181589d698569aeb0bcba2e87699825971382d8373b9ec4c97c1b421';

const sinAlergias: readonly Restriccion[] = [];

describe('validarMenu: sello del nutricionista (D3)', () => {
  it('acepta un menu aprobado con sello y hash coherentes', () => {
    const r = validarMenu(conMenu(), sinAlergias, ctx);
    expect(r.selloValido).toBe(true);
    expect(r.hallazgos).toEqual([]);
    expect(r.valido).toBe(true);
    expect(r.coberturaDatos).toBe(1);
  });

  it('rechaza un menu sin sello con un hallazgo `firma`', () => {
    const r = validarMenu(conMenu({ sello: null }), sinAlergias, ctx);
    expect(r.selloValido).toBe(false);
    expect(r.valido).toBe(false);
    expect(r.hallazgos.map((h) => h.tipo)).toContain('firma');
  });

  it('rechaza un sello cuyo hash no es el del menu', () => {
    const r = validarMenu(
      conMenu({
        sello: {
          nutricionista: 'Nutricionista Demo',
          cnp: 'CNP-DEMO-0001',
          fecha: '2026-11-23T09:00:00Z',
          version: 1,
          hash: 'f'.repeat(64),
        },
      }),
      sinAlergias,
      ctx,
    );
    expect(r.selloValido).toBe(false);
    expect(r.hallazgos.some((h) => h.mensaje.includes('sello.hash'))).toBe(true);
  });

  it('rechaza cuando el hash del menu no corresponde al contenido recalculado', () => {
    const conOtroContenido = conMenu({
      hash: HASH_MENU,
      sello: {
        nutricionista: 'Nutricionista Demo',
        cnp: 'CNP-DEMO-0001',
        fecha: '2026-11-23T09:00:00Z',
        version: 1,
        hash: HASH_MENU,
      },
      dias: [{ diaSemana: 1, fecha: '2026-11-23', platos: [plato, { ...plato, id: 'plato-2' }] }],    });
    const r = validarMenu(conOtroContenido, sinAlergias, ctx);
    expect(r.selloValido).toBe(false);
    expect(r.hashCalculado).not.toBe(HASH_MENU);
  });

  it('rechaza un menu en borrador aunque tenga sello', () => {
    const r = validarMenu(conMenu({ estado: 'borrador' }), sinAlergias, ctx);
    expect(r.selloValido).toBe(false);
    expect(r.hallazgos.some((h) => h.mensaje.startsWith('estado'))).toBe(true);
  });
});

describe('validarMenu: alergia es veto absoluto', () => {
  const alergiaPapa: readonly Restriccion[] = [
    { id: 'r-1', tipo: 'alergia', valor: 'papa', motivo: 'test' },
  ];

  it('invalida el menu cuando un alergeno cruza un ingrediente y dice donde', () => {
    const r = validarMenu(conMenu(), alergiaPapa, ctx);
    expect(r.valido).toBe(false);
    const hallazgo = r.hallazgos.find((h) => h.tipo === 'alergia');
    expect(hallazgo?.platoId).toBe('plato-guiso');
    expect(hallazgo?.insumoId).toBe('papa');
    expect(hallazgo?.severidad).toBe('critico');
  });

  it('no invalida cuando la restriccion no cruza ningun ingrediente', () => {
    const r = validarMenu(
      conMenu(),
      [{ id: 'r-2', tipo: 'alergia', valor: 'mani', motivo: null }],
      ctx,
    );
    expect(r.hallazgos.filter((h) => h.tipo === 'alergia')).toEqual([]);
    // El sello sigue valido: la ambiguedad es de dato, no de firma.
    expect(r.selloValido).toBe(true);
    // Pero la restriccion sin sello resoluble es un hallazgo `firma` (no un 0
    // silencioso): el menu no se declara valido hasta que se resuelva.
    expect(r.hallazgos.some((h) => h.tipo === 'firma')).toBe(true);
    expect(r.valido).toBe(false);
  });

  it('no convierte una dieta en veto', () => {
    const r = validarMenu(
      conMenu(),
      [{ id: 'r-3', tipo: 'dieta', valor: 'vegana', motivo: null }],
      ctx,
    );
    expect(r.hallazgos.filter((h) => h.tipo === 'alergia')).toEqual([]);
  });
});

describe('validarMenu: cobertura de grupos obligatorios', () => {
  it('un grupo sin porcion firmada es un hallazgo, nunca un 0', () => {
    const sinMenor: PlatoMenu = {
      ...plato,
      porciones: [{ grupo: 'adulto', cantidad: 280, unidad: 'g' }],
    };
    const grupo: GrupoEtario = 'menor_5';
    const menu = conMenu({
      dias: [{ diaSemana: 1, fecha: '2026-11-23', platos: [sinMenor] }],
    });
    const r = validarMenu(menu, sinAlergias, ctx);
    expect(r.hallazgos.some((h) => h.tipo === 'porcion' && h.mensaje.includes(grupo))).toBe(true);
    expect(r.platosSinPorcion).toEqual(['plato-guiso']);
    expect(r.coberturaDatos).toBeLessThan(1);
    expect(r.valido).toBe(false);
  });
});

describe('validarMenu: sin umbrales no se valida', () => {
  it('lanza ContratoInvalido en vez de asumir 0', () => {
    const incompleto: Contexto = {
      ...ctx,
      reglas: { ...reglas, gruposObligatorios: [], coberturaMinimaPorComida: null },
    };
    expect(() => validarMenu(conMenu(), sinAlergias, incompleto)).toThrow(ContratoInvalido);
  });
});
