/**
 * Reglas del servicio del dia (issue #17, paso 0:40 del guion).
 *
 * Cada regla tiene su `it`; el fixture es espejo de `supabase/seed.sql` y el total
 * se verifica contra el padron, no contra una constante del guion.
 */
import { describe, expect, it } from 'vitest';

import { MenuNoServible } from './errors.js';
import {
  menuDelSeed,
  padronDelSeed,
  plantillaGeneralA,
  platosDelDia,
} from './fixtures-servicio.test-helpers.js';
import { esMenuServible, serializarContenido, servirDelDia } from './servicio.js';

describe('servirDelDia: porciones y total', () => {
  it('cuenta personas por grupo y multiplica por la porcion firmada', () => {
    const resultado = servirDelDia(menuDelSeed(), padronDelSeed());
    const [opcion] = resultado.opciones;

    expect(opcion?.opcion).toBe('A');
    expect(opcion?.porGrupo).toEqual([
      { grupo: 'adulto', categoria: 'adulto', personas: 1, porcion: 280, unidad: 'g', raciones: 280 },
      { grupo: 'menor_5', categoria: 'nino', personas: 1, porcion: 180, unidad: 'g', raciones: 180 },
      { grupo: 'gestante', categoria: 'gestante', personas: 1, porcion: 320, unidad: 'g', raciones: 320 },
    ]);
  });

  it('el total sale del padron vigente: 5 personas, la baja logica no come', () => {
    const resultado = servirDelDia(menuDelSeed(), padronDelSeed());

    // Guard estructural: si el fixture cambia, este numero cambia con el.
    const vigentes = padronDelSeed().filter((p) => p.deletedAt === null).length;
    expect(resultado.opciones[0]?.total).toBe(vigentes);
    expect(resultado.opciones[0]?.total).toBe(5);
  });

  it('si el padron crece, el total crece (no es una constante 148)', () => {
    const padron = padronDelSeed();
    const conUnoMas = [...padron, { ...padron[0]!, codigoP: 'P-0471' }];

    const antes = servirDelDia(menuDelSeed(), padron).opciones[0]?.total;
    const despues = servirDelDia(menuDelSeed(), conUnoMas).opciones[0]?.total;

    expect(despues).toBe((antes ?? 0) + 1);
  });

  it('adulto = 1 persona x 280 g y gestante = 1 x 320 g; total gramos 780', () => {
    const [opcion] = servirDelDia(menuDelSeed(), padronDelSeed()).opciones;

    const adulto = opcion?.porGrupo.find((f) => f.grupo === 'adulto');
    const gestante = opcion?.porGrupo.find((f) => f.grupo === 'gestante');
    expect(adulto?.raciones).toBe(280);
    expect(gestante?.raciones).toBe(320);
    expect(opcion?.totalGramos).toBe(780);
  });

  it('un grupo con personas pero sin porcion firmada se declara, no se inventa', () => {
    const [opcion] = servirDelDia(menuDelSeed(), padronDelSeed()).opciones;

    // El seed no firma porcion para adulto_mayor ni lactante_6_23m.
    expect(opcion?.gruposSinPorcion).toEqual(['adulto_mayor', 'lactante_6_23m']);
    expect(opcion?.porGrupo.some((f) => f.grupo === 'adulto_mayor')).toBe(false);
  });
});

describe('servirDelDia: sello y hash', () => {
  it('rechaza un menu sin sello y dice que falla el campo sello', () => {
    const template = { ...plantillaGeneralA(), sello: null };

    expect(() => servirDelDia(menuDelSeed(template), padronDelSeed())).toThrow(MenuNoServible);
    try {
      servirDelDia(menuDelSeed(template), padronDelSeed());
    } catch (error) {
      expect(error).toBeInstanceOf(MenuNoServible);
      expect((error as MenuNoServible).campo).toBe('sello');
      expect((error as MenuNoServible).message).toContain('sello');
    }
  });

  it('rechaza un menu que no esta publicado y dice el estado', () => {
    const template = { ...plantillaGeneralA(), estado: 'borrador' as const };

    expect(() => servirDelDia(menuDelSeed(template), padronDelSeed())).toThrowError(
      /no servible por "estado".*borrador/,
    );
  });

  it('rechaza el hash manipulado: si se quita la validacion del hash, este test se pone rojo', () => {
    const firmado = plantillaGeneralA();
    // El sello firma sha256(serializacion); un hash a mano (64 hex fijos) no cuadra.
    const manipulado = {
      ...firmado,
      hash: 'f'.repeat(64),
      sello: { ...firmado.sello!, hash: 'f'.repeat(64) },
    };

    // Contrato del hash: es el sha256 hex de la serializacion, no la serializacion.
    expect(firmado.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(firmado.hash).not.toBe(serializarContenido(firmado, platosDelDia()));

    expect(() => esMenuServible(manipulado, platosDelDia())).toThrow(MenuNoServible);
    try {
      servirDelDia(menuDelSeed(manipulado), padronDelSeed());
    } catch (error) {
      expect((error as MenuNoServible).campo).toBe('sello.hash');
      expect((error as MenuNoServible).message).toContain('no corresponde al contenido del dia');
    }
  });

  it('rechaza si el sello no coincide con el hash del menu', () => {
    const firmado = plantillaGeneralA();
    const template = { ...firmado, sello: { ...firmado.sello!, hash: 'otro-hash' } };

    expect(() => servirDelDia(menuDelSeed(template), padronDelSeed())).toThrowError(
      /no servible por "sello.hash"/,
    );
  });

  it('rechaza porciones distintas para el mismo grupo y dice el grupo', () => {
    const platos = platosDelDia();
    const impostor = {
      ...platos[0]!,
      id: 'otro-plato',
      porciones: [
        { id: 'x', dishId: 'otro-plato', grupo: 'adulto' as const, cantidad: 260, unidad: 'g' as const, version: 1, hash: 'h' },
      ],
    };
    const contenido = [...platos, impostor];
    // El hash firma el contenido contradictorio: asi el conflicto de porcion es lo que salta.
    const template = plantillaGeneralA(contenido);
    const menu = { template, platos: contenido, sustituciones: [] };

    expect(() => servirDelDia(menu, padronDelSeed())).toThrowError(
      /no servible por "porcion.adulto"/,
    );
  });

  it('estabilidad bajo reordenamiento: el hash no cambia si se reordenan los platos', () => {
    // No es un test de contrato: compara el serializador consigo mismo para fijar
    // que el orden de los platos no altera el texto (y por tanto el hash).
    const platos = platosDelDia();
    const template = plantillaGeneralA(platos);

    expect(serializarContenido(template, [...platos].reverse())).toBe(
      serializarContenido(template, platos),
    );
  });
});

describe('servirDelDia: sustituciones', () => {
  it('aplica la sustitucion aprobada en ESTA plantilla, con su factor', () => {
    // Misma sustitucion del seed pero aprobada para la plantilla 301.
    const menu = {
      ...menuDelSeed(),
      sustituciones: menuDelSeed().sustituciones.map((s) => ({
        ...s,
        templateId: menuDelSeed().template.id,
      })),
    };
    const { sustituciones } = servirDelDia(menu, padronDelSeed());

    expect(sustituciones.aprobadas).toEqual([
      {
        insumoOrigenId: 'leche_evaporada',
        insumoDestinoId: 'quinua',
        factor: 1.2,
        aprobadaPor: 'CNP-DEMO-0001',
      },
    ]);
  });

  it('una sustitucion aprobada de OTRA plantilla se ignora (el seed la tiene en la 302)', () => {
    // `sustitucionesDelSeed()` es de la 302; el menu es de la 301.
    const { sustituciones } = servirDelDia(menuDelSeed(), padronDelSeed());

    expect(sustituciones.aprobadas).toEqual([]);
    // No inventa equivalencia para leche_evaporada: no esta entre los insumos del menu,
    // pero tampoco aparece como aprobada, y la 302 no contamina.
    expect(sustituciones.aprobadas.some((s) => s.insumoOrigenId === 'leche_evaporada')).toBe(false);
    // Los insumos del plato siguen quedando "sin sustituto" (no tienen sustituto en la 301).
    expect(sustituciones.sinSustituto.map((s) => s.insumoOrigenId).sort()).toEqual([
      'lentejas',
      'papa',
    ]);
  });

  it('insumo sin sustituto aprobado queda "sin sustituto" y no inventa equivalencias', () => {
    const { sustituciones } = servirDelDia(menuDelSeed(), padronDelSeed());

    // Lentejas y papa no tienen sustitucion en la plantilla 301.
    expect(sustituciones.sinSustituto).toEqual([
      { platoId: '00000000-0000-4000-8000-000000000501', insumoOrigenId: 'lentejas', estado: 'sin sustituto' },
      { platoId: '00000000-0000-4000-8000-000000000501', insumoOrigenId: 'papa', estado: 'sin sustituto' },
    ]);
    expect(sustituciones.aprobadas.some((s) => s.insumoOrigenId === 'lentejas')).toBe(false);
  });
});
