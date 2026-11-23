/**
 * Folio corto imprimible con 2 caracteres de verificacion.
 * Sirve para rechazar el QR de otra olla con un mensaje util en vez de un error.
 * No usa azar ni reloj: el mismo id da el mismo folio.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const LARGO_BASE = 8;

function normalizar(id: string): string {
  return id.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function digito(base: string): string {
  let suma = 7;
  for (let i = 0; i < base.length; i += 1) {
    suma = (suma * 31 + base.charCodeAt(i)) % ALFABETO.length;
  }
  return ALFABETO[suma] ?? 'A';
}

export function digitoVerificacion(base: string): string {
  return digito(base) + digito(`x${base}`);
}

/** `generarFolio('uuid…')` → `ABC12345-K7`. */
export function generarFolio(id: string): string {
  const base = normalizar(id).slice(0, LARGO_BASE).padEnd(LARGO_BASE, '0');
  return `${base}-${digitoVerificacion(base)}`;
}

export function validarFolio(folio: string): boolean {
  const partes = /^([A-Z0-9]{8})-([A-Z0-9]{2})$/.exec(folio);
  const base = partes?.[1];
  const verificacion = partes?.[2];
  if (base === undefined || verificacion === undefined) {
    return false;
  }
  return verificacion === digitoVerificacion(base);
}
