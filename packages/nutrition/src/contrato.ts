/**
 * Contrato del motor nutricional (docs/contracts/nutricion.md + docs/DECISIONES.md D3).
 *
 * La unidad de verdad es el MENU SEMANAL FIRMADO POR NUTRICIONISTA y la PORCION POR GRUPO.
 * El sistema no prescribe dietas ni calcula requerimientos individuales.
 *
 * ESTE PAQUETE NO CONTIENE VALORES NUTRICIONALES: ni una kcal, ni un mg, ni un umbral.
 * Todo valor entra inyectado por `ReglasMotor` y `ProveedorComposicion`; lo que no tiene
 * fuente se marca `null` = [valor a confirmar].
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

export type EstadoMenu = 'borrador' | 'en_revision' | 'aprobado' | 'publicado' | 'retirado';
export type MomentoMenu = 'almuerzo' | 'cena';
export type Severidad = 'critico' | 'alto' | 'moderado';
export type DietaEspecial =
  | 'vegetariana'
  | 'vegana'
  | 'sin_lactosa'
  | 'sin_gluten'
  | 'bajo_sodio'
  | 'sin_cerdo'
  | 'sin_pescado'
  | 'sin_huevo';

export interface Insumo {
  readonly id: string;
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
}

/** Sello obligatorio del menu aprobado. */
export interface SelloMenu {
  readonly nutricionista: string;
  readonly cnp: string;
  readonly fecha: string;
  readonly version: number;
  /** SHA-256 del contenido del menu (hex). */
  readonly hash: string;
}

export interface IngredienteMenu {
  readonly insumoId: string;
  /** Gramos de porcion comestible cruda. null = sin cantidad (degrada). */
  readonly gramos: number | null;
  readonly unidad: Unidad;
}

/** Porcion base del plato y ajuste por grupo etario. */
export interface Porcion {
  readonly grupo: GrupoEtario;
  readonly cantidad: number;
  readonly unidad: Unidad;
}

export interface PlatoMenu {
  readonly id: string;
  readonly momento: MomentoMenu;
  readonly titulo: string;
  readonly ingredientes: readonly IngredienteMenu[];
  /** Porcion definida por el nutricionista para cada grupo. */
  readonly porciones: readonly Porcion[];
}

export interface MenuDia {
  readonly diaSemana: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly fecha: string | null;
  readonly platos: readonly PlatoMenu[];
}

/** Menu semanal: 2 perfiles x 2 opciones, 7 dias, almuerzo y cena. */
export interface MenuSemanal {
  readonly id: string;
  readonly ollaId: string | null;
  readonly perfil: 'general' | 'especial';
  readonly opcion: 'A' | 'B';
  readonly estado: EstadoMenu;
  readonly sello: SelloMenu | null;
  readonly dias: readonly MenuDia[];
  readonly version: number;
  readonly hash: string;
}

export type TipoRestriccion = 'alergia' | 'dieta' | 'frecuencia' | 'inocuidad' | 'otro';

export interface Restriccion {
  readonly id: string;
  readonly tipo: TipoRestriccion;
  readonly valor: string;
  readonly motivo: string | null;
}

export interface SustitucionAprobada {
  readonly id: string;
  readonly insumoOrigenId: string;
  readonly insumoDestinoId: string;
  /** Gramos destino = gramos origen x factor. */
  readonly factor: number;
  readonly aprobadaPor: string;
}

export interface AporteNutrientes {
  /** Clave presente = valor conocido. Clave ausente = sin dato (NO es 0). */
  readonly valores: Readonly<Partial<Record<NutrienteId, number>>>;
}

/** Se usa para explicar/informar; no para prescribir requerimientos individuales. */
export interface ProveedorComposicion {
  readonly tablaId: string;
  readonly version: string;
  aporte(insumoId: string, gramos: number): AporteNutrientes | null;
  retencion(nutriente: NutrienteId, tecnica: 'hervido' | 'guisado' | 'frito' | 'plancha' | 'al_vapor' | 'crudo'): number;
}

/**
 * Todo umbral es configuracion, no constante. `null` = [valor a confirmar].
 * `crearContexto` rechaza un juego incompleto: un umbral faltante no puede
 * convertirse en un 0 silencioso.
 */
export interface ReglasMotor {
  readonly version: string;
  /** Fraccion de tolerancia al comparar la porcion servida con la firmada. */
  readonly toleranciaPorcion: number | null;
  /** Desvio absoluto (en gramos) que dispara hallazgo. */
  readonly umbralDesvioPorcion: number | null;
  readonly maxSustitucionesPorPlato: number | null;
  readonly maxPlatosPorMomento: number | null;
  /** insumoId -> veces por semana. */
  readonly frecuenciaMaxima: Readonly<Record<string, number | null>>;
  readonly umbralesSeveridad: {
    readonly critico: number | null;
    readonly alto: number | null;
    readonly moderado: number | null;
  };
  /** Cobertura minima que debe declarar el menu validado. null = [a confirmar]. */
  readonly coberturaMinimaPorComida: number | null;
  /** Grupos que el menu debe cubrir; estructura, no valor nutricional. */
  readonly gruposObligatorios: readonly GrupoEtario[];
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

export interface HallazgoMenu {
  readonly tipo: 'alergia' | 'dieta' | 'frecuencia' | 'porcion' | 'firma' | 'inocuidad';
  readonly severidad: Severidad;
  readonly platoId: string | null;
  readonly insumoId: string | null;
  /** Frase legible; el motor no decide la presentacion final. */
  readonly mensaje: string;
  /** Detalle numerico solo para la vista tecnica. */
  readonly tecnico: {
    readonly esperado: number | null;
    readonly observado: number | null;
    readonly unidad: string;
  } | null;
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

export interface ResultadoValidacion {
  readonly menuId: string;
  readonly valido: boolean;
  readonly selloValido: boolean;
  /** Hash recalculado por el motor sobre el contenido recibido. */
  readonly hashCalculado: string;
  readonly hallazgos: readonly HallazgoMenu[];
  /** 0..1: proporcion de pares plato×grupo con porcion declarada. */
  readonly coberturaDatos: number;
  readonly platosSinPorcion: readonly string[];
  readonly insumosSinDato: readonly string[];
  readonly trazabilidad: {
    readonly motorVersion: string;
    readonly reglasVersion: string;
    readonly composicionVersion: string;
    readonly menuVersion: number;
    readonly calculadoEn: string;
  };
  readonly explicacion: TextoExplicativo;
}

export interface PorcionAjustada {
  readonly grupo: GrupoEtario;
  readonly cantidad: number;
  readonly unidad: Unidad;
  /** 1 = sin ajuste. El ajuste por grupo nunca inventa equivalencias. */
  readonly factorAplicado: number;
  readonly motivo: string;
}

export interface ResultadoSustitucion {
  readonly platoId: string;
  readonly insumoOrigenId: string;
  readonly insumoDestinoId: string;
  readonly factor: number;
  readonly gramosOrigen: number | null;
  readonly gramosDestino: number | null;
  /** Siempre true: solo se devuelven sustituciones aprobadas en la plantilla. */
  readonly aprobada: true;
  readonly explicacion: TextoExplicativo;
}
