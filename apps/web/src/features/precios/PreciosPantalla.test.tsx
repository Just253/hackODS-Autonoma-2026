import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { FUENTE_DEMO, POLLO_ACTUAL, POLLO_PREVIA, PRODUCTO_DEMO, UNIDAD_DEMO } from '../../fixtures/precios-demo';
import { PreciosPantalla } from './PreciosPantalla';

const base = {
  producto: PRODUCTO_DEMO,
  unidad: UNIDAD_DEMO,
  fuente: FUENTE_DEMO,
  ventanaActual: POLLO_ACTUAL,
  ventanaPrevia: POLLO_PREVIA,
};

type Estado = 'listo' | 'cargando' | 'error' | 'sin-conexion';

const render = (props: Partial<typeof base> & { estado?: Estado } = {}): string =>
  renderToStaticMarkup(<PreciosPantalla {...base} {...props} />);

describe('PreciosPantalla (7 observaciones + outlier)', () => {
  it('muestra +12,00 % contra la mediana y la fuente visible', () => {
    const html = render();

    expect(html).toContain('+12,00 %');
    expect(html).toContain(FUENTE_DEMO);
    expect(html).toContain('data-tono="alza"');
  });

  it('muestra la mediana actual S/ 1,40 / kg, no el outlier de S/ 14,00', () => {
    const html = render();

    expect(html).toContain('S/ 1,40 / kg');
    expect(html).toContain('data-estado="outlier"');
    expect(html).not.toContain('S/ 14,00');
  });

  it('no usa promedio: el texto dice "mediana"', () => {
    const html = render();
    expect(html.toLowerCase()).toContain('mediana');
    expect(html.toLowerCase()).not.toContain('promedio');
  });

  it('si falta la ventana previa muestra "sin dato" y no dibuja flecha', () => {
    const html = render({ ventanaPrevia: [] });

    expect(html).toContain('sin dato');
    expect(html).not.toContain('data-tono="alza"');
  });

  it('sin conexión avisa "pendiente de sincronizar" sin perder la variación', () => {
    const html = render({ estado: 'sin-conexion' });

    expect(html).toContain('pendiente de sincronizar');
    expect(html).toContain('+12,00 %');
  });
});
