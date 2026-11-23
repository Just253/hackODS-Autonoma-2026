/**
 * Puente al dominio. La lógica NO vive acá: se reexporta de `@hackods/domain`
 * (la regla es del paquete, `packages/domain/src/presupuesto/presupuesto.ts`).
 * Si un cálculo falta, se agrega en `packages/domain`, no en `apps/web`.
 */
export {
  calcularPresupuesto,
  type CortePresupuesto,
  type ResultadoPresupuesto,
  type AlertaPresupuesto,
  type TipoAlertaPresupuesto,
} from '@hackods/domain';
