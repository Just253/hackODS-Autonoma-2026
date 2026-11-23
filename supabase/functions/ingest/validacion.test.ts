/**
 * Pruebas de la lista blanca de `ingest`: el compute (`tools/compute/servicio.mjs`)
 * define qué MIME, qué tamaño y qué bytes acepta, y la función tiene que fallar
 * **antes** de subir, no después con un 502.
 *
 * Nota: `supabase/` no es un paquete del monorepo (no hay Deno en CI), así que este
 * archivo corre con el paquete `@hackods/web`, que sí tiene vitest: ver
 * `apps/web/vite.config.ts` → `test.include`. El módulo se importa por ruta relativa.
 */
import { describe, expect, it } from 'vitest';

import {
  LIMITE_AUDIO,
  LIMITE_IMAGEN,
  MS_EXTRACT,
  MS_TRANSCRIBE,
  bytesCoinciden,
  elegirOlla,
  extensionDe,
  limiteDe,
  mimeValido,
  normalizarMime,
  textoLimite,
} from '../../../supabase/functions/ingest/validacion.ts';

/** Bytes con la firma indicada y relleno: sólo importan los primeros. */
function bytes(firma: number[], relleno = 16): Uint8Array {
  const salida = new Uint8Array(firma.length + relleno);
  salida.set(firma, 0);
  return salida;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const WAV = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
const WEBM = [0x1a, 0x45, 0xdf, 0xa3];

describe('normalizarMime', () => {
  it('image/jpg se normaliza a image/jpeg (el compute acepta las dos, la canónica es jpeg)', () => {
    expect(normalizarMime('image/jpg')).toBe('image/jpeg');
    expect(normalizarMime('IMAGE/JPG; q=1')).toBe('image/jpeg');
    expect(normalizarMime('image/jpeg')).toBe('image/jpeg');
  });

  it('los alias de wav se normalizan a audio/wav', () => {
    expect(normalizarMime('audio/wave')).toBe('audio/wav');
    expect(normalizarMime('audio/x-wav')).toBe('audio/wav');
    expect(normalizarMime('audio/webm')).toBe('audio/webm');
    expect(normalizarMime('video/webm')).toBe('video/webm');
  });

  it('lo que el compute no procesa no tiene forma canónica', () => {
    expect(normalizarMime('image/heic')).toBeNull();
    expect(normalizarMime('application/pdf')).toBeNull();
    expect(normalizarMime('image/svg+xml')).toBeNull();
    expect(normalizarMime('audio/mpeg')).toBeNull();
    expect(normalizarMime('')).toBeNull();
  });
});

describe('mimeValido — lista blanca, no negra', () => {
  it('boleta acepta png y jpeg/jpg, y nada más', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/jpg']) {
      expect(mimeValido(mime, 'boleta')).toBe(true);
    }
    for (const mime of ['image/heic', 'image/webp', 'image/svg+xml', 'application/pdf']) {
      expect(mimeValido(mime, 'boleta')).toBe(false);
    }
  });

  it('audio acepta wav/webm y sus alias, y nada más', () => {
    for (const mime of ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm']) {
      expect(mimeValido(mime, 'audio')).toBe(true);
    }
    for (const mime of ['audio/mpeg', 'audio/ogg', 'audio/mp4', 'video/webm']) {
      expect(mimeValido(mime, 'audio')).toBe(false);
    }
  });

  it('una imagen en la rama de audio (y viceversa) no pasa', () => {
    expect(mimeValido('image/png', 'audio')).toBe(false);
    expect(mimeValido('audio/wav', 'boleta')).toBe(false);
  });
});

describe('limites = los del compute', () => {
  it('imagen 4 MB, audio 8 MB', () => {
    expect(limiteDe('boleta')).toBe(4 * 1024 * 1024);
    expect(limiteDe('audio')).toBe(8 * 1024 * 1024);
    expect(LIMITE_IMAGEN).toBe(4 * 1024 * 1024);
    expect(LIMITE_AUDIO).toBe(8 * 1024 * 1024);
  });

  it('el mensaje dice el tope real, no un número raro', () => {
    expect(textoLimite('boleta')).toBe('4 MB');
    expect(textoLimite('audio')).toBe('8 MB');
  });

  it('los timeouts le dan margen al compute (120 s OCR / 180 s ASR), no 30 s', () => {
    expect(MS_EXTRACT).toBeGreaterThan(120_000);
    expect(MS_TRANSCRIBE).toBeGreaterThan(180_000);
  });
});

describe('bytesCoinciden — el MIME declarado no basta', () => {
  it('un image/png con bytes de ZIP se rechaza', () => {
    expect(bytesCoinciden(bytes(ZIP), 'image/png')).toBe(false);
  });

  it('firmas reales', () => {
    expect(bytesCoinciden(bytes(PNG), 'image/png')).toBe(true);
    expect(bytesCoinciden(bytes(JPEG), 'image/jpeg')).toBe(true);
    expect(bytesCoinciden(bytes(WAV), 'audio/wav')).toBe(true);
    expect(bytesCoinciden(bytes(WEBM), 'audio/webm')).toBe(true);
  });

  it('un JPEG declarado png no pasa', () => {
    expect(bytesCoinciden(bytes(JPEG), 'image/png')).toBe(false);
  });

  it('RIFF sin WAVE no es wav (p. ej. un .webp o un .avi)', () => {
    expect(bytesCoinciden(bytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'audio/wav')).toBe(
      false,
    );
  });

  it('cuerpo demasiado corto no adivina: false', () => {
    expect(bytesCoinciden(new Uint8Array([0x89, 0x50]), 'image/png')).toBe(false);
    expect(bytesCoinciden(new Uint8Array(), 'image/jpeg')).toBe(false);
  });
});

describe('extensionDe', () => {
  it('usa la forma canónica, no el MIME crudo', () => {
    expect(extensionDe('image/jpg')).toBe('jpg');
    expect(extensionDe('image/jpeg')).toBe('jpg');
    expect(extensionDe('image/png')).toBe('png');
    expect(extensionDe('audio/wave')).toBe('wav');
    expect(extensionDe('audio/webm')).toBe('webm');
  });
});

describe('elegirOlla — Postgres no elige por el usuario', () => {
  const A = '0b6a1e6e-5f2a-4c1e-9c2b-0e6a1e6e5f2a';
  const B = '1c7b2f7f-6a3b-4d2f-8d3c-1f7b2f7f6a3b';

  it('sin olla_id y una sola olla: esa', () => {
    expect(elegirOlla(null, [A])).toEqual({ ok: true, ollaId: A });
  });

  it('sin olla_id y dos ollas: 400 OLLA_AMBIGUA (no elige la primera)', () => {
    const r = elegirOlla(null, [A, B]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.codigo).toBe('OLLA_AMBIGUA');
    }
  });

  it('olla_id de una olla del usuario: se acepta, sin importar mayúsculas', () => {
    expect(elegirOlla(B, [A, B])).toEqual({ ok: true, ollaId: B });
    expect(elegirOlla(B.toUpperCase(), [A, B])).toEqual({ ok: true, ollaId: B });
  });

  it('olla_id de otra olla: 403 OLLA_AJENA', () => {
    const r = elegirOlla(B, [A]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.codigo).toBe('OLLA_AJENA');
    }
  });

  it('olla_id con forma inválida (inyección, path traversal): 400', () => {
    for (const pedida of ['../../otra', '1 OR 1=1', 'abc']) {
      const r = elegirOlla(pedida, [A]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.codigo).toBe('OLLA_INVALIDA');
    }
  });

  it('sin ninguna olla: 403 SIN_OLLA', () => {
    const r = elegirOlla(null, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(403);
  });
});
