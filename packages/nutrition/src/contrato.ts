/**
 * Contrato del motor nutricional (docs/contracts/nutricion.md).
 *
 * ESTE PAQUETE NO CONTIENE VALORES NUTRICIONALES. Ni una kcal, ni un mg, ni un umbral.
 * Todo valor entra inyectado por `ProveedorComposicion`, `ProveedorRequerimientos` y
 * `ReglasMotor`; lo que todavia no tiene fuente se marca `null` = [valor a confirmar].
 */

export type NutrienteId =
  | 'energia'
  | 'proteina'
  | 'hierro'
  | 'zinc'
  | 'vitaminaA'
  | 'folato'
  | 'vitaminaB12'
  | 'calcio';

export type FactorAbsorcionId = 'vitaminaC' | 'fitato' | 'tanino' | 'hemo';

export type Unidad =
  | 'g'
  | 'kg'
  | 'ml'
  | 'unidad'
  | 'taza'
  | 'cucharada'
  | 'cucharón'
  | 'atado'
  | 'lata';

export type Sexo = 'F' | 'M' | 'X';
export type Actividad = 'ligera' | 'moderada' | 'intensa';

export type DietaEspecial =
  | 'vegetariana'
  | 'vegana'
  | 'sin_lactosa'
  | 'sin_gluten'
  | 'bajo_sodio'
  | 'sin_cerdo'
  | 'sin_pescado'
  | 'sin_huevo';

export type Condicion =
  | 'menor_6m'
  | 'lactante_6_23m'
  | 'menor_5'
  | 'escolar'
  | 'adolescente'
  | 'adulto'
  | 'adulto_mayor'
  | 'discapacidad_masticacion'
  | 'requiere_derivacion';

export type Veredicto = 'apto' | 'deficit' | 'insuficiente_datos';
export type Severidad = 'critico' | 'alto' | 'moderado';

export type GrupoEtario =
  | 'menor_6m'
  | 'lactante_6_23m'
  | 'menor_5'
  | 'escolar'
  | 'adolescente'
  | 'adulto'
  | 'adulto_mayor'
  | 'gestante'
  | 'lactante_materna';

export type TipoServicio = 'desayuno' | 'almuerzo' | 'cena' | 'refaccion' | 'unico';
export type ModoReparto = 'igual' | 'diferenciado';
export type Tecnica = 'hervido' | 'guisado' | 'frito' | 'plancha' | 'al_vapor' | 'crudo';

export interface Gestacion {
  readonly trimestre: 1 | 2 | 3;
  readonly semanas: number | null;
  readonly controlPrenatal: boolean | null;
}

export interface EstadoAnemia {
  /** Solo true si lo informo personal de salud. El motor NO diagnostica. */
  readonly diagnosticada: boolean;
  /** Dato clinico: vista tecnica, nunca el veredicto publico. */
  readonly hemoglobinaGdL: number | null;
  readonly altitudMetros: number | null;
  readonly fechaDiagnostico: string | null;
}

export interface Persona {
  readonly id: string;
  /** Unica entrada obligatoria del calculo. */
  readonly edadMeses: number;
  readonly sexo: Sexo;
  readonly pesoKg: number | null;
  readonly tallaCm: number | null;
  readonly actividad: Actividad;
  readonly gestacion: Gestacion | null;
  readonly lactancia: 'exclusiva' | 'predominante' | 'mixta' | 'no' | null;
  readonly anemia: EstadoAnemia | null;
  readonly alergias: readonly string[];
  readonly dietas: readonly DietaEspecial[];
  readonly condiciones: readonly Condicion[];
  readonly notas: string | null;
}

export interface Insumo {
  readonly id: string;
  readonly nombre: string;
  readonly grupo:
    | 'cereal'
    | 'menestra'
    | 'tuberculo'
    | 'verdura'
    | 'fruta'
    | 'carne'
    | 'viscera'
    | 'pescado'
    | 'huevo'
    | 'lacteo'
    | 'grasa'
    | 'azucar'
    | 'condimento'
    | 'otro';
  /** null = insumo sin dato de composicion: degrada, no rompe. */
  readonly refComposicion: {
    readonly tabla: string;
    readonly clave: string;
    readonly version: string;
  } | null;
  /** 1 cucharada = N g. Equivalencia declarada, nunca inferida. */
  readonly unidadCasera: Readonly<Partial<Record<Unidad, number>>>;
  readonly alergenos: readonly string[];
  readonly esPerecedero: boolean;
  readonly vidaUtilDias: number | null;
  readonly notas: string | null;
}

export interface IngredienteReceta {
  readonly insumoId: string;
  /** Gramos de porcion comestible cruda. */
  readonly gramos: number;
  readonly captura: { readonly cantidad: number; readonly unidad: Unidad } | null;
}

export interface Receta {
  readonly id: string;
  readonly nombre: string;
  readonly ingredientes: readonly IngredienteReceta[];
  readonly porcionesBase: number;
  readonly rendimientoCocidoG: number | null;
  readonly tecnicas: readonly Tecnica[];
  readonly version: number;
}

export interface Servicio {
  readonly id: string;
  readonly ollaId: string;
  readonly fecha: string;
  readonly tipo: TipoServicio;
  readonly recetaId: string;
  readonly comensales: readonly { readonly personaId: string; readonly presente: boolean }[];
  /** Fraccion del dia (0..1]. null = default de reglas por `tipo`. */
  readonly coberturaDia: number | null;
  readonly comidaPrincipal: boolean | null;
  readonly modoReparto: ModoReparto;
  readonly bebidas: readonly {
    readonly tipo: 'te' | 'cafe' | 'mate' | 'jugo' | 'agua' | 'otro';
    readonly conComida: boolean;
  }[];
}

export interface ExistenciaDespensa {
  readonly insumoId: string;
  readonly gramosDisponibles: number;
  readonly gramosReservados: number;
  readonly venceEn: string | null;
  readonly costoPorKg: number | null;
}

export interface Despensa {
  readonly ollaId: string;
  readonly actualizadaEn: string;
  readonly existencias: readonly ExistenciaDespensa[];
}

export interface AporteNutrientes {
  /** Clave presente = valor conocido. Clave ausente = sin dato (NO es 0). */
  readonly valores: Readonly<Partial<Record<NutrienteId, number>>>;
  readonly factores?: Readonly<Partial<Record<FactorAbsorcionId, number>>>;
}

export interface ProveedorComposicion {
  readonly tablaId: string;
  readonly version: string;
  /** Aporte de `gramos` de porcion comestible cruda. null = insumo sin dato. */
  aporte(insumoId: string, gramos: number): AporteNutrientes | null;
  /** Factor de retencion por tecnica. 1 si no hay dato. */
  retencion(nutriente: NutrienteId, tecnica: Tecnica): number;
}

export interface ProveedorRequerimientos {
  readonly tablaId: string;
  readonly version: string;
  /** Requerimiento diario por persona. Claves ausentes = sin dato. */
  requerimiento(p: Persona, ctx: Contexto): AporteNutrientes;
  /** Peso de referencia sin balanza. null = sin dato. */
  pesoReferencia(edadMeses: number, sexo: Sexo): number | null;
}

/**
 * Todo umbral es configuracion, no constante. `null` = [valor a confirmar].
 * `crearContexto` rechaza un juego incompleto: un umbral faltante no puede
 * convertirse en un 0 silencioso.
 */
export interface ReglasMotor {
  readonly version: string;
  readonly coberturaDia: Readonly<Record<TipoServicio, number | null>>;
  readonly coberturaHierroComidaPrincipal: number | null;
  readonly umbralDeficit: number | null;
  readonly umbralesSeveridad: {
    readonly critico: number | null;
    readonly alto: number | null;
    readonly moderado: number | null;
  };
  readonly pesos: Readonly<Record<NutrienteId, number | null>>;
  readonly topesDePuntaje: readonly { readonly si: string; readonly entonces: number | null }[];
  readonly bandasVeredicto: readonly {
    readonly min: number | null;
    readonly veredicto: Veredicto;
  }[];
  readonly factorObjetivoAnemia: number | null;
  readonly maxSugerencias: number | null;
  readonly maxNutrientesAAjustar: number | null;
  readonly escalonesGramos: readonly (number | null)[];
  readonly maxFrecuenciaInsumo: Readonly<Record<string, number | null>>;
  readonly umbralRepeticionOverride: number | null;
}

/** Contexto explicito: nada de estado global, nada de Date.now(). */
export interface Contexto {
  /** ISO 8601 UTC. */
  readonly ahora: string;
  readonly locale: 'es-PE';
  readonly reglas: ReglasMotor;
  readonly composicion: ProveedorComposicion;
  /** Inyectado para no romper la pureza. */
  readonly ids: { nuevo(): string };
}

export interface Hallazgo {
  readonly nutriente: NutrienteId;
  readonly severidad: Severidad;
  /** Cantidad de personas bajo el objetivo. Nunca nombres. */
  readonly personasAfectadas: number;
  readonly grupos: readonly GrupoEtario[];
  readonly ratio: number | null;
  readonly tecnico: {
    readonly objetivo: number;
    readonly aporte: number;
    readonly unidad: string;
    readonly factoresAplicados: readonly string[];
  } | null;
}

export interface Sugerencia {
  readonly id: string;
  readonly insumoId: string;
  readonly nombreInsumo: string;
  readonly cantidad: number;
  readonly unidad: Unidad;
  readonly paraNutriente: NutrienteId;
  readonly razon: string;
  readonly enDespensa: boolean;
  /** Siempre true: lo vetado (alergia/dieta) no se devuelve. */
  readonly compatible: true;
  readonly deltaPuntaje: number | null;
}

export interface DesglosePuntaje {
  readonly nutriente: NutrienteId;
  readonly peso: number;
  readonly ratio: number | null;
  readonly aporte: number;
}

export interface CamposFaltante {
  readonly campo: string;
  readonly motivo: 'requerido' | 'sin_dato_en_tabla' | 'fuera_de_rango';
}

export interface TextoExplicativo {
  readonly titulo: string;
  readonly lineas: readonly string[];
  readonly accion: string | null;
  readonly reconocimiento: string | null;
  readonly derivacion: string | null;
  readonly notaDatos: string | null;
  readonly nivelTecnico: boolean;
}

export interface ResultadoEvaluacion {
  readonly servicioId: string;
  readonly veredicto: Veredicto;
  readonly puntaje: number | null;
  readonly desglose: readonly DesglosePuntaje[];
  readonly hallazgos: readonly Hallazgo[];
  readonly grupos: readonly {
    readonly grupo: GrupoEtario;
    readonly personas: number;
    readonly ratios: Readonly<Partial<Record<NutrienteId, number | null>>>;
  }[];
  readonly coberturaDatos: number;
  readonly insumosSinDato: readonly string[];
  readonly insumosSinCantidad: readonly string[];
  readonly recetaIncompleta: boolean;
  readonly sinDespensa: boolean;
  readonly estimaciones: readonly (
    | 'peso_por_edad'
    | 'sexo_no_declarado'
    | 'rendimiento_no_pesado'
    | 'sin_balanza'
  )[];
  readonly confianza: number;
  readonly trazabilidad: {
    readonly motorVersion: string;
    readonly reglasVersion: string;
    readonly composicionVersion: string;
    readonly requerimientosVersion: string;
    readonly inputsHash: string;
    readonly calculadoEn: string;
  };
  readonly camposFaltantes: readonly CamposFaltante[];
  readonly explicacion: TextoExplicativo;
}

export interface ResultadoSugerencias {
  readonly servicioId: string;
  readonly sugerencias: readonly Sugerencia[];
  readonly noResoluble: readonly {
    readonly hallazgo: NutrienteId;
    readonly motivo: 'sin_stock' | 'alergia' | 'dieta' | 'sin_insumo_adecuado';
  }[];
  readonly recetaPropuesta: Receta | null;
  readonly puntajeEstimado: number | null;
}

export interface SolicitudItem {
  readonly insumoId: string;
  readonly cantidad: number;
  readonly unidad: Unidad;
  readonly presentacion: string | null;
  readonly paraNutriente: NutrienteId;
  readonly cubreFraccion: number;
}

export interface ResultadoSolicitud {
  readonly deficitDe: readonly { readonly nutriente: NutrienteId; readonly cantidad: number }[];
  readonly items: readonly SolicitudItem[];
  readonly cubreTotal: number;
  readonly destinatarios: readonly {
    readonly ollaId: string;
    readonly items: readonly string[];
    readonly mensaje: string;
  }[];
  readonly prioridad: readonly { readonly personaId: string; readonly motivo: string }[];
  readonly parcial: boolean;
}
