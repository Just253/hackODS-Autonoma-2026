/**
 * Contratos de captura sin boleta: texto y voz (docs/DECISIONES.md D9).
 *
 * Referencia: `docs/contracts/captura-voz.md` (flujo, estados y parser).
 *
 * La captura es la bandeja de entrada; recien al confirmar se materializa en
 * `Comprobante` + `ComprobanteItem`. Ningun numero entra al presupuesto sin que
 * una persona lo confirme (D8).
 */
import { z } from 'zod';

import { unidadBaseSchema } from './domain.js';
import {
  centimosSchema,
  confianzaSchema,
  milesimasSchema,
  microcentesimosSchema,
} from './finanzas.js';

const idSchema = z.string().min(1);
const isoFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha ISO (YYYY-MM-DD)');
const isoInstante = z.string().min(1);

// ---------------------------------------------------------------------------
// Estados y avisos del parser
// ---------------------------------------------------------------------------

export const origenCapturaSchema = z.enum(['manual', 'voz']);
export type OrigenCaptura = z.infer<typeof origenCapturaSchema>;

export const estadoCapturaSchema = z.enum([
  'borrador',
  'capturada',
  'pendiente_compute',
  'procesando',
  'transcrita',
  'propuesta',
  'error_compute',
  'confirmada',
  'asentada',
  'anulada',
  'descartada',
  'duplicada',
]);
export type EstadoCaptura = z.infer<typeof estadoCapturaSchema>;

export const estadoCapturaItemSchema = z.enum([
  'propuesto',
  'confirmado',
  'excluido',
  'sin_precio',
  'sin_cantidad',
  'monto_pendiente',
]);
export type EstadoCapturaItem = z.infer<typeof estadoCapturaItemSchema>;

export const origenPrecioCapturaSchema = z.enum(['dicho', 'calculado', 'pendiente']);
export type OrigenPrecioCaptura = z.infer<typeof origenPrecioCapturaSchema>;

/**
 * Codigos estables del parser (docs/contracts/captura-voz.md §4.7).
 * Un codigo que toca dinero bloquea la confirmacion; uno de detalle no.
 */
export const codigoAvisoSchema = z.enum([
  'NUMERO_AMBIGUO',
  'PRECIO_FUERA_DE_RANGO',
  'PRECIO_AMBIGUO',
  'ARITMETICA_NO_CUADRA',
  'MONTO_SIN_REPARTIR',
  /** @deprecated el diseno original lo llamaba asi; se conserva por compatibilidad de lectura. */
  'MONTO_COMPARTIDO',
  'SIN_PRECIO',
  'SIN_CANTIDAD',
  'CANTIDAD_SUPUESTA',
  'TOTAL_CALCULADO',
  'FRACCION_SIN_UNIDAD',
  'UNIDAD_SIN_EQUIVALENCIA',
  'PRODUCTO_AMBIGUO',
  'SIN_CLASIFICAR',
  'ASR_DUDOSO',
  'CANTIDAD_IMPOSIBLE',
]);
export type CodigoAviso = z.infer<typeof codigoAvisoSchema>;

// ---------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------

export const capturaSchema = z
  .object({
    id: idSchema,
    ollaId: idSchema,
    origen: origenCapturaSchema,
    fechaNegocio: isoFecha,
    estado: estadoCapturaSchema,
    texto: z.string().min(1).nullable(),
    textoNorm: z.string().min(1).nullable(),
    /** FK logica al blob local `audio:<id>`; nunca sale del dispositivo por defecto. */
    audioRef: z.string().min(1).nullable(),
    audioHash: z.string().length(64).nullable(),
    audioMs: z.number().int().min(0).max(30_000).nullable(),
    audioBytes: z.number().int().min(0).max(2_097_152).nullable(),
    audioBorradoEn: isoInstante.nullable(),
    transcripcionId: idSchema.nullable(),
    montoDeclaradoCentavos: centimosSchema.nullable(),
    montoSinRepartirCentavos: centimosSchema.nullable(),
    coberturaMontoBp: z.number().int().min(0).max(10_000),
    confianzaGlobal: confianzaSchema,
    duplicadaDeId: idSchema.nullable(),
    nota: z.string().min(1).nullable(),
    confirmadaEn: isoInstante.nullable(),
    confirmadaPorRef: z.string().min(1).nullable(),
    asentadaEn: isoInstante.nullable(),
    createdAt: isoInstante,
    updatedAt: isoInstante,
    deletedAt: isoInstante.nullable(),
    deviceId: z.string().min(1),
    lamport: z.number().int().min(0),
  })
  .refine((c) => c.origen !== 'voz' || c.audioRef !== null || c.audioBorradoEn !== null, {
    message: 'captura de voz sin audio ni marca de borrado',
    path: ['audioRef'],
  });
export type Captura = z.infer<typeof capturaSchema>;

export const capturaItemSchema = z
  .object({
    id: idSchema,
    capturaId: idSchema,
    ollaId: idSchema,
    lineaNo: z.number().int().min(1),
    descripcionCruda: z.string().min(1),
    descripcionNorm: z.string().min(1),
    cantidadCruda: z.string().min(1).nullable(),
    cantidadMilesimas: milesimasSchema.nullable(),
    unidadCruda: z.string().min(1).nullable(),
    unidadBase: unidadBaseSchema.nullable(),
    precioTotalCentavos: centimosSchema.nullable(),
    precioUnitarioCentavos: centimosSchema.nullable(),
    precioMicrocentPorBase: microcentesimosSchema.nullable(),
    origenPrecio: origenPrecioCapturaSchema,
    productoId: idSchema.nullable(),
    productoConfianza: confianzaSchema.nullable(),
    confianza: confianzaSchema,
    estado: estadoCapturaItemSchema,
    motivoCodigo: z.string().min(1).nullable(),
    avisos: z.array(codigoAvisoSchema),
    corregidoDe: idSchema.nullable(),
    createdAt: isoInstante,
    updatedAt: isoInstante,
    deviceId: z.string().min(1),
    lamport: z.number().int().min(0),
  })
  .refine((i) => i.estado !== 'confirmado' || i.precioTotalCentavos !== null, {
    message: 'un item confirmado siempre tiene importe',
    path: ['precioTotalCentavos'],
  });
export type CapturaItem = z.infer<typeof capturaItemSchema>;

export const motorAsrSchema = z.enum([
  'cf_whisper_turbo',
  'cf_whisper',
  'faster_whisper_pc',
  'transformers_js',
  'whisper_cpp_wasm',
  'humano',
]);
export type MotorAsr = z.infer<typeof motorAsrSchema>;

/** Texto evidencia: se conserva aunque la persona lo corrija. Una captura, una transcripcion vigente. */
export const transcripcionSchema = z.object({
  id: idSchema,
  capturaId: idSchema,
  texto: z.string().min(1),
  textoNorm: z.string().min(1),
  motor: motorAsrSchema,
  modeloId: z.string().min(1),
  modeloVersion: z.string().min(1),
  /** Se fuerza `es`; no se autodetecta en una frase corta con ruido. */
  idioma: z.string().min(2).max(5),
  duracionMs: z.number().int().min(0),
  latenciaMs: z.number().int().min(0),
  confianzaMedia: confianzaSchema.nullable(),
  vad: z.boolean(),
  idiomaDetectado: z.string().min(2).max(5).nullable(),
  revisadaPorHumano: z.boolean(),
  createdAt: isoInstante,
  deviceId: z.string().min(1),
  lamport: z.number().int().min(0),
});
export type Transcripcion = z.infer<typeof transcripcionSchema>;

// ---------------------------------------------------------------------------
// Clasificacion de producto
// ---------------------------------------------------------------------------

export const estadoClasificacionSchema = z.enum(['confirmado', 'por_revisar', 'desconocido']);
export type EstadoClasificacion = z.infer<typeof estadoClasificacionSchema>;

export const motivoClasificacionSchema = z.enum([
  'alias_exacto',
  'similitud_alta',
  'margen_insuficiente',
  'similitud_baja',
  'sin_catalogo',
  'unidad_incompatible',
  'aritmetica_inconsistente',
]);
export type MotivoClasificacion = z.infer<typeof motivoClasificacionSchema>;

export const candidatoProductoSchema = z.object({
  productoId: idSchema,
  nombre: z.string().min(1),
  categoria: z.string().min(1),
  /** Similitud coseno 0..1. */
  similitud: confianzaSchema,
  origen: z.enum(['alias', 'embedding']),
});
export type CandidatoProducto = z.infer<typeof candidatoProductoSchema>;

export const clasificacionSchema = z.object({
  itemId: idSchema,
  estado: estadoClasificacionSchema,
  productoId: idSchema.nullable(),
  /** Top 3 ordenado por similitud descendente. */
  candidatos: z.array(candidatoProductoSchema).max(3),
  confianza: confianzaSchema,
  motivo: motivoClasificacionSchema,
  unidadBase: unidadBaseSchema.nullable(),
  cantidadBase: milesimasSchema.nullable(),
  precioPorUnidadBase: microcentesimosSchema.nullable(),
  requiereRevision: z.boolean(),
});
export type Clasificacion = z.infer<typeof clasificacionSchema>;
