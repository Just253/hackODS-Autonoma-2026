/**
 * Recetario de demostracion de la olla.
 *
 * TODO ES FICTICIO Y ESTA MARCADO COMO TAL: ningun plato, precio, stock ni
 * aprobacion viene de una persona o establecimiento real. La porcion firmada y
 * los ingredientes del guiso salen de `supabase/seed.sql` (plantilla 301) para
 * que la demo local no contradiga el seed; el resto es andamiaje de pantalla.
 *
 * El calculo NO vive aca: la pantalla usa `explotarIngredientes`,
 * `costoDeReceta`, `faltantesDeDespensa` y `aplicarSustituciones` de
 * `@hackods/domain`. Este archivo solo son datos.
 */
import type { GrupoEtario, UnidadBase } from '@hackods/contracts';
import type { RecetaProducible, SustitucionAprobada } from '@hackods/domain';

export interface InsumoDemo {
  readonly id: string;
  /** Como se lee en la olla, sin la etiqueta de andamiaje. */
  readonly nombre: string;
  readonly unidadBase: UnidadBase;
  /** Equivalencia declarada; `null` = no hay dato (nunca se infiere). */
  readonly gramosPorUnidad: number | null;
}

export interface RecetaDemo extends RecetaProducible {
  /** Dos generales y dos para grupos vulnerables, como pide el issue #72. */
  readonly perfil: 'general' | 'vulnerable';
}

export const INSUMOS_DEMO: readonly InsumoDemo[] = [
  { id: 'arroz', nombre: 'Arroz', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'quinua', nombre: 'Quinua', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'papa', nombre: 'Papa', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'lentejas', nombre: 'Lentejas', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'zanahoria', nombre: 'Zanahoria', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'sangrecita', nombre: 'Sangrecita', unidadBase: 'g', gramosPorUnidad: null },
  { id: 'leche_evaporada', nombre: 'Leche evaporada', unidadBase: 'g', gramosPorUnidad: null },
] as const;

/**
 * Gramos de la porcion firmada por grupo (`portion.cantidad` del seed). Los
 * grupos que no estan aca usan la porcion base y la pantalla lo dice.
 */
export const PORCIONES_FIRMADAS_DEMO: Readonly<Partial<Record<GrupoEtario, number>>> = {
  adulto: 280,
  menor_5: 180,
  gestante: 320,
} as const;

/** Porcion base de los platos: la del adulto en el menu firmado del seed. */
const PORCION_BASE = 280;

export const RECETAS_DEMO: readonly RecetaDemo[] = [
  {
    id: 'receta-arroz-quinua',
    titulo: 'Arroz con quinua y papa',
    perfil: 'general',
    porcionBaseGramos: PORCION_BASE,
    ingredientes: [
      { insumoId: 'arroz', gramosPorPorcion: 70 },
      { insumoId: 'quinua', gramosPorPorcion: 30 },
      { insumoId: 'papa', gramosPorPorcion: 60 },
    ],
  },
  {
    id: 'receta-guiso-lentejas',
    titulo: 'Guiso de lentejas',
    perfil: 'general',
    porcionBaseGramos: PORCION_BASE,
    // Mismos gramos que `ingredient` del seed: lentejas 80 g y papa 120 g.
    ingredientes: [
      { insumoId: 'lentejas', gramosPorPorcion: 80 },
      { insumoId: 'papa', gramosPorPorcion: 120 },
      { insumoId: 'zanahoria', gramosPorPorcion: 40 },
    ],
  },
  {
    id: 'receta-sangrecita-papa',
    titulo: 'Sangrecita con papa',
    perfil: 'vulnerable',
    porcionBaseGramos: PORCION_BASE,
    ingredientes: [
      { insumoId: 'sangrecita', gramosPorPorcion: 60 },
      { insumoId: 'papa', gramosPorPorcion: 100 },
    ],
  },
  {
    id: 'receta-crema-quinua',
    titulo: 'Crema de quinua con leche',
    perfil: 'vulnerable',
    porcionBaseGramos: PORCION_BASE,
    ingredientes: [
      { insumoId: 'quinua', gramosPorPorcion: 45 },
      { insumoId: 'leche_evaporada', gramosPorPorcion: 60 },
    ],
  },
] as const;

export const RECETA_INICIAL = 'receta-arroz-quinua';

/**
 * Sustituciones aprobadas por la nutricionista de la demo. La unica que existe
 * en el seed es leche evaporada -> quinua (factor 1,20, plantilla 302). No se
 * agregan equivalencias nuevas: sin fila aprobada, la pantalla dice
 * `sin sustituto`.
 */
export const SUSTITUCIONES_DEMO: readonly SustitucionAprobada[] = [
  {
    id: 'subs-demo-leche-quinua',
    insumoOrigenId: 'leche_evaporada',
    insumoDestinoId: 'quinua',
    factor: 1.2,
    aprobadaPor: 'la nutricionista',
  },
] as const;

export interface EntradaDemo {
  readonly insumoId: string;
  readonly gramos: number;
}

/**
 * Stock inicial de demostracion, como MOVIMIENTOS de entrada append-only (no un
 * saldo mutable). Se siembra una sola vez por tablet, con ids estables.
 *
 * A proposito: la sangrecita alcanza para una sola porcion adulta (100 g) y la
 * leche evaporada no tiene stock, para que la demo muestre los dos caminos del
 * faltante: sin sustituto y con sustituto aprobado.
 */
export const ENTRADAS_DEMO: readonly EntradaDemo[] = [
  { insumoId: 'arroz', gramos: 20_000 },
  { insumoId: 'quinua', gramos: 2_000 },
  { insumoId: 'papa', gramos: 8_000 },
  { insumoId: 'lentejas', gramos: 3_000 },
  { insumoId: 'zanahoria', gramos: 2_000 },
  { insumoId: 'sangrecita', gramos: 100 },
] as const;

/** Autor ficticio de las entradas de demo: nunca una persona real. */
export const AUTOR_DEMO = 'demo-ficticio';

export interface GrupoDemo {
  readonly grupo: GrupoEtario;
  readonly etiqueta: string;
}

/** Grupos que ofrece la pantalla. `adulto_mayor` no tiene porcion firmada. */
export const GRUPOS_DEMO: readonly GrupoDemo[] = [
  { grupo: 'adulto', etiqueta: 'Adultos' },
  { grupo: 'menor_5', etiqueta: 'Niños y niñas menores de 5' },
  { grupo: 'gestante', etiqueta: 'Gestantes' },
  { grupo: 'adulto_mayor', etiqueta: 'Adultos mayores' },
] as const;
