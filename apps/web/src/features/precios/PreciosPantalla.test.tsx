import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  FUENTE_PRECIOS_DEMO,
  PRODUCTO_DESTACADO,
  PRODUCTOS_DEMO,
  type ProductoPrecioDemo,
} from '../../fixtures/precios-productos';
import { POLLO_ACTUAL, POLLO_PREVIA } from '../../fixtures/precios-demo';
import { PreciosPantalla } from './PreciosPantalla';

type Estado = 'listo' | 'cargando' | 'error' | 'sin-conexion';

const base = {
  productos: PRODUCTOS_DEMO,
  fuente: FUENTE_PRECIOS_DEMO,
  productoInicial: PRODUCTO_DESTACADO,
};

const render = (props: Partial<typeof base> & { estado?: Estado } = {}): string =>
  renderToStaticMarkup(<PreciosPantalla {...base} {...props} />);

/** El pollo solo, para las pruebas que miran una unica tendencia. */
const pollo = (cambio: Partial<ProductoPrecioDemo> = {}): ProductoPrecioDemo => ({
  id: 'pollo',
  nombre: 'pollo',
  unidad: 'kg',
  ventanaActual: POLLO_ACTUAL,
  ventanaPrevia: POLLO_PREVIA,
  ...cambio,
});

describe('PreciosPantalla (lista por producto + detalle)', () => {
  it('lista los seis insumos de la olla, no solo el pollo', () => {
    const html = render();

    for (const nombre of ['arroz', 'lentejas', 'papa', 'huevo', 'quinua', 'pollo']) {
      expect(html).toContain(`>${nombre}</span>`);
    }
  });

  it('muestra +12,00 % contra el precio típico del pollo y la fuente visible', () => {
    const html = render();

    expect(html).toContain('+12,00 %');
    expect(html).toContain(FUENTE_PRECIOS_DEMO);
    expect(html).toContain('data-tono="alza"');
  });

  it('muestra el precio típico actual S/ 1,40 / kg, no el valor suelto de S/ 14,00', () => {
    const html = render();

    expect(html).toContain('S/ 1,40 / kg');
    expect(html).toContain('data-estado="outlier"');
    expect(html).not.toContain('S/ 14,00');
  });

  it('no usa promedio ni jerga estadística: dice "precio típico"', () => {
    const html = render().toLowerCase();
    expect(html).toContain('precio típico');
    expect(html).not.toContain('promedio');
    // La palabra "mediana" es jerga: no se muestra, aunque el cálculo la use.
    expect(html).not.toContain('mediana');
    expect(html).not.toContain('atípica');
  });

  it('si falta la ventana previa muestra "sin dato" y no dibuja flecha', () => {
    const html = render({ productos: [pollo({ ventanaPrevia: [] })] });

    expect(html).toContain('sin dato');
    expect(html).not.toContain('data-tono="alza"');
  });

  it('sin conexión avisa "guardado en esta tablet" sin perder la variación', () => {
    const html = render({ estado: 'sin-conexion' });

    expect(html).toContain('guardado en esta tablet');
    expect(html).toContain('+12,00 %');
  });

  it('el detalle se calcula por producto: la papa cae 10 %', () => {
    const html = render({ productos: [pollo()] });

    // Con el pollo solo no aparece la papa; el caso queda cubierto por la lista.
    expect(html).not.toContain('papa');

    const conPapa = render({ productoInicial: 'papa' });
    expect(conPapa).toContain('\u221210,00 %');
    expect(conPapa).toContain('S/ 1,62 / kg');
  });
});
