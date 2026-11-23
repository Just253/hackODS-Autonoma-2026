/**
 * Un solo patrón de secreto para todo el repo: lo usan el pre-commit (staged) y `pnpm verificar`
 * (diff contra main). Vive acá para que no haya dos definiciones que se desincronicen.
 *
 * Busca un VALOR con forma de credencial, no la palabra: `const SECRETO = /token/` es código y
 * "los secretos no se commitean" es prosa. Si el patrón buscara la palabra, el propio guard se bloquearía
 * a sí mismo (pasó en el primer intento).
 */
export const SECRETO =
  /([A-Za-z0-9_-]*(api[_-]?key|secret|token|passw)[A-Za-z0-9_-]*\s*[:=]\s*["'][^"']{16,}["'])|\b(sk-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b|BEGIN [A-Z ]*PRIVATE KEY/i;

/** ¿Esta línea agrega una credencial? Devuelve true/false. */
export function pareceSecreto(linea) {
  return SECRETO.test(linea);
}
