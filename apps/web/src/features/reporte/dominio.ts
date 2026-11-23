/**
 * Puente al dominio para el reporte entre ollas (#18). El filtro de identidad y
 * la agregacion viven en `@hackods/domain` (`agregadoEntreOllas`).
 */
export {
  agregadoEntreOllas,
  CATEGORIA_OTROS,
  OLLAS_DEMO,
  type AgregadoEntreOllas,
  type FilaAgregado,
  type OllaFicticia,
  type Periodo,
} from '@hackods/domain';

export type { Movimiento } from '@hackods/contracts';
