import type {
  Contexto,
  Despensa,
  NutrienteId,
  Persona,
  Receta,
  ResultadoEvaluacion,
  ResultadoSolicitud,
  ResultadoSugerencias,
  Servicio,
  TextoExplicativo,
} from './contrato.js';
import { NoImplementado } from './errors.js';
import { validarReglas } from './reglas.js';

/**
 * Evalua un servicio contra las personas que comen.
 * Degrada con `insuficiente_datos`; solo lanza `ContratoInvalido` si las reglas estan incompletas.
 *
 * TODO(M3): implementar. Invariantes en docs/contracts/nutricion.md 3.2.
 */
export function evaluarServicio(
  servicio: Servicio,
  personas: readonly Persona[],
  receta: Receta,
  despensa: Despensa | null,
  ctx: Contexto,
): ResultadoEvaluacion {
  validarReglas(ctx.reglas);
  void servicio;
  void personas;
  void receta;
  void despensa;
  throw new NoImplementado('evaluarServicio');
}

/**
 * Propone ajustes con lo que hay en la despensa, sin violar alergias ni dietas.
 *
 * TODO(M3): implementar. Maximo `ctx.reglas.maxSugerencias`, nunca para `menor_6m`.
 */
export function sugerirAjustes(
  evaluacion: ResultadoEvaluacion,
  servicio: Servicio,
  personas: readonly Persona[],
  receta: Receta,
  despensa: Despensa | null,
  ctx: Contexto,
  opciones?: { readonly incluirFaltantes?: boolean; readonly maxSugerencias?: number },
): ResultadoSugerencias {
  validarReglas(ctx.reglas);
  void evaluacion;
  void servicio;
  void personas;
  void receta;
  void despensa;
  void opciones;
  throw new NoImplementado('sugerirAjustes');
}

/**
 * Traduce un deficit a un pedido concreto a otras ollas.
 *
 * TODO(M5): implementar. Prioridad: anemia diagnosticada, gestantes/lactantes, <24 m, <5 a.
 */
export function priorizarSolicitud(
  deficit: readonly { readonly nutriente: NutrienteId; readonly cantidad: number }[],
  contexto: {
    readonly servicioId: string;
    readonly personas: readonly Persona[];
    readonly recetaObjetivo: Receta;
    readonly donantes: readonly {
      readonly ollaId: string;
      readonly superavit: readonly { readonly insumoId: string; readonly gramos: number }[];
      readonly distanciaKm: number | null;
      readonly confiabilidad: number | null;
    }[];
  },
  ctx: Contexto,
): ResultadoSolicitud {
  validarReglas(ctx.reglas);
  void deficit;
  void contexto;
  throw new NoImplementado('priorizarSolicitud');
}

/**
 * Redacta el resultado. `organizadora` no puede ver tecnicismos ni cifras clinicas.
 *
 * TODO(M3): implementar con plantillas versionadas; nunca inventar frases con cifras.
 */
export function explicar(
  evaluacion: ResultadoEvaluacion,
  sugerencias: ResultadoSugerencias | null,
  audiencia: 'organizadora' | 'nutricionista',
  ctx: Contexto,
): TextoExplicativo {
  validarReglas(ctx.reglas);
  void evaluacion;
  void sugerencias;
  void audiencia;
  throw new NoImplementado('explicar');
}
