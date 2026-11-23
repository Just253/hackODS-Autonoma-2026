/**
 * Fechas en palabras para la pantalla.
 *
 * El rótulo `2026-11-01` es un dato de contrato, no algo que se lee en la olla.
 * Estas funciones convierten la parte de fecha (los diez primeros caracteres
 * de un ISO) a "1 de noviembre" y a rangos como "Del 1 al 30 de noviembre".
 *
 * Sin `Date` ni zona horaria: se parte el string y se arma el texto. Asi el
 * resultado es el mismo en la tablet, en el servidor y en un test, y una fecha
 * con hora (`2026-11-01T10:00:00Z`) no se corre de dia por UTC.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

interface Partes {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
}

function partes(iso: string): Partes | null {
  const soloFecha = iso.slice(0, 10);
  const [anio, mes, dia] = soloFecha.split('-');
  if (anio === undefined || mes === undefined || dia === undefined) return null;
  const numeros = [Number(anio), Number(mes), Number(dia)];
  if (numeros.some((n) => !Number.isInteger(n))) return null;
  const [a, m, d] = numeros as [number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { anio: a, mes: m, dia: d };
}

/** "1 de noviembre". Si la fecha no se entiende, devuelve el texto tal cual. */
export function formatearDia(iso: string): string {
  const p = partes(iso);
  if (p === null) return iso;
  return `${p.dia} de ${MESES[p.mes - 1]}`;
}

/**
 * "Del 1 al 30 de noviembre" cuando es el mismo mes;
 * "Del 28 de octubre al 3 de noviembre" cuando cambia.
 */
export function formatearRango(desde: string, hasta: string): string {
  const inicio = partes(desde);
  const fin = partes(hasta);
  if (inicio === null || fin === null) return `Del ${desde} al ${hasta}`;

  if (inicio.mes === fin.mes && inicio.anio === fin.anio) {
    if (inicio.dia === fin.dia) return `El ${formatearDia(desde)}`;
    return `Del ${inicio.dia} al ${fin.dia} de ${MESES[fin.mes - 1]}`;
  }
  return `Del ${formatearDia(desde)} al ${formatearDia(hasta)}`;
}
