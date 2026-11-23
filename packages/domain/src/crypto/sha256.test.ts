/**
 * Vectores conocidos de FIPS 180-4. Si la implementacion pura de `sha256.ts` se
 * desvia en un solo bit, estos tests lo cazan: el hash del sello no se valida a
 * si mismo.
 */
import { describe, expect, it } from 'vitest';

import { sha256Hex } from './sha256.js';

describe('sha256Hex: vectores conocidos', () => {
  it('sha256("") = e3b0c442...', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('sha256("abc") = ba7816bf...', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sha256 de 448 bits ("abcdbcde..." 56 bytes) cruza el bloque de padding', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('un texto largo (> 1 bloque) matchea el vector de 1e6 "a"', () => {
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('es hex de 64 caracteres y es estable', () => {
    const hash = sha256Hex('menu-demo-general-A');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(sha256Hex('menu-demo-general-A'));
  });
});
