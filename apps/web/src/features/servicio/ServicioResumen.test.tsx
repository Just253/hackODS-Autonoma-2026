import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import type { MenuOpcion } from '@hackods/domain';

import { HASH_DEMO_301, menusDelDiaDemo, padronDemo, persona } from '../../fixtures/servicio-demo';
import { ServicioResumen } from './ServicioResumen';

const render = (menus: readonly MenuOpcion[], personas = padronDemo()): string =>
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
    // La columna de gramos se llama Total, no Raciones: "raciones" es el conteo de personas.
    expect(html).toContain('>Total</th>');
    expect(html).not.toContain('>Raciones</th>');
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