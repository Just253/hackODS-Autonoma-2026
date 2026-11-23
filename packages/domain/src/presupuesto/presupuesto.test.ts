import { describe, expect, it } from 'vitest';

import type { Centimos, MovimientoPresupuesto, TipoMovimientoPresupuesto } from '@hackods/contracts';

import { calcularPresupuesto, type CortePresupuesto } from './presupuesto.js';

const centimos = (valor: number): Centimos => valor as Centimos;

function movimiento(
  id: string,
  tipo: TipoMovimientoPresupuesto,
  monto: number,
  asentadoEn: string,
): MovimientoPresupuesto {
  return {
    id,
    ollaId: 'olla_demo',
    presupuestoId: 'pp_01',
    tipo,
    montoCentavos: centimos(monto),
    comprobanteId: null,
    comprobanteItemId: null,
    compromisoId: null,
    ocurridoEn: '2026-11-01',
    asentadoEn,
    actorRef: 'M-0001',
    motivo: null,
    idempotencyKey: `idem_${id}`,
    createdAt: asentadoEn,
    updatedAt: asentadoEn,
    deletedAt: null,
    deviceId: 'device_demo',
    lamport: 1,
  };
}

const corte: CortePresupuesto = {
  presupuestoId: 'pp_01',
  instante: '2026-11-18T15:00:00Z',
  fechaNegocio: '2026-11-18',
  periodoDesde: '2026-11-01',
  periodoHasta: '2026-11-30',
};

const ejemplo = [
  movimiento('m1', 'asignacion', 180_000, '2026-11-01T09:00:00Z'),
  movimiento('m2', 'gasto', 90_000, '2026-11-05T10:00:00Z'),
  movimiento('m3', 'compromiso', 15_000, '2026-11-10T10:00:00Z'),
  movimiento('m4', 'gasto', 55_330, '2026-11-18T15:00:00Z'),
];

describe('calcularPresupuesto', () => {
  it('reproduce el ejemplo trabajado de §7.5 (S/ 1 800, G 1 453,30, C 150)', () => {
    const resultado = calcularPresupuesto(ejemplo, corte);

    expect(resultado.asignado).toBe(180_000);
    expect(resultado.gastado).toBe(145_330);
    expect(resultado.comprometido).toBe(15_000);
    expect(resultado.disponible).toBe(19_670);
    expect(resultado.consumoBp).toBe(8_907);
    expect(resultado.diasTranscurridos).toBe(18);
    expect(resultado.diasRestantes).toBe(12);
    expect(resultado.tasaConsumoCentimosPorDia).toBeCloseTo(8_073.888, 2);
    expect(resultado.proyeccionCentimos).toBe(242_217);
    expect(resultado.pisoComprometidoCentimos).toBe(160_330);
    expect(resultado.desvioCentimos).toBe(62_217);
    expect(resultado.muestraInsuficiente).toBe(false);
  });

  it('dispara 80 % y proyeccion, pero no 100 %', () => {
    const { alertas } = calcularPresupuesto(ejemplo, corte);
    const tipos = alertas.map((alerta) => alerta.tipo);

    expect(tipos).toContain('presupuesto_80');
    expect(tipos).toContain('proyeccion_excede');
    expect(tipos).not.toContain('presupuesto_100');
    expect(alertas.find((alerta) => alerta.tipo === 'proyeccion_excede')?.claveDedup).toBe(
      'proyeccion:pp_01:2026-11-18',
    );
  });

  it('corta por asentadoEn: un gasto posterior al corte no entra', () => {
    const conGastoFuturo = [
      ...ejemplo,
      movimiento('m5', 'gasto', 10_000, '2026-11-19T09:00:00Z'),
    ];
    const resultado = calcularPresupuesto(conGastoFuturo, corte);

    expect(resultado.gastado).toBe(145_330);
    expect(resultado.disponible).toBe(19_670);
  });

  it('sin asignado devuelve consumoBp null y no inventa 100 %', () => {
    const sinAsignado = [movimiento('m1', 'gasto', 10_000, '2026-11-10T10:00:00Z')];
    const resultado = calcularPresupuesto(sinAsignado, corte);

    expect(resultado.asignado).toBe(0);
    expect(resultado.consumoBp).toBeNull();
    expect(resultado.alertas.map((alerta) => alerta.tipo)).not.toContain('presupuesto_100');
  });

  it('con menos de 3 dias marca la proyeccion insuficiente y no alerta', () => {
    const temprano = [
      movimiento('m1', 'asignacion', 100_000, '2026-11-01T09:00:00Z'),
      movimiento('m2', 'gasto', 50_000, '2026-11-02T10:00:00Z'),
    ];
    const resultado = calcularPresupuesto(temprano, { ...corte, fechaNegocio: '2026-11-02' });

    expect(resultado.diasTranscurridos).toBe(2);
    expect(resultado.muestraInsuficiente).toBe(true);
    expect(resultado.proyeccionCentimos).not.toBeNull();
    expect(resultado.alertas).toHaveLength(0);
  });

  it('al 100 % dispara alerta critica', () => {
    const agotado = [
      movimiento('m1', 'asignacion', 100_000, '2026-11-01T09:00:00Z'),
      movimiento('m2', 'gasto', 100_000, '2026-11-20T10:00:00Z'),
    ];
    const resultado = calcularPresupuesto(agotado, {
      ...corte,
      instante: '2026-11-20T10:00:00Z',
      fechaNegocio: '2026-11-20',
    });

    expect(resultado.consumoBp).toBe(10_000);
    expect(resultado.disponible).toBe(0);
    expect(resultado.alertas).toContainEqual(
      expect.objectContaining({ tipo: 'presupuesto_100', severidad: 'critica' }),
    );
  });
});
