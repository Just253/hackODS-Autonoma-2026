import type {
  Contexto,
  GrupoEtario,
  MenuSemanal,
  PlatoMenu,
  Porcion,
  PorcionAjustada,
  Restriccion,
  ResultadoSustitucion,
  ResultadoValidacion,
  SustitucionAprobada,
  TextoExplicativo,
} from './contrato.js';
import { NoImplementado } from './errors.js';
import { validarReglas } from './reglas.js';

/**
 * Valida un menu firmado contra sus restricciones (alergias, dietas, frecuencia,
 * inocuidad) y verifica el sello. No prescribe dietas ni calcula requerimientos.
 *
 * TODO(M3): implementar. Un menu `aprobado`/`publicado` sin sello valido es invalido.
 */
export function validarMenu(
  menu: MenuSemanal,
  restricciones: readonly Restriccion[],
  ctx: Contexto,
): ResultadoValidacion {
  validarReglas(ctx.reglas);
  void menu;
  void restricciones;
  throw new NoImplementado('validarMenu');
}

/**
 * Ajusta la porcion firmada para un grupo etario. El factor sale de las reglas;
 * nunca se inventa una equivalencia.
 *
 * TODO(M3): implementar. Sin reglas completas no se ajusta: `ContratoInvalido`.
 */
export function porcionParaGrupo(
  grupo: GrupoEtario,
  porcionBase: Porcion,
  ctx: Contexto,
): PorcionAjustada {
  validarReglas(ctx.reglas);
  void grupo;
  void porcionBase;
  throw new NoImplementado('porcionParaGrupo');
}

/**
 * Aplica una sustitucion APROBADA en la plantilla, con su factor.
 * Nada de equivalencias inventadas ni sustituciones fuera de la lista.
 *
 * TODO(M3): implementar. Si no esta aprobada, `ContratoInvalido`.
 */
export function sustituirInsumo(
  plato: PlatoMenu,
  insumoOrigenId: string,
  sustituciones: readonly SustitucionAprobada[],
  ctx: Contexto,
): ResultadoSustitucion {
  validarReglas(ctx.reglas);
  void plato;
  void insumoOrigenId;
  void sustituciones;
  throw new NoImplementado('sustituirInsumo');
}

/**
 * Redacta el resultado. `organizadora` no puede ver tecnicismos ni cifras clinicas.
 *
 * TODO(M3): implementar con plantillas versionadas; nunca inventar frases con cifras.
 */
export function explicar(
  resultado: ResultadoValidacion,
  audiencia: 'organizadora' | 'nutricionista',
  ctx: Contexto,
): TextoExplicativo {
  validarReglas(ctx.reglas);
  void resultado;
  void audiencia;
  throw new NoImplementado('explicar');
}
