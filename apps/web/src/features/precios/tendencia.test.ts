import { describe, expect, it } from 'vitest';

import { POLLO_ACTUAL, POLLO_PREVIA } from '../../fixtures/precios-demo';
import { calcularTendencia, promedioParaPrueba } from './tendencia';

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
    // La mediana sigue siendo la de los 6 válidos.
    expect(tendencia.medianaActual).toBe(1_400_000);
  });

  it('ROJO→VERDE: si se usara el PROMEDIO, la variación sería otra (prueba que la mediana importa)', () => {
    const validosActual = tendencia.serieActual.evaluadas
      .filter((o) => !o.excluida)
      .map((o) => Number(o.valor));
    const validosPrevia = tendencia.seriePrevia.evaluadas.map((o) => Number(o.valor));

    const promedioActual = promedioParaPrueba(validosActual);
    const promedioPrevia = promedioParaPrueba(validosPrevia);

    // La mediana da +12,00 % (= 1 200 bp). El promedio NO da eso:
    expect(tendencia.variacionBp).toBe(1_200);
    const bpPromedio = Math.round(
      (10_000 * ((promedioActual ?? 0) - (promedioPrevia ?? 0))) / (promedioPrevia ?? 1),
    );
    expect(bpPromedio).not.toBe(1_200);
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

  it('con menos de 3 observaciones válidas en la actual, "sin dato"', () => {
    const pocas = calcularTendencia({
      ventanaActual: observaciones(POLLO_ACTUAL.slice(0, 2)),
      ventanaPrevia: observaciones(POLLO_PREVIA),
    });

    expect(pocas.sinDato).toBe(true);
    expect(pocas.motivo).toBe('ventana_actual_insuficiente');
  });
});

