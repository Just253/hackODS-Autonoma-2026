/**
 * Receta -> produccion -> descuento -> costo -> faltante.
 *
 * Referencia: `docs/DECISIONES.md` D3/D4 (menu firmado + porcion por grupo;
 * movimientos append-only) y el issue #72.
 *
 * Reglas que este archivo hace cumplir:
 * - Puro y determinista: sin React, sin Dexie, sin red, sin reloj.
 * - Los gramos de una receta son POR PORCION BASE. La porcion firmada de cada
 *   grupo se aplica como factor (`porcion del grupo / porcion base`); si el
 *   grupo no tiene porcion firmada se usa la base tal cual y se declara
 *   `porcion_base`, nunca se inventa un factor.
 * - Cantidades en gramos enteros, redondeadas una sola vez por linea con
 *   `round_half_up`.
 * - El costo es `gramos x precio por unidad base`. Sin precio, `null`
 *   (`sin dato`): el total no se completa con un promedio.
 * - Una sustitucion solo se aplica si el llamador la elige y esta aprobada en
 *   la plantilla. Este archivo lista y aplica; jamas reemplaza por su cuenta.
 * - No hay saldo mutable: `movimientosDeSalida` devuelve deltas negativos y
 *   `saldoDespensa` (racion.ts) los suma.
 */
import type { GrupoEtario, TipoServicio, UnidadBase } from '@hackods/contracts';

import { redondearMitadArriba } from './aritmetica.js';
import { DatoFaltante, ErrorDominio } from './errors.js';
import type { SustitucionAplicada } from './servicio.js';

/** Unidad en la que viene observado un precio. La canonica es `UnidadBase`. */
export type UnidadPrecio = UnidadBase | 'kg' | 'l';

export interface IngredientePorcion {
  readonly insumoId: string;
  /** Gramos (o unidad base) por porcion base. `null` = sin cantidad. */
  readonly gramosPorPorcion: number | null;
}

/** Receta irreducible a una lista de ingredientes por porcion base. */
export interface RecetaProducible {
  readonly id: string;
  readonly titulo: string;
  /** Gramos de la porcion firmada que se toma como base (adulto en el seed). */
  readonly porcionBaseGramos: number;
  readonly ingredientes: readonly IngredientePorcion[];
}

/** Fila de una receta con los gramos que aporta cada grupo. */
export interface NecesidadPorGrupo {
  readonly grupo: GrupoEtario;
  readonly comensales: number;
  readonly gramos: number;
}

export interface NecesidadInsumo {
  readonly insumoId: string;
  /** Total para todos los comensales, en gramos enteros. */
  readonly gramos: number;
  readonly porGrupo: readonly NecesidadPorGrupo[];
}

export type OrigenFactor = 'porcion_firmada' | 'porcion_base';

export interface GrupoConPorcion {
  readonly grupo: GrupoEtario;
  readonly comensales: number;
  /** Porcion firmada del grupo, en gramos. `null` = este grupo no tiene. */
  readonly porcionFirmadaGramos: number | null;
  /** Factor aplicado a los gramos por porcion base. */
  readonly factor: number;
  readonly origenFactor: OrigenFactor;
}

export interface ExplosionReceta {
  readonly porGrupo: readonly GrupoConPorcion[];
  readonly necesidades: readonly NecesidadInsumo[];
  readonly totalComensales: number;
  /** Ingredientes sin gramos: viajan como `sin dato`, no como cero. */
  readonly insumosSinGramos: readonly string[];
  /** Grupos sin porcion firmada: usan la base y la pantalla lo dice. */
  readonly gruposSinPorcionFirmada: readonly GrupoEtario[];
}

export type ComensalesPorGrupo = Readonly<Partial<Record<GrupoEtario, number>>>;

/**
 * Explota una receta para los comensales de cada grupo.
 *
 * `porcionesFirmadas` son los gramos que el nutricionista firmo por grupo
 * (`portion.cantidad` del menu). Si un grupo no aparece, se usa la porcion base
 * con factor 1 y el resultado lo declara en `gruposSinPorcionFirmada`.
 */
export function explotarIngredientes(
  receta: RecetaProducible,
  comensales: ComensalesPorGrupo,
  porcionesFirmadas: ComensalesPorGrupo = {},
): ExplosionReceta {
  if (!Number.isFinite(receta.porcionBaseGramos) || receta.porcionBaseGramos <= 0) {
    throw new DatoFaltante(
      `la receta ${receta.id} no declara una porcion base en gramos mayor que cero`,
    );
  }

  const grupos: GrupoConPorcion[] = [];
  for (const [grupo, cantidad] of Object.entries(comensales) as [GrupoEtario, number][]) {
    if (!Number.isInteger(cantidad) || cantidad < 0) {
      throw new ErrorDominio(
        `comensales de ${grupo}: se espera un entero >= 0, llego "${cantidad}"`,
      );
    }
    if (cantidad === 0) continue;

    const firmada = porcionesFirmadas[grupo];
    const valida = firmada !== undefined && firmada > 0;
    grupos.push({
      grupo,
      comensales: cantidad,
      porcionFirmadaGramos: valida ? firmada : null,
      factor: valida ? firmada / receta.porcionBaseGramos : 1,
      origenFactor: valida ? 'porcion_firmada' : 'porcion_base',
    });
  }

  const sinGramos: string[] = [];
  const porInsumo = new Map<string, NecesidadPorGrupo[]>();

  for (const ingrediente of receta.ingredientes) {
    if (ingrediente.gramosPorPorcion === null) {
      if (!sinGramos.includes(ingrediente.insumoId)) sinGramos.push(ingrediente.insumoId);
      continue;
    }
    if (!Number.isFinite(ingrediente.gramosPorPorcion) || ingrediente.gramosPorPorcion < 0) {
      throw new ErrorDominio(
        `gramos por porcion de ${ingrediente.insumoId}: se espera un numero >= 0`,
      );
    }

    for (const grupo of grupos) {
      const gramos = redondearMitadArriba(
        ingrediente.gramosPorPorcion * grupo.comensales * grupo.factor,
      );
      if (gramos === 0) continue;
      const lineas = porInsumo.get(ingrediente.insumoId) ?? [];
      lineas.push({ grupo: grupo.grupo, comensales: grupo.comensales, gramos });
      porInsumo.set(ingrediente.insumoId, lineas);
    }
  }

  const necesidades: NecesidadInsumo[] = [];
  for (const [insumoId, lineas] of porInsumo) {
    necesidades.push({
      insumoId,
      gramos: lineas.reduce((total, linea) => total + linea.gramos, 0),
      porGrupo: lineas,
    });
  }

  return {
    porGrupo: grupos,
    necesidades,
    totalComensales: grupos.reduce((total, grupo) => total + grupo.comensales, 0),
    insumosSinGramos: sinGramos,
    gruposSinPorcionFirmada: grupos
      .filter((grupo) => grupo.origenFactor === 'porcion_base')
      .map((grupo) => grupo.grupo),
  };
}

/** Lo minimo para costear o descontar: que insumo y cuanto. */
export interface RequerimientoInsumo {
  readonly insumoId: string;
  readonly gramos: number;
}

/** Precio por unidad base en microcentesimos (1 sol = 1 000 000). */
export interface PrecioInsumo {
  readonly microPorUnidadBase: number | null;
}

export type PreciosPorInsumo = Readonly<Record<string, PrecioInsumo | undefined>>;

export interface LineaCosto {
  readonly insumoId: string;
  readonly gramos: number;
  readonly microPorUnidadBase: number | null;
  /** `null` = sin dato; nunca 0 por falta de precio. */
  readonly costoMicro: number | null;
}

export interface CostoReceta {
  readonly lineas: readonly LineaCosto[];
  /** `null` si falta el precio de algun insumo: el total no se inventa. */
  readonly totalMicro: number | null;
  /** Suma de las lineas con precio, para explicar sin presentarla como total. */
  readonly totalConocidoMicro: number;
  readonly porRacionMicro: number | null;
  readonly insumosSinPrecio: readonly string[];
}

/** Costo total y por racion de lo que se va a cocinar. */
export function costoDeReceta(
  requerimientos: readonly RequerimientoInsumo[],
  precios: PreciosPorInsumo,
  raciones: number,
): CostoReceta {
  const lineas: LineaCosto[] = [];
  const insumosSinPrecio: string[] = [];
  let totalConocidoMicro = 0;

  for (const requerimiento of requerimientos) {
    const precio = precios[requerimiento.insumoId]?.microPorUnidadBase ?? null;
    const valido = precio !== null && Number.isFinite(precio) && precio >= 0;
    if (!valido) insumosSinPrecio.push(requerimiento.insumoId);
    const costoMicro = valido
      ? redondearMitadArriba(requerimiento.gramos * precio)
      : null;
    if (costoMicro !== null) totalConocidoMicro += costoMicro;
    lineas.push({
      insumoId: requerimiento.insumoId,
      gramos: requerimiento.gramos,
      microPorUnidadBase: valido ? precio : null,
      costoMicro,
    });
  }

  const totalMicro = insumosSinPrecio.length === 0 ? totalConocidoMicro : null;
  const porRacionMicro =
    totalMicro !== null && raciones > 0 ? redondearMitadArriba(totalMicro / raciones) : null;

  return { lineas, totalMicro, totalConocidoMicro, porRacionMicro, insumosSinPrecio };
}

/**
 * Pasa un precio observado a la unidad base del insumo.
 *
 * Solo usa equivalencias declaradas (`kg`/`l` son metricas; `gramosPorUnidad`
 * es del catalogo). g <-> ml devuelve `null`: sin densidad no hay conversion.
 */
export function precioPorUnidadBase(
  precioMicro: number,
  unidadPrecio: UnidadPrecio,
  unidadBase: UnidadBase,
  gramosPorUnidad: number | null,
): number | null {
  if (!Number.isFinite(precioMicro) || precioMicro < 0) return null;

  // Precio por gramo / por mililitro / por unidad, segun corresponda.
  let porGramo: number | null = null;
  let porMl: number | null = null;
  let porUnidad: number | null = null;
  switch (unidadPrecio) {
    case 'g':
      porGramo = precioMicro;
      break;
    case 'kg':
      porGramo = precioMicro / 1000;
      break;
    case 'ml':
      porMl = precioMicro;
      break;
    case 'l':
      porMl = precioMicro / 1000;
      break;
    case 'unidad':
      porUnidad = precioMicro;
      break;
  }

  const equivalencia =
    gramosPorUnidad !== null && Number.isFinite(gramosPorUnidad) && gramosPorUnidad > 0
      ? gramosPorUnidad
      : null;

  let resultado: number | null = null;
  switch (unidadBase) {
    case 'g':
      if (porGramo !== null) resultado = porGramo;
      else if (porUnidad !== null && equivalencia !== null) resultado = porUnidad / equivalencia;
      break;
    case 'ml':
      if (porMl !== null) resultado = porMl;
      break;
    case 'unidad':
      if (porUnidad !== null) resultado = porUnidad;
      else if (porGramo !== null && equivalencia !== null) resultado = porGramo * equivalencia;
      break;
  }

  if (resultado === null || !Number.isFinite(resultado)) return null;
  return redondearMitadArriba(resultado);
}

export interface FaltanteInsumo {
  readonly insumoId: string;
  readonly requerido: number;
  readonly disponible: number;
  readonly faltan: number;
}

/** Compara lo necesario con el saldo derivado; solo lista lo que NO alcanza. */
export function faltantesDeDespensa(
  requerimientos: readonly RequerimientoInsumo[],
  saldo: Readonly<Record<string, number>>,
): readonly FaltanteInsumo[] {
  const faltantes: FaltanteInsumo[] = [];
  for (const requerimiento of requerimientos) {
    if (requerimiento.gramos <= 0) continue;
    const disponible = saldo[requerimiento.insumoId] ?? 0;
    if (requerimiento.gramos > disponible) {
      faltantes.push({
        insumoId: requerimiento.insumoId,
        requerido: requerimiento.gramos,
        disponible,
        faltan: requerimiento.gramos - disponible,
      });
    }
  }
  return faltantes;
}

/** Equivalencia aprobada en la plantilla. Sin este registro no hay sustituto. */
export interface SustitucionAprobada {
  readonly id: string;
  readonly insumoOrigenId: string;
  readonly insumoDestinoId: string;
  readonly factor: number;
  readonly aprobadaPor: string;
}

export interface FaltanteConSustitutos {
  readonly faltante: FaltanteInsumo;
  readonly sustituciones: readonly SustitucionAprobada[];
  readonly estado: 'con sustituto' | 'sin sustituto';
}

/**
 * Lista las sustituciones aprobadas de cada faltante. No aplica nada: la
 * persona elige y `aplicarSustituciones` deja la eleccion registrada.
 */
export function sustitucionesParaFaltantes(
  faltantes: readonly FaltanteInsumo[],
  sustituciones: readonly SustitucionAprobada[],
): readonly FaltanteConSustitutos[] {
  return faltantes.map((faltante) => {
    const aprobadas = sustituciones.filter(
      (sustitucion) => sustitucion.insumoOrigenId === faltante.insumoId,
    );
    return {
      faltante,
      sustituciones: aprobadas,
      estado: aprobadas.length === 0 ? 'sin sustituto' : 'con sustituto',
    };
  });
}

export interface ResultadoSustitucion {
  readonly requerimientos: readonly RequerimientoInsumo[];
  /** Solo las sustituciones que se usaron de verdad. */
  readonly aplicadas: readonly SustitucionAplicada[];
}

/**
 * Reemplaza lo elegido por la persona: `gramos x factor` del insumo destino, y
 * suma si el destino ya estaba en la receta. Sin eleccion, el insumo queda.
 */
export function aplicarSustituciones(
  requerimientos: readonly RequerimientoInsumo[],
  elegidas: readonly SustitucionAprobada[],
): ResultadoSustitucion {
  const porOrigen = new Map<string, SustitucionAprobada>();
  for (const sustitucion of elegidas) {
    if (!porOrigen.has(sustitucion.insumoOrigenId)) {
      porOrigen.set(sustitucion.insumoOrigenId, sustitucion);
    }
  }

  const acumulado = new Map<string, number>();
  const aplicadas: SustitucionAplicada[] = [];

  for (const requerimiento of requerimientos) {
    const sustitucion = porOrigen.get(requerimiento.insumoId);
    if (sustitucion === undefined) {
      acumulado.set(
        requerimiento.insumoId,
        (acumulado.get(requerimiento.insumoId) ?? 0) + requerimiento.gramos,
      );
      continue;
    }
    const gramos = redondearMitadArriba(requerimiento.gramos * sustitucion.factor);
    acumulado.set(
      sustitucion.insumoDestinoId,
      (acumulado.get(sustitucion.insumoDestinoId) ?? 0) + gramos,
    );
    aplicadas.push({
      insumoOrigenId: sustitucion.insumoOrigenId,
      insumoDestinoId: sustitucion.insumoDestinoId,
      factor: sustitucion.factor,
      aprobadaPor: sustitucion.aprobadaPor,
    });
  }

  const resultado: RequerimientoInsumo[] = [];
  for (const [insumoId, gramos] of acumulado) {
    if (gramos > 0) resultado.push({ insumoId, gramos });
  }
  return { requerimientos: resultado, aplicadas };
}

/** Deltas de salida (negativos) para el almacen append-only. */
export function movimientosDeSalida(
  requerimientos: readonly RequerimientoInsumo[],
): readonly { readonly insumoId: string; readonly delta: number }[] {
  return requerimientos
    .filter((requerimiento) => requerimiento.gramos > 0)
    .map((requerimiento) => ({
      insumoId: requerimiento.insumoId,
      delta: -requerimiento.gramos,
    }));
}

// ---------------------------------------------------------------------------
// Cierre del servicio. Vive aca como tipo puro para que Dexie y la pantalla
// usen una sola forma; el contrato `Servicio` todavia no tiene comensales por
// grupo ni costo (eso necesita #62/#65 y una migracion aparte).
// ---------------------------------------------------------------------------

export interface CostoRegistrado {
  readonly totalMicro: number | null;
  readonly porRacionMicro: number | null;
  readonly insumosSinPrecio: readonly string[];
}

/** Servicio cocinado, append-only, con receta, comensales y auditoria. */
export interface ServicioDeReceta {
  readonly id: string;
  readonly ollaId: string;
  /** Fecha de negocio `YYYY-MM-DD` (America/Lima). */
  readonly fecha: string;
  readonly recetaId: string;
  readonly recetaTitulo: string;
  readonly tipo: TipoServicio;
  readonly comensalesPorGrupo: ComensalesPorGrupo;
  readonly totalComensales: number;
  /** `memberId` ficticio de quien cocino: nunca un nombre real (D2). */
  readonly cocinero: string;
  readonly rolCocinero: string;
  /** Checklist de inocuidad, no un calculo (D6). */
  readonly cocidoA75C: boolean;
  readonly costo: CostoRegistrado;
  readonly sustituciones: readonly SustitucionAplicada[];
  readonly movimientosIds: readonly string[];
  readonly createdAt: string;
}
