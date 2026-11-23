import { describe, expect, it } from 'vitest';

import type { PrecioRemoto } from '../../data/remoto.js';
import { microDesdeFila, partirVentanas, productosDeLaSerie } from './serie-remota.js';

/**
 * De la fila de Supabase al `ProductoPrecio`. Nada de red y nada de medianas:
 * lo que se prueba es la conversion de unidad, el corte de ventanas del
 * contrato (§8.2: [t-30, t] y [t-60, t-31]) y que los canales no se mezclen.
 */

function precio(over: Partial<PrecioRemoto> = {}): PrecioRemoto {
  return {
    insumoId: 'arroz',
    insumo: 'Arroz demo',
    canal: 'mayorista',
    unidad: 'g',
    precio: 420000,
    fecha: '2026-11-01',
    ...over,
  };
}

describe('microDesdeFila', () => {
  it('la convencion del seed: 420000 -> S/ 4,20 por kg', () => {
    expect(microDesdeFila(420000)).toBe(4_200_000);
  });

  it('unidad: 50000 -> S/ 0,50 por unidad', () => {
    expect(microDesdeFila(50000)).toBe(500_000);
  });
});

describe('partirVentanas', () => {
  it('actual = [t-30, t] y previa = [t-60, t-31]', () => {
    const filas = [
      precio({ fecha: '2026-09-29' }), // t-61: fuera de las dos
      precio({ fecha: '2026-09-30' }), // previa (t-60)
      precio({ fecha: '2026-10-29' }), // previa (t-31)
      precio({ fecha: '2026-10-30' }), // actual (t-30)
      precio({ fecha: '2026-11-29' }), // actual (t)
    ];

    const { actual, previa } = partirVentanas(filas, '2026-11-29');

    expect(actual.map((o) => o.fecha)).toEqual(['2026-10-30', '2026-11-29']);
    expect(previa.map((o) => o.fecha)).toEqual(['2026-09-30', '2026-10-29']);
  });

  it('una fecha que no es fecha no entra a ninguna ventana', () => {
    const { actual, previa } = partirVentanas(
      [precio({ fecha: 'sin-fecha' }), precio({ fecha: '2026-11-01' })],
      '2026-11-01',
    );

    expect(actual).toHaveLength(1);
    expect(previa).toHaveLength(0);
  });
});

describe('productosDeLaSerie', () => {
  it('separa por canal: mayorista y minorista son dos series', () => {
    const filas = [
      precio({ canal: 'mayorista' }),
      precio({ canal: 'minorista', precio: 510000 }),
    ];

    const productos = productosDeLaSerie(filas);

    expect(productos.map((p) => p.nombre)).toEqual([
      'Arroz demo (mayorista)',
      'Arroz demo (minorista)',
    ]);
    expect(productos[0]?.unidad).toBe('g');
    expect(productos[0]?.id).toBe('arroz:mayorista:g');
  });

  it('la semana del seed cae entera en la ventana actual: sin previa, sin flecha', () => {
    const filas = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'].map(
      (fecha, indice) => precio({ fecha, precio: 420000 + indice * 1000 }),
    );

    const [producto] = productosDeLaSerie(filas);

    expect(producto?.ventanaActual).toHaveLength(7);
    expect(producto?.ventanaPrevia).toHaveLength(0);
  });

  it('cada observacion lleva microcentesimos, no soles', () => {
    const [producto] = productosDeLaSerie([precio()]);

    expect(producto?.ventanaActual[0]?.valor).toBe(4_200_000);
  });

  it('sin filas no hay productos (no se inventa un catalogo)', () => {
    expect(productosDeLaSerie([])).toEqual([]);
  });
});
