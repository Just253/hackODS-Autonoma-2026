/**
 * Acta de transferencia entre ollas y match de excedentes (issue #76).
 *
 * Aca solo viven las **formas** que cruzan paquetes; la logica pura (codigo,
 * hash, firmas, movimientos, match e impacto) esta en
 * `packages/domain/src/acta.ts`.
 *
 * Reglas:
 * - El acta firmada es la unica fuente de impacto: `firmada` exige dos firmas
 *   distintas. `borrador`, `en_revision`, `anulada` no mueven stock.
 * - Sin identidades (D2/D7): se firma con un rol y una llave publica/efimera, no
 *   con nombre ni DNI. Nada de PII en `firmaActaSchema`.
 * - El codigo tiene 4 digitos y es unico por origen: la unicidad de la migracion
 *   es `(origen, codigo)`; dos actas del mismo origen con el mismo codigo son la
 *   misma acta.
 * - Fechas en ISO 8601; enteros para cantidades (gramos) y dinero (centimos).
 */
import { z } from 'zod';

import { unidadSchema } from './domain.js';

/** Estados del acta. Solo `firmada` genera movimientos e impacto. */
export const estadoActaSchema = z.enum(['borrador', 'en_revision', 'firmada', 'anulada']);
export type EstadoActa = z.infer<typeof estadoActaSchema>;

/** Firma de una olla: rol y llave, sin nombre ni documento (D2/D7). */
export const firmaActaSchema = z.object({
  /** Id de la olla que firma; debe ser una de las puntas del acta. */
  ollaId: z.string().min(1),
  /** Rol de quien firma en esa olla (organizadora, admin…). */
  rol: z.string().min(1),
  /** Llave publica/efimera del dispositivo; no identifica a una persona. */
  llave: z.string().min(1),
  /** Instante ISO de la firma. */
  firmadaEn: z.string().min(1),
});
export type FirmaActa = z.infer<typeof firmaActaSchema>;

/** Item del acta: insumo, lote y cantidad en la unidad declarada. */
export const actaItemSchema = z.object({
  insumoId: z.string().min(1),
  /** Lote/fecha de vencimiento o identificador de partida. `null` = sin lote. */
  lote: z.string().min(1).nullable(),
  cantidad: z.number().positive(),
  unidad: unidadSchema,
});
export type ActaItem = z.infer<typeof actaItemSchema>;

/** Codigo de 4 digitos; la unicidad real es `(origen, codigo)` (migracion). */
export const codigoActaSchema = z.string().regex(/^\d{4}$/, 'codigo de 4 digitos');

/** Hash SHA-256 hex del contenido canonico del acta. */
export const hashActaSchema = z.string().regex(/^[0-9a-f]{64}$/, 'hash SHA-256 hex (64)');

export const actaSchema = z.object({
  id: z.string().min(1),
  /** Olla que entrega (sale stock). */
  origen: z.string().min(1),
  /** Olla que recibe (entra stock). Distinta del origen. */
  destino: z.string().min(1),
  estado: estadoActaSchema,
  codigo: codigoActaSchema,
  /** SHA-256 del contenido en el momento de generar el acta. */
  hash: hashActaSchema,
  items: z.array(actaItemSchema).min(1),
  /**
   * Firmas de las dos puntas. `firmada` exige exactamente dos, de ollas
   * distintas; el dominio lo verifica (`firmarActa`). Un arreglo vacio es un
   * acta sin firmar (borrador).
   */
  firmas: z.array(firmaActaSchema),
  /** Instante ISO de la firma completa; `null` mientras no esta firmada. */
  firmadaEn: z.string().min(1).nullable(),
  deviceId: z.string().min(1),
  lamport: z.number().int().min(0),
});
export type Acta = z.infer<typeof actaSchema>;

/**
 * Excedente publicado por una olla: lo que le sobra y puede transferir antes de
 * que venza. `vencimiento` es fecha ISO (YYYY-MM-DD): lo que vence antes urge.
 */
export const excedenteSchema = z.object({
  id: z.string().min(1),
  ollaId: z.string().min(1),
  insumoId: z.string().min(1),
  cantidad: z.number().positive(),
  unidad: unidadSchema,
  /** Fecha ISO del vencimiento del lote excedente. */
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha ISO (YYYY-MM-DD)'),
  /** Publicado en algun momento: un excedente vencido o retirado no matchea. */
  publicadoEn: z.string().min(1),
});
export type Excedente = z.infer<typeof excedenteSchema>;

/** Necesidad declarada por una olla para un insumo en una fecha. */
export const necesidadSchema = z.object({
  ollaId: z.string().min(1),
  insumoId: z.string().min(1),
  /** A partir de cuando la necesita (fecha ISO). */
  fechaNecesidad: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha ISO (YYYY-MM-DD)'),
});
export type Necesidad = z.infer<typeof necesidadSchema>;

/**
 * Match excedente↔necesidad con score 0..1 y las razones que lo explican. Las
 * razones son texto legible: el operador puede auditar por que se priorizo.
 */
export const matchExcedenteSchema = z.object({
  excedenteId: z.string().min(1),
  necesidadOllaId: z.string().min(1),
  insumoId: z.string().min(1),
  /** 0..1, combinacion ponderada de cercania/urgencia/necesidad. */
  score: z.number().min(0).max(1),
  /** Al menos una razon textual; nunca se muestra un score sin explicacion. */
  razones: z.array(z.string().min(1)).min(1),
});
export type MatchExcedente = z.infer<typeof matchExcedenteSchema>;
