import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { FUENTE_DEMO, POLLO_ACTUAL, POLLO_PREVIA, PRODUCTO_DEMO, UNIDAD_DEMO } from '../../fixtures/precios-demo';
import { PreciosPantalla } from './PreciosPantalla';
import { calcularTendencia } from './tendencia';

import type { Microcentesimos } from '@hackods/contracts';

/** Marca de microcentesimos: el contrato no acepta un `number` suelto. */
const micro = (valor: number): Microcentesimos => valor as Microcentesimos;

const base = {
  producto: PRODUCTO_DEMO,
  unidad: UNIDAD_DEMO,
  fuente: FUENTE_DEMO,
  ventanaActual: POLLO_ACTUAL,
  ventanaPrevia: POLLO_PREVIA,
};

const render = (props: Partial<typeof base> = {}): string =>
  renderToStaticMarkup(<PreciosPantalla {...base} {...props} />);

const obs = (lista: readonly { id: string; valor: number; fecha: string }[]) =>
  lista.map((o) => ({ id: o.id, valor: o.valor as never, fecha: o.fecha }));

describe('PreciosPantalla · outlier en la ventana PREVIA', () => {
  /**
   * La ventana previa trae un outlier de unidad (x10) que el MAD debe excluir.
   *
   * Se construye la ventana de 7 manera explicita, con un solo valor simetrico
   * alrededor de 1 250 000, porque `POLLO_PREVIA` es asimetrica y reemplazar el
   * primer valor corre la mediana. Con 7 y el outlier excluido quedan 6 validos:
   *
   *   validos ordenados: 1 200 000 · 1 230 000 · 1 250 000 · 1 250 000 · 1 280 000 · 1 300 000
   *   mediana de 6 = (1 250 000 + 1 250 000) / 2 = 1 250 000  (exacta)
   *
   * El outlier (12 500 000, x10) entra en lugar del extremo alto.
   */
  const previaConOutlier = [
    { id: 'pp_1', valor: micro(1_200_000), fecha: '2026-09-17' },
    { id: 'pp_2', valor: micro(1_230_000), fecha: '2026-09-24' },
    { id: 'pp_3', valor: micro(1_250_000), fecha: '2026-10-01' },
    { id: 'pp_4', valor: micro(1_250_000), fecha: '2026-10-08' },
    { id: 'pp_5', valor: micro(1_280_000), fecha: '2026-10-15' },
    { id: 'pp_6', valor: micro(1_300_000), fecha: '2026-10-22' },
    { id: 'pollo_prev_outlier', valor: micro(12_500_000), fecha: '2026-10-29' },
  ];

  it('el outlier previo se marca y NO mueve la mediana previa', () => {
    const t = calcularTendencia({
      ventanaActual: obs(POLLO_ACTUAL),
      ventanaPrevia: obs(previaConOutlier),
    });

    const excluida = t.seriePrevia.evaluadas.filter((o) => o.excluida);
    expect(excluida).toHaveLength(1);
    expect(excluida[0]?.id).toBe('pollo_prev_outlier');
    expect(t.medianaPrevia).toBe(1_250_000);
    expect(t.variacionBp).toBe(1_200);
  });

  it('la pantalla avisa del outlier previo y mantiene +12,00 %', () => {
    const html = render({ ventanaPrevia: previaConOutlier });
    expect(html).toContain('data-estado="outlier-previo"');
    expect(html).toContain('+12,00 %');
  });
});

describe('PreciosPantalla · variación negativa menor a 1 % (MEDIA 7)', () => {
  /**
   * Cuenta hecha a mano:
   *   ventana actual ordenada: 1 243 000 .. 1 244 500 (7 valores)
   *   mediana actual = 1 243 800 (el 4o ordenado; ninguno se excluye, MAD = 200)
   *   mediana previa = 1 250 000 (fixture)
   *   variación = (1 243 800 - 1 250 000) / 1 250 000 = -0,00496 -> -49,6 bp
   *   redondeo entero -> -50 bp  ->  se publica "−0,50 %"
   */
  const actualBaja = [
    { id: 'b1', valor: micro(1_243_000), fecha: '2026-11-01' },
    { id: 'b2', valor: micro(1_243_700), fecha: '2026-11-02' },
    { id: 'b3', valor: micro(1_243_750), fecha: '2026-11-03' },
    { id: 'b4', valor: micro(1_243_800), fecha: '2026-11-04' },
    { id: 'b5', valor: micro(1_244_000), fecha: '2026-11-05' },
    { id: 'b6', valor: micro(1_244_200), fecha: '2026-11-06' },
    { id: 'b7', valor: micro(1_244_500), fecha: '2026-11-07' },
  ];

  it('publica "−0,50 %" con signo negativo explícito, nunca "0,50 %"', () => {
    const t = calcularTendencia({
      ventanaActual: obs(actualBaja),
      ventanaPrevia: obs(POLLO_PREVIA),
    });
    expect(t.variacionBp).toBe(-50);

    const html = render({ ventanaActual: actualBaja });
    expect(html).toContain('\u22120,50 %');
    // El texto sin signo no debe aparecer como variación.
    expect(html).not.toMatch(/[^−]0,50 %/);
    expect(html).toContain('data-tono="baja"');
  });
});
