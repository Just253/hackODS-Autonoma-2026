/**
 * Reloj de Lamport del dispositivo.
 *
 * `Date.now()` ordena por reloj de pared y eso rompe la convergencia (D5): dos
 * telefonos con relojes distintos editarian distinto. El contador vive en Dexie
 * y solo sube. La persistencia real del outbox es de `packages/sync`; aca solo
 * se guarda el contador para que una recarga no lo reinicie.
 */
import type { BaseOlla } from './base.js';

const CLAVE = 'lamport' as const;

/**
 * Debe llamarse DENTRO de una transaccion que incluya `meta` (el alta de
 * persona ya abre `rw` sobre `personas`, `identidadLocal` y `meta`): Dexie no
 * permite que una transaccion hija toque una tabla que el padre no declaro.
 */
export async function siguienteLamport(base: BaseOlla): Promise<number> {
  const actual = await base.meta.get(CLAVE);
  const siguiente = (actual?.valor ?? 0) + 1;
  await base.meta.put({ clave: CLAVE, valor: siguiente });
  return siguiente;
}

export async function lamportActual(base: BaseOlla): Promise<number> {
  const actual = await base.meta.get(CLAVE);
  return actual?.valor ?? 0;
}
