/**
 * Serie de precios: mediana movil + filtro MAD (z > 3,5) + guarda P50/3 .. 3xP50.
 *
 * Referencia: `docs/contracts/comprobantes.md` §8. La serie se separa por
 * producto, unidad base y canal; nunca se mezclan (D8).
 *
 * Decisiones de implementacion:
 * - `medianaMovil` trabaja sobre la ventana que recibe y toma las ultimas `n`
 *   observaciones por fecha. El filtro no borra filas: las marca `excluida`.
 * - La guarda de cordura usa `p50Referencia` (P50 estable del producto) o lo
 *   deriva de observaciones con mas de 7 dias de antiguedad respecto de
 *   `fechaReferencia`. Sin base, la guarda se omite.
 */
import type { Microcentesimos } from '@hackods/contracts';

import { mediana } from '../aritmetica.js';
import { MAD_Z, N_MEDIANA } from '../clasificacion/config.js';

export interface ObservacionPrecio {
  readonly id: string;
  readonly valor: Microcentesimos;
  readonly fecha: string;
}

export interface OpcionesSerie {
  /** Observaciones de la mediana movil (P1: 7). */
  readonly n?: number;
  /** Minimo para publicar tendencia (P1: 3). */
  readonly nMin?: number;
  /** Umbral del z modificado (P3: 3,5). */
  readonly madZ?: number;
  /** P50 estable en microcentesimos; si falta se deriva o se omite la guarda. */
  readonly p50Referencia?: Microcentesimos | null;
  /** Fecha de negocio para derivar el P50 estable (`YYYY-MM-DD`). */
  readonly fechaReferencia?: string;
  /** Antiguedad minima de una observacion para entrar al P50 estable (7 dias). */
  readonly diasP50Estable?: number;
}

export type MotivoExclusion = 'mad' | 'fuera_de_rango';

export interface ObservacionEvaluada {
  readonly id: string;
  readonly valor: Microcentesimos;
  readonly excluida: boolean;
  readonly motivo: MotivoExclusion | null;
  /** z modificado; `null` si MAD = 0 (se aplica la regla de respaldo). */
  readonly z: number | null;
}

export interface ResultadoSerie {
  readonly evaluadas: readonly ObservacionEvaluada[];
  readonly mediana: Microcentesimos | null;
  readonly mad: Microcentesimos | null;
  readonly minimo: Microcentesimos | null;
  readonly maximo: Microcentesimos | null;
  /** Menos de `nMin` observaciones utiles: se muestra el precio actual, no una flecha. */
  readonly muestraInsuficiente: boolean;
  readonly p50Referencia: Microcentesimos | null;
}

function comoMicro(valor: number): Microcentesimos {
  return valor as Microcentesimos;
}

function p50Estable(
  observaciones: readonly ObservacionPrecio[],
  opciones: OpcionesSerie,
): number | null {
  if (opciones.p50Referencia !== undefined && opciones.p50Referencia !== null) {
    return Number(opciones.p50Referencia);
  }
  const referencia = opciones.fechaReferencia;
  if (referencia === undefined) {
    return null;
  }
  const dias = opciones.diasP50Estable ?? 7;
  const limite = new Date(Date.parse(`${referencia}T00:00:00Z`) - dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const antiguas = observaciones.filter((observacion) => observacion.fecha <= limite);
  return mediana(antiguas.map((observacion) => Number(observacion.valor)));
}

/**
 * Calcula la mediana movil y marca los outliers de la serie.
 * No ordena por `id`: la fecha manda; el id desempata.
 */
export function medianaMovil(
  observaciones: readonly ObservacionPrecio[],
  opciones: OpcionesSerie = {},
): ResultadoSerie {
  const n = opciones.n ?? N_MEDIANA;
  const nMin = opciones.nMin ?? 3;
  const madZ = opciones.madZ ?? MAD_Z;

  const ordenadas = [...observaciones].sort((a, b) => {
    if (a.fecha === b.fecha) {
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    }
    return a.fecha < b.fecha ? -1 : 1;
  });
  const ventana = ordenadas.slice(Math.max(0, ordenadas.length - n));

  if (ventana.length === 0) {
    return {
      evaluadas: [],
      mediana: null,
      mad: null,
      minimo: null,
      maximo: null,
      muestraInsuficiente: true,
      p50Referencia: null,
    };
  }

  const valores = ventana.map((observacion) => Number(observacion.valor));
  const centro = mediana(valores);
  const p50 = p50Estable(ordenadas, opciones);

  const desviaciones = centro === null ? [] : valores.map((valor) => Math.abs(valor - centro));
  const mad = mediana(desviaciones);

  const evaluadas: ObservacionEvaluada[] = ventana.map((observacion, indice) => {
    const valor = valores[indice] ?? Number(observacion.valor);
    const fueraDeRango =
      p50 !== null && p50 > 0 && (valor < p50 / 3 || valor > p50 * 3);
    if (fueraDeRango) {
      return { id: observacion.id, valor: observacion.valor, excluida: true, motivo: 'fuera_de_rango', z: null };
    }

    if (centro === null || mad === null) {
      return { id: observacion.id, valor: observacion.valor, excluida: false, motivo: null, z: null };
    }
    if (mad === 0) {
      const respaldo = centro > 0 && Math.abs(valor - centro) > 3 * centro;
      return {
        id: observacion.id,
        valor: observacion.valor,
        excluida: respaldo,
        motivo: respaldo ? 'mad' : null,
        z: null,
      };
    }
    const z = (0.6745 * (valor - centro)) / mad;
    const outlier = Math.abs(z) > madZ;
    return {
      id: observacion.id,
      valor: observacion.valor,
      excluida: outlier,
      motivo: outlier ? 'mad' : null,
      z,
    };
  });

  const validos = evaluadas.filter((observacion) => !observacion.excluida).map((o) => Number(o.valor));
  const muestraInsuficiente = validos.length < nMin;
  const medianaFinal = muestraInsuficiente ? null : mediana(validos);
  const minimo = validos.length > 0 ? Math.min(...validos) : null;
  const maximo = validos.length > 0 ? Math.max(...validos) : null;

  return {
    evaluadas,
    mediana: medianaFinal === null ? null : comoMicro(medianaFinal),
    mad: mad === null ? null : comoMicro(mad),
    minimo: minimo === null ? null : comoMicro(minimo),
    maximo: maximo === null ? null : comoMicro(maximo),
    muestraInsuficiente,
    p50Referencia: p50 === null ? null : comoMicro(p50),
  };
}
