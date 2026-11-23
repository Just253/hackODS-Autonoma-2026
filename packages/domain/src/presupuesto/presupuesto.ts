/**
 * Presupuesto por olla: A/G/C/D, consumo, proyeccion al cierre y alertas 80/100.
 *
 * Referencia: `docs/contracts/comprobantes.md` §7. Todo se calcula desde
 * `MovimientoPresupuesto` append-only (nunca desde columnas mutables).
 *
 * El corte es un snapshot: solo entran movimientos con `asentadoEn <= corte.instante`.
 * `montoCentavos` ya viene con signo: no se suman valores absolutos.
 */
import type {
  Centimos,
  MovimientoPresupuesto,
  TipoMovimientoPresupuesto,
} from '@hackods/contracts';

import { diasEntre, instanteAnteriorOIgual, redondearMitadArriba } from '../aritmetica.js';

const TIPOS_ASIGNACION: readonly TipoMovimientoPresupuesto[] = [
  'asignacion',
  'ajuste',
  'traslado_entrada',
  'traslado_salida',
];

const TIPOS_GASTO: readonly TipoMovimientoPresupuesto[] = ['gasto', 'credito', 'anulacion'];

const TIPOS_COMPROMISO: readonly TipoMovimientoPresupuesto[] = [
  'compromiso',
  'liberacion_compromiso',
];

export interface CortePresupuesto {
  readonly presupuestoId: string;
  /** Instante del snapshot (`asentadoEn <= instante`). */
  readonly instante: string;
  /** Dia de negocio en `America/Lima` (`YYYY-MM-DD`), nunca derivado de un UTC crudo. */
  readonly fechaNegocio: string;
  readonly periodoDesde: string;
  readonly periodoHasta: string;
}

export type TipoAlertaPresupuesto = 'presupuesto_80' | 'presupuesto_100' | 'proyeccion_excede';

export interface AlertaPresupuesto {
  readonly tipo: TipoAlertaPresupuesto;
  readonly severidad: 'atencion' | 'critica';
  /** Una alerta por periodo y version, no por comprobante (docs/contracts/comprobantes.md §7.3). */
  readonly claveDedup: string;
}

export interface ResultadoPresupuesto {
  readonly asignado: Centimos;
  readonly gastado: Centimos;
  readonly comprometido: Centimos;
  readonly disponible: Centimos;
  /** 10 000 = 100 %; `null` si el asignado es 0 (nunca un 100 % falso). */
  readonly consumoBp: number | null;
  readonly diasTranscurridos: number;
  readonly diasRestantes: number;
  readonly tasaConsumoCentimosPorDia: number | null;
  /** Proyeccion lineal al cierre; `null` si el periodo no empezo. */
  readonly proyeccionCentimos: Centimos | null;
  readonly pisoComprometidoCentimos: Centimos;
  readonly desvioCentimos: Centimos;
  /** Con menos de 3 dias la proyeccion no es defendible y no dispara alerta. */
  readonly muestraInsuficiente: boolean;
  readonly alertas: readonly AlertaPresupuesto[];
}

function comoCentimos(valor: number): Centimos {
  return valor as Centimos;
}

function sumarPorTipos(
  movimientos: readonly MovimientoPresupuesto[],
  tipos: readonly TipoMovimientoPresupuesto[],
): number {
  return movimientos
    .filter((movimiento) => tipos.includes(movimiento.tipo))
    .reduce((total, movimiento) => total + Number(movimiento.montoCentavos), 0);
}

/**
 * Calcula el presupuesto en un corte. Es una funcion pura: recibe los movimientos
 * del periodo y devuelve el snapshot; no consulta reloj, red ni base de datos.
 */
export function calcularPresupuesto(
  movimientos: readonly MovimientoPresupuesto[],
  corte: CortePresupuesto,
): ResultadoPresupuesto {
  const enCorte = movimientos.filter((movimiento) =>
    instanteAnteriorOIgual(movimiento.asentadoEn, corte.instante),
  );

  const asignado = sumarPorTipos(enCorte, TIPOS_ASIGNACION);
  const gastado = sumarPorTipos(enCorte, TIPOS_GASTO);
  const comprometido = sumarPorTipos(enCorte, TIPOS_COMPROMISO);
  const disponible = asignado - gastado - comprometido;

  const consumoBp =
    asignado > 0 ? redondearMitadArriba((10_000 * (gastado + comprometido)) / asignado) : null;

  const periodoEmpezo = diasEntre(corte.periodoDesde, corte.fechaNegocio) >= 0;
  const diasTranscurridos = periodoEmpezo
    ? Math.max(0, diasEntre(corte.periodoDesde, minimo(corte.fechaNegocio, corte.periodoHasta)) + 1)
    : 0;
  const diasRestantes = Math.max(0, diasEntre(corte.fechaNegocio, corte.periodoHasta));

  const tasaConsumo = diasTranscurridos > 0 ? gastado / Math.max(1, diasTranscurridos) : null;

  const proyeccion =
    periodoEmpezo && tasaConsumo !== null
      ? gastado + redondearMitadArriba(tasaConsumo * diasRestantes)
      : null;

  const pisoComprometido = gastado + comprometido;
  const desvio = Math.max(proyeccion ?? pisoComprometido, pisoComprometido) - asignado;
  const muestraInsuficiente = diasTranscurridos < 3;

  const alertas: AlertaPresupuesto[] = [];
  const clave = (tipo: string): string => `${tipo}:${corte.presupuestoId}`;

  if (consumoBp !== null && consumoBp >= 8_000) {
    alertas.push({ tipo: 'presupuesto_80', severidad: 'atencion', claveDedup: clave('presupuesto_80') });
  }
  if (consumoBp !== null && consumoBp >= 10_000) {
    alertas.push({
      tipo: 'presupuesto_100',
      severidad: 'critica',
      claveDedup: clave('presupuesto_100'),
    });
  }
  if (
    !muestraInsuficiente &&
    proyeccion !== null &&
    Math.max(proyeccion, pisoComprometido) > asignado &&
    (consumoBp === null || consumoBp < 10_000)
  ) {
    alertas.push({
      tipo: 'proyeccion_excede',
      severidad: 'atencion',
      claveDedup: `proyeccion:${corte.presupuestoId}:${corte.fechaNegocio}`,
    });
  }

  return {
    asignado: comoCentimos(asignado),
    gastado: comoCentimos(gastado),
    comprometido: comoCentimos(comprometido),
    disponible: comoCentimos(disponible),
    consumoBp,
    diasTranscurridos,
    diasRestantes,
    tasaConsumoCentimosPorDia: tasaConsumo,
    proyeccionCentimos: proyeccion === null ? null : comoCentimos(proyeccion),
    pisoComprometidoCentimos: comoCentimos(pisoComprometido),
    desvioCentimos: comoCentimos(desvio),
    muestraInsuficiente,
    alertas,
  };
}

/** Fechas ISO comparables lexicograficamente. */
function minimo(a: string, b: string): string {
  return a < b ? a : b;
}
