import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { MenuNoServible, type MenuOpcion } from '@hackods/domain';

import { HASH_DEMO_301, menusDelDiaDemo, padronDemo, persona } from '../../fixtures/servicio-demo';
import { ServicioResumen, fraseDeCocina } from './ServicioResumen';

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

    expect(html).toContain('Grupos sin porción firmada');
    expect(html).toContain('Adulto mayor');
    expect(html).toContain('Lactante 6 a 23 meses');
  });

  it('si el menu no es servible muestra sin dato y el sello fallado, sin numero inventado', () => {
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

  it('la cocinera lee una frase de cocina y NO el nombre tecnico del campo', () => {
    const [general, especial] = menusDelDiaDemo();
    const roto: MenuOpcion = {
      ...general!,
      template: { ...general!.template, hash: 'f'.repeat(64) },
    };
    const html = render([roto, especial!]);
    // Lo que se lee primero: la frase, sin `sello.hash` ni el detalle del dominio.
    const visible = html.replace(/<details[\s\S]*?<\/details>/g, '');
    expect(visible).toContain('La firma del menú no coincide con lo que se va a servir.');
    expect(visible).not.toContain('sello.hash');
    expect(visible).not.toContain('el hash del sello');
    // El dato tecnico no se borra: queda adentro, para quien lo busque.
    expect(html).toContain('sello.hash');
    expect(html).toContain('el hash del sello');
  });
});

describe('fraseDeCocina: el error tecnico traducido a lo que se lee en la cocina', () => {
  it('campo "estado" -> falta la aprobacion de la nutricionista, sin la palabra "borrador"', () => {
    const frase = fraseDeCocina(
      new MenuNoServible('menu-1', 'estado', 'estado "borrador": el menu no esta aprobado'),
    );
    expect(frase).toContain('no tiene la aprobación de la nutricionista');
    expect(frase).not.toContain('borrador');
  });

  it('campo "sello.hash" y "sello.version" -> la firma no coincide con lo que se va a servir', () => {
    expect(fraseDeCocina(new MenuNoServible('menu-1', 'sello.hash', 'x'))).toContain(
      'La firma del menú no coincide con lo que se va a servir.',
    );
    expect(fraseDeCocina(new MenuNoServible('menu-1', 'sello.version', 'x'))).toContain(
      'La firma del menú no coincide con lo que se va a servir.',
    );
  });

  it('campo "sello" -> el menú no trae la firma; campo "menu" -> no se eligió el menú', () => {
    expect(fraseDeCocina(new MenuNoServible('menu-1', 'sello', 'x'))).toContain(
      'no tiene la firma de la nutricionista',
    );
    expect(fraseDeCocina(new MenuNoServible('(sin menu)', 'menu', 'x'))).toContain(
      'Todavía no se eligió el menú del día.',
    );
  });

  it('cualquier otro campo cae en una frase generica sin jerga (ni `porcion.adulto`)', () => {
    const frase = fraseDeCocina(new MenuNoServible('menu-1', 'porcion.adulto', 'x'));
    expect(frase).toBe(
      'Algo en el menú del día no está bien. Revisa con la nutricionista antes de servir.',
    );
    expect(frase).not.toContain('porcion');
  });
});