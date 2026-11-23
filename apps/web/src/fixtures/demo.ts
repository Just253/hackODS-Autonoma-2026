/**
 * Datos ficticios para presupuesto. Ninguna persona real, ningún RUC.
 * Coinciden con el ejemplo trabajado de `docs/contracts/comprobantes.md` §7.5.
 */
import type { Centimos, MovimientoPresupuesto, TipoMovimientoPresupuesto } from '@hackods/contracts';

export const OLLA_DEMO = 'olla_demo';

const centimos = (valor: number): Centimos => valor as Centimos;

export function movimientoDemo(
  id: string,
  tipo: TipoMovimientoPresupuesto,
  monto: number,
  asentadoEn: string,
  ocurridoEn = '2026-11-01',
): MovimientoPresupuesto {
  return {
    id,
    ollaId: OLLA_DEMO,
    presupuestoId: 'pp_demo_11',
    tipo,
    montoCentavos: centimos(monto),
    comprobanteId: null,
    comprobanteItemId: null,
    compromisoId: null,
    ocurridoEn,
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

/** Corte del 18/11 a las 15:00 con el ejemplo §7.5 (A 1 800, G 1 453,30, C 150). */
export const CORTE_DEMO = {
  presupuestoId: 'pp_demo_11',
  instante: '2026-11-18T15:00:00Z',
  fechaNegocio: '2026-11-18',
  periodoDesde: '2026-11-01',
  periodoHasta: '2026-11-30',
} as const;

export const MOVIMIENTOS_DEMO: readonly MovimientoPresupuesto[] = [
  movimientoDemo('m1', 'asignacion', 180_000, '2026-11-01T09:00:00Z'),
  movimientoDemo('m2', 'gasto', 90_000, '2026-11-05T10:00:00Z'),
  movimientoDemo('m3', 'compromiso', 15_000, '2026-11-10T10:00:00Z'),
  movimientoDemo('m4', 'gasto', 55_330, '2026-11-18T15:00:00Z'),
];
