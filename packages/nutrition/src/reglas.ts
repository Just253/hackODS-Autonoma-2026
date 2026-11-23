import type {
  Contexto,
  NutrienteId,
  ProveedorComposicion,
  ReglasMotor,
  TipoServicio,
} from './contrato.js';
import { ContratoInvalido } from './errors.js';

export const TIPOS_SERVICIO: readonly TipoServicio[] = [
  'desayuno',
  'almuerzo',
  'cena',
  'refaccion',
  'unico',
];

export const NUTRIENTES: readonly NutrienteId[] = [
  'energia',
  'proteina',
  'hierro',
  'zinc',
  'vitaminaA',
  'folato',
  'vitaminaB12',
  'calcio',
];

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function esEnteroPositivo(valor: unknown): valor is number {
  return esNumero(valor) && Number.isInteger(valor) && valor >= 1;
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

  for (const tipo of TIPOS_SERVICIO) {
    const valor = reglas.coberturaDia?.[tipo];
    if (!esNumero(valor) || valor <= 0 || valor > 1) {
      faltan.push(`coberturaDia.${tipo}`);
    }
  }

  if (
    !esNumero(reglas.coberturaHierroComidaPrincipal) ||
    reglas.coberturaHierroComidaPrincipal < 0 ||
    reglas.coberturaHierroComidaPrincipal > 1
  ) {
    faltan.push('coberturaHierroComidaPrincipal');
  }

  if (!esNumero(reglas.umbralDeficit) || reglas.umbralDeficit < 0) {
    faltan.push('umbralDeficit');
  }

  const severidad = reglas.umbralesSeveridad;
  for (const nivel of ['critico', 'alto', 'moderado'] as const) {
    const valor = severidad?.[nivel];
    if (!esNumero(valor) || valor < 0) {
      faltan.push(`umbralesSeveridad.${nivel}`);
    }
  }

  for (const nutriente of NUTRIENTES) {
    const peso = reglas.pesos?.[nutriente];
    if (!esNumero(peso) || peso < 0) {
      faltan.push(`pesos.${nutriente}`);
    }
  }

  if (!Array.isArray(reglas.topesDePuntaje)) {
    faltan.push('topesDePuntaje');
  } else {
    reglas.topesDePuntaje.forEach((tope, i) => {
      if (typeof tope?.si !== 'string' || tope.si.trim() === '' || !esNumero(tope.entonces)) {
        faltan.push(`topesDePuntaje[${i}]`);
      }
    });
  }

  if (!Array.isArray(reglas.bandasVeredicto) || reglas.bandasVeredicto.length === 0) {
    faltan.push('bandasVeredicto');
  } else {
    reglas.bandasVeredicto.forEach((banda, i) => {
      const veredictosValidos = ['apto', 'deficit', 'insuficiente_datos'];
      if (!esNumero(banda?.min) || !veredictosValidos.includes(banda.veredicto)) {
        faltan.push(`bandasVeredicto[${i}]`);
      }
    });
  }

  if (!esNumero(reglas.factorObjetivoAnemia) || reglas.factorObjetivoAnemia < 0) {
    faltan.push('factorObjetivoAnemia');
  }

  if (!esEnteroPositivo(reglas.maxSugerencias)) {
    faltan.push('maxSugerencias');
  }

  if (!esEnteroPositivo(reglas.maxNutrientesAAjustar)) {
    faltan.push('maxNutrientesAAjustar');
  }

  if (!Array.isArray(reglas.escalonesGramos) || reglas.escalonesGramos.length === 0) {
    faltan.push('escalonesGramos');
  } else {
    reglas.escalonesGramos.forEach((gramos, i) => {
      if (!esNumero(gramos) || gramos <= 0) {
        faltan.push(`escalonesGramos[${i}]`);
      }
    });
  }

  if (reglas.maxFrecuenciaInsumo === null || typeof reglas.maxFrecuenciaInsumo !== 'object') {
    faltan.push('maxFrecuenciaInsumo');
  } else {
    for (const [insumo, veces] of Object.entries(reglas.maxFrecuenciaInsumo)) {
      if (!esNumero(veces) || veces < 0) {
        faltan.push(`maxFrecuenciaInsumo.${insumo}`);
      }
    }
  }

  if (!esNumero(reglas.umbralRepeticionOverride) || reglas.umbralRepeticionOverride < 0) {
    faltan.push('umbralRepeticionOverride');
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
