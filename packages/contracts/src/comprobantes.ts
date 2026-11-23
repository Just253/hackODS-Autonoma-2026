import { z } from 'zod';

import { comprobanteItemSchema, type ComprobanteItem } from './finanzas.js';

/**
 * Invariante D8: **nada entra al presupuesto sin confirmacion humana**.
 * Un item de comprobante solo puede afectar el presupuesto si una persona lo confirmo
 * (`docs/contracts/comprobantes.md` §0.3; `docs/DECISIONES.md` D8).
 */
export const itemPresupuestableSchema = comprobanteItemSchema.refine(
  (item) => item.estado === 'confirmado',
  { message: 'un item no confirmado no afecta el presupuesto (D8)', path: ['estado'] },
);
export type ItemPresupuestable = z.infer<typeof itemPresupuestableSchema>;

/** Guard para consumidores que ya tienen un `ComprobanteItem` en memoria. */
export function esItemPresupuestable(item: Pick<ComprobanteItem, 'estado'>): boolean {
  return item.estado === 'confirmado';
}
