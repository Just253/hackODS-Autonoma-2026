import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TAU, MARGEN, PISO } from '@hackods/domain';

import { CANDIDATOS_POR_ITEM, ITEMS_BOLETA } from '../../fixtures/comprobante-demo.js';
import { ComprobantePage, formatearCentimos } from './ComprobantePage.js';
import { clasificarItem, sumaAlPresupuesto } from './clasificar.js';

/**
 * Issue #9: 6 lineas, exactamente 2 en por_revisar, y nada suma al presupuesto
 * sin confirmar (DEC-2026-0008).
 *
 * El test no repite 0,69 / 0,04 / 0,45: importa TAU, MARGEN y PISO del dominio.
 * Si el umbral cambia, el test cambia con el.
 */

const ATRIBUTO_TOTAL = '[data-estado=' + String.fromCharCode(34) + 'total-confirmado' + String.fromCharCode(34) + ']';

function clasificarTodo() {
  return ITEMS_BOLETA.map((item) => clasificarItem(item, CANDIDATOS_POR_ITEM[item.id] ?? []));
}

function totalEnPantalla(): number {
  const nodo = document.querySelector(ATRIBUTO_TOTAL);
  if (nodo === null) throw new Error('falta el total confirmado en pantalla');
  const texto = nodo.textContent ?? '';
  return Number(texto.replace(/[^0-9]/g, ''));
}

afterEach(() => {
  cleanup();
});

describe('clasificacion del comprobante', () => {
  it('deja exactamente 2 de las 6 lineas en por_revisar', () => {
    const clasificaciones = clasificarTodo();
    const porRevisar = clasificaciones.filter((c) => c.estado === 'por_revisar');
    expect(porRevisar).toHaveLength(2);
    expect(porRevisar.map((c) => c.itemId)).toEqual(['item-01', 'item-03']);
  });

  it('el item-01 no supera el margen y el item-03 no supera TAU', () => {
    const uno = CANDIDATOS_POR_ITEM['item-01'] ?? [];
    const similitudes = uno.map((c) => c.similitud).sort((a, b) => b - a);
    const s1uno = similitudes[0] ?? 0;
    const s2uno = similitudes[1] ?? 0;
    expect(s1uno).toBeGreaterThanOrEqual(TAU);
    expect(s1uno - s2uno).toBeLessThan(MARGEN);

    const tres = CANDIDATOS_POR_ITEM['item-03'] ?? [];
    const s1tres = Math.max(...tres.map((c) => c.similitud));
    expect(s1tres).toBeLessThan(TAU);
    expect(s1tres).toBeGreaterThanOrEqual(PISO);
  });

  it('por debajo de PISO queda desconocido y tambien queda por fuera del presupuesto', () => {
    const item = ITEMS_BOLETA[0];
    if (item === undefined) throw new Error('fixture vacia');
    const resultado = clasificarItem(item, [
      { productoId: 'x', nombre: 'X', categoria: 'otros', similitud: PISO - 0.01 },
    ]);
    expect(resultado.estado).toBe('desconocido');
    expect(sumaAlPresupuesto(resultado.estado)).toBe(false);
  });

  it('sumaAlPresupuesto solo es true para confirmado', () => {
    expect(sumaAlPresupuesto('confirmado')).toBe(true);
    expect(sumaAlPresupuesto('por_revisar')).toBe(false);
    expect(sumaAlPresupuesto('desconocido')).toBe(false);
  });
});

describe('pantalla de comprobante', () => {
  it('muestra las 6 lineas con texto crudo, cantidad, unidad y precio unitario', () => {
    render(<ComprobantePage />);
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    for (const item of ITEMS_BOLETA) {
      expect(screen.getByText(item.descripcionCruda)).toBeInTheDocument();
      expect(screen.getAllByText(formatearCentimos(item.totalLineaCentavos)).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Cantidad')).toHaveLength(6);
    expect(screen.getAllByText('Unidad')).toHaveLength(6);
    expect(screen.getAllByText('Precio unitario')).toHaveLength(6);
  });

  it('las 2 lineas por_revisar arrancan con data-suma=no y el total es 0', () => {
    render(<ComprobantePage />);
    const porRevisar = screen
      .getAllByRole('listitem')
      .filter((f) => f.getAttribute('data-estado') === 'por_revisar');
    expect(porRevisar).toHaveLength(2);
    for (const fila of porRevisar) {
      expect(fila.getAttribute('data-suma')).toBe('no');
    }
    expect(totalEnPantalla()).toBe(0);
  });

  it('confirmar una linea la pasa a confirmado y recien entonces suma', () => {
    render(<ComprobantePage />);
    const item = ITEMS_BOLETA[0];
    if (item === undefined) throw new Error('fixture vacia');
    expect(totalEnPantalla()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ' + item.descripcionCruda }));
    const fila = screen.getByText(item.descripcionCruda).closest('li');
    expect(fila?.getAttribute('data-estado')).toBe('confirmado');
    expect(fila?.getAttribute('data-suma')).toBe('si');
    expect(totalEnPantalla()).toBe(Number(item.totalLineaCentavos));
  });

  it('el total NO incluye ninguna linea por_revisar sin confirmar', () => {
    render(<ComprobantePage />);
    for (const fila of screen.getAllByRole('listitem')) {
      if (fila.getAttribute('data-estado') === 'confirmado') {
        fireEvent.click(within(fila).getByRole('button'));
      }
    }
    const esperado = ITEMS_BOLETA.filter((item) => item.id !== 'item-01' && item.id !== 'item-03').reduce(
      (suma, item) => suma + Number(item.totalLineaCentavos),
      0,
    );
    expect(totalEnPantalla()).toBe(esperado);
    const pendientes = screen
      .getAllByRole('listitem')
      .filter((f) => f.getAttribute('data-estado') === 'por_revisar');
    expect(pendientes).toHaveLength(2);
    for (const fila of pendientes) {
      expect(fila.getAttribute('data-suma')).toBe('no');
      expect(within(fila).getByText(/no suma/i)).toBeInTheDocument();
    }
  });
});

describe('formato de dinero', () => {
  it('centimos a soles sin floats', () => {
    expect(formatearCentimos(0)).toBe('S/ 0,00');
    expect(formatearCentimos(2450)).toBe('S/ 24,50');
    expect(formatearCentimos(100)).toBe('S/ 1,00');
    expect(formatearCentimos(5)).toBe('S/ 0,05');
  });
});
