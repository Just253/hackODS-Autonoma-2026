/**
 * Cursor de `sync-pull` por olla, en `localStorage`.
 *
 * Es una preferencia de ESTE dispositivo (como la sesion y el tamano de letra):
 * dice desde que `(lamport, deviceId)` traer eventos la proxima vez. Si se
 * pierde, el proximo pull arranca en cero: se re-traen eventos ya aplicados y
 * `put` los vuelve a dejar igual (idempotente), no se duplica nada.
 *
 * No va a Dexie a proposito: son 40 bytes, no es dato de dominio y no tiene que
 * abrir IndexedDB antes del primer pull.
 */

export interface CursorSync {
  readonly lamport: number;
  readonly deviceId: string;
}

const CURSOR_CERO: CursorSync = { lamport: 0, deviceId: '' };

export interface AlmacenCursor {
  leer(): CursorSync;
  guardar(cursor: CursorSync): void;
}

function claveCursor(ollaId: string): string {
  return `hackods:cursor-sync:${ollaId}`;
}

function almacenSeguro(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Cursor persistido por olla. Nunca lanza: sin almacen, cursor en cero. */
export function cursorDeOlla(
  ollaId: string,
  almacen: Pick<Storage, 'getItem' | 'setItem'> | null = almacenSeguro(),
): AlmacenCursor {
  if (almacen === null) {
    return { leer: () => CURSOR_CERO, guardar: () => undefined };
  }
  const clave = claveCursor(ollaId);
  return {
    leer() {
      try {
        const crudo = almacen.getItem(clave);
        if (crudo === null) return CURSOR_CERO;
        const valor = JSON.parse(crudo) as Partial<CursorSync>;
        if (
          typeof valor.lamport !== 'number' ||
          !Number.isInteger(valor.lamport) ||
          valor.lamport < 0 ||
          typeof valor.deviceId !== 'string'
        ) {
          return CURSOR_CERO;
        }
        return { lamport: valor.lamport, deviceId: valor.deviceId };
      } catch {
        return CURSOR_CERO;
      }
    },
    guardar(cursor) {
      try {
        almacen.setItem(clave, JSON.stringify(cursor));
      } catch {
        /* cuota o modo privado: se reintenta desde cero la proxima vez */
      }
    },
  };
}

/** Cursor en memoria: para tests y para un dispositivo sin almacen. */
export function cursorEnMemoria(inicial: CursorSync = CURSOR_CERO): AlmacenCursor {
  let actual = inicial;
  return {
    leer: () => actual,
    guardar: (cursor) => {
      actual = cursor;
    },
  };
}
