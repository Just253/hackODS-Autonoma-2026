/**
 * Puente al dominio para solicitudes entre ollas (#18). La logica NO vive aca:
 * las transiciones y el movimiento generado salen de `@hackods/domain`.
 */
export {
  crearSolicitud,
  resolverSolicitud,
  TransicionInvalida,
  UnidadNoSoportada,
  type DecisionSolicitud,
  type EstadoSolicitudDominio,
  type NuevaSolicitud,
  type ResultadoResolucion,
  type SolicitudEntreOllas,
} from '@hackods/domain';

export type { Movimiento, SolicitudItem } from '@hackods/contracts';
