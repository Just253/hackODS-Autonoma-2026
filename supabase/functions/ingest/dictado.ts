/**
 * Dictado tolerante a ASR para la Edge Function `ingest`.
 *
 * COPIA Deno de `packages/domain/src/ingesta.ts` (la Edge no importa el
 * monorepo). Mantener sincronizado: la fuente canónica y sus tests viven en
 * `packages/domain`; este archivo solo reproduce `parsearDictado` y helpers.
 */

export interface ItemDictado {
  readonly insumoTexto: string;
  readonly cantidad: number | null;
  readonly unidad: string | null;
}

const PALABRAS: Readonly<Record<string, number>> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15,
  veinte: 20, medio: 0.5, media: 0.5,
};

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
    if (patron.test(trozo)) return { unidad: canonica, resto: trozo.replace(patron, ' ') };
  }
  return { unidad: null, resto: trozo };
}

function normalizarIngreso(texto: string): string {
  return texto.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function fonetica(palabra: string): string {
  let s = normalizarIngreso(palabra).replace(/[^a-z]/g, '');
  s = s.replace(/h/g, '').replace(/v/g, 'b').replace(/z/g, 's');
  s = s.replace(/c(?=[ei])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k');
  s = s.replace(/ll/g, 'y').replace(/y/g, 'i').replace(/x/g, 'ks').replace(/w/g, 'u');
  return s.replace(/(.)\1+/g, '$1');
}

const INSUMOS_BASE: readonly string[] = [
  'arroz', 'aceite', 'papa', 'lentejas', 'huevo', 'quinua', 'pollo', 'azucar',
  'sal', 'leche', 'zanahoria', 'frijol', 'avena', 'cebolla', 'tomate', 'camote',
  'platano', 'atun', 'fideo', 'trigo', 'garbanzo', 'haba', 'queso', 'mantequilla', 'panela',
];

const PALABRAS_RUIDO: ReadonlySet<string> = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'uno', 'y', 'ne', 'en', 'eh', 'n',
]);

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previa: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const actual: number[] = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min((actual[j - 1] ?? 0) + 1, (previa[j] ?? 0) + 1, (previa[j - 1] ?? 0) + coste);
    }
    previa = actual;
  }
  return previa[b.length] ?? 0;
}

function distanciaMaxima(palabra: string): number {
  return palabra.length <= 4 ? 1 : 2;
}

function insumoCanonico(palabra: string): string | null {
  const p = normalizarIngreso(palabra);
  if (p === '') return null;
  const pFon = fonetica(p);
  let mejor: { insumo: string; distancia: number } | null = null;
  for (const insumo of INSUMOS_BASE) {
    const candidato = normalizarIngreso(insumo);
    if (p === candidato) return insumo;
    const candidatoFon = fonetica(candidato);
    const distanciaFon = pFon.length >= 3 && candidatoFon.length >= 3 ? levenshtein(pFon, candidatoFon) : Infinity;
    const distancia = Math.min(levenshtein(p, candidato), distanciaFon);
    if (distancia <= distanciaMaxima(p) && (mejor === null || distancia < mejor.distancia)) {
      mejor = { insumo, distancia };
    }
  }
  return mejor?.insumo ?? null;
}

function buscarInsumo(resto: string): string | null {
  const palabras = normalizarIngreso(resto).split(' ').filter(Boolean);
  for (const palabra of palabras) {
    if (PALABRAS_RUIDO.has(palabra)) continue;
    const insumo = insumoCanonico(palabra);
    if (insumo !== null) return insumo;
  }
  return null;
}

function trocearDictado(texto: string): string[] {
  const base = texto.split(RE_SEPARADOR).filter((t) => t.trim() !== '');
  const salida: string[] = [];
  for (const trozo of base) {
    const palabras = trozo.trim().split(/\s+/);
    let actual: string[] = [];
    let conNumero = false;
    for (const palabra of palabras) {
      const esNumero = RE_NUMERO.test(palabra) || PALABRAS[palabra.toLowerCase()] !== undefined;
      if (esNumero && conNumero && actual.length > 0) {
        salida.push(actual.join(' '));
        actual = [];
        conNumero = false;
      }
      actual.push(palabra);
      if (esNumero) conNumero = true;
    }
    if (actual.length > 0) salida.push(actual.join(' '));
  }
  return salida;
}

export function parsearDictado(texto: string): ItemDictado[] {
  if (typeof texto !== 'string' || texto.trim() === '') return [];
  const items: ItemDictado[] = [];
  for (const trozo of trocearDictado(texto)) {
    let cantidad: number | null = null;
    let resto = trozo.trim();
    const digito = RE_NUMERO.exec(resto);
    if (digito?.[1] !== undefined) {
      cantidad = aNumero(digito[1]);
      resto = `${resto.slice(0, digito.index)} ${resto.slice(digito.index + digito[0].length)}`;
    } else {
      const primera = resto.split(/\s+/)[0] ?? '';
      const valor = PALABRAS[primera.toLowerCase()];
      if (valor !== undefined) { cantidad = valor; resto = resto.slice(primera.length); }
    }
    const { unidad, resto: sinUnidad } = unidadEn(resto);
    const insumoTexto = buscarInsumo(sinUnidad);
    if (insumoTexto === null || cantidad === null) continue;
    items.push({ insumoTexto, cantidad, unidad });
  }
  return items;
}
