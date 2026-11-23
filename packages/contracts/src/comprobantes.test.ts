import { describe, expect, it } from 'vitest';

import { esItemPresupuestable, itemPresupuestableSchema } from './comprobantes.js';
import {
  aCentimos,
  aMicrocentesimos,
  aMilesimas,
  type ComprobanteItem,
  type EstadoItemComprobante,
} from './finanzas.js';

/** Item valido segun `comprobanteItemSchema`; el `estado` es lo que varia en cada caso. */
function itemConEstado(estado: EstadoItemComprobante): ComprobanteItem {
  return {
    id: 'itm_01',
    comprobanteId: 'cmp_01',
    ollaId: 'olla_demo',
    lineaNo: 1,
    descripcionCruda: 'ARROZ EXTRA 1 SACO 50KG',
    cantidadCruda: '1',
    unidadCruda: 'saco',
    presentacionCruda: '50KG',
    cantidadMilesimas: aMilesimas(50_000_000),
    unidadBase: 'g',
    equivalenciaId: 'eq_01',
    precioUnitarioCrudoCentavos: aCentimos(24_000),
    totalLineaCentavos: aCentimos(24_000),
    descuentoLineaCentavos: aCentimos(0),
    totalNetoCentavos: aCentimos(24_000),
    igvLineaCentavos: null,
    totalNetoConIgvCentavos: aCentimos(24_000),
    esPesoVariable: false,
    productoId: 'prd_arroz',
    productoConfianza: 0.93,
    estado,
    motivoEstado: null,
    origenValor: 'comprobante',
    precioMicrocentPorBase: aMicrocentesimos(480),
    excluidoDeSerie: false,
    createdAt: '2026-11-18T15:00:00Z',
    updatedAt: '2026-11-18T15:00:00Z',
    deletedAt: null,
    deviceId: 'device_demo',
    lamport: 1,
  };
}

describe('D8: un item no confirmado no afecta el presupuesto', () => {
  it('un item confirmado pasa el refinado y el guard', () => {
    const item = itemConEstado('confirmado');

    expect(itemPresupuestableSchema.safeParse(item).success).toBe(true);
    expect(esItemPresupuestable(item)).toBe(true);
  });

  it.each(['por_revisar', 'clasificado', 'extraido', 'normalizado', 'excluido'] as const)(
    'un item en %s NO pasa el refinado ni el guard',
    (estado) => {
      const item = itemConEstado(estado);

      expect(itemPresupuestableSchema.safeParse(item).success).toBe(false);
      expect(esItemPresupuestable(item)).toBe(false);
    },
  );

  it('el mensaje de error nombra la regla y el presupuesto', () => {
    const resultado = itemPresupuestableSchema.safeParse(itemConEstado('por_revisar'));

    expect(resultado.success).toBe(false);
    const mensaje = resultado.error?.issues[0]?.message ?? '';
    expect(mensaje).toContain('presupuesto');
    expect(mensaje).toContain('no confirmado');
  });
});
