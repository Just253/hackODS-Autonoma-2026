/**
 * Parser local y determinista de capturas habladas o escritas (D9).
 *
 * Referencia: `docs/contracts/captura-voz.md` §4 y los 12 casos de §9.
 * No usa modelos, red, audio ni Supabase: texto entra, items propuestos salen.
 *
 * Reglas duras:
 * - Un monto que la persona no dijo **no se inventa**: se emite `SIN_PRECIO`.
 * - Dos productos y un solo monto **no se reparten**: `MONTO_SIN_REPARTIR` bloquea.
 * - El dinero en centimos y la cantidad en milesimas son enteros: se redondea
 *   una sola vez por linea, con `round_half_up`.
 */
import { z } from 'zod';

import type { Centimos, CodigoAviso, Milesimas, UnidadBase } from '@hackods/contracts';

import { redondearMitadArriba } from '../aritmetica.js';

// ---------------------------------------------------------------------------
// Contrato de salida
// ---------------------------------------------------------------------------

export interface ContextoParseo {
  /**
   * P50 por producto en centimos **por unidad hablada** (kg, L o unidad).
   * Se usa solo para la guarda P4 `[P50/3, 3xP50]`; sin dato, la guarda se omite.
   */
  readonly preciosReferencia?: Readonly<Record<string, number>>;
  /** Nombres que exigen revision aunque el monto sea firme. */
  readonly productosAmbiguos?: readonly string[];
}

export interface ItemPropuesto {
  readonly lineaNo: number;
  readonly descripcion: string;
  readonly descripcionNorm: string;
  readonly cantidadMilesimas: Milesimas | null;
  readonly unidadBase: UnidadBase | null;
  readonly unidadCruda: string | null;
  readonly precioTotalCentavos: Centimos | null;
  readonly precioUnitarioCentavos: Centimos | null;
  readonly origenPrecio: 'dicho' | 'calculado' | 'pendiente';
  readonly productoId: string | null;
  readonly confianza: number;
  readonly avisos: readonly CodigoAviso[];
}

export interface ResultadoParseo {
  readonly items: readonly ItemPropuesto[];
  readonly montoSinRepartirCentavos: Centimos | null;
  readonly montoDeclaradoCentavos: Centimos | null;
  /** 10 000 = todos los montos declarados quedaron con importe. */
  readonly coberturaMontoBp: number;
  /** D8: toda captura pasa por una persona, incluso con confianza 1,0. */
  readonly requiereConfirmacion: boolean;
  /** Un aviso que toca dinero impide confirmar hasta resolverlo. */
  readonly bloqueaConfirmacion: boolean;
  readonly avisos: readonly CodigoAviso[];
}

const textoEntradaSchema = z.string().trim().min(1, 'texto vacio').max(500, 'texto demasiado largo');

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type ClaseUnidad = 'kg' | 'g' | 'L' | 'ml' | 'unidad' | 'docena' | 'libra' | 'presentacion';

interface UnidadInfo {
  readonly clase: ClaseUnidad;
  readonly base: UnidadBase | null;
  readonly cruda: string;
  readonly factorMilesimas: number;
  readonly presentacion: boolean;
}

type Token =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'unit'; readonly info: UnidadInfo }
  | { readonly kind: 'word'; readonly value: string }
  | { readonly kind: 'sep'; readonly value: string };

const PALABRAS_NUMERO: Readonly<Record<string, number>> = {
  cero: 0,
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
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  trescientos: 300,
  cuatrocientos: 400,
  quinientos: 500,
  seiscientos: 600,
  setecientos: 700,
  ochocientos: 800,
  novecientos: 900,
  mil: 1000,
};

const UNIDADES: Readonly<Record<string, ClaseUnidad>> = {
  kilo: 'kg',
  kilos: 'kg',
  kilogramo: 'kg',
  kilogramos: 'kg',
  kg: 'kg',
  kgr: 'kg',
  gramo: 'g',
  gramos: 'g',
  gr: 'g',
  g: 'g',
  litro: 'L',
  litros: 'L',
  lt: 'L',
  lts: 'L',
  l: 'L',
  mililitro: 'ml',
  mililitros: 'ml',
  ml: 'ml',
  cc: 'ml',
  unidad: 'unidad',
  unidades: 'unidad',
  und: 'unidad',
  unid: 'unidad',
  pza: 'unidad',
  docena: 'docena',
  docenas: 'docena',
  libra: 'libra',
  libras: 'libra',
  lb: 'libra',
  saco: 'presentacion',
  sacos: 'presentacion',
  bolsa: 'presentacion',
  bolsas: 'presentacion',
  caja: 'presentacion',
  cajas: 'presentacion',
  atado: 'presentacion',
  atados: 'presentacion',
  bandeja: 'presentacion',
  bandejas: 'presentacion',
  manojo: 'presentacion',
  manojos: 'presentacion',
  lata: 'presentacion',
  latas: 'presentacion',
  botella: 'presentacion',
  botellas: 'presentacion',
};

const SEPARADORES: ReadonlySet<string> = new Set(['y', 'tambien', 'mas', 'luego']);

const CLAVES_SEP = new Set([',', ';']);

function unidadDe(palabra: string): UnidadInfo | undefined {
  const clase = UNIDADES[palabra];
  if (clase === undefined) {
    return undefined;
  }
  switch (clase) {
    case 'kg':
      return { clase, base: 'g', cruda: 'kg', factorMilesimas: 1_000_000, presentacion: false };
    case 'g':
      return { clase, base: 'g', cruda: 'g', factorMilesimas: 1_000, presentacion: false };
    case 'L':
      return { clase, base: 'ml', cruda: 'L', factorMilesimas: 1_000_000, presentacion: false };
    case 'ml':
      return { clase, base: 'ml', cruda: 'ml', factorMilesimas: 1_000, presentacion: false };
    case 'unidad':
      return { clase, base: 'unidad', cruda: 'unidad', factorMilesimas: 1_000, presentacion: false };
    case 'docena':
      return { clase, base: 'unidad', cruda: 'docena', factorMilesimas: 12_000, presentacion: false };
    case 'libra':
      return { clase, base: 'g', cruda: 'libra', factorMilesimas: 453_592, presentacion: false };
    case 'presentacion':
      return { clase, base: null, cruda: palabra, factorMilesimas: 1_000, presentacion: true };
  }
}

const UNIDAD_KG: UnidadInfo = {
  clase: 'kg',
  base: 'g',
  cruda: 'kg',
  factorMilesimas: 1_000_000,
  presentacion: false,
};

function normalizar(texto: string): string {
  return texto
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/s\/\.?/g, ' ')
    .replace(/(\d+)\s*\/\s*(\d+)/g, (_todo, numerador: string, denominador: string) => {
      const n = Number(numerador);
      const d = Number(denominador);
      return d > 0 ? ` ${n / d} ` : ' ';
    })
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/,/g, ' , ')
    .replace(/[^a-z0-9.\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizar(texto: string): Token[] {
  const piezas = normalizar(texto).split(' ').filter((pieza) => pieza.length > 0);
  const tokens: Token[] = [];
  for (const pieza of piezas) {
    if (CLAVES_SEP.has(pieza)) {
      tokens.push({ kind: 'sep', value: ',' });
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(pieza)) {
      tokens.push({ kind: 'num', value: Number(pieza) });
      continue;
    }
    const unidad = unidadDe(pieza);
    if (unidad !== undefined) {
      tokens.push({ kind: 'unit', info: unidad });
      continue;
    }
    const numero = PALABRAS_NUMERO[pieza];
    if (numero !== undefined) {
      tokens.push({ kind: 'num', value: numero });
      continue;
    }
    if (SEPARADORES.has(pieza)) {
      tokens.push({ kind: 'sep', value: 'y' });
      continue;
    }
    tokens.push({ kind: 'word', value: pieza });
  }
  return tokens;
}

/** Une "treinta y cinco", "ciento veinte", "trescientos cincuenta". */
function componerNumeros(tokens: readonly Token[]): Token[] {
  const salida: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const actual = tokens[i];
    if (actual === undefined) {
      i += 1;
      continue;
    }
    if (actual.kind !== 'num') {
      salida.push(actual);
      i += 1;
      continue;
    }
    let valor = actual.value;
    let j = i + 1;
    for (;;) {
      const siguiente = tokens[j];
      if (siguiente?.kind === 'num' && valor >= 100 && valor < 1000 && siguiente.value > 0 && siguiente.value < 100) {
        valor += siguiente.value;
        j += 1;
        continue;
      }
      if (siguiente?.kind === 'num' && siguiente.value === 1000 && valor > 0 && valor < 1000) {
        valor *= 1000;
        j += 1;
        continue;
      }
      if (siguiente?.kind === 'sep' && siguiente.value === 'y') {
        const unidad = tokens[j + 1];
        if (unidad?.kind === 'num' && unidad.value > 0 && unidad.value < 10 && valor >= 20) {
          valor += unidad.value;
          j += 2;
          continue;
        }
      }
      break;
    }
    salida.push({ kind: 'num', value: valor });
    i = j;
  }
  return salida;
}

function decimal(valor: number): number {
  if (valor >= 10) {
    return valor / 10 ** Math.trunc(valor).toString().length;
  }
  return valor / 10;
}

/** "tres cincuenta" -> 3.50, "cuatro con cincuenta" -> 4.50, "dieciocho noventa" -> 18.90. */
function unirDecimales(tokens: readonly Token[]): Token[] {
  const salida: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const actual = tokens[i];
    if (actual === undefined) {
      i += 1;
      continue;
    }
    if (actual.kind !== 'num') {
      salida.push(actual);
      i += 1;
      continue;
    }
    let valor = actual.value;
    let j = i + 1;
    const conector = tokens[j];
    if (conector?.kind === 'word' && (conector.value === 'con' || conector.value === 'punto')) {
      const siguiente = tokens[j + 1];
      if (siguiente?.kind === 'num' && siguiente.value >= 0 && valor < 100) {
        valor += decimal(siguiente.value);
        j += 2;
      }
    } else {
      const siguiente = tokens[j];
      const despues = tokens[j + 1];
      if (
        siguiente?.kind === 'num' &&
        despues?.kind !== 'unit' &&
        valor < 100 &&
        siguiente.value < 100
      ) {
        valor += decimal(siguiente.value);
        j += 1;
      }
    }
    salida.push({ kind: 'num', value: valor });
    i = j;
  }
  return salida;
}

/** Segmenta por "y", comas y conectores, sin partir "dos kilos y medio". */
function segmentar(tokens: readonly Token[]): Token[][] {
  const segmentos: Token[][] = [];
  let actual: Token[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) {
      continue;
    }
    if (token.kind === 'sep') {
      const siguiente = tokens[i + 1];
      const anterior = actual[actual.length - 1];
      const protegeMedio =
        siguiente?.kind === 'word' &&
        siguiente.value === 'medio' &&
        (anterior?.kind === 'unit' || anterior?.kind === 'num');
      if (protegeMedio) {
        actual.push(token);
        continue;
      }
      if (actual.length > 0) {
        segmentos.push(actual);
        actual = [];
      }
      continue;
    }
    actual.push(token);
  }
  if (actual.length > 0) {
    segmentos.push(actual);
  }
  return segmentos;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

interface DefinicionProducto {
  readonly clave: string;
  readonly descripcion: string;
  readonly ambiguo: boolean;
  readonly pesado: boolean;
}

function producto(
  clave: string,
  descripcion: string,
  ambiguo: boolean,
  pesado: boolean,
): DefinicionProducto {
  return { clave, descripcion, ambiguo, pesado };
}

const PRODUCTOS: Readonly<Record<string, DefinicionProducto>> = {
  papa: producto('papa', 'papa', true, true),
  papas: producto('papa', 'papa', true, true),
  arroz: producto('arroz', 'arroz', true, true),
  aceite: producto('aceite', 'aceite', true, false),
  'aceite vegetal': producto('aceite', 'aceite', true, false),
  jurel: producto('jurel', 'jurel', false, true),
  queso: producto('queso', 'queso', false, true),
  fideo: producto('fideos', 'fideos', false, true),
  fideos: producto('fideos', 'fideos', false, true),
  pollo: producto('pollo', 'pollo', false, true),
  huevo: producto('huevo', 'huevo', false, false),
  huevos: producto('huevo', 'huevo', false, false),
  cebolla: producto('cebolla', 'cebolla', false, true),
  'cebolla china': producto('cebolla china', 'cebolla china', false, true),
};

const PALABRAS_IGNORADAS: ReadonlySet<string> = new Set([
  'compre',
  'compramos',
  'compro',
  'gaste',
  'gastamos',
  'pague',
  'pagamos',
  'hoy',
  'ayer',
  'de',
  'del',
  'el',
  'la',
  'los',
  'las',
  'un',
  'una',
  'unos',
  'unas',
  'a',
  'al',
  'en',
  'con',
  'para',
  'por',
  'soles',
  'sol',
  'y',
  'medio',
  'cuarto',
  'cuartos',
  'punto',
  'mas',
  'tambien',
  'luego',
  'cosa',
  'cosas',
]);

// ---------------------------------------------------------------------------
// Parseo de un segmento
// ---------------------------------------------------------------------------

type ResultadoSegmento =
  | { readonly tipo: 'item'; readonly item: ItemPropuesto }
  | { readonly tipo: 'monto'; readonly monto: Centimos }
  | { readonly tipo: 'vacio' };

function esMedio(token: Token | undefined): boolean {
  return token?.kind === 'word' && token.value === 'medio';
}

function comoCentimos(valor: number): Centimos {
  return valor as Centimos;
}

function comoMilesimas(valor: number): Milesimas {
  return valor as Milesimas;
}

function parsearSegmento(
  tokens: readonly Token[],
  lineaNo: number,
  ctx: ContextoParseo,
): ResultadoSegmento {
  const usado = new Set<number>();
  const avisos: CodigoAviso[] = [];

  let cantidad: number | null = null;
  let unidad: UnidadInfo | null = null;
  let unidadExplicita = false;
  let fraccion = false;
  let cantidadSupuesta = false;

  // (1) Fracciones: "medio", "un cuarto", "tres cuartos".
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'word') {
      continue;
    }
    if (token.value === 'cuarto' || token.value === 'cuartos') {
      const anterior = tokens[i - 1];
      let valor = 0.25;
      if (anterior?.kind === 'num' && (anterior.value === 1 || anterior.value === 3)) {
        valor = anterior.value * 0.25;
        usado.add(i - 1);
      }
      cantidad = valor;
      fraccion = true;
      usado.add(i);
      const siguiente = tokens[i + 1];
      if (siguiente?.kind === 'unit') {
        unidad = siguiente.info;
        unidadExplicita = true;
        usado.add(i + 1);
      }
      break;
    }
    if (token.value === 'medio') {
      const siguiente = tokens[i + 1];
      if (siguiente?.kind === 'unit') {
        cantidad = 0.5;
        unidad = siguiente.info;
        unidadExplicita = true;
        fraccion = true;
        usado.add(i);
        usado.add(i + 1);
        break;
      }
      const anterior = tokens[i - 1];
      if (anterior?.kind === 'unit') {
        // "kilo y medio": lo resuelve el paso de cantidad.
        continue;
      }
      if (anterior?.kind === 'sep' && tokens[i - 2]?.kind === 'unit') {
        // "dos kilos y medio": tambien lo resuelve el paso de cantidad.
        continue;
      }
      cantidad = 0.5;
      fraccion = true;
      usado.add(i);
      break;
    }
  }

  // (2) Cantidad + unidad: "dos kilos", "tres bolsas", "docena", "un atado".
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined || usado.has(i)) {
      continue;
    }
    if (token.kind === 'num') {
      const siguiente = tokens[i + 1];
      if (siguiente?.kind === 'unit' && !usado.has(i + 1)) {
        if (cantidad === null) {
          cantidad = token.value;
        }
        if (unidad === null) {
          unidad = siguiente.info;
          unidadExplicita = true;
        }
        usado.add(i);
        usado.add(i + 1);
        if (tokens[i + 2]?.kind === 'sep' && esMedio(tokens[i + 3])) {
          cantidad += 0.5;
          usado.add(i + 2);
          usado.add(i + 3);
        }
      }
    } else if (token.kind === 'unit' && cantidad === null) {
      const anterior = tokens[i - 1];
      const esMarcador = anterior?.kind === 'word' && (anterior.value === 'el' || anterior.value === 'la');
      if (esMarcador) {
        continue;
      }
      if (token.info.clase === 'docena') {
        cantidad = 1;
        unidad = token.info;
        unidadExplicita = true;
        usado.add(i);
      } else if (tokens[i + 1]?.kind === 'sep' && esMedio(tokens[i + 2])) {
        cantidad = 1.5;
        unidad = token.info;
        unidadExplicita = true;
        usado.add(i);
        usado.add(i + 1);
        usado.add(i + 2);
      }
    }
  }

  // (3) "el kilo" / "el litro" / "la unidad" marcan precio unitario, no cantidad.
  let marcador: UnidadInfo | null = null;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'word') {
      continue;
    }
    if (token.value !== 'el' && token.value !== 'la') {
      continue;
    }
    const siguiente = tokens[i + 1];
    if (siguiente?.kind === 'unit') {
      marcador = siguiente.info;
    }
  }

  // (4) Dinero: el primer numero que no se uso como cantidad.
  let indiceMonto = -1;
  let numerosLibres = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'num' || usado.has(i)) {
      continue;
    }
    numerosLibres += 1;
    if (indiceMonto === -1) {
      indiceMonto = i;
    }
  }
  if (numerosLibres > 1) {
    avisos.push('NUMERO_AMBIGUO');
  }

  const tokenMonto = indiceMonto >= 0 ? tokens[indiceMonto] : undefined;
  const valorMonto = tokenMonto?.kind === 'num' ? tokenMonto.value : null;
  const anteriorMonto = indiceMonto > 0 ? tokens[indiceMonto - 1] : undefined;
  const cueA =
    anteriorMonto?.kind === 'word' && (anteriorMonto.value === 'a' || anteriorMonto.value === 'al');
  const esUnitario = valorMonto !== null && (cueA || marcador !== null);

  if (esUnitario && cantidad === null) {
    cantidad = 1;
    cantidadSupuesta = true;
    if (unidad === null) {
      unidad = marcador;
      if (unidad !== null) {
        unidadExplicita = false;
      }
    }
    avisos.push('CANTIDAD_SUPUESTA');
  }

  // (5) Resolver unidad de una fraccion sin unidad explicita.
  if (fraccion && !unidadExplicita) {
    if (unidad === null) {
      unidad = marcador ?? UNIDAD_KG;
    }
    avisos.push('FRACCION_SIN_UNIDAD');
  }

  // (6) Nombre del producto.
  const palabras: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'word' || usado.has(i) || PALABRAS_IGNORADAS.has(token.value)) {
      continue;
    }
    palabras.push(token.value);
  }
  const frase = palabras.join(' ').trim();
  const definicion = frase.length > 0 ? (PRODUCTOS[frase] ?? null) : null;

  if (frase.length === 0) {
    if (valorMonto === null) {
      return { tipo: 'vacio' };
    }
    return { tipo: 'monto', monto: comoCentimos(redondearMitadArriba(valorMonto * 100)) };
  }

  const clave = definicion?.clave ?? frase;
  const descripcion = definicion?.descripcion ?? frase;

  const unidadBase = unidad?.base ?? null;
  const cantidadMilesimas =
    cantidad !== null && unidad !== null
      ? comoMilesimas(redondearMitadArriba(cantidad * unidad.factorMilesimas))
      : null;

  // (7) Dinero de la linea. El unitario derivado se expresa por unidad base
  // (kg, L, unidad), no por presentacion: "docena = S/ 5,20" da S/ 0,43/unidad.
  let total: number | null = null;
  let unitario: number | null = null;
  let origen: ItemPropuesto['origenPrecio'] = 'pendiente';

  if (valorMonto !== null) {
    const enCentimos = redondearMitadArriba(valorMonto * 100);
    if (esUnitario) {
      unitario = enCentimos;
      if (cantidad !== null) {
        total = redondearMitadArriba(cantidad * enCentimos);
        origen = 'calculado';
      }
    } else {
      total = enCentimos;
      origen = 'dicho';
      const cantidadParaUnitario =
        unidadBase !== null && cantidadMilesimas !== null
          ? Number(cantidadMilesimas) / (unidadBase === 'unidad' ? 1_000 : 1_000_000)
          : (cantidad ?? 0);
      if (cantidadParaUnitario > 0) {
        unitario = redondearMitadArriba(enCentimos / cantidadParaUnitario);
      }
    }
  }

  // (8) Avisos de dinero y detalle.
  if (valorMonto === null) {
    avisos.push('SIN_PRECIO');
  }
  if (cantidad === null && !cantidadSupuesta) {
    avisos.push('SIN_CANTIDAD');
  }
  if (origen === 'calculado' && unidadBase !== null && !cantidadSupuesta) {
    avisos.push('TOTAL_CALCULADO');
  }
  if (unidad?.presentacion === true) {
    avisos.push('UNIDAD_SIN_EQUIVALENCIA');
  }
  const ambiguo = definicion?.ambiguo === true || (ctx.productosAmbiguos ?? []).includes(clave);
  if (ambiguo) {
    avisos.push('PRODUCTO_AMBIGUO');
  }

  const referencia = ctx.preciosReferencia?.[clave];
  if (unitario !== null && referencia !== undefined && referencia > 0) {
    if (unitario < referencia / 3 || unitario > referencia * 3) {
      avisos.push('PRECIO_FUERA_DE_RANGO');
      avisos.push('PRECIO_AMBIGUO');
    }
  }

  // (9) Confianza: min de las senales, como en §5.2.
  let confianza = 1;
  if (avisos.includes('TOTAL_CALCULADO')) {
    confianza = Math.min(confianza, 0.9);
  }
  if (
    avisos.includes('CANTIDAD_SUPUESTA') ||
    avisos.includes('FRACCION_SIN_UNIDAD') ||
    avisos.includes('UNIDAD_SIN_EQUIVALENCIA')
  ) {
    confianza = Math.min(confianza, 0.7);
  }
  if (avisos.includes('SIN_PRECIO') || avisos.includes('SIN_CANTIDAD')) {
    confianza = Math.min(confianza, 0.4);
  }
  if (
    avisos.includes('PRODUCTO_AMBIGUO') ||
    avisos.includes('PRECIO_AMBIGUO') ||
    avisos.includes('PRECIO_FUERA_DE_RANGO')
  ) {
    confianza = Math.min(confianza, 0.5);
  }

  return {
    tipo: 'item',
    item: {
      lineaNo,
      descripcion,
      descripcionNorm: descripcion,
      cantidadMilesimas,
      unidadBase,
      unidadCruda: unidad?.cruda ?? null,
      precioTotalCentavos: total === null ? null : comoCentimos(total),
      precioUnitarioCentavos: unitario === null ? null : comoCentimos(unitario),
      origenPrecio: origen,
      productoId: null,
      confianza,
      avisos,
    },
  };
}

// ---------------------------------------------------------------------------
// Entrada publica
// ---------------------------------------------------------------------------

const AVISOS_BLOQUEANTES: ReadonlySet<CodigoAviso> = new Set<CodigoAviso>([
  'NUMERO_AMBIGUO',
  'PRECIO_FUERA_DE_RANGO',
  'PRECIO_AMBIGUO',
  'ARITMETICA_NO_CUADRA',
  'MONTO_SIN_REPARTIR',
  'CANTIDAD_IMPOSIBLE',
]);

/**
 * Convierte una frase ("dos kilos de papa a tres cincuenta") en items propuestos.
 * No asienta nada ni toca el presupuesto: eso exige confirmacion humana (D8).
 */
export function parsearCaptura(texto: string, ctx: ContextoParseo = {}): ResultadoParseo {
  const entrada = textoEntradaSchema.parse(texto);
  const tokens = segmentar(unirDecimales(componerNumeros(tokenizar(entrada))));

  let items: ItemPropuesto[] = [];
  const montos: number[] = [];

  for (const segmento of tokens) {
    const resultado = parsearSegmento(segmento, items.length + 1, ctx);
    if (resultado.tipo === 'item') {
      items.push(resultado.item);
    } else if (resultado.tipo === 'monto') {
      montos.push(Number(resultado.monto));
    }
  }

  let montoSinRepartir: Centimos | null = null;
  let montoDeclarado: Centimos | null = null;

  if (items.length >= 2 && montos.length === 1) {
    const monto = montos[0];
    if (monto !== undefined) {
      montoSinRepartir = comoCentimos(monto);
    }
    montos.length = 0;
    items = items.map((item) => ({
      ...item,
      avisos: item.avisos.filter((aviso) => aviso !== 'SIN_PRECIO'),
    }));
  } else if (items.length === 1 && montos.length === 1) {
    const monto = montos[0];
    const unico = items[0];
    if (monto !== undefined && unico !== undefined) {
      items = [
        {
          ...unico,
          precioTotalCentavos: comoCentimos(monto),
          origenPrecio: 'dicho',
          avisos: unico.avisos.filter((aviso) => aviso !== 'SIN_PRECIO'),
        },
      ];
      montos.length = 0;
    }
  }

  if (montos.length > 0) {
    montoDeclarado = comoCentimos(montos.reduce((total, monto) => total + monto, 0));
  }

  const avisosResultado: CodigoAviso[] = [];
  const agregar = (aviso: CodigoAviso): void => {
    if (!avisosResultado.includes(aviso)) {
      avisosResultado.push(aviso);
    }
  };
  for (const item of items) {
    for (const aviso of item.avisos) {
      agregar(aviso);
    }
  }
  if (montoSinRepartir !== null) {
    agregar('MONTO_SIN_REPARTIR');
    items = items.map((item) => ({
      ...item,
      avisos: item.avisos.includes('MONTO_SIN_REPARTIR')
        ? item.avisos
        : [...item.avisos, 'MONTO_SIN_REPARTIR'],
    }));
  }

  const itemsFinales = items.map((item, indice) => ({ ...item, lineaNo: indice + 1 }));

  const conocidos = itemsFinales.reduce(
    (total, item) => total + Number(item.precioTotalCentavos ?? 0),
    0,
  );
  const declarados = conocidos + Number(montoSinRepartir ?? 0) + Number(montoDeclarado ?? 0);
  const coberturaMontoBp =
    declarados > 0 ? redondearMitadArriba((10_000 * conocidos) / declarados) : 0;

  const bloqueaConfirmacion = avisosResultado.some((aviso) => AVISOS_BLOQUEANTES.has(aviso));

  return {
    items: itemsFinales,
    montoSinRepartirCentavos: montoSinRepartir,
    montoDeclaradoCentavos: montoDeclarado,
    coberturaMontoBp,
    requiereConfirmacion: itemsFinales.length > 0 || montoDeclarado !== null,
    bloqueaConfirmacion,
    avisos: avisosResultado,
  };
}
