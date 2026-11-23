/**
 * Metricas del producto para HOY (issue #55).
 *
 * No redefine lo que ya existe: son los tipos de la agregacion que **compone** las
 * salidas de `servirDelDia` (`packages/domain/src/servicio.ts`) y de
 * `agregadoEntreOllas` (`packages/domain/src/reporte.ts`). Aca solo viven las
 * formas; el calculo esta en `packages/domain/src/metricas.ts` y no recalcula la
 * racion ni el volumen por categoria: los reutiliza.
 *
 * Reglas:
 * - Enteros para conteos y gramos; el volumen se mide como en `reporte.ts`
 *   (suma de `Math.abs(delta)`, nunca un saldo con signo).
 * - Sin identidades: `padronPorCategoria` cuenta personas por `categoria`, jamas
 *   expone un `codigoP` ni un nombre.
 */
import { z } from 'zod';

/** Personas vigentes (`deletedAt === null`) por categoria del padron. */
export const padronPorCategoriaSchema = z.record(z.string(), z.number().int().min(0));
export type PadronPorCategoria = z.infer<typeof padronPorCategoriaSchema>;

/** Gramos por grupo etario, sumados sobre las opciones servidas. */
export const gramosPorGrupoSchema = z.record(z.string(), z.number());
export type GramosPorGrupo = z.infer<typeof gramosPorGrupoSchema>;

/** Volumen movido por categoria (misma forma de `FilaAgregado.volumen`). */
export const volumenPorCategoriaSchema = z.record(z.string(), z.number());
export type VolumenPorCategoria = z.infer<typeof volumenPorCategoriaSchema>;

/**
 * Agregacion tipada del dia. Cada campo trae su fuente:
 * - `racionesTotales`: suma de `RacionOpcion.total` de `servirDelDia`.
 * - `gramosPorGrupo`: suma de `RacionOpcion.porGrupo[].raciones` por grupo.
 * - `volumenPorCategoria`: suma de `agregadoEntreOllas(...).filas[].volumen`.
 * - `padronPorCategoria`: conteo de personas vigentes por `categoria`.
 */
export const metricasDelDiaSchema = z.object({
  racionesTotales: z.number().int().min(0),
  gramosPorGrupo: gramosPorGrupoSchema,
  volumenPorCategoria: volumenPorCategoriaSchema,
  padronPorCategoria: padronPorCategoriaSchema,
});
export type MetricasDelDia = z.infer<typeof metricasDelDiaSchema>;
