import type { Movimiento } from './dominio';

const AT = '2026-11-10T09:00:00.000Z';

/**
 * Helper local, duplicado a proposito con `features/solicitud/fixtures.ts`:
 * moverlo a un módulo compartido de test exigiría importar fixtures de una
 * feature desde otra (o un paquete de test transversal), que es más acoplamiento
 * del que ahorra. Cada feature arma su fixture con lo que necesita.
 */
function movimiento(id: string, ollaId: string, insumoId: string, delta: number): Movimiento {
  return {
    id,
    ollaId,
    insumoId,
    delta,
    motivo: 'entrada',
    autor: 'test',
    at: AT,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    deviceId: 'dev',
    lamport: 1,
  };
}

export const PERIODO_DEMO = { desde: '2026-11-01', hasta: '2026-11-30' } as const;

/** Incluye un `P-XXXX` y un alias de persona a proposito: no deben salir. */
export const MOVIMIENTOS_ENTRE_OLLAS: readonly Movimiento[] = [
  movimiento('m1', 'olla_1', 'arroz', 20000),
  movimiento('m2', 'olla_2', 'frijol', 5000),
  movimiento('m3', 'olla_3', 'P-ABCD', 7000),
  movimiento('m4', 'olla_3', 'Alias de Juana', 3000),
];
