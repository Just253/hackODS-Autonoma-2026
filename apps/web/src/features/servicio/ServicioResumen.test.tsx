import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Persona } from '@hackods/contracts';
import type { MenuOpcion } from '@hackods/domain';

import {
  HASH_DEMO_301,
  TEMPLATE_DEMO_302,
  menusDelDiaDemo,
  padronDemo,
  persona,
  plantillaDemo301,
  sustitucionesDemo,
} from '../../fixtures/servicio-demo';
import { ServicioResumen } from './ServicioResumen';

const render = (menus: readonly MenuOpcion[], personas: readonly Persona[] = padronDemo()): string =>
  renderToStaticMarkup(<ServicioResumen menus={menus} personas={personas} />);

describe('ServicioResumen (servirDelDia conectado)', () => {
  it('muestra sello, hash, las 2 opciones, la porcion por grupo y el total', () => {
    const html = render(menusDelDiaDemo());

    expect(html).toContain('Nutricionista Demo');
    expect(html).toContain('CNP-DEMO-0001');
    expect(html).toContain(HASH_DEMO_301.slice(0, 12));
    expect(html).toContain('General');
    expect(html).toContain('Especial');
    expect(html).toContain('280 g');
    expect(html).toContain('180 g');
    expect(html).toContain('320 g');
    expect(html).toContain('Total de raciones: 5');
  });

  it('el total sale del padron: una persona mas lo sube a 6 (no es constante)', () => {
    const conUnoMas = [...padronDemo(), persona('P-0007', 'adulto')];
    const html = render(menusDelDiaDemo(), conUnoMas);

    expect(html).toContain('Total de raciones: 6');
    expect(html).not.toContain('Total de raciones: 5');
  });

  it('declara los grupos sin porcion firmada en vez de inventar una', () => {
    const html = render(menusDelDiaDemo());

    expect(html).toContain('Grupos sin porcion firmada');
    expect(html).toContain('Adulto mayor');
    expect(html).toContain('Lactante 6 a 23 meses');
  });

  /**
   * Prueba `gruposSinPorcion` SOLA, sin que el caso muera antes por sello/hash.
   *
   * El padron tiene una sola persona (adulto mayor) y la opcion 302 es un menu
   * vacio con su hash REAL (`HASH_DEMO_302`, el del contenido sin platos). El
   * menu es servible; lo unico que falta es la porcion del grupo, y eso es lo
   * que tiene que decir la pantalla (hallazgo del revisor: la asercion vieja
   * fallaba por `sello.hash`, no por `gruposSinPorcion`).
   */
  it('con hash valido, el grupo sin porcion firmada se declara (no falla por sello)', () => {
    const html = render(menusDelDiaDemo(), [persona('P-0101', 'adulto_mayor')]);

    expect(html).not.toContain('no se puede servir');
    expect(html).toContain('Grupos sin porcion firmada');
    expect(html).toContain('Adulto mayor');
    // Los grupos con porcion firmada no aparecen como faltantes.
    const faltantes = html.slice(html.indexOf('Grupos sin porcion firmada'));
    expect(faltantes).not.toContain('Gestante');
  });

  it('si el menu no es servible muestra sin dato y el campo, sin numero inventado', () => {
    const [general, especial] = menusDelDiaDemo();
    const roto: MenuOpcion = {
      ...general!,
      template: { ...general!.template, hash: 'f'.repeat(64) },
    };
    const html = render([roto, especial!]);

    expect(html).toContain('no se puede servir');
    expect(html).toContain('sello.hash');
    expect(html).toContain('sin dato');
    expect(html).not.toContain('Total de raciones');
  });
});

describe('ServicioResumen: sustituciones (criterio 4 de #17)', () => {
  it('muestra la sustitucion aprobada de la plantilla con su factor', () => {
    // La sustitucion del seed (leche_evaporada -> quinua x1.20) es de la 302.
    const html = render(menusDelDiaDemo());

    expect(html).toContain('Sustituciones');
    expect(html).toContain('Sustitucion aprobada');
    expect(html).toContain('leche_evaporada');
    expect(html).toContain('quinua');
    expect(html).toContain('factor 1.2');
  });

  it('no le atribuye a la 301 (sin aprobacion) una sustitucion de otra plantilla', () => {
    const html = render(menusDelDiaDemo());
    // Las dos tarjetas juntas tienen UNA sola aprobacion: la de la 302.
    expect(html.match(/Sustitucion aprobada/g)?.length).toBe(1);
  });

  it('un insumo sin sustituto aprobado dice "sin sustituto" y no inventa equivalencia', () => {
    const html = render(menusDelDiaDemo());

    expect(html).toContain('sin sustituto');
    // Lentejas y papa (los insumos del plato de la 301) no tienen sustituto aprobado.
    expect(html).toContain('lentejas');
    expect(html).toContain('papa');
    // Nada de "lentejas por X": la pantalla no escribe una equivalencia inventada.
    expect(html).not.toContain('lentejas por');
    expect(html).not.toContain('papa por');
  });

  it('una plantilla sin sustituciones ni insumos no dibuja la seccion', () => {
    const sinSubs: MenuOpcion[] = [
      { template: plantillaDemo301(), platos: [], sustituciones: [] },
    ];

    expect(render(sinSubs)).not.toContain('data-testid="sustituciones"');
  });

  it('la sustitucion aprobada sale de la plantilla, no se rellena desde otra', () => {
    // Misma aprobacion del seed pero movida de plantilla: la 302 ya no la trae.
    const [general, especial] = menusDelDiaDemo();
    const sinAprobacion: MenuOpcion = {
      ...especial!,
      sustituciones: sustitucionesDemo().filter((s) => s.templateId !== TEMPLATE_DEMO_302),
    };
    const html = render([general!, sinAprobacion]);

    // Ya no hay aprobacion dibujada: la 301 no tiene la sustitucion y la 302 la perdio.
    expect(html).not.toContain('Sustitucion aprobada');
  });
});
