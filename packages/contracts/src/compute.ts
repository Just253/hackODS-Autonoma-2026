/**
 * `ComputePort`: fachada stateless de inferencia (docs/ARQUITECTURA-COMPUTE.md).
 *
 * Supabase es el registro (una sola verdad); el computo solo recibe bytes/texto
 * y devuelve resultados. Nunca escribe, nunca autentica personas y nunca
 * reemplaza a Postgres.
 *
 * La fachada expone cuatro operaciones: `/health`, `/transcribe`, `/extract` y `/embed`.
 */
import { z } from 'zod';

export const proveedorComputeSchema = z.enum(['pc', 'workers-ai', 'local']);
export type ProveedorCompute = z.infer<typeof proveedorComputeSchema>;

export const codigoErrorComputeSchema = z.enum([
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'SCOPE_DENIED',
  'RATE_LIMITED',
  'TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'UNPROCESSABLE',
  'MODEL_NOT_READY',
  'MODEL_ERROR',
  'TIMEOUT',
  'VERSION_MISMATCH',
  'INTERNAL',
]);
export type CodigoErrorCompute = z.infer<typeof codigoErrorComputeSchema>;

export const errorComputeSchema = z.object({
  code: codigoErrorComputeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  retryAfterS: z.number().int().min(0).optional(),
});
export type ErrorCompute = z.infer<typeof errorComputeSchema>;

/** Envelope comun: toda peticion lleva idempotencia y trazabilidad. */
export const envelopeSchema = z.object({
  idempotencyKey: z.string().min(1),
  requestId: z.string().min(1),
});
export type Envelope = z.infer<typeof envelopeSchema>;

export const modeloInfoSchema = z.object({
  nombre: z.string().min(1),
  /** `null` en ASR/VLM; el embedding siempre declara su dimension. */
  dim: z.number().int().positive().nullable(),
  /** `sha256:…` del artefacto, para no mezclar vectores de modelos distintos. */
  hash: z.string().min(1).nullable(),
  cargado: z.boolean(),
});
export type ModeloInfo = z.infer<typeof modeloInfoSchema>;

export const healthReportSchema = z.object({
  ok: z.boolean(),
  apiVersion: z.string().min(1),
  uptimeS: z.number().int().min(0),
  gpu: z.object({
    presente: z.boolean(),
    vramLibreMb: z.number().int().min(0).nullable(),
  }),
  modelos: z.object({
    embed: modeloInfoSchema,
    asr: modeloInfoSchema,
    vlm: modeloInfoSchema,
  }),
  /** Version del catalogo cacheado; si no coincide, el adaptador responde VERSION_MISMATCH. */
  catalogoCache: z.string().min(1).nullable(),
  colaLocal: z.number().int().min(0),
  presupuestoSegundosRestantes: z.number().int().min(0),
});
export type HealthReport = z.infer<typeof healthReportSchema>;

export interface TranscribeRequest extends Envelope {
  /** ≤ 8 MB y ≤ 120 s. Opus/webm o WAV 16 kHz mono. */
  readonly audio: Blob;
  readonly mime: string;
  readonly idioma: 'es' | 'es-PE';
  readonly duracionMs: number;
  /** Vocabulario del catalogo para `initial_prompt` (≤ 40 palabras). */
  readonly pista?: string;
}

export const segmentoTranscripcionSchema = z.object({
  t0: z.number().min(0),
  t1: z.number().min(0),
  texto: z.string(),
});
export type SegmentoTranscripcion = z.infer<typeof segmentoTranscripcionSchema>;

export const transcribeResponseSchema = z.object({
  ok: z.boolean(),
  texto: z.string(),
  idioma: z.string().min(2).max(5),
  duracionS: z.number().min(0),
  segmentos: z.array(segmentoTranscripcionSchema),
  confianzaMedia: z.number().min(0).max(1).nullable(),
});
export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;

/** El extractor devuelve **texto**, nunca el importe ya convertido (un digito alucinado no es dinero). */
export const extraccionItemTextoSchema = z.object({
  linea: z.number().int().min(1),
  descripcion: z.string().min(1),
  cantidadTexto: z.string().min(1).nullable(),
  unidadTexto: z.string().min(1).nullable(),
  presentacionTexto: z.string().min(1).nullable(),
  precioUnitarioTexto: z.string().min(1).nullable(),
  totalLineaTexto: z.string().min(1).nullable(),
});
export type ExtraccionItemTexto = z.infer<typeof extraccionItemTextoSchema>;

export interface ExtractRequest extends Envelope {
  /** Imagen ≤ 4 MB (1280 px, JPEG 0.7) o PDF ≤ 8 MB y ≤ 10 paginas. */
  readonly archivo: Blob;
  readonly mime: string;
  readonly tipo: 'imagen' | 'pdf';
}

export const extractResponseSchema = z.object({
  ok: z.boolean(),
  codigo: z.enum(['ilegible', 'sin_items', 'timeout', 'pdf_no_soportado']).nullable(),
  proveedor: z.object({
    nombre: z.string().min(1).nullable(),
    ruc: z.string().min(1).nullable(),
  }),
  tipoDocumento: z.enum(['boleta', 'factura', 'otro']).nullable(),
  serie: z.string().min(1).nullable(),
  folio: z.string().min(1).nullable(),
  fechaTexto: z.string().min(1).nullable(),
  moneda: z.string().min(1).nullable(),
  items: z.array(extraccionItemTextoSchema),
  subtotalTexto: z.string().min(1).nullable(),
  igvTexto: z.string().min(1).nullable(),
  totalTexto: z.string().min(1).nullable(),
  confianza: z.number().min(0).max(1),
  advertencias: z.array(z.string().min(1)),
});
export type ExtractResponse = z.infer<typeof extractResponseSchema>;

export const embedRequestSchema = envelopeSchema.extend({
  textos: z.array(z.string().min(1).max(512)).min(1).max(64),
  modeloEsperado: z.string().min(1),
});
export type EmbedRequest = z.infer<typeof embedRequestSchema>;

export const embedResponseSchema = z.object({
  ok: z.boolean(),
  modelo: modeloInfoSchema,
  dim: z.number().int().positive(),
  normalizado: z.boolean(),
  vectores: z.array(z.array(z.number())),
});
export type EmbedResponse = z.infer<typeof embedResponseSchema>;

/**
 * Contrato congelado: cambiarlo es un ADR, no un refactor.
 * `RemotePCCompute`, `WorkersAICompute` y `LocalCompute` implementan lo mismo.
 */
export interface ComputePort {
  /** "1.2.0": viaja en la respuesta y permite detectar clientes viejos. */
  readonly version: string;
  readonly provider: ProveedorCompute;

  health(signal?: AbortSignal): Promise<HealthReport>;
  transcribe(request: TranscribeRequest, signal?: AbortSignal): Promise<TranscribeResponse>;
  extract(request: ExtractRequest, signal?: AbortSignal): Promise<ExtractResponse>;
  embed(request: EmbedRequest, signal?: AbortSignal): Promise<EmbedResponse>;
}
