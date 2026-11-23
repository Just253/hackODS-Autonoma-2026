/**
 * Metricas del dia (issue #55): cada metrica con su `it`, contra el fixture del
 * seed. No verifican la forma de la implementacion sino que **compongan** lo que
 * ya calculan `servirDelDia` y `agregadoEntreOllas`:
 * - `racionesTotales` = suma de `RacionOpcion.total` (5 vigentes del padron).
 * - `gramosPorGrupo` = suma de `raciones` por grupo (adulto 280, menor_5 180,
 *   gestante 320; los grupos sin porcion no aparecen).
 * - `volumenPorCategoria` reusa `agregadoEntreOllas`: arroz+frijol -> granos.
 * - `padronPorCategoria` cuenta vigentes por categoria; la baja logica no cuenta.
 */
import { describe, expect, it } from 'vitest';

import type { Movimiento } from '@hackods/contracts';

import { menu301, menuDelSeed, padronDelSeed } from './fixtures-servicio.test-helpers.js';
import { servirDelDia } from './servicio.js';
import {
  gramosPorGrupo,
  metricasDelDia,
  padronPorCategoria,
  racionesTotales,
  volumenPorCategoria,
} from './metricas.js';
import type { Periodo } from './reporte.js';

const PERIODO: Periodo = { desde: '2026-11-01', hasta: '2026-11-30' };

function movimiento(id: string, ollaId: string, insumoId: string, delta: number): Movimiento {
  return {
    id,
    ollaId,
    insumoId,
    delta,
    motivo: 'entrada',
    autor: 'test',
    at: '2026-11-10T09:00:00.000Z',
    createdAt: '2026-11-10T09:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    deletedAt: null,
    deviceId: 'dev',
    lamport: 1,
  };
}

describe('racionesTotales: suma de las raciones servidas hoy', () => {
  it('son las personas vigentes del padron, no una constante', () => {
    const servicio = servirDelDia([menuDelSeed()], padronDelSeed());
    const vigentes = padronDelSeed().filter((p) => p.deletedAt === null).length;
    expect(racionesTotales(servicio)).toBe(vigentes);
    expect(racionesTotales(servicio)).toBe(5);
  });

  it('si el padron crece, las raciones totales crecen', () => {
    const padron = padronDelSeed();
    const servicio = servirDelDia([menuDelSeed()], padron);
    const conUnoMas = [...padron, { ...padron[0]!, codigoP: 'P-0471' }];
    const servicioMas = servirDelDia([menuDelSeed()], conUnoMas);
    expect(racionesTotales(servicioMas)).toBe(racionesTotales(servicio) + 1);
  });
});

describe('gramosPorGrupo: suma de raciones por grupo servido', () => {
  it('refleja las porciones firmadas por grupo (adulto 280, menor_5 180, gestante 320)', () => {
    const servicio = servirDelDia([menuDelSeed()], padronDelSeed());
    expect(gramosPorGrupo(servicio)).toEqual({ adulto: 280, menor_5: 180, gestante: 320 });
  });

  it('un grupo sin personas no aparece (no se inventa un 0)', () => {
    const servicio = servirDelDia([menuDelSeed()], padronDelSeed());
    const grupos = gramosPorGrupo(servicio);
    expect(grupos.adulto_mayor).toBeUndefined();
  });

  it('suma los gramos del MISMO grupo entre varias opciones servidas', () => {
    // Dos opciones con el mismo padron: adulto 280 g por opcion -> 560 g sumados.
    const servicio = servirDelDia([menu301(), menu301()], padronDelSeed());
    const grupos = gramosPorGrupo(servicio);
    expect(grupos.adulto).toBe(560);
    expect(grupos.menor_5).toBe(360);
    expect(grupos.gestante).toBe(640);
  });
});

describe('volumenPorCategoria: reutiliza agregadoEntreOllas', () => {
  it('arroz (olla_1) y frijol (olla_2) se suman en granos', () => {
    const movimientos = [
      movimiento('m1', 'olla_1', 'arroz', 20000),
      movimiento('m2', 'olla_2', 'frijol', 5000),
    ];
    expect(volumenPorCategoria(movimientos, PERIODO)).toEqual({ granos: 25000 });
  });

  it('un insumo desconocido cae en otros, sin exponer su id', () => {
    const movimientos = [movimiento('m3', 'olla_3', 'P-ABCD', 7000)];
    const volumen = volumenPorCategoria(movimientos, PERIODO);
    expect(volumen).toEqual({ otros: 7000 });
    expect(JSON.stringify(volumen)).not.toContain('P-ABCD');
  });
});

describe('padronPorCategoria: vigentes por categoria, sin identidades', () => {
  it('cuenta solo personas vigentes; la baja logica no cuenta', () => {
    // Seed: gestante, nino, adulto_mayor, adulto, lactante + una baja (adulto).
    expect(padronPorCategoria(padronDelSeed())).toEqual({
      gestante: 1,
      nino: 1,
      adulto_mayor: 1,
      adulto: 1,
      lactante: 1,
    });
  });

  it('no expone ningun codigo P en la salida', () => {
    const conteo = padronPorCategoria(padronDelSeed());
    expect(JSON.stringify(conteo)).not.toMatch(/P-\d{4}/);
  });
});

describe('metricasDelDia: agrega las cuatro metricas en un objeto', () => {
  it('compone raciones, gramos, volumen y padron coherentes entre si', () => {
    const servicio = servirDelDia([menuDelSeed()], padronDelSeed());
    const movimientos = [
      movimiento('m1', 'olla_1', 'arroz', 20000),
      movimiento('m2', 'olla_2', 'frijol', 5000),
    ];
    const metricas = metricasDelDia(servicio, movimientos, padronDelSeed(), PERIODO);

    expect(metricas.racionesTotales).toBe(5);
    expect(metricas.gramosPorGrupo).toEqual({ adulto: 280, menor_5: 180, gestante: 320 });
    expect(metricas.volumenPorCategoria).toEqual({ granos: 25000 });
    expect(metricas.padronPorCategoria).toEqual({
      gestante: 1,
      nino: 1,
      adulto_mayor: 1,
      adulto: 1,
      lactante: 1,
    });
    // Coherencia: la suma del padron vigente es igual al total de raciones.
    const sumaPadron = Object.values(metricas.padronPorCategoria).reduce((a, b) => a + b, 0);
    expect(sumaPadron).toBe(metricas.racionesTotales);
  });
});
