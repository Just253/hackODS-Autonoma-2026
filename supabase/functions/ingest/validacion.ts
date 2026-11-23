/**
 * Validación de la captura en `ingest`: qué MIME llega al compute, cuánto pesa y qué
 * dicen sus primeros bytes. Es la lista blanca que **copia** el contrato del compute
 * (`tools/compute/servicio.mjs`), no la que le gustaría a la app.
 *
 * Puro y sin Deno a propósito: se prueba con vitest (`validacion.test.ts`) porque en
 * esta máquina no hay Deno. `index.ts` importa este módulo tal cual.
 *
 * La regla que resume todo: lo que el compute va a rechazar con 415/413 se rechaza
 * **acá**, antes de `storage.upload()`, para no dejar un binario huérfano.
 */

/** Tipos que `/extract` acepta (`TIPOS_IMAGEN` en `tools/compute/servicio.mjs`). */
export const MIMES_IMAGEN: ReadonlyMap<string, string> = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
]);

/** Tipos que `/transcribe` acepta (`TIPOS_AUDIO` en `tools/compute/servicio.mjs`). */
export const MIMES_AUDIO: ReadonlyMap<string, string> = new Map([
  ['audio/wav', 'wav'],
  ['audio/wave', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/webm', 'webm'],
  ['video/webm', 'webm'],
]);

/** Límites del compute: `LIMITE_IMAGEN` y `LIMITE_AUDIO`. `>` es rechazo. */
export const LIMITE_IMAGEN = 4 * 1024 * 1024;
export const LIMITE_AUDIO = 8 * 1024 * 1024;

/** `MS_EMBED`. El endpoint de vectores es rápido; 30 s alcanza. */
export const MS_EMBED = 30_000;
/**
 * `MS_OCR` del compute (120 s) con margen. Antes eran 30 s: cortaba a un OCR en frío
 * que el compute seguía procesando, y el cliente veía un 502 como si el compute
 * estuviera caído.
 */
export const MS_EXTRACT = 150_000;
/** `MS_ASR` del compute (180 s) con margen. */
export const MS_TRANSCRIBE = 210_000;

/**
 * Techo del cuerpo. Un OCR de 150 s no garantiza volver antes del muro de la Edge
 * Function (Wall Clock, que en el plan pago llega a 400 s); uno de 210 s casi con
 * seguridad no. `504` lo dice honesto en lugar de fingir un 502 del compute.
 */
export const MS_MURO_EDGE = 400_000;

/**
 * `image/jpg` no es `image/jpeg` para el compute pero sí para algunos navegadores:
 * se normaliza a la forma canónica antes de reenviar. `null` = no soportado.
 */
export function normalizarMime(mime: string): string | null {
  const limpio = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (MIMES_IMAGEN.has(limpio)) return limpio === 'image/jpg' ? 'image/jpeg' : limpio;
  if (MIMES_AUDIO.has(limpio)) {
    if (limpio === 'audio/wave' || limpio === 'audio/x-wav') return 'audio/wav';
    return limpio;
  }
  return null;
}

export function limiteDe(tipo: 'audio' | 'boleta'): number {
  return tipo === 'audio' ? LIMITE_AUDIO : LIMITE_IMAGEN;
}

/** Tope legible para el mensaje de error: "8 MB" / "4 MB". */
export function textoLimite(tipo: 'audio' | 'boleta'): string {
  return `${limiteDe(tipo) / (1024 * 1024)} MB`;
}

/** ¿El tipo declarado coincide con la rama? Audio solo audio, boleta solo imagen. */
export function mimeValido(mime: string, tipo: 'audio' | 'boleta'): boolean {
  const canonico = normalizarMime(mime);
  if (canonico === null) return false;
  return tipo === 'audio' ? canonico.startsWith('audio/') : canonico.startsWith('image/');
}

function empiezaCon(bytes: Uint8Array, firma: ReadonlyArray<number>): boolean {
  if (bytes.length < firma.length) return false;
  return firma.every((b, i) => bytes[i] === b);
}

/**
 * Firma real del archivo. Un `image/png` declarado con bytes de ZIP (`PK`) es un
 * MIME mentiroso y se rechaza antes de subir. Devuelve `true` si los bytes son del
 * tipo; `false` si no. No adivina: sin firma reconocible, `false`.
 */
export function bytesCoinciden(bytes: Uint8Array, mime: string): boolean {
  switch (normalizarMime(mime)) {
    case 'image/png':
      return empiezaCon(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/jpeg':
      return empiezaCon(bytes, [0xff, 0xd8, 0xff]);
    case 'audio/wav': {
      // RIFF....WAVE: la marca 'WAVE' va en el byte 8.
      if (!empiezaCon(bytes, [0x52, 0x49, 0x46, 0x46])) return false;
      return bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
    }
    case 'audio/webm':
    case 'video/webm':
      return empiezaCon(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    default:
      return false;
  }
}

/** Extensión del `storage_path`; canónico, no el que declaró el cliente. */
export function extensionDe(mime: string): string {
  const canonico = normalizarMime(mime);
  if (canonico === null) return 'bin';
  return MIMES_IMAGEN.get(canonico) ?? MIMES_AUDIO.get(canonico) ?? 'bin';
}

// ---------------------------------------------------------------------------
// Elección de la olla
// ---------------------------------------------------------------------------

export type EleccionOlla =
  | { readonly ok: true; readonly ollaId: string }
  | { readonly ok: false; readonly status: number; readonly codigo: string; readonly mensaje: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * La olla **nunca** la elige `limit(1)`. Reglas:
 * - si el formulario trae `olla_id`, tiene que estar en `misOllas` (las de
 *   `app.mis_ollas()`, que RLS ya filtró) o es `403`;
 * - si no trae y el usuario tiene una sola, esa;
 * - si no trae y tiene varias, `400` pidiendo que la elija: elegir por él sube el
 *   binario a la olla equivocada sin que el cliente lo sepa.
 */
export function elegirOlla(pedida: string | null, misOllas: readonly string[]): EleccionOlla {
  const ollas = normalizarOllas(misOllas);
  if (ollas.length === 0) {
    return { ok: false, status: 403, codigo: 'SIN_OLLA', mensaje: 'el usuario no pertenece a ninguna olla' };
  }

  if (pedida !== null) {
    const limpia = pedida.trim().toLowerCase();
    if (limpia === '' || !UUID.test(limpia)) {
      return { ok: false, status: 400, codigo: 'OLLA_INVALIDA', mensaje: '`olla_id` no es un uuid válido' };
    }
    if (!ollas.includes(limpia)) {
      return { ok: false, status: 403, codigo: 'OLLA_AJENA', mensaje: '`olla_id` no es una olla del usuario' };
    }
    return { ok: true, ollaId: limpia };
  }

  const unica = ollas[0];
  if (ollas.length === 1 && unica !== undefined) return { ok: true, ollaId: unica };
  return {
    ok: false,
    status: 400,
    codigo: 'OLLA_AMBIGUA',
    mensaje: 'el usuario pertenece a varias ollas; mandá `olla_id` con la que corresponde',
  };
}

/** `app.mis_ollas()` devuelve `uuid[]`; la comparación no depende de mayúsculas. */
function normalizarOllas(valores: readonly string[]): string[] {
  return valores.map((v) => v.trim().toLowerCase()).filter((v) => v !== '');
}
