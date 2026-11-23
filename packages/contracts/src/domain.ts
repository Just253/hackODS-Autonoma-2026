/**
 * Contratos v1 del dominio. Fuente de verdad de los tipos que cruzan paquetes.
 *
 * Reglas:
 * - Los tipos se infieren de los schemas Zod: no se escriben dos veces.
 * - Nada de valores nutricionales ni reglas clinicas aca.
 * - Toda entidad sincronizable lleva `SyncMeta` (ver docs/ARQUITECTURA.md 4.2).
 */
import { z } from 'zod';

/** Version del esquema local/SQL. Cambio incompatible = v2 (ADR). */
export const SCHEMA_VERSION = 1 as const;

/** Version de la tabla de requerimientos. Hasta revision humana es borrador. */
export const TABLA_VERSION = 'v0-borrador' as const;

export const categoriaSchema = z.enum([
  'adulto',
  'adulto_mayor',
  'nino',
  'gestante',
  'lactante',
]);
export type Categoria = z.infer<typeof categoriaSchema>;

/** "Reportada por la organizacion": nunca un diagnostico. */
export const anemiaSchema = z.enum(['si', 'no', 'sin_dato']);
export type AnemiaReportada = z.infer<typeof anemiaSchema>;

export const unidadBaseSchema = z.enum(['g', 'ml', 'unidad']);
export type UnidadBase = z.infer<typeof unidadBaseSchema>;

/** Unidades de captura; la canonica siempre es `UnidadBase`. */
export const unidadSchema = z.enum([
  'g',
  'kg',
  'ml',
  'unidad',
  'taza',
  'cucharada',
  'cucharón',
  'atado',
  'lata',
]);
export type Unidad = z.infer<typeof unidadSchema>;

export const nutrienteIdSchema = z.enum([
  'energia',
  'proteina',
  'hierro',
  'zinc',
  'vitaminaA',
  'folato',
  'vitaminaB12',
  'calcio',
]);
export type NutrienteId = z.infer<typeof nutrienteIdSchema>;

export const veredictoSchema = z.enum(['apto', 'deficit', 'insuficiente_datos']);
export type Veredicto = z.infer<typeof veredictoSchema>;

export const estadoSolicitudSchema = z.enum([
  'borrador',
  'enviada',
  'aceptada',
  'entregada',
  'cancelada',
]);
export type EstadoSolicitud = z.infer<typeof estadoSolicitudSchema>;

export const motivoMovimientoSchema = z.enum(['entrada', 'salida', 'ajuste', 'merma']);
export type MotivoMovimiento = z.infer<typeof motivoMovimientoSchema>;

export const tecnicaSchema = z.enum([
  'hervido',
  'guisado',
  'frito',
  'plancha',
  'al_vapor',
  'crudo',
]);
export type Tecnica = z.infer<typeof tecnicaSchema>;

export const tipoServicioSchema = z.enum([
  'desayuno',
  'almuerzo',
  'cena',
  'refaccion',
  'unico',
]);
export type TipoServicio = z.infer<typeof tipoServicioSchema>;

export const rolSchema = z.enum(['organizadora', 'cocinera', 'nutricionista', 'admin']);
export type Rol = z.infer<typeof rolSchema>;

/**
 * Columnas de sincronizacion presentes desde el registro #1.
 * `createdAt` es solo para mostrar; el orden de merge usa lamport + deviceId.
 */
export const syncMetaSchema = z.object({
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  deletedAt: z.string().nullable(),
  deviceId: z.string().min(1),
});
export type SyncMeta = z.infer<typeof syncMetaSchema>;

export const ollaSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  /** 6 caracteres sin ambiguedad (sin 0/O/1/I). */
  codigo: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  distrito: z.string().nullable(),
  creadaEn: z.string().min(1),
});
export type Olla = z.infer<typeof ollaSchema>;

export const personaSchema = z
  .object({
    id: z.string().min(1),
    ollaId: z.string().min(1),
    /** Nombre o apodo. Nunca apellidos completos ni DNI en v1. */
    alias: z.string().min(1),
    anioNacimiento: z.number().int().min(1900).max(2100),
    categoria: categoriaSchema,
    anemia: anemiaSchema,
    pesoKg: z.number().positive().nullable(),
    notas: z.string().nullable(),
  })
  .extend(syncMetaSchema.shape);
export type Persona = z.infer<typeof personaSchema>;

export const insumoSchema = z.object({
  id: z.string().min(1),
  nombre: z.string().min(1),
  unidadBase: unidadBaseSchema,
  /** Equivalencia declarada, nunca inferida. `null` = no hay dato. */
  gramosPorUnidad: z.number().positive().nullable(),
  stockMinimo: z.number().min(0),
  perecedero: z.boolean(),
  alergenos: z.array(z.string().min(1)),
});
export type Insumo = z.infer<typeof insumoSchema>;

export const ingredienteRecetaSchema = z.object({
  insumoId: z.string().min(1),
  /** Gramos de porcion comestible cruda. `null` = sin cantidad. */
  gramos: z.number().min(0).nullable(),
  captura: z
    .object({
      cantidad: z.number().positive(),
      unidad: unidadSchema,
    })
    .nullable(),
});
export type IngredienteReceta = z.infer<typeof ingredienteRecetaSchema>;

export const recetaSchema = z.object({
  id: z.string().min(1),
  ollaId: z.string().min(1),
  nombre: z.string().min(1),
  porcionesBase: z.number().int().min(1),
  ingredientes: z.array(ingredienteRecetaSchema),
  tecnicas: z.array(tecnicaSchema),
  version: z.number().int().min(1),
});
export type Receta = z.infer<typeof recetaSchema>;

export const comensalSchema = z.object({
  personaId: z.string().min(1),
  presente: z.boolean(),
});
export type Comensal = z.infer<typeof comensalSchema>;

export const servicioSchema = z.object({
  id: z.string().min(1),
  ollaId: z.string().min(1),
  /** ISO date (YYYY-MM-DD). */
  fecha: z.string().min(1),
  tipo: tipoServicioSchema,
  recetaId: z.string().min(1),
  comensales: z.array(comensalSchema),
  /** Fraccion del dia que cubre. `null` = default de reglas por tipo. */
  coberturaDia: z.number().gt(0).max(1).nullable(),
  comidaPrincipal: z.boolean().nullable(),
  modoReparto: z.enum(['igual', 'diferenciado']),
});
export type Servicio = z.infer<typeof servicioSchema>;

/** La despensa guarda movimientos; el saldo es una vista. */
export const movimientoSchema = z
  .object({
    id: z.string().min(1),
    ollaId: z.string().min(1),
    insumoId: z.string().min(1),
    /** Delta con signo, en `unidadBase` del insumo. */
    delta: z.number(),
    motivo: motivoMovimientoSchema,
    autor: z.string().min(1),
    at: z.string().min(1),
  })
  .extend(syncMetaSchema.shape);
export type Movimiento = z.infer<typeof movimientoSchema>;

export const solicitudItemSchema = z.object({
  insumoId: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: unidadSchema,
  nota: z.string().nullable(),
});
export type SolicitudItem = z.infer<typeof solicitudItemSchema>;

export const solicitudSchema = z
  .object({
    id: z.string().min(1),
    ollaOrigenId: z.string().min(1),
    ollaDestinoId: z.string().min(1),
    estado: estadoSolicitudSchema,
    items: z.array(solicitudItemSchema).min(1),
  })
  .extend(syncMetaSchema.shape);
export type Solicitud = z.infer<typeof solicitudSchema>;

/** Racion sugerida por el motor. `razones` nunca esta vacia en un resultado util. */
export const racionSugeridaSchema = z.object({
  personaId: z.string().min(1),
  servicioId: z.string().nullable(),
  componentes: z.array(
    z.object({
      insumoId: z.string().min(1),
      gramos: z.number().min(0),
      grupo: z.string().min(1),
    }),
  ),
  cobertura: z.record(nutrienteIdSchema, z.number()),
  razones: z.array(z.string().min(1)).min(2),
  modo: z.enum(['automatico', 'nutricionista']),
  versionTabla: z.string().min(1),
});
export type RacionSugerida = z.infer<typeof racionSugeridaSchema>;
