/**
 * Metricas del producto para HOY (issue #55).
 *
 * Regla del repo: **no reimplementar lo que ya existe**. Este modulo solo COMPONE:
 * - `servirDelDia` (`./servicio.ts`) ya calcula raciones por opcion y gramos por grupo.
 * - `agregadoEntreOllas` (`./reporte.ts`) ya calcula volumen por categoria.
 * Lo unico nuevo es `padronPorCategoria` (conteo de personas vigentes por categoria),
 * que ninguno de los dos entrega.
 *
 * Puro: sin reloj, sin red, sin azar. Recibe la salida de `servirDelDia` ya calculada
 * (`ResultadoServicio`) y los movimientos con fecha asentada; no vuelve a contar
 * personas por grupo ni a multiplicar porciones.
 *
 * `padronPorCategoria` NO expone identidades: solo cuenta personas por categoria.
 */
import type {
  MetricasDelDia,
  Movimiento,
  Persona,
} from '@hackods/contracts';

import type { ResultadoServicio } from './servicio.js';
import type { OllaFicticia, Periodo } from './reporte.js';
import { agregadoEntreOllas, OLLAS_DEMO } from './reporte.js';

/**
 * Raciones totales del dia: suma de `RacionOpcion.total` de cada opcion servida.
 * Si una opcion no existe (sin plantilla), el total es 0, no `undefined`.
 */
export function racionesTotales(servicio: ResultadoServicio): number {
  return servicio.opciones.reduce((total, opcion) => total + opcion.total, 0);
}

/**
 * Gramos por grupo etario, sumando `RacionPorGrupo.raciones` (personas x porcion)
 * de TODAS las opciones. Se toma el valor ya calculado por `servirDelDia`; no se
 * multiplica otra vez.
 */
export function gramosPorGrupo(servicio: ResultadoServicio): Readonly<Record<string, number>> {
  const porGrupo: Record<string, number> = {};
  for (const opcion of servicio.opciones) {
    for (const fila of opcion.porGrupo) {
      porGrupo[fila.grupo] = (porGrupo[fila.grupo] ?? 0) + fila.raciones;
    }
  }
  return porGrupo;
}

/**
 * Volumen movido por categoria para el periodo, sumando las tres ollas del
 * agregado. Reutiliza `agregadoEntreOllas`; el filtro de identidad vive alli.
 */
export function volumenPorCategoria(
  movimientos: readonly Movimiento[],
  periodo: Periodo,
  ollas: readonly OllaFicticia[] = OLLAS_DEMO,
): Readonly<Record<string, number>> {
  const agregado = agregadoEntreOllas(movimientos, periodo, ollas);
  const porCategoria: Record<string, number> = {};
  for (const fila of agregado.filas) {
    for (const [categoria, volumen] of Object.entries(fila.volumen)) {
      porCategoria[categoria] = (porCategoria[categoria] ?? 0) + volumen;
    }
  }
  return porCategoria;
}

/**
 * Conteo de personas vigentes (`deletedAt === null`) por `categoria`. Lo unico
 * nuevo de esta agregacion: `servirDelDia` cuenta por GRUPO etario, no por
 * categoria del padron, y esa distincion importa (una baja logica no come).
 */
export function padronPorCategoria(personas: readonly Persona[]): Readonly<Record<string, number>> {
  const porCategoria: Record<string, number> = {};
  for (const persona of personas) {
    if (persona.deletedAt !== null) continue;
    porCategoria[persona.categoria] = (porCategoria[persona.categoria] ?? 0) + 1;
  }
  return porCategoria;
}

/**
 * Agregacion tipada del dia: compone las cuatro metricas en un objeto.
 *
 * @param servicio la salida YA calculada de `servirDelDia` (no se recalcula)
 * @param movimientos movimientos del periodo (con `at` asentado)
 * @param personas padron vigente; las bajas logicas se filtran en `padronPorCategoria`
 * @param periodo ventana del volumen por categoria
 * @param ollas las ollas del agregado (por defecto las tres demo)
 */
export function metricasDelDia(
  servicio: ResultadoServicio,
  movimientos: readonly Movimiento[],
  personas: readonly Persona[],
  periodo: Periodo,
  ollas: readonly OllaFicticia[] = OLLAS_DEMO,
): MetricasDelDia {
  return {
    racionesTotales: racionesTotales(servicio),
    gramosPorGrupo: gramosPorGrupo(servicio),
    volumenPorCategoria: volumenPorCategoria(movimientos, periodo, ollas),
    padronPorCategoria: padronPorCategoria(personas),
  };
}
