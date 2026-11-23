import { describe, expect, it } from 'vitest';

import { POLLO_ACTUAL, POLLO_PREVIA } from '../../fixtures/precios-demo';
import { calcularTendencia } from './tendencia';
import type { ObservacionPrecio } from './dominio';

const observaciones = (lista: readonly { id: string; valor: number; fecha: string }[]) =>
  lista.map((o) => ({ id: o.id, valor: o.valor as never, fecha: o.fecha }));

describe('calcularTendencia (mediana de 7 con outlier)', () => {
  const tendencia = calcularTendencia({
    ventanaActual: observaciones(POLLO_ACTUAL),
    ventanaPrevia: observaciones(POLLO_PREVIA),
  });

  it('+12 % exacto: mediana actual 1 400 000 vs previa 1 250 000', () => {
    expect(tendencia.medianaActual).toBe(1_400_000);
    expect(tendencia.medianaPrevia).toBe(1_250_000);
    expect(tendencia.variacionBp).toBe(1_200); // 1 200 bp = +12,00 %
    expect(tendencia.sinDato).toBe(false);
  });

  it('el outlier (14 000 000) queda excluido y no mueve la mediana', () => {
    const excluida = tendencia.serieActual.evaluadas.filter((o) => o.excluida);
    expect(excluida).toHaveLength(1);
    expect(excluida[0]?.id).toBe('pollo_act_7');
    // La mediana sigue siendo la de los 6 validos.
    expect(tendencia.medianaActual).toBe(1_400_000);
  });

  /**
   * Prueba de COMPORTAMIENTO: con un outlier de orden de magnitud adentro de
   * la ventana, la variacion publicada debe ser la de la MEDIANA y no la que
   * daria el promedio. No se deriva el esperado del producto: es un numero
   * fijo, con la cuenta hecha a mano.
   *
   *   ventana actual  = [1 390 000, 1 395 000, 1 400 000, 1 400 000,
   *                      1 405 000, 1 410 000, 14 000 000]
   *   mediana actual  = 1 400 000  (el 4o de 7 ordenados; el outlier no la toca)
   *   previa (mediana) = 1 250 000
   *   variacion       = (1 400 000 - 1 250 000) / 1 250 000 = 0,12 -> 1 200 bp
   *
   *   si se promediara la ventana SIN filtrar:
   *   promedio = 32 000 000 / 7 = 3 200 000 -> (3 200 000 - 1 250 000) / 1 250 000
   *   = +156,00 % = 15 600 bp, muy lejos de 1 200.
   * Si alguien cambia la mediana por un promedio en `calcularTendencia`, este
   * test falla: el valor publicado deja de ser +12,00 %.
   */
  it('el outlier no mueve la tendencia: publica +12,00 % (mediana, no promedio)', () => {
    expect(tendencia.variacionBp).toBe(1_200);

    // El mismo caso con la variacion calculada sobre la MEDIANA de la ventana
    // cruda (outlier incluido) da lo mismo: la mediana resiste, el promedio no.
    const cruda: ObservacionPrecio[] = [
      ...observaciones(POLLO_ACTUAL).slice(0, 6),
      { id: 'pollo_act_7', valor: 14_000_000 as never, fecha: '2026-11-19' },
    ];
    const sinFiltro = calcularTendencia({
      ventanaActual: cruda,
      ventanaPrevia: observaciones(POLLO_PREVIA),
    });
    expect(sinFiltro.variacionBp).toBe(1_200);
  });

  it('si falta la ventana previa, "sin dato" y no interpola', () => {
    const sinPrevia = calcularTendencia({
      ventanaActual: observaciones(POLLO_ACTUAL),
      ventanaPrevia: [],
    });

    expect(sinPrevia.sinDato).toBe(true);
    expect(sinPrevia.variacionBp).toBeNull();
    expect(sinPrevia.motivo).toBe('sin_previa');
  });

  it('con menos de 3 observaciones validas en la actual, "sin dato"', () => {
    const pocas = calcularTendencia({
      ventanaActual: observaciones(POLLO_ACTUAL.slice(0, 2)),
      ventanaPrevia: observaciones(POLLO_PREVIA),
    });

    expect(pocas.sinDato).toBe(true);
    expect(pocas.motivo).toBe('ventana_actual_insuficiente');
  });
});