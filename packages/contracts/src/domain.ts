/**
 * Contratos v1 del dominio. Fuente de verdad de los tipos que cruzan paquetes.
 *
 * Reglas:
 * - Los tipos se infieren de los schemas Zod: no se escriben dos veces.
 * - Nada de valores nutricionales ni reglas clinicas aca.
 * - Identidad: el servidor solo conoce `codigoP` (P-XXXX). `nombreLocal` y `alias`
 *   viven en `identidadLocalSchema`, marcado `localOnly: true`, y NO se serializan
 *   (docs/DECISIONES.md D2).
 * - Toda entidad sincronizable lleva `SyncMeta` y su orden es `(lamport, deviceId)`.
 */
import { z } from 'zod';

/** Version del esquema local/SQL. Cambio incompatible = v2 (ADR). */
export const SCHEMA_VERSION = 1 as const;

/** Version del menu firmado. Hasta revision humana es borrador. */
export const MENU_VERSION = 'v0-borrador' as const;

/** Lote maximo del contrato POST /sync/push (docs/contracts/sync.md). */
export const LOTE_MAXIMO = 100 as const;

export const ollaTipoSchema = z.enum(['comun', 'comedor_pca']);
export type OllaTipo = z.infer<typeof ollaTipoSchema>;

export const categoriaSchema = z.enum([
  'adulto',
  'adulto_mayor',
  'nino',
  'gestante',
  'lactante',
]);
export type Categoria = z.infer<typeof categoriaSchema>;

export const grupoEtarioSchema = z.enum([
  'menor_6m',
  'lactante_6_23m',
  'menor_5',
  'escolar',
  'adolescente',
  'adulto',
  'adulto_mayor',
  'gestante',
  'lactante_materna',
]);
export type GrupoEtario = z.infer<typeof grupoEtarioSchema>;

/** "Reportada por la organizacion": nunca un diagnostico. */
export const anemiaSchema = z.enum(['si', 'no', 'sin_dato']);
export type AnemiaReportada = z.infer<typeof anemiaSchema>;

export const sexoSchema = z.enum(['F', 'M', 'X']);
export type Sexo = z.infer<typeof sexoSchema>;

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

/** La despensa guarda movimientos; el saldo se deriva. `transferencia` mueve entre ollas. */
export const motivoMovimientoSchema = z.enum([
  'entrada',
  'salida',
  'merma',
  'ajuste',
  'transferencia',
]);
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

export const canalPrecioSchema = z.enum(['mayorista', 'minorista']);
export type CanalPrecio = z.infer<typeof canalPrecioSchema>;

export const estadoMenuSchema = z.enum([
  'borrador',
  'en_revision',
  'aprobado',
  'publicado',
  'retirado',
]);
export type EstadoMenu = z.infer<typeof estadoMenuSchema>;

export const momentoMenuSchema = z.enum(['almuerzo', 'cena']);
export type MomentoMenu = z.infer<typeof momentoMenuSchema>;

export const estadoEventoSchema = z.enum([
  'pendiente',
  'enviado',
  'aplicado',
  'conflicto',
  'rechazado',
]);
export type EstadoEvento = z.infer<typeof estadoEventoSchema>;

const isoFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha ISO (YYYY-MM-DD)');
const isoInstante = z.string().min(1);
const uuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const codigoPSchema = z.string().regex(/^P-[A-Z0-9]{4}$/, 'codigo P-XXXX');

/**
 * Columnas de sincronizacion presentes desde el registro #1.
 * `createdAt` es solo para mostrar; el orden de merge usa lamport + deviceId.
 */
export const syncMetaSchema = z.object({
  createdAt: isoInstante,
  updatedAt: isoInstante,
  deletedAt: isoInstante.nullable(),
  deviceId: z.string().min(1),
  lamport: z.number().int().min(0),
});
export type SyncMeta = z.infer<typeof syncMetaSchema>;

export const ollaSchema = z.object({
  id: z.string().min(1),
  /** Denominacion publica de la olla. No identifica a ninguna persona. */
  titulo: z.string().min(1),
  /** 6 caracteres sin ambiguedad (sin 0/O/1/I). */
  codigo: z.string().regex(/^[A-HJ-NP-Z2-9]{6}$/),
  tipo: ollaTipoSchema,
  distrito: z.string().nullable(),
  creadaEn: isoInstante,
});
export type Olla = z.infer<typeof ollaSchema>;

/**
 * Persona tal como viaja al servidor: SOLO el codigo P-XXXX.
 * Sin identidad personal, sin documento, sin telefono, sin direccion (docs/DECISIONES.md D2/D4).
 */
export const personaSchema = z
  .object({
    codigoP: codigoPSchema,
    ollaId: z.string().min(1),
    anioNacimiento: z.number().int().min(1900).max(2100),
    sexo: sexoSchema,
    categoria: categoriaSchema,
    /**
     * Datos de salud: el servidor ya no los entrega por SELECT directo (#4,
     * docs/adr/0005-rls-salud.md). Solo llegan por `v_personas_salud` o, en
     * `personas`, a nutricionista/admin; por eso son opcionales en el contrato.
     */
    anemia: anemiaSchema.optional(),
    pesoKg: z.number().positive().nullable().optional(),
    tallaCm: z.number().positive().nullable().optional(),
    /** Seguimiento opt-in con consentimiento; negarse no quita la racion. */
    consentimientoSeguimiento: z.boolean(),
    /** Texto libre del padrón: tampoco se concede por SELECT directo (#4). */
    notas: z.string().nullable().optional(),
  })
  .extend(syncMetaSchema.shape);
export type Persona = z.infer<typeof personaSchema>;

/**
 * Datos que NUNCA salen del dispositivo. `localOnly` es literal `true` para que
 * un serializador no pueda confundirlo con una entidad sincronizable.
 */
export const identidadLocalSchema = z.object({
  localOnly: z.literal(true),
  codigoP: codigoPSchema,
  nombreLocal: z.string().min(1).nullable(),
  alias: z.string().min(1).nullable(),
  actualizadoEn: isoInstante,
});
export type IdentidadLocal = z.infer<typeof identidadLocalSchema>;

export const insumoSchema = z.object({
  id: z.string().min(1),
  /** Denominacion del catalogo, no de una persona. */
  denominacion: z.string().min(1),
  unidadBase: unidadBaseSchema,
  /** Equivalencia declarada, nunca inferida. `null` = no hay dato. */
  gramosPorUnidad: z.number().positive().nullable(),
  stockMinimo: z.number().min(0),
  perecedero: z.boolean(),
  alergenos: z.array(z.string().min(1)),
});
export type Insumo = z.infer<typeof insumoSchema>;

/** Precio como serie: sin fecha, canal y fuente no sirve para costo ni brecha. */
export const precioSchema = z.object({
  id: z.string().min(1),
  insumoId: z.string().min(1),
  canal: canalPrecioSchema,
  unidad: unidadBaseSchema,
  precio: z.number().min(0),
  fecha: isoFecha,
  fuente: z.string().min(1),
  url: z.string().url().nullable(),
});
export type Precio = z.infer<typeof precioSchema>;

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
  titulo: z.string().min(1),
  porcionesBase: z.number().int().min(1),
  ingredientes: z.array(ingredienteRecetaSchema),
  tecnicas: z.array(tecnicaSchema),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Receta = z.infer<typeof recetaSchema>;

export const comensalSchema = z.object({
  codigoP: codigoPSchema,
  presente: z.boolean(),
});
export type Comensal = z.infer<typeof comensalSchema>;

/** 75 C es checklist de inocuidad del servicio, no un calculo (D6). */
export const inocuidadSchema = z.object({
  cocidoA75C: z.boolean(),
  verificadoEn: isoInstante.nullable(),
});
export type Inocuidad = z.infer<typeof inocuidadSchema>;

export const servicioSchema = z.object({
  id: z.string().min(1),
  ollaId: z.string().min(1),
  fecha: isoFecha,
  tipo: tipoServicioSchema,
  recetaId: z.string().min(1),
  comensales: z.array(comensalSchema),
  /** Fraccion del dia que cubre. `null` = default de reglas por tipo. */
  coberturaDia: z.number().gt(0).max(1).nullable(),
  comidaPrincipal: z.boolean().nullable(),
  modoReparto: z.enum(['igual', 'diferenciado']),
  inocuidad: inocuidadSchema.nullable(),
});
export type Servicio = z.infer<typeof servicioSchema>;

/** Append-only: no se edita ni se borra un movimiento. */
export const movimientoSchema = z
  .object({
    id: z.string().min(1),
    ollaId: z.string().min(1),
    insumoId: z.string().min(1),
    /** Delta con signo, en `unidadBase` del insumo. */
    delta: z.number(),
    motivo: motivoMovimientoSchema,
    autor: z.string().min(1),
    at: isoInstante,
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

// ---------------------------------------------------------------------------
// Menu firmado: 2 perfiles x 2 opciones, 7 dias, almuerzo y cena (D3).
// Toda la familia lleva `version` y `hash` para que el sello sea verificable.
// ---------------------------------------------------------------------------

/** Sello del nutricionista: sin esto el menu no es `aprobado` ni `publicado`. */
export const selloMenuSchema = z.object({
  nutricionista: z.string().min(1),
  cnp: z.string().min(1),
  fecha: isoInstante,
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type SelloMenu = z.infer<typeof selloMenuSchema>;

export const menuTemplateSchema = z.object({
  id: z.string().min(1),
  ollaId: z.string().min(1).nullable(),
  perfil: z.enum(['general', 'especial']),
  opcion: z.enum(['A', 'B']),
  estado: estadoMenuSchema,
  sello: selloMenuSchema.nullable(),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type MenuTemplate = z.infer<typeof menuTemplateSchema>;

export const menuDaySchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  /** 1 = lunes … 7 = domingo. */
  diaSemana: z.number().int().min(1).max(7),
  fecha: isoFecha.nullable(),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type MenuDay = z.infer<typeof menuDaySchema>;

export const dishSchema = z.object({
  id: z.string().min(1),
  menuDayId: z.string().min(1),
  momento: momentoMenuSchema,
  titulo: z.string().min(1),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Dish = z.infer<typeof dishSchema>;

export const ingredientMenuSchema = z.object({
  id: z.string().min(1),
  dishId: z.string().min(1),
  insumoId: z.string().min(1),
  gramos: z.number().min(0).nullable(),
  unidad: unidadSchema,
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type IngredientMenu = z.infer<typeof ingredientMenuSchema>;

export const portionSchema = z.object({
  id: z.string().min(1),
  dishId: z.string().min(1),
  grupo: grupoEtarioSchema,
  cantidad: z.number().positive(),
  unidad: unidadSchema,
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Portion = z.infer<typeof portionSchema>;

export const constraintSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  tipo: z.enum(['alergia', 'dieta', 'frecuencia', 'inocuidad', 'otro']),
  valor: z.string().min(1),
  motivo: z.string().nullable(),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Constraint = z.infer<typeof constraintSchema>;

/** Solo sustituciones aprobadas en la plantilla, con factor. Nunca inventadas. */
export const substitutionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  insumoOrigenId: z.string().min(1),
  insumoDestinoId: z.string().min(1),
  factor: z.number().positive(),
  aprobadaPor: z.string().min(1),
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Substitution = z.infer<typeof substitutionSchema>;

export const validationSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  estado: z.enum(['aprobado', 'rechazado']),
  hallazgos: z.array(z.string().min(1)),
  validador: z.string().min(1),
  cnp: z.string().min(1),
  fecha: isoInstante,
  version: z.number().int().min(1),
  hash: z.string().min(1),
});
export type Validation = z.infer<typeof validationSchema>;

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export const entidadSyncSchema = z.enum([
  'personas',
  'raciones',
  'movimientos',
  'solicitudes',
  'precios',
  'menus',
]);
export type EntidadSync = z.infer<typeof entidadSyncSchema>;

/** Evento del outbox / `evento_sync`. `idempotencyKey` siempre = `eventUuid`. */
export const eventoSyncSchema = z.object({
  eventUuid: uuidSchema,
  idempotencyKey: uuidSchema,
  lamport: z.number().int().min(0),
  deviceId: z.string().min(1),
  ollaId: z.string().min(1),
  entidad: entidadSyncSchema,
  payload: z.unknown(),
  estado: estadoEventoSchema,
  creadoEn: isoInstante,
});
export type EventoSync = z.infer<typeof eventoSyncSchema>;

/** Racion servida/entregada. No se edita: se anula con otro registro. */
export const racionSchema = z.object({
  personaCodigoP: codigoPSchema,
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
  versionMenu: z.string().min(1),
});
export type Racion = z.infer<typeof racionSchema>;
