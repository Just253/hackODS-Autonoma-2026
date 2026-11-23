/**
 * Contratos de comprobantes, catalogo, precios y presupuesto (docs/DECISIONES.md D8).
 *
 * Referencia: `docs/contracts/comprobantes.md` (tipos, estados y formulas).
 *
 * Reglas:
 * - Dinero, cantidad y precio normalizado son **enteros branded**, nunca `number` suelto:
 *   `Centimos` (1 = S/ 0,01), `Milesimas` (1 = 0,001 de unidad base) y
 *   `Microcentesimos` (1 = 10^-6 centimo por unidad base).
 * - Los estados son uniones literales: un `string` suelto no entra.
 * - Los nombres de campo van en camelCase; el SQL snake_case vive en `supabase/`.
 */
import { z } from 'zod';

import { syncMetaSchema, unidadBaseSchema } from './domain.js';

// ---------------------------------------------------------------------------
// Dinero y cantidad: enteros branded
// ---------------------------------------------------------------------------

export const centimosSchema = z.number().int().brand<'Centimos'>();
export type Centimos = z.infer<typeof centimosSchema>;

export const milesimasSchema = z.number().int().brand<'Milesimas'>();
export type Milesimas = z.infer<typeof milesimasSchema>;

export const microcentesimosSchema = z.number().int().brand<'Microcentesimos'>();
export type Microcentesimos = z.infer<typeof microcentesimosSchema>;

/** Convierte un entero en `Centimos` validando en el borde. */
export function aCentimos(valor: number): Centimos {
  return centimosSchema.parse(valor);
}

/** Convierte un entero en `Milesimas` validando en el borde. */
export function aMilesimas(valor: number): Milesimas {
  return milesimasSchema.parse(valor);
}

/** Convierte un entero en `Microcentesimos` validando en el borde. */
export function aMicrocentesimos(valor: number): Microcentesimos {
  return microcentesimosSchema.parse(valor);
}

/** Puntos base: 10 000 = 100 %. */
export const puntosBaseSchema = z.number().int().min(0).max(100_000);
export type PuntosBase = z.infer<typeof puntosBaseSchema>;

const idSchema = z.string().min(1);
const isoFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha ISO (YYYY-MM-DD)');
const isoInstante = z.string().min(1);
/** Similitud/confianza 0..1, nunca un porcentaje 0..100. */
export const confianzaSchema = z.number().min(0).max(1);
export type Confianza = z.infer<typeof confianzaSchema>;

// ---------------------------------------------------------------------------
// Estados (uniones literales)
// ---------------------------------------------------------------------------

export const tipoComprobanteSchema = z.enum(['boleta', 'factura', 'nota_credito', 'declaracion', 'otro']);
export type TipoComprobante = z.infer<typeof tipoComprobanteSchema>;

export const origenComprobanteSchema = z.enum([
  'compra',
  'donacion_especie',
  'transferencia_entre_ollas',
  'ajuste_interno',
]);
export type OrigenComprobante = z.infer<typeof origenComprobanteSchema>;

/** Evidencia minima: papel, texto dictado/tipeado o audio (docs/contracts/captura-voz.md §2.6). */
export const evidenciaComprobanteSchema = z.enum(['imagen', 'texto', 'audio']);
export type EvidenciaComprobante = z.infer<typeof evidenciaComprobanteSchema>;

export const estadoComprobanteSchema = z.enum([
  'capturado',
  'en_cola',
  'extrayendo',
  'extraido',
  'clasificando',
  'por_revisar',
  'confirmado',
  'asentado',
  'rechazado',
  'duplicado',
  'error_extraccion',
  'anulado',
]);
export type EstadoComprobante = z.infer<typeof estadoComprobanteSchema>;

export const tratamientoIgvSchema = z.enum([
  'incluido_no_discriminado',
  'discriminado',
  'exonerado',
  'inafecto',
  'desconocido',
]);
export type TratamientoIgv = z.infer<typeof tratamientoIgvSchema>;

export const estadoItemComprobanteSchema = z.enum([
  'extraido',
  'normalizado',
  'clasificado',
  'por_revisar',
  'confirmado',
  'excluido',
]);
export type EstadoItemComprobante = z.infer<typeof estadoItemComprobanteSchema>;

export const origenValorItemSchema = z.enum(['comprobante', 'estimado', 'referencia_donacion', 'declarado']);
export type OrigenValorItem = z.infer<typeof origenValorItemSchema>;

export const categoriaProductoSchema = z.enum([
  'abarrotes',
  'verduras',
  'frutas',
  'carnes',
  'lacteos',
  'bebidas',
  'limpieza',
  'otros',
  'sin_clasificar',
]);
export type CategoriaProducto = z.infer<typeof categoriaProductoSchema>;

export const estadoAliasSchema = z.enum(['propuesto', 'aprobado', 'rechazado']);
export type EstadoAlias = z.infer<typeof estadoAliasSchema>;

export const origenAliasSchema = z.enum(['humano', 'modelo', 'importacion']);
export type OrigenAlias = z.infer<typeof origenAliasSchema>;

export const canalObservadoSchema = z.enum(['mayorista', 'minorista', 'no_declarado']);
export type CanalObservado = z.infer<typeof canalObservadoSchema>;

export const origenPrecioObservadoSchema = z.enum(['compra', 'encuesta', 'donacion_valorizada', 'declarado']);
export type OrigenPrecioObservado = z.infer<typeof origenPrecioObservadoSchema>;

export const calidadEvidenciaSchema = z.enum(['papel', 'declarado']);
export type CalidadEvidencia = z.infer<typeof calidadEvidenciaSchema>;

export const estadoPrecioObservadoSchema = z.enum(['valido', 'sospechoso', 'excluido']);
export type EstadoPrecioObservado = z.infer<typeof estadoPrecioObservadoSchema>;

export const ambitoPresupuestoSchema = z.enum(['mensual', 'quincenal', 'evento', 'anual']);
export type AmbitoPresupuesto = z.infer<typeof ambitoPresupuestoSchema>;

export const estadoPresupuestoSchema = z.enum(['borrador', 'vigente', 'cerrado']);
export type EstadoPresupuesto = z.infer<typeof estadoPresupuestoSchema>;

export const tipoMovimientoPresupuestoSchema = z.enum([
  'asignacion',
  'ajuste',
  'traslado_entrada',
  'traslado_salida',
  'gasto',
  'credito',
  'anulacion',
  'compromiso',
  'liberacion_compromiso',
]);
export type TipoMovimientoPresupuesto = z.infer<typeof tipoMovimientoPresupuestoSchema>;

export const tipoAlertaSchema = z.enum([
  'presupuesto_80',
  'presupuesto_100',
  'proyeccion_excede',
  'comprobante_duplicado',
  'comprobante_reutilizado',
  'item_por_revisar',
  'precio_outlier',
  'serie_insuficiente',
  'conciliacion_fallida',
  'sin_periodo',
  'periodo_cerrado_con_gasto',
]);
export type TipoAlerta = z.infer<typeof tipoAlertaSchema>;

export const severidadAlertaSchema = z.enum(['info', 'atencion', 'critica']);
export type SeveridadAlerta = z.infer<typeof severidadAlertaSchema>;

export const estadoAlertaSchema = z.enum(['abierta', 'vista', 'resuelta', 'descartada']);
export type EstadoAlerta = z.infer<typeof estadoAlertaSchema>;

// ---------------------------------------------------------------------------
// Comprobante e items
// ---------------------------------------------------------------------------

export const comprobanteSchema = z
  .object({
    id: idSchema,
    ollaId: idSchema,
    /** `null` hasta confirmar; obligatorio al asentar. */
    periodoId: idSchema.nullable(),
    tipo: tipoComprobanteSchema,
    origen: origenComprobanteSchema,
    evidencia: evidenciaComprobanteSchema,
    proveedorNombre: z.string().min(1).max(120),
    proveedorNombreNorm: z.string().min(1).max(120),
    proveedorId: idSchema.nullable(),
    proveedorRuc: z
      .string()
      .regex(/^\d{11}$/, 'RUC de 11 digitos')
      .nullable(),
    serie: z.string().min(1).nullable(),
    folio: z.string().min(1).nullable(),
    folioNorm: z.string().min(1).nullable(),
    fechaEmision: isoFecha,
    /** A que dia se imputa el gasto; por defecto = emision. */
    fechaImputacion: isoFecha,
    moneda: z.string().length(3),
    tipoCambio: z.number().positive().nullable(),
    totalPenCentavos: centimosSchema.nullable(),
    lineasIncluyenIgv: z.boolean(),
    tratamientoIgv: tratamientoIgvSchema,
    subtotalCentavos: centimosSchema.nullable(),
    igvCentavos: centimosSchema.nullable(),
    descuentoCentavos: centimosSchema,
    /** La verdad del dinero: lo que salio del bolsillo. */
    totalCentavos: centimosSchema,
    diferenciaConciliacionCentavos: z.number().int().nullable(),
    imagenHash: z.string().length(64).nullable(),
    imagenPath: z.string().min(1).nullable(),
    paginasTotal: z.number().int().min(1),
    huellaFuerte: z.string().length(64).nullable(),
    huellaDebil: z.string().length(64).nullable(),
    estado: estadoComprobanteSchema,
    motivoEstado: z.string().min(1).nullable(),
    duplicadoDeId: idSchema.nullable(),
    comprobanteAfectadoId: idSchema.nullable(),
    repartoModo: z.enum(['no', 'por_monto', 'por_items']),
    extractorVersion: z.string().min(1).nullable(),
    clasificadorVersion: z.string().min(1).nullable(),
    confianzaExtraccion: confianzaSchema.nullable(),
    confirmadoEn: isoInstante.nullable(),
    confirmadoPorRef: z.string().min(1).nullable(),
    asentadoEn: isoInstante.nullable(),
  })
  .extend(syncMetaSchema.shape);
export type Comprobante = z.infer<typeof comprobanteSchema>;

export const comprobanteItemSchema = z
  .object({
    id: idSchema,
    comprobanteId: idSchema,
    ollaId: idSchema,
    lineaNo: z.number().int().min(1),
    /** Exactamente lo impreso: `ARROZ EXTRA 1 SACO 50KG`. */
    descripcionCruda: z.string().min(1),
    cantidadCruda: z.string().min(1).nullable(),
    unidadCruda: z.string().min(1).nullable(),
    presentacionCruda: z.string().min(1).nullable(),
    /** Obligatoria para `normalizado`; 1 = 0,001 de unidad base. */
    cantidadMilesimas: milesimasSchema.nullable(),
    unidadBase: unidadBaseSchema.nullable(),
    equivalenciaId: idSchema.nullable(),
    precioUnitarioCrudoCentavos: centimosSchema.nullable(),
    totalLineaCentavos: centimosSchema,
    descuentoLineaCentavos: centimosSchema,
    totalNetoCentavos: centimosSchema,
    igvLineaCentavos: centimosSchema.nullable(),
    /** Bruto pagado por la linea: `totalNeto + igvLinea`. */
    totalNetoConIgvCentavos: centimosSchema,
    esPesoVariable: z.boolean(),
    productoId: idSchema.nullable(),
    productoConfianza: confianzaSchema.nullable(),
    estado: estadoItemComprobanteSchema,
    motivoEstado: z.string().min(1).nullable(),
    origenValor: origenValorItemSchema,
    precioMicrocentPorBase: microcentesimosSchema.nullable(),
    excluidoDeSerie: z.boolean(),
  })
  .extend(syncMetaSchema.shape);
export type ComprobanteItem = z.infer<typeof comprobanteItemSchema>;

// ---------------------------------------------------------------------------
// Catalogo y precios observados
// ---------------------------------------------------------------------------

export const productoCatalogoSchema = z.object({
  id: idSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nombre: z.string().min(1),
  categoria: categoriaProductoSchema,
  subcategoria: z.string().min(1).nullable(),
  unidadBase: unidadBaseSchema,
  perecedero: z.boolean(),
  pesoVariable: z.boolean(),
  rangoPrecioMinMicrocent: microcentesimosSchema.nullable(),
  rangoPrecioMaxMicrocent: microcentesimosSchema.nullable(),
  cantidadMinLineaMilesimas: milesimasSchema.nullable(),
  cantidadMaxLineaMilesimas: milesimasSchema.nullable(),
  activo: z.boolean(),
  version: z.number().int().min(1),
  createdAt: isoInstante,
  updatedAt: isoInstante,
  deletedAt: isoInstante.nullable(),
});
export type ProductoCatalogo = z.infer<typeof productoCatalogoSchema>;

export const productoAliasSchema = z.object({
  id: idSchema,
  productoId: idSchema,
  /** `null` = alias global aprobado por admin; con valor = alias de esa olla. */
  ollaId: idSchema.nullable(),
  texto: z.string().min(1),
  textoNorm: z.string().min(1),
  estado: estadoAliasSchema,
  origen: origenAliasSchema,
  aprobadoPorRef: z.string().min(1).nullable(),
  aprobadoEn: isoInstante.nullable(),
  vecesUsado: z.number().int().min(0),
  ultimaVez: isoInstante.nullable(),
});
export type ProductoAlias = z.infer<typeof productoAliasSchema>;

/** Inmutable: corregir = nueva observacion + `reemplazaAId` en la anterior. */
export const precioObservadoSchema = z.object({
  id: idSchema,
  ollaId: idSchema,
  productoId: idSchema,
  comprobanteItemId: idSchema.nullable(),
  fecha: isoFecha,
  canal: canalObservadoSchema,
  unidadBase: unidadBaseSchema,
  cantidadMilesimas: milesimasSchema,
  precioMicrocentPorBase: microcentesimosSchema,
  moneda: z.string().length(3),
  precioPenMicrocentPorBase: microcentesimosSchema.nullable(),
  /** Solo para dedupe interno; jamas en reportes. */
  proveedorRef: idSchema.nullable(),
  zonaId: idSchema.nullable(),
  origen: origenPrecioObservadoSchema,
  calidadEvidencia: calidadEvidenciaSchema,
  estado: estadoPrecioObservadoSchema,
  motivoExclusion: z.string().min(1).nullable(),
  reemplazaAId: idSchema.nullable(),
  createdAt: isoInstante,
  lamport: z.number().int().min(0),
  deviceId: z.string().min(1),
});
export type PrecioObservado = z.infer<typeof precioObservadoSchema>;

// ---------------------------------------------------------------------------
// Presupuesto y alertas
// ---------------------------------------------------------------------------

export const presupuestoSchema = z
  .object({
    id: idSchema,
    ollaId: idSchema,
    ambito: ambitoPresupuestoSchema,
    periodoDesde: isoFecha,
    periodoHasta: isoFecha,
    moneda: z.string().length(3),
    /** Inmutable: los ajustes son movimientos. */
    montoAsignadoInicialCentavos: centimosSchema,
    estado: estadoPresupuestoSchema,
    version: z.number().int().min(1),
    nota: z.string().min(1).nullable(),
  })
  .extend(syncMetaSchema.shape);
export type Presupuesto = z.infer<typeof presupuestoSchema>;

/** Append-only: `montoCentavos` ya viene con signo. */
export const movimientoPresupuestoSchema = z
  .object({
    id: idSchema,
    ollaId: idSchema,
    presupuestoId: idSchema,
    tipo: tipoMovimientoPresupuestoSchema,
    montoCentavos: centimosSchema,
    comprobanteId: idSchema.nullable(),
    comprobanteItemId: idSchema.nullable(),
    compromisoId: idSchema.nullable(),
    ocurridoEn: isoFecha,
    /** Lo pone el servidor: la base del corte. */
    asentadoEn: isoInstante,
    actorRef: z.string().min(1),
    motivo: z.string().min(1).nullable(),
    idempotencyKey: z.string().min(1),
  })
  .extend(syncMetaSchema.shape);
export type MovimientoPresupuesto = z.infer<typeof movimientoPresupuestoSchema>;

export const alertaSchema = z.object({
  id: idSchema,
  ollaId: idSchema,
  tipo: tipoAlertaSchema,
  severidad: severidadAlertaSchema,
  estado: estadoAlertaSchema,
  /** Ej. `presupuesto_80:<presupuestoId>`: una alerta por periodo, no por comprobante. */
  claveDedup: z.string().min(1),
  entidad: z.string().min(1),
  entidadId: idSchema,
  payload: z.record(z.string(), z.unknown()).nullable(),
  creadaEn: isoInstante,
  vistaEn: isoInstante.nullable(),
  resueltaEn: isoInstante.nullable(),
  resueltaPorRef: z.string().min(1).nullable(),
  silenciadaHasta: isoInstante.nullable(),
});
export type Alerta = z.infer<typeof alertaSchema>;
