/**
 * Acta firmada sin red y match de excedentes entre ollas (issue #76).
 *
 * Corazon del flujo: inventario -> match -> acta firmada. Todo es **puro y
 * determinista**: sin React, sin Supabase, sin red, sin reloj. El instante llega
 * por parametro; los ids UUID los genera el caller, como en `solicitud.ts`.
 *
 * Reglas:
 * - Un acta es `firmada` solo con **dos firmas distintas** (una por punta) y
 *   desde `borrador` o `en_revision`. Sin firmas no firma: lanza error tipado.
 * - Solo el acta firmada mueve stock: `movimientosDeActa` devuelve el par de
 *   transferencia (origen negativo, destino positivo, suma 0; ni crea ni destruye).
 * - `impactoDesdeActas` cuenta **solo actas firmadas** e **ignora movimientos
 *   sueltos y mermas** (una merma no es rescate). Con contenido vacio devuelve 0.
 * - `matchExcedentes` ordena con pesos de cercania/urgencia/necesidad y explica
 *   cada score con razones textuales; empate determinista por ids.
 * - La unicidad de codigo es `(origen, codigo)` (migracion): dos actas del mismo
 *   origen con el mismo codigo son la misma y cuentan una sola vez.
 */
import type {
  Acta,
  ActaItem,
  Excedente,
  FirmaActa,
  MatchExcedente,
  Movimiento,
  Necesidad,
} from '@hackods/contracts';

import { DatoFaltante, ErrorDominio } from './errors.js';
import { sha256Hex } from './crypto/sha256.js';

/** El acta no se puede firmar: estado no firmable o firmas insuficientes/repetidas. */
export class ActaNoFirmable extends ErrorDominio {
  override name = 'ActaNoFirmable';

  constructor(
    readonly actaId: string,
    readonly motivo: string,
  ) {
    super(`acta ${actaId}: no firmable: ${motivo}`);
  }
}

// ---------------------------------------------------------------------------
// Codigo y hash del acta
// ---------------------------------------------------------------------------

/**
 * Codigo de 4 digitos determinista a partir de una semilla. Usa los bytes de
 * `sha256(seed)` para que la distribucion no dependa de la longitud de la
 * semilla; se rellena con ceros a la izquierda (`0007` no es `7`).
 */
export function codigoActa(seed: string): string {
  const digest = sha256Hex(`acta-codigo:${seed}`);
  const valor = Number.parseInt(digest.slice(0, 8), 16) % 10000;
  return valor.toString().padStart(4, '0');
}

/**
 * Texto canonico que se firma: claves en orden fijo, items ordenados, sin la
 * columna `hash` ni `firmas` (esas se derivan y firman por separado). Dos
 * renders del mismo contenido dan el mismo texto y por tanto el mismo hash.
 */
function serializarActa(acta: Pick<Acta, 'id' | 'origen' | 'destino' | 'codigo' | 'items'>): string {
  const items = acta.items
    .map((item) => `${item.insumoId}|${item.lote ?? ''}|${item.cantidad}|${item.unidad}`)
    .sort()
    .join(';');
  return `acta:${acta.id}|origen:${acta.origen}|destino:${acta.destino}|codigo:${acta.codigo}|${items}`;
}

/** SHA-256 hex del contenido canonico del acta (64 caracteres). */
export function hashActa(
  acta: Pick<Acta, 'id' | 'origen' | 'destino' | 'codigo' | 'items'>,
): string {
  return sha256Hex(serializarActa(acta));
}

// ---------------------------------------------------------------------------
// Firmas
// ---------------------------------------------------------------------------

export interface ResultadoFirmar {
  readonly acta: Acta;
  /** `true` solo si ya quedo `firmada` (dos firmas distintas). */
  readonly firmada: boolean;
}

/**
 * Aplica una firma al acta. Puro: no escribe, devuelve el acta nueva.
 *
 * - Estado firmable: `borrador` o `en_revision`; el resto lanza `ActaNoFirmable`.
 * - La punta que firma debe ser `origen` o `destino` (no una tercera olla).
 * - Las dos firmas deben ser de ollas **distintas**: firmar dos veces la misma
 *   punta no cuenta. Con la segunda firma distinta el acta pasa a `firmada` y
 *   fija `firmadaEn = ahora`.
 */
export function firmarActa(
  acta: Acta,
  firma: FirmaActa,
  ahora: string,
): ResultadoFirmar {
  if (acta.estado !== 'borrador' && acta.estado !== 'en_revision') {
    throw new ActaNoFirmable(acta.id, `estado "${acta.estado}" no admite firmas`);
  }
  if (firma.ollaId !== acta.origen && firma.ollaId !== acta.destino) {
    throw new ActaNoFirmable(acta.id, `la olla "${firma.ollaId}" no es punta del acta`);
  }

  // Una punta firma una vez: repetir la misma olla no suma una segunda firma.
  const firmas = acta.firmas.filter((f) => f.ollaId !== firma.ollaId);
  firmas.push(firma);

  const puntasFirmadas = new Set(firmas.map((f) => f.ollaId));
  const completa = puntasFirmadas.has(acta.origen) && puntasFirmadas.has(acta.destino);

  return {
    acta: {
      ...acta,
      estado: completa ? 'firmada' : acta.estado,
      firmas,
      firmadaEn: completa ? ahora : acta.firmadaEn,
    },
    firmada: completa,
  };
}

// ---------------------------------------------------------------------------
// Movimientos de un acta firmada
// ---------------------------------------------------------------------------

export interface IdsMovimientosActa {
  readonly origen: string;
  readonly destino: string;
}

function cantidadEnGramos(cantidad: number, unidad: string, insumoId: string): number {
  if (unidad === 'kg') return cantidad * 1000;
  if (unidad === 'g') return cantidad;
  throw new ErrorDominio(`acta: la unidad "${unidad}" de "${insumoId}" no tiene factor a gramos`);
}

/**
 * Movimientos append-only que un acta firmada genera: por cada item, un par
 * `transferencia` (origen con delta negativo, destino positivo), suma 0. Un
 * acta no firmada NO mueve stock: lanza `ActaNoFirmable`.
 *
 * Los ids vienen del caller: `movimientos.id` es `uuid`; el dominio es
 * determinista y no llama a `randomUUID()`. Se esperan `2 * items` ids
 * (pares origen/destino por item).
 */
export function movimientosDeActa(acta: Acta, ids: readonly IdsMovimientosActa[]): Movimiento[] {
  if (acta.estado !== 'firmada') {
    throw new ActaNoFirmable(acta.id, `estado "${acta.estado}" no genera movimientos`);
  }
  if (ids.length < acta.items.length) {
    throw new DatoFaltante(
      `movimientosDeActa: faltan ids (${ids.length} para ${acta.items.length} items)`,
    );
  }

  const movimientos: Movimiento[] = [];
  acta.items.forEach((item: ActaItem, i: number) => {
    const par = ids[i]!;
    const cantidad = cantidadEnGramos(item.cantidad, item.unidad, item.insumoId);
    const firmadaEn = acta.firmadaEn ?? acta.id;
    const base = {
      insumoId: item.insumoId,
      motivo: 'transferencia' as const,
      autor: 'acta',
      at: firmadaEn,
      createdAt: firmadaEn,
      updatedAt: firmadaEn,
      deletedAt: null,
      deviceId: acta.deviceId,
      lamport: acta.lamport,
    };
    movimientos.push(
      { ...base, id: par.origen, ollaId: acta.origen, delta: -cantidad },
      { ...base, id: par.destino, ollaId: acta.destino, delta: cantidad },
    );
  });
  return movimientos;
}

// ---------------------------------------------------------------------------
// Match de excedentes
// ---------------------------------------------------------------------------

export interface PesosMatch {
  readonly cercania: number;
  readonly urgencia: number;
  readonly necesidad: number;
}

/** Pesos por defecto del issue #76: cercania 0.3, urgencia 0.5, necesidad 0.2. */
export const PESOS_MATCH: PesosMatch = { cercania: 0.3, urgencia: 0.5, necesidad: 0.2 };

export interface ContextoMatch {
  /**
   * Distancia relativa 0..1 entre dos ollas (0 = misma, 1 = lo mas lejos).
   * El caller la aporta; sin geodatos, 0.5 para todas es neutro.
   */
  readonly cercania: (a: string, b: string) => number;
  /** Dia operativo del match (ISO). Los vencimientos se miden contra esta fecha. */
  readonly hoy: string;
  readonly top?: number;
  readonly pesos?: PesosMatch;
}

/** Dias entre dos fechas ISO `YYYY-MM-DD` (b - a), sin leer el reloj. */
function diasEntre(a: string, b: string): number {
  const msA = Date.parse(`${a}T00:00:00.000Z`);
  const msB = Date.parse(`${b}T00:00:00.000Z`);
  return Math.round((msB - msA) / 86_400_000);
}

/**
 * Rankea los excedentes contra las necesidades por insumo, con score ponderado
 * y razones explicables. Solo matchea el mismo `insumoId` y solo excedentes que
 * no vencen antes de la necesidad. Devuelve top N (5 por defecto), orden
 * determinista: score descendente y, a igual score, ids ascendentes.
 */
export function matchExcedentes(
  excedentes: readonly Excedente[],
  necesidades: readonly Necesidad[],
  contexto: ContextoMatch,
): MatchExcedente[] {
  const pesos = contexto.pesos ?? PESOS_MATCH;
  const top = contexto.top ?? 5;
  const candidatos: MatchExcedente[] = [];

  for (const excedente of excedentes) {
    const diasVida = diasEntre(contexto.hoy, excedente.vencimiento);
    if (diasVida < 0) continue; // ya vencio: no se matchea.

    for (const necesidad of necesidades) {
      if (necesidad.insumoId !== excedente.insumoId) continue;
      if (necesidad.ollaId === excedente.ollaId) continue; // no se transfiere a si misma.
      // La necesidad debe cubrirse antes de que el excedente venza.
      const diasNecesidad = diasEntre(contexto.hoy, necesidad.fechaNecesidad);
      if (diasNecesidad > diasVida) continue;

      const cercania = contexto.cercania(excedente.ollaId, necesidad.ollaId);
      // Urgencia: vence antes => mas urgente. 10 dias o mas => 0.
      const urgencia = Math.max(0, 1 - diasVida / 10);
      // Necesidad: tan pronto la necesita, mas peso; 7 dias o mas => 0.
      const necesidadScore = Math.max(0, 1 - diasNecesidad / 7);
      const score =
        pesos.cercania * (1 - Math.min(1, Math.max(0, cercania))) +
        pesos.urgencia * urgencia +
        pesos.necesidad * necesidadScore;

      const razones: string[] = [];
      if (diasVida <= 3) {
        razones.push(`vence en ${diasVida} dia(s) (${excedente.vencimiento})`);
      }
      if (cercania <= 0.34) {
        razones.push(`olla cercana (distancia ${cercania.toFixed(2)})`);
      }
      if (diasNecesidad <= 2) {
        razones.push(`lo necesita en ${diasNecesidad} dia(s)`);
      }
      razones.push(`mismo insumo "${excedente.insumoId}"`);

      candidatos.push({
        excedenteId: excedente.id,
        necesidadOllaId: necesidad.ollaId,
        insumoId: excedente.insumoId,
        score: Math.round(score * 1000) / 1000,
        razones,
      });
    }
  }

  candidatos.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.excedenteId !== b.excedenteId) return a.excedenteId < b.excedenteId ? -1 : 1;
    return a.necesidadOllaId < b.necesidadOllaId ? -1 : 1;
  });
  return candidatos.slice(0, top);
}

// ---------------------------------------------------------------------------
// Impacto desde actas firmadas
// ---------------------------------------------------------------------------

export interface ImpactoAgregado {
  readonly actasFirmadas: number;
  /** Kilos rescatados (solo desde actas firmadas, no mermas). */
  readonly kgRescatados: number;
  /** Raciones equivalentes: kg rescatados divididos por la racion de referencia. */
  readonly raciones: number;
  /** Kg que puede ir a compost: el 14,5% si aplica, si no 0. */
  readonly compostKg: number;
  /** Soles ahorrados, solo si el caller aporta precios por insumo. `null` = sin dato. */
  readonly soles: number | null;
}

export interface OpcionesImpacto {
  /** Kg por racion de referencia (default 0.35). */
  readonly kgPorRacion?: number;
  /** Fraccion a compost de lo no rescatable (default 0.145 = 14,5%). */
  readonly fraccionCompost?: number;
  /** Precio por kg en soles por insumo; si falta, no se calcula `soles`. */
  readonly precios?: Readonly<Record<string, number>>;
}

const KG_POR_RACION = 0.35;
const FRACCION_COMPOST = 0.145;

/**
 * Impacto de un conjunto de actas. **Cuenta solo las `firmada`**; un acta
 * borrador, en revision o anulada no aporta impacto, e **ignora cualquier
 * movimiento suelto o merma** que el caller no haya pasado como acta (aquí no se
 * reciben movimientos). Determinsta: se deriva de las actas, nunca de un saldo.
 */
export function impactoDesdeActas(
  actas: readonly Acta[],
  opciones: OpcionesImpacto = {},
): ImpactoAgregado {
  const kgPorRacion = opciones.kgPorRacion ?? KG_POR_RACION;
  const fraccionCompost = opciones.fraccionCompost ?? FRACCION_COMPOST;

  const firmadas = actas.filter((a) => a.estado === 'firmada');
  // Un codigo repetido en el mismo origen es la misma acta: cuenta una vez.
  const vistas = new Set<string>();
  let kg = 0;
  let soles = 0;

  for (const acta of firmadas) {
    const clave = `${acta.origen}\u0000${acta.codigo}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    for (const item of acta.items) {
      const kgItem = cantidadEnGramos(item.cantidad, item.unidad, item.insumoId) / 1000;
      kg += kgItem;
      if (opciones.precios !== undefined) {
        const precio = opciones.precios[item.insumoId];
        if (precio !== undefined) soles += kgItem * precio;
      }
    }
  }

  return {
    actasFirmadas: vistas.size,
    kgRescatados: Math.round(kg * 1000) / 1000,
    raciones: Math.floor(kg / kgPorRacion),
    compostKg: Math.round(kg * fraccionCompost * 1000) / 1000,
    // Sin precios => sin dato (`null`). Con precios parciales se informa lo
    // calculable; el caller sabe que falta cubrir todo el catalogo.
    soles: opciones.precios === undefined ? null : Math.round(soles * 100) / 100,
  };
}
