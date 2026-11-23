/**
 * Ingesta: dictado a items, boleta a items normalizados y categoria por embedding.
 *
 * Referencia: `docs/contracts/ingesta.md` y `docs/adr/0011-ingesta.md`.
 * Funcion pura: sin fetch, sin Supabase, sin reloj. Lo que no se puede asegurar
 * no se inventa: un importe dudoso queda `porRevisar` (D8) y una categoria
 * bajo el umbral queda `sin_clasificar`.
 */
import {
  aMicrocentesimos,
  type ExtraccionItemTexto,
  type ExtractResponse,
  type Microcentesimos,
} from '@hackods/contracts';

import { TAU } from './clasificacion/config.js';

// ---------------------------------------------------------------------------
// Dictado (audio -> texto -> items hablados)
// ---------------------------------------------------------------------------

export interface ItemDictado {
  readonly insumoTexto: string;
  readonly cantidad: number | null;
  readonly unidad: string | null;
}

const PALABRAS: Readonly<Record<string, number>> = {
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  quince: 15,
  veinte: 20,
  medio: 0.5,
  media: 0.5,
};

/**
 * Unidad hablada -> unidad canónica de la ingesta. `saco`/`bolsa` se conservan
 * crudas: su equivalencia en gramos la decide una persona, no el parser.
 */
const UNIDADES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(kilos?|kilogramos?|kg)\b/i, 'kg'],
  [/\b(gramos?|grs?|gr|g)\b/i, 'g'],
  [/\b(litros?|lts?|lt|l)\b/i, 'lt'],
  [/\b(mililitros?|mls?|ml)\b/i, 'ml'],
  [/\b(sacos?)\b/i, 'saco'],
  [/\b(bolsas?|paquetes?|pkg)\b/i, 'bolsa'],
  [/\b(unidades?|unid|unds?|un)\b/i, 'unidad'],
];

const RE_NUMERO = /(\d+(?:[.,]\d+)?)/;
const RE_SEPARADOR = /\s*(?:,|;| y |\n)\s*/i;

function aNumero(trozo: string): number | null {
  const limpio = trozo.trim().toLowerCase();
  const palabra = PALABRAS[limpio];
  if (palabra !== undefined) return palabra;
  const numero = Number(limpio.replace(',', '.'));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function unidadEn(trozo: string): { unidad: string | null; resto: string } {
  for (const [patron, canonica] of UNIDADES) {
    if (patron.test(trozo)) {
      return { unidad: canonica, resto: trozo.replace(patron, ' ') };
    }
  }
  return { unidad: null, resto: trozo };
}

function limpiarProducto(trozo: string): string {
  return trozo
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:de\s+|del\s+)/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * "2 kilos de arroz, medio saco de papa" -> `[{arroz, 2, kg}, {papa, 0.5, saco}]`.
 * Cada trozo con un número (dígito o palabra) y un producto. Un trozo sin
 * producto se descarta: nunca se adivina cuál.
 */
export function parsearDictado(texto: string): ItemDictado[] {
  if (typeof texto !== 'string' || texto.trim() === '') return [];

  const trozos = texto.split(RE_SEPARADOR).filter((t) => t.trim() !== '');
  const items: ItemDictado[] = [];

  for (const trozo of trozos) {
    let cantidad: number | null = null;
    let resto = trozo.trim();

    const digito = RE_NUMERO.exec(resto);
    if (digito?.[1] !== undefined) {
      cantidad = aNumero(digito[1]);
      resto = `${resto.slice(0, digito.index)} ${resto.slice(digito.index + digito[0].length)}`;
    } else {
      const primera = resto.split(/\s+/)[0] ?? '';
      const valor = PALABRAS[primera.toLowerCase()];
      if (valor !== undefined) {
        cantidad = valor;
        resto = resto.slice(primera.length);
      }
    }

    const { unidad, resto: sinUnidad } = unidadEn(resto);
    const insumoTexto = limpiarProducto(sinUnidad);
    if (insumoTexto === '' || cantidad === null) continue;

    items.push({ insumoTexto, cantidad, unidad });
  }

  return items;
}

// ---------------------------------------------------------------------------
// Boleta (OCR -> items con importe en microcentesimos)
// ---------------------------------------------------------------------------

export interface ItemCrudo {
  readonly linea: number;
  readonly textoCrudo: string;
  readonly cantidad: number | null;
  readonly unidad: string | null;
  /** Importe unitario; `null` cuando no se puede asegurar. */
  readonly precioUnitarioMicrocent: Microcentesimos | null;
  readonly porRevisar: boolean;
}

/** Importes con más de dos decimales o caracteres raros no se aseguran. */
const RE_IMPORTE = /^\d+(?:[.,]\d{1,2})?$/;

function importeAMicrocent(texto: string | null): Microcentesimos | null {
  if (texto === null) return null;
  const limpio = texto.trim().replace(/\s/g, '');
  if (!RE_IMPORTE.test(limpio)) return null;
  const soles = Number(limpio.replace(',', '.'));
  if (!Number.isFinite(soles) || soles < 0) return null;
  // 1 sol = 100 centimos = 100 000 000 microcentesimos.
  return aMicrocentesimos(Math.round(soles * 100_000_000));
}

function cantidadNumerica(texto: string | null): number | null {
  if (texto === null) return null;
  const numero = Number(texto.trim().replace(',', '.'));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

function textoPlano(item: ExtraccionItemTexto): string {
  const partes = [
    item.descripcion,
    item.cantidadTexto,
    item.unidadTexto,
    item.precioUnitarioTexto,
    item.totalLineaTexto,
  ].filter((parte): parte is string => parte !== null);
  return partes.join(' ').trim();
}

/**
 * Normaliza lo que devolvió `/extract` (textos del papel) a items de ingesta.
 * Si hay unitario se usa; si solo hay total de línea y cantidad, se reparte.
 * El importe dudoso va `porRevisar: true` y `precioUnitarioMicrocent: null`:
 * el dinero no se adivina (D8).
 */
export function normalizarItemsBoleta(extract: ExtractResponse): ItemCrudo[] {
  return extract.items.map((item: ExtraccionItemTexto): ItemCrudo => {
    const unitario = importeAMicrocent(item.precioUnitarioTexto);
    const total = importeAMicrocent(item.totalLineaTexto);
    const cantidad = cantidadNumerica(item.cantidadTexto);

    let precioUnitarioMicrocent: Microcentesimos | null = unitario;
    if (precioUnitarioMicrocent === null && total !== null && cantidad !== null && cantidad > 0) {
      precioUnitarioMicrocent = aMicrocentesimos(Math.round(total / cantidad));
    }

    const porRevisar =
      precioUnitarioMicrocent === null ||
      (item.precioUnitarioTexto !== null && unitario === null) ||
      (item.totalLineaTexto !== null && total === null);

    return {
      linea: item.linea,
      textoCrudo: textoPlano(item),
      cantidad,
      unidad: item.unidadTexto,
      precioUnitarioMicrocent,
      porRevisar,
    };
  });
}

// ---------------------------------------------------------------------------
// Embeddings: similitud y categoria
// ---------------------------------------------------------------------------

export interface EntradaCatalogo {
  readonly categoria: string;
  readonly vector: readonly number[];
}

export interface ResultadoCategoria {
  readonly categoria: string;
  /** Similitud del mejor candidato; `0` si el catálogo está vacío o no hay match. */
  readonly confianza: number;
}

/** Coseno de dos vectores de igual dimensión. Si no coinciden, `0` (nunca un falso positivo). */
export function similitudCoseno(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let punto = 0;
  let normaA = 0;
  let normaB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i] ?? 0;
    const vb = b[i] ?? 0;
    punto += va * vb;
    normaA += va * va;
    normaB += vb * vb;
  }
  if (normaA === 0 || normaB === 0) return 0;
  return punto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

/**
 * Categoria por el mejor candidato del catálogo. Bajo `umbral` -> `sin_clasificar`
 * con la confianza real del mejor match (no se inventa una categoría).
 */
export function categorizarPorEmbedding(
  vector: readonly number[],
  catalogo: readonly EntradaCatalogo[],
  umbral: number = TAU,
): ResultadoCategoria {
  let mejor: ResultadoCategoria = { categoria: 'sin_clasificar', confianza: 0 };
  for (const entrada of catalogo) {
    const similitud = similitudCoseno(vector, entrada.vector);
    if (similitud > mejor.confianza) {
      mejor = { categoria: entrada.categoria, confianza: similitud };
    }
  }
  return mejor.confianza >= umbral ? mejor : { categoria: 'sin_clasificar', confianza: mejor.confianza };
}

// ---------------------------------------------------------------------------
// Catálogo local declarado (la base no tiene `producto_alias` hoy)
// ---------------------------------------------------------------------------

/**
 * Categorías base de una olla. Es un mapa local **declarado**: la base no tiene
 * `producto_alias` y la ingesta no depende de una tabla que no existe.
 */
export const CATEGORIAS_BASE: readonly string[] = [
  'cereal',
  'legumbre',
  'tubérculo',
  'verdura',
  'fruta',
  'carne',
  'pescado',
  'lácteo',
  'huevo',
  'aceite',
  'azúcar',
  'otro',
] as const;
