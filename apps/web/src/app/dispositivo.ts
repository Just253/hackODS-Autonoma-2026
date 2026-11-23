/**
 * Identificador de ESTE dispositivo para el enrolamiento.
 *
 * `app.enroll(codigo, pin, deviceId)` lo exige, y `devices` lo guarda para que
 * la RLS sepa que el JWT pertenece a un aparato. Se genera una vez y se
 * conserva en `localStorage`; no es un secreto ni identifica a una persona
 * (DEC-2026-0002), solo a la tablet.
 */
const CLAVE_DISPOSITIVO = 'hackods:device-id:v1';

function almacenSeguro(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function nuevoId(): string {
  // Sin `crypto.randomUUID` (navegador viejo) se usa tiempo + azar: el valor
  // solo tiene que ser unico en esta olla, no criptografico.
  const azar = Math.random().toString(36).slice(2, 10);
  return `disp-${Date.now().toString(36)}-${azar}`;
}

/** El id persistido; si no hay almacen, uno nuevo por sesion de pagina. */
let enMemoria: string | null = null;

export function idDeDispositivo(): string {
  const almacen = almacenSeguro();
  if (almacen === null) {
    enMemoria ??= nuevoId();
    return enMemoria;
  }
  try {
    const guardado = almacen.getItem(CLAVE_DISPOSITIVO);
    if (guardado !== null && guardado.trim() !== '') return guardado;
    const id = nuevoId();
    almacen.setItem(CLAVE_DISPOSITIVO, id);
    return id;
  } catch {
    enMemoria ??= nuevoId();
    return enMemoria;
  }
}
