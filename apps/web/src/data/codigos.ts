import { personaSchema } from '@hackods/contracts';

/**
 * Generador de `codigoP` (P-XXXX) local al dispositivo.
 *
 * El servidor no reparte codigos durante la ventana offline (MODO-6H ┬º2), asi
 * que el codigo se genera aca. Alfabeto sin ambiguedad (sin 0/O, 1/I), el mimo
 * que exige `ollaSchema.codigo`, para que se pueda dictar por radio o leer del
 * papel del comedor sin errores. El regex de `personaSchema` lo valida igual.
 */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LARGO = 4;

export type Azar = () => number;

const azarGlobal: Azar = () => Math.random();

function letra(azar: Azar): string {
  const indice = Math.floor(azar() * ALFABETO.length);
  // Clamp defensivo: un azar inyectado con 1 exacto no debe salir del alfabeto.
  return ALFABETO[Math.min(indice, ALFABETO.length - 1)] ?? 'A';
}

export function generarCodigoP(azar: Azar = azarGlobal): string {
  let cuerpo = '';
  for (let i = 0; i < LARGO; i += 1) {
    cuerpo += letra(azar);
  }
  return `P-${cuerpo}`;
}

/**
 * Codigo libre en la olla. `ocupados` son los codigos ya guardados en Dexie;
 * el llamador es quien persiste y reintenta si hubo carrera.
 */
export function generarCodigoPLibre(
  ocupados: ReadonlySet<string>,
  azar: Azar = azarGlobal,
): string {
  for (let intento = 0; intento < 100; intento += 1) {
    const codigo = generarCodigoP(azar);
    if (!ocupados.has(codigo)) {
      return codigo;
    }
  }
  throw new Error('no se encontro un codigo P-XXXX libre: revisar el generador');
}

/** Ultimo paso antes de guardar: el schema es la puerta, no una suposicion. */
export function validarPersona(persona: unknown): unknown {
  return personaSchema.parse(persona);
}
