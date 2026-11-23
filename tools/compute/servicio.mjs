#!/usr/bin/env node
/**
 * compute de pruebas — issue #64.
 *
 * Servicio HTTP local (sólo loopback, puerto 4400) para que un tercero pruebe
 * OCR, transcripción y embeddings contra la máquina del equipo. **No toca la app**:
 * no importa nada de `apps/` ni de `packages/`, no escribe en IndexedDB ni en Supabase.
 *
 *   GET  /            HTML mínimo con los endpoints (sin token, sin estado real)
 *   GET  /health      estado de los tres motores (requiere token)
 *   POST /embed       texto → vectores bge-m3 normalizados L2 (requiere token)
 *   POST /transcribe  audio wav/webm → texto con faster-whisper (requiere token)
 *   POST /extract     imagen → líneas de comprobante con OCR (requiere token)
 *
 * Seguridad: `Authorization: Bearer <token>`. El token sale de `COMPUTE_TOKEN` o de
 * `tools/compute/.token` (se genera al arrancar si falta; está gitignored).
 * Nunca se loguea el contenido de un pedido: sólo método, ruta, estado, bytes y ms.
 */
import { createServer } from 'node:http';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.0';
/** Loopback a propósito: el único camino público es el túnel de Cloudflare. */
const HOST = '127.0.0.1';
const PUERTO = Number(process.env.COMPUTE_PORT ?? 4400);
const OLLAMA = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const MODELO_EMBED = 'bge-m3';
const DIM_EMBED = 1024;
const MODELO_ASR = process.env.WHISPER_MODELO ?? 'small';
/** Candidatos de OCR por visión, en orden. Se verifica `vision` con /api/show antes de usar. */
const CANDIDATOS_VISION = ['qwen3.5:4b', 'gemma4-e4b-local:latest', 'qwen3.5:2b'];

const LIMITE_EMBED = 256 * 1024;
const LIMITE_AUDIO = 8 * 1024 * 1024;
const LIMITE_IMAGEN = 4 * 1024 * 1024;
const MAX_AUDIO_S = 120;
const MAX_TEXTO_EMBED = 512;
const MAX_TEXTO_EMBED_CANTIDAD = 64;
const MS_EMBED = 60_000;
const MS_ASR = 180_000;
const MS_OCR = 120_000;
const DIR_TEMP = join(tmpdir(), 'compute-pruebas');

const ARRANQUE = Date.now();

// --- Token --------------------------------------------------------------------
const ARCHIVO_TOKEN = join(AQUI, '.token');

function cargarToken() {
  const delEntorno = (process.env.COMPUTE_TOKEN ?? '').trim();
  if (delEntorno.length >= 16) return { valor: delEntorno, origen: 'variable COMPUTE_TOKEN' };

  if (existsSync(ARCHIVO_TOKEN)) {
    const guardado = readFileSync(ARCHIVO_TOKEN, 'utf8').trim();
    if (guardado.length >= 16) return { valor: guardado, origen: 'tools/compute/.token' };
  }

  const nuevo = randomBytes(32).toString('hex');
  writeFileSync(ARCHIVO_TOKEN, `${nuevo}\n`, { mode: 0o600 });
  return { valor: nuevo, origen: 'generado ahora en tools/compute/.token' };
}

const TOKEN = cargarToken();
const HUELLA_TOKEN = createHash('sha256').update(TOKEN.valor).digest();

function autorizado(req) {
  const cabecera = req.headers.authorization ?? '';
  const partes = cabecera.split(' ');
  if (partes.length !== 2 || !/^bearer$/i.test(partes[0]) || !partes[1]) return false;
  const huella = createHash('sha256').update(partes[1]).digest();
  return huella.length === HUELLA_TOKEN.length && timingSafeEqual(huella, HUELLA_TOKEN);
}

// --- Errores con forma de respuesta -------------------------------------------
class ErrorHttp extends Error {
  constructor(estado, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

// --- HTTP mínimo ---------------------------------------------------------------
function responderJson(res, estado, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texto),
    'cache-control': 'no-store',
  });
  res.end(texto);
}

async function leerCuerpo(req, limite) {
  const declarado = Number(req.headers['content-length'] ?? 0);
  if (declarado > limite) {
    throw new ErrorHttp(413, 'CUERPO_GRANDE', `El cuerpo pasa el límite de ${limite} bytes.`);
  }
  const trozos = [];
  let total = 0;
  for await (const trozo of req) {
    total += trozo.length;
    if (total > limite) throw new ErrorHttp(413, 'CUERPO_GRANDE', `El cuerpo pasa el límite de ${limite} bytes.`);
    trozos.push(trozo);
  }
  return Buffer.concat(trozos);
}

/** `AbortSignal.timeout` ya existe en Node 22; el helper sólo nombra la intención. */
const conLimite = (ms) => AbortSignal.timeout(ms);

// --- Ollama -------------------------------------------------------------------
let cacheModelos = { cuando: 0, nombres: [], arriba: false };

async function modelosOllama() {
  if (Date.now() - cacheModelos.cuando < 10_000) return cacheModelos;
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: conLimite(4000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const datos = await r.json();
    cacheModelos = {
      cuando: Date.now(),
      nombres: (datos.models ?? []).map((m) => m.name),
      arriba: true,
    };
  } catch {
    cacheModelos = { cuando: Date.now(), nombres: [], arriba: false };
  }
  return cacheModelos;
}

/** ¿Ese modelo existe y acepta imágenes? Se pregunta a /api/show, no se adivina por el nombre. */
async function aceptaImagenes(nombre) {
  try {
    const r = await fetch(`${OLLAMA}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nombre }),
      signal: conLimite(8000),
    });
    if (!r.ok) return false;
    const datos = await r.json();
    return Array.isArray(datos.capabilities) && datos.capabilities.includes('vision');
  } catch {
    return false;
  }
}

let cacheVision = { cuando: 0, modelo: null };
let cacheTesseract = { cuando: 0, disponible: false, version: null };

async function motorVision() {
  if (Date.now() - cacheVision.cuando < 60_000) return cacheVision.modelo;
  const { nombres, arriba } = await modelosOllama();
  let elegido = null;
  if (arriba) {
    for (const candidato of CANDIDATOS_VISION) {
      if (!tieneModelo(nombres, candidato)) continue;
      if (await aceptaImagenes(candidato)) {
        elegido = candidato;
        break;
      }
    }
  }
  cacheVision = { cuando: Date.now(), modelo: elegido };
  return elegido;
}

/** `bge-m3` y `bge-m3:latest` son el mismo modelo en Ollama; se aceptan las dos formas. */
function tieneModelo(nombres, buscado) {
  if (nombres.includes(buscado)) return true;
  const sinEtiqueta = buscado.replace(/:latest$/, '');
  return nombres.some((n) => n === `${sinEtiqueta}:latest` || n.replace(/:latest$/, '') === sinEtiqueta);
}

function hayTesseract() {
  if (Date.now() - cacheTesseract.cuando < 60_000) return cacheTesseract;
  let resultado = { cuando: Date.now(), disponible: false, version: null };
  try {
    const r = spawnSync('tesseract', ['--version'], { encoding: 'utf8', timeout: 8000, shell: false });
    if (r.status === 0) {
      const version = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n')[0].trim() || 'desconocida';
      resultado = { cuando: Date.now(), disponible: true, version };
    }
  } catch {
    // sin tesseract en PATH: sigue sin motor
  }
  cacheTesseract = resultado;
  return resultado;
}

// --- Whisper ------------------------------------------------------------------
/** ¿El modelo ya está en la caché de Hugging Face, con `model.bin` de verdad? */
function whisperEnCache(nombre) {
  const base = join(homedir(), '.cache', 'huggingface', 'hub', `models--Systran--faster-whisper-${nombre}`);
  const dirSnapshots = join(base, 'snapshots');
  if (!existsSync(dirSnapshots)) return false;
  try {
    for (const snap of readdirSync(dirSnapshots)) {
      const bin = join(dirSnapshots, snap, 'model.bin');
      if (existsSync(bin) && statSync(bin).size > 0) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function dirTemporal() {
  mkdirSync(DIR_TEMP, { recursive: true });
  return DIR_TEMP;
}

function ejecutar(cmd, args, { timeout, cwd } = {}) {
  return new Promise((resolve) => {
    const hijo = spawn(cmd, args, { cwd, windowsHide: true, shell: false });
    let salida = '';
    let error = '';
    let cortado = false;
    const reloj = setTimeout(() => {
      cortado = true;
      hijo.kill('SIGKILL');
    }, timeout ?? MS_ASR);

    hijo.stdout.on('data', (t) => {
      salida += t.toString();
    });
    hijo.stderr.on('data', (t) => {
      error += t.toString();
    });
    hijo.on('error', (e) => {
      clearTimeout(reloj);
      resolve({ codigo: -1, salida, error: `${error}${e.message}`, cortado });
    });
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      resolve({ codigo, salida, error, cortado });
    });
  });
}

// --- Endpoints ----------------------------------------------------------------
async function salud() {
  const { nombres, arriba } = await modelosOllama();
  const tesseract = hayTesseract();
  const vision = await motorVision();
  return {
    ok: arriba && tieneModelo(nombres, MODELO_EMBED) && whisperEnCache(MODELO_ASR),
    version: VERSION,
    embed: {
      modelo: MODELO_EMBED,
      dim: DIM_EMBED,
      cargado: arriba && tieneModelo(nombres, MODELO_EMBED),
    },
    asr: {
      modelo: MODELO_ASR,
      cargado: whisperEnCache(MODELO_ASR),
    },
    ocr: {
      motor: tesseract.disponible ? 'tesseract' : vision ? `ollama:${vision}` : null,
      disponible: tesseract.disponible || Boolean(vision),
    },
    uptime: Math.round((Date.now() - ARRANQUE) / 1000),
  };
}

function normalizarL2(vector) {
  let suma = 0;
  for (const v of vector) suma += v * v;
  const norma = Math.sqrt(suma);
  if (!Number.isFinite(norma) || norma === 0) return vector.slice();
  return vector.map((v) => v / norma);
}

async function manejarEmbed(req, res) {
  const crudo = await leerCuerpo(req, LIMITE_EMBED);
  let datos;
  try {
    datos = JSON.parse(crudo.toString('utf8'));
  } catch {
    throw new ErrorHttp(400, 'JSON_INVALIDO', 'El cuerpo no es JSON válido.');
  }

  const textos = datos?.textos;
  if (!Array.isArray(textos) || textos.length === 0) {
    throw new ErrorHttp(400, 'TEXTOS_INVALIDOS', 'Se espera {"textos": string[]} con al menos 1 elemento.');
  }
  if (textos.length > MAX_TEXTO_EMBED_CANTIDAD) {
    throw new ErrorHttp(400, 'TEXTOS_INVALIDOS', `Máximo ${MAX_TEXTO_EMBED_CANTIDAD} textos por pedido.`);
  }
  for (const [i, texto] of textos.entries()) {
    if (typeof texto !== 'string' || texto.trim() === '') {
      throw new ErrorHttp(400, 'TEXTOS_INVALIDOS', `textos[${i}] tiene que ser un string no vacío.`);
    }
    if (texto.length > MAX_TEXTO_EMBED) {
      throw new ErrorHttp(400, 'TEXTOS_INVALIDOS', `textos[${i}] pasa los ${MAX_TEXTO_EMBED} caracteres.`);
    }
  }

  let respuesta;
  try {
    respuesta = await fetch(`${OLLAMA}/api/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODELO_EMBED, input: textos }),
      signal: conLimite(MS_EMBED),
    });
  } catch (e) {
    throw new ErrorHttp(502, 'OLLAMA_NO_RESPONDE', `No se pudo hablar con Ollama (${e.name}).`);
  }
  if (!respuesta.ok) {
    throw new ErrorHttp(502, 'OLLAMA_ERROR', `Ollama devolvió HTTP ${respuesta.status}.`);
  }

  const cuerpo = await respuesta.json();
  const crudos = Array.isArray(cuerpo.embeddings) ? cuerpo.embeddings : cuerpo.embedding ? [cuerpo.embedding] : [];
  if (crudos.length !== textos.length) {
    throw new ErrorHttp(502, 'EMBED_INCOMPLETO', `Ollama devolvió ${crudos.length} vectores para ${textos.length} textos.`);
  }
  for (const vector of crudos) {
    if (!Array.isArray(vector) || vector.length !== DIM_EMBED) {
      throw new ErrorHttp(502, 'EMBED_DIM', `Se esperaban vectores de ${DIM_EMBED} dimensiones.`);
    }
  }

  return {
    vectores: crudos.map(normalizarL2),
    dim: DIM_EMBED,
    modelo: MODELO_EMBED,
    normalizado: true,
  };
}

const TIPOS_AUDIO = new Map([
  ['audio/wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/webm', 'webm'],
  ['video/webm', 'webm'],
]);

async function manejarTranscribe(req, res, url) {
  const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const extension = TIPOS_AUDIO.get(tipo);
  if (!extension) {
    throw new ErrorHttp(415, 'TIPO_NO_SOPORTADO', 'Se acepta audio/wav o audio/webm.');
  }

  const audio = await leerCuerpo(req, LIMITE_AUDIO);
  if (audio.length === 0) throw new ErrorHttp(400, 'AUDIO_VACIO', 'El cuerpo está vacío.');

  const directorio = dirTemporal();
  const archivo = join(directorio, `audio-${randomBytes(8).toString('hex')}.${extension}`);
  writeFileSync(archivo, audio, { mode: 0o600 });

  try {
    const idioma = (url.searchParams.get('idioma') ?? '').trim();
    const args = [join(AQUI, 'transcribir.py'), archivo, MODELO_ASR, String(MAX_AUDIO_S)];
    if (/^[a-z]{2}$/.test(idioma)) args.push(idioma);

    const r = await ejecutar('python', args, { timeout: MS_ASR });

    let salida;
    try {
      salida = JSON.parse(r.salida.trim().split('\n').pop() ?? '');
    } catch {
      const detalle = r.cortado ? 'se cortó por tiempo' : `exit ${r.codigo}`;
      throw new ErrorHttp(500, 'ASR_FALLO', `transcribir.py no devolvió JSON (${detalle}).`);
    }

    if (!salida.ok) {
      const estado = salida.codigo === 'AUDIO_LARGO' ? 422 : salida.codigo === 'AUDIO_ILEGIBLE' ? 415 : 500;
      throw new ErrorHttp(estado, salida.codigo ?? 'ASR_FALLO', salida.message ?? 'Falló la transcripción.');
    }

    return {
      texto: salida.texto,
      idioma: salida.idioma,
      duracionS: salida.duracionS,
      segmentos: salida.segmentos,
      // faster-whisper no da una confianza calibrada por palabra: inventarla sería mentir.
      confianzaMedia: null,
      motor: salida.motor,
      dispositivo: salida.dispositivo,
    };
  } finally {
    rmSync(archivo, { force: true });
  }
}

const TIPOS_IMAGEN = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
]);

/** Una línea de tesseract → ítems del comprobante, sin inventar números. */
function interpretarLinea(linea) {
  const limpia = linea.replace(/\s+/g, ' ').trim();
  if (!limpia) return null;

  const numeros = [...limpia.matchAll(/\d+(?:[.,]\d{1,2})?/g)].map((m) => m[0]);
  const unidad = limpia.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|kilo|kilos|g|gr|gramos|lt|l|litro|litros|un|und|unid|unidades|pkg|paquete|bolsa)\b/i);
  const descripcion = limpia
    .replace(/\d+(?:[.,]\d{1,2})?\s*(kg|kilo|kilos|g|gr|gramos|lt|l|litro|litros|un|und|unid|unidades|pkg|paquete|bolsa)\b/gi, ' ')
    .replace(/\d+(?:[.,]\d{1,2})?/g, ' ')
    .replace(/[^\p{L}\s%]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  const dosDecimales = numeros.filter((n) => /[.,]\d{1,2}$/.test(n));
  const precio = dosDecimales.length ? dosDecimales : numeros;

  let cantidadTexto = unidad ? unidad[1] : null;
  let unidadTexto = unidad ? unidad[2].toLowerCase() : null;
  let precioUnitarioTexto = null;
  let totalLineaTexto = null;

  if (precio.length === 1) {
    totalLineaTexto = precio[0];
  } else if (precio.length >= 2) {
    precioUnitarioTexto = precio[precio.length - 2];
    totalLineaTexto = precio[precio.length - 1];
    if (!cantidadTexto && precio.length >= 3) cantidadTexto = precio[precio.length - 3];
  }

  return {
    linea: limpia,
    descripcion: descripcion || null,
    cantidadTexto,
    unidadTexto,
    precioUnitarioTexto,
    totalLineaTexto,
  };
}

async function extraerConTesseract(archivo) {
  const r = await ejecutar('tesseract', [archivo, 'stdout', '--psm', '6', 'tsv'], { timeout: MS_OCR });
  if (r.codigo !== 0) {
    throw new ErrorHttp(500, 'OCR_FALLO', `tesseract salió con ${r.codigo}.`);
  }

  const filas = r.salida.split('\n').slice(1).filter(Boolean);
  const lineas = new Map();
  let sumaConfianza = 0;
  let palabras = 0;

  for (const fila of filas) {
    const celdas = fila.split('\t');
    if (celdas.length < 12) continue;
    const [nivel, pagina, bloque, parrafo, linea, , , , , conf, ...resto] = celdas;
    if (nivel !== '5') continue;
    const texto = resto.join(' ').trim();
    if (!texto) continue;
    const clave = `${pagina}-${bloque}-${parrafo}-${linea}`;
    if (!lineas.has(clave)) lineas.set(clave, []);
    lineas.get(clave).push(texto);
    const valor = Number(conf);
    if (Number.isFinite(valor) && valor > 0) {
      sumaConfianza += valor;
      palabras++;
    }
  }

  const items = [...lineas.values()]
    .map((trozos) => interpretarLinea(trozos.join(' ')))
    .filter(Boolean);

  return {
    items,
    confianza: palabras ? Number((sumaConfianza / palabras / 100).toFixed(3)) : null,
    motor: 'tesseract',
  };
}

const PROMPT_OCR = `Sos un lector de comprobantes de compra de una olla común del Perú.
Leé la imagen y devolvé SOLO un objeto JSON, sin explicaciones ni markdown:
{"items":[{"linea":"<la línea tal como se lee>","descripcion":"<producto, minúsculas>","cantidadTexto":"<número tal como aparece, o null>","unidadTexto":"<kg, un, lt... o null>","precioUnitarioTexto":"<tal como aparece, o null>","totalLineaTexto":"<tal como aparece, o null>"}]}
Reglas: no inventes líneas que no estén en la imagen; si un dato no se lee, poné null. Conservá los números con sus decimales tal como están escritos.`;

async function extraerConVision(archivo, modelo, tipo) {
  const imagen = readFileSync(archivo).toString('base64');
  let respuesta;
  try {
    respuesta = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        prompt: PROMPT_OCR,
        images: [imagen],
        format: 'json',
        stream: false,
        options: { temperature: 0 },
      }),
      signal: conLimite(MS_OCR),
    });
  } catch (e) {
    throw new ErrorHttp(502, 'OLLAMA_NO_RESPONDE', `No se pudo hablar con Ollama (${e.name}).`);
  }
  if (!respuesta.ok) {
    throw new ErrorHttp(502, 'OLLAMA_ERROR', `Ollama devolvió HTTP ${respuesta.status}.`);
  }

  const cuerpo = await respuesta.json();
  let datos;
  try {
    datos = JSON.parse(cuerpo.response ?? '');
  } catch {
    throw new ErrorHttp(502, 'OCR_ILEGIBLE', 'El modelo no devolvió JSON válido.');
  }
  if (!Array.isArray(datos?.items)) {
    throw new ErrorHttp(502, 'OCR_ILEGIBLE', 'El modelo no devolvió una lista de items.');
  }

  const texto = (v) => (typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'null' ? v.trim() : null);
  const items = datos.items
    .filter((i) => i && (texto(i.linea) || texto(i.descripcion)))
    .map((i) => ({
      linea: texto(i.linea) ?? texto(i.descripcion),
      descripcion: texto(i.descripcion),
      cantidadTexto: texto(i.cantidadTexto),
      unidadTexto: texto(i.unidadTexto),
      precioUnitarioTexto: texto(i.precioUnitarioTexto),
      totalLineaTexto: texto(i.totalLineaTexto),
    }));

  return {
    items,
    confianza: null, // un modelo de visión no da confianza calibrada; null es la verdad
    motor: `ollama:${modelo}`,
    // Se devuelve el tipo para que el que llama sepa que la imagen no se guardó en ningún lado.
    tipo,
  };
}

async function manejarExtract(req, res) {
  const tipo = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  const extension = TIPOS_IMAGEN.get(tipo);
  if (!extension) {
    throw new ErrorHttp(415, 'TIPO_NO_SOPORTADO', 'Se acepta image/png o image/jpeg.');
  }

  const imagen = await leerCuerpo(req, LIMITE_IMAGEN);
  if (imagen.length === 0) throw new ErrorHttp(400, 'IMAGEN_VACIA', 'El cuerpo está vacío.');

  const tesseract = hayTesseract();
  const vision = await motorVision();

  if (!tesseract.disponible && !vision) {
    throw new ErrorHttp(
      501,
      'OCR_NO_DISPONIBLE',
      'No hay motor de OCR en esta máquina. Instalá Tesseract o un modelo de visión en Ollama y volvé a probar.',
      {
        instruccion: [
          'Opción A (Tesseract): winget install --id UB-Mannheim.TesseractOCR, después abrí una consola nueva y rearrancá el servicio.',
          'Opción B (visión): ollama pull qwen3.5:4b, después rearrancá el servicio para que lo detecte.',
        ],
      },
    );
  }

  const directorio = dirTemporal();
  const archivo = join(directorio, `imagen-${randomBytes(8).toString('hex')}.${extension}`);
  writeFileSync(archivo, imagen, { mode: 0o600 });

  try {
    const resultado = tesseract.disponible
      ? await extraerConTesseract(archivo)
      : await extraerConVision(archivo, vision, tipo);
    return resultado;
  } finally {
    rmSync(archivo, { force: true });
  }
}

// --- Página mínima para el tercero --------------------------------------------
function pagina() {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>compute de pruebas · hackODS</title>
<style>
  :root { color-scheme: dark }
  body { margin:0; padding:2rem 1.25rem; font:15px/1.6 system-ui,sans-serif; background:#0f1115; color:#e7e9ee }
  main { max-width: 44rem; margin: 0 auto }
  h1 { font-size:1.35rem; margin:0 0 .25rem }
  p.sub { color:#9aa3b2; margin:0 0 1.5rem }
  code, pre { font-family: ui-monospace, Consolas, monospace }
  code { background:#1a1e26; padding:.1rem .3rem; border-radius:4px }
  table { width:100%; border-collapse:collapse; margin:1rem 0 }
  th,td { text-align:left; padding:.4rem .5rem; border-bottom:1px solid #232833; vertical-align:top }
  th { color:#9aa3b2; font-weight:600; font-size:.8rem; text-transform:uppercase; letter-spacing:.04em }
  pre { background:#1a1e26; padding:.75rem; border-radius:6px; overflow-x:auto; font-size:.85rem }
  .aviso { border-left:3px solid #b4791f; padding:.5rem .75rem; background:#1a1e26; border-radius:0 6px 6px 0 }
</style></head>
<body><main>
  <h1>compute de pruebas</h1>
  <p class="sub">Servicio local de la máquina del equipo · versión ${VERSION} · issue #64</p>

  <p>Prueba tres cosas, nada más: <strong>embeddings</strong>, <strong>transcripción</strong> y <strong>OCR</strong>.
  No toca la app, no guarda nada y no conoce ninguna olla.</p>

  <table>
    <tr><th>Endpoint</th><th>Qué hace</th></tr>
    <tr><td><code>GET /health</code></td><td>estado de los tres motores y uptime (requiere token)</td></tr>
    <tr><td><code>POST /embed</code></td><td><code>{"textos":["..."]}</code> → vectores de ${DIM_EMBED} dimensiones, normalizados L2</td></tr>
    <tr><td><code>POST /transcribe</code></td><td>audio <code>audio/wav</code> o <code>audio/webm</code> (≤8 MB, ≤${MAX_AUDIO_S} s) → texto</td></tr>
    <tr><td><code>POST /extract</code></td><td>imagen <code>image/png</code> o <code>image/jpeg</code> (≤4 MB) → líneas del comprobante</td></tr>
  </table>

  <p class="aviso">Todos los endpoints piden <code>Authorization: Bearer &lt;token&gt;</code>.
  El token no está acá: se pide a quien administra la máquina y vive en <code>tools/compute/.token</code>.</p>

  <pre>curl -s -H "Authorization: Bearer $COMPUTE_TOKEN" \\
  https://&lt;tu-url&gt;.trycloudflare.com/health</pre>

  <p>Ejemplos completos de los cuatro pedidos, en <code>tools/compute/LEEME.md</code> del repositorio.</p>
</main></body></html>`;
}

// --- Servidor -----------------------------------------------------------------
const RUTAS_POST = new Map([
  ['/embed', manejarEmbed],
  ['/transcribe', manejarTranscribe],
  ['/extract', manejarExtract],
]);

const servidor = createServer(async (req, res) => {
  const inicio = Date.now();
  const url = new URL(req.url ?? '/', `http://${HOST}:${PUERTO}`);
  let estado = 500;

  const terminar = () => {
    // Sólo método, ruta, estado y tiempo: nunca el contenido, nunca el token.
    console.log(`${req.method} ${url.pathname} → ${estado} (${Date.now() - inicio} ms)`);
  };
  res.on('finish', terminar);

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      estado = 200;
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(pagina());
      return;
    }

    const esRutaConocida =
      (req.method === 'GET' && url.pathname === '/health') || (req.method === 'POST' && RUTAS_POST.has(url.pathname));
    if (!esRutaConocida) {
      estado = 404;
      responderJson(res, 404, { codigo: 'NO_ENCONTRADA', message: 'Esa ruta no existe. Ver GET /.' });
      return;
    }

    if (!autorizado(req)) {
      estado = 401;
      responderJson(res, 401, {
        codigo: 'SIN_TOKEN',
        message: 'Falta Authorization: Bearer <token>, o el token no coincide.',
      });
      return;
    }

    if (req.method === 'GET') {
      const cuerpo = await salud();
      estado = 200;
      responderJson(res, 200, cuerpo);
      return;
    }

    const cuerpo = await RUTAS_POST.get(url.pathname)(req, res, url);
    estado = 200;
    responderJson(res, 200, cuerpo);
  } catch (e) {
    if (e instanceof ErrorHttp) {
      estado = e.estado;
      responderJson(res, e.estado, { codigo: e.codigo, message: e.message, ...e.extra });
    } else {
      estado = 500;
      console.error(`error interno en ${url.pathname}: ${e?.name ?? 'Error'}`);
      responderJson(res, 500, { codigo: 'ERROR_INTERNO', message: 'Falló el servicio. Ver el log de la máquina.' });
    }
  }
});

servidor.requestTimeout = 200_000;
servidor.headersTimeout = 20_000;
servidor.listen(PUERTO, HOST, () => {
  console.log(`compute de pruebas v${VERSION} en http://${HOST}:${PUERTO}`);
  console.log(`token: ${TOKEN.origen} (no se imprime el valor)`);
  console.log(`modelos: embed=${MODELO_EMBED} asr=${MODELO_ASR}`);
});

// Un cierre limpio: no hay nada persistido, pero el puerto se libera al instante.
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => {
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
