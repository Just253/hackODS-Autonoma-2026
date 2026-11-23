import type {
  Contexto,
  GrupoEtario,
  ProveedorComposicion,
  ReglasMotor,
} from './contrato.js';
import { ContratoInvalido } from './errors.js';

export const GRUPOS_ETARIOS: readonly GrupoEtario[] = [
  'menor_6m',
  'lactante_6_23m',
  'menor_5',
  'escolar',
  'adolescente',
  'adulto',
  'adulto_mayor',
  'gestante',
  'lactante_materna',
];

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function esEnteroNoNegativo(valor: unknown): valor is number {
  return esNumero(valor) && Number.isInteger(valor) && valor >= 0;
}

/**
 * Valida que `ReglasMotor` este completo. No completa nada: si falta un umbral,
 * lo informa y lanza. Los valores siguen siendo responsabilidad del nutricionista.
 */
export function validarReglas(reglas: ReglasMotor | null | undefined): void {
  if (reglas === null || reglas === undefined) {
    throw new ContratoInvalido('ReglasMotor ausente', ['reglas']);
  }

  const faltan: string[] = [];

  if (typeof reglas.version !== 'string' || reglas.version.trim() === '') {
    faltan.push('version');
  }

  if (!esNumero(reglas.toleranciaPorcion) || reglas.toleranciaPorcion < 0 || reglas.toleranciaPorcion > 1) {
    faltan.push('toleranciaPorcion');
  }

  if (!esNumero(reglas.umbralDesvioPorcion) || reglas.umbralDesvioPorcion < 0) {
    faltan.push('umbralDesvioPorcion');
  }

  if (!esEnteroNoNegativo(reglas.maxSustitucionesPorPlato)) {
    faltan.push('maxSustitucionesPorPlato');
  }

  if (!esEnteroNoNegativo(reglas.maxPlatosPorMomento) || reglas.maxPlatosPorMomento < 1) {
    faltan.push('maxPlatosPorMomento');
  }

  if (reglas.frecuenciaMaxima === null || typeof reglas.frecuenciaMaxima !== 'object') {
    faltan.push('frecuenciaMaxima');
  } else {
    for (const [insumo, veces] of Object.entries(reglas.frecuenciaMaxima)) {
      if (!esNumero(veces) || veces < 0) {
        faltan.push(`frecuenciaMaxima.${insumo}`);
      }
    }
  }

  const severidad = reglas.umbralesSeveridad;
  for (const nivel of ['critico', 'alto', 'moderado'] as const) {
    const valor = severidad?.[nivel];
    if (!esNumero(valor) || valor < 0) {
      faltan.push(`umbralesSeveridad.${nivel}`);
    }
  }

  if (
    !esNumero(reglas.coberturaMinimaPorComida) ||
    reglas.coberturaMinimaPorComida < 0 ||
    reglas.coberturaMinimaPorComida > 1
  ) {
    faltan.push('coberturaMinimaPorComida');
  }

  if (!Array.isArray(reglas.gruposObligatorios) || reglas.gruposObligatorios.length === 0) {
    faltan.push('gruposObligatorios');
  } else {
    reglas.gruposObligatorios.forEach((grupo, i) => {
      if (!GRUPOS_ETARIOS.includes(grupo)) {
        faltan.push(`gruposObligatorios[${i}]`);
      }
    });
  }

  if (faltan.length > 0) {
    throw new ContratoInvalido('ReglasMotor incompleto: hay valores [a confirmar]', faltan);
  }
}

export interface EntradaContexto {
  /** ISO 8601 UTC. */
  readonly ahora: string;
  readonly reglas: ReglasMotor;
  readonly composicion: ProveedorComposicion;
  readonly ids: { nuevo(): string };
}

/**
 * Construye el `Contexto` validando sus reglas. Todo lo que el motor necesita
 * entra por aca: sin imports de datos, sin reloj del sistema, sin red.
 */
export function crearContexto(entrada: EntradaContexto): Contexto {
  const faltan: string[] = [];

  if (entrada.ahora.trim() === '' || Number.isNaN(Date.parse(entrada.ahora))) {
    faltan.push('ahora');
  }
  if (entrada.composicion === null || typeof entrada.composicion?.version !== 'string') {
    faltan.push('composicion.version');
  }
  if (typeof entrada.ids?.nuevo !== 'function') {
    faltan.push('ids.nuevo');
  }
  if (faltan.length > 0) {
    throw new ContratoInvalido('Contexto incompleto', faltan);
  }

  validarReglas(entrada.reglas);

  return Object.freeze({
    ahora: entrada.ahora,
    locale: 'es-PE' as const,
    reglas: entrada.reglas,
    composicion: entrada.composicion,
    ids: entrada.ids,
  });
}
