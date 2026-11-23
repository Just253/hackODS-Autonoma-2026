# 03 · Motor nutricional — contrato de interfaz

> **Alcance de este documento:** solo el **contrato** del paquete `packages/nutrition`.
> No define valores nutricionales, ni tablas de composición, ni requerimientos, ni umbrales
> clínicos. Todo eso entra por inyección (§1.6) y lo provee el usuario con otros agentes.
>
> **Lo que este documento sí fija:** qué datos entran, qué sale, qué funciones puras existen, cómo
> se explica el resultado, cómo se audita al nutricionista y qué no se dice nunca.
>
> **Regla de oro del contrato:** este paquete **no contiene ni un solo número nutricional**. Si un
> archivo de `packages/nutrition/src` tiene una cifra de kcal, mg o µg, es un bug de diseño.

Índice: §1 entradas · §2 salidas · §3 funciones puras · §4 explicabilidad y override ·
§5 ética y límites · §6 fixtures · nota final.

---

## 0. Convenciones transversales

| Convención | Regla |
|---|---|
| Unidades canónicas | Masa en **gramos**, edad en **meses**, tiempo en **ISO 8601 UTC**. |
| Números | `number` finito; nunca `NaN`/`Infinity` cruza el borde. |
| Ausencia de dato | `null` (nunca `0`, nunca `undefined` en JSON persistido). |
| Datos faltantes | **No lanzan excepción**: se devuelve `insuficiente_datos` con `camposFaltantes` (§2.1). |
| Errores de programación | Sí lanzan: `ContratoInvalido` (campo requerido ausente, enum inválido, gramos negativos). |
| Determinismo | Sin `Date.now()`, sin `Math.random()`, sin IO. El tiempo y los ids llegan en `Contexto`. |
| Pureza | Toda función recibe todo por parámetro y no muta sus argumentos (`readonly`). |
| Versionado | Todo resultado declara `reglasVersion`, `composicionVersion` y `motorVersion`. |
| Localización | Unidades y textos se resuelven en la capa de presentación; el motor devuelve claves + datos. |

```ts
// Contexto explícito: nada de estado global.
interface Contexto {
  readonly ahora: string;              // ISO
  readonly locale: 'es-PE';
  readonly reglas: ReglasMotor;        // umbrales y pesos — §1.7
  readonly composicion: ProveedorComposicion;  // tabla externa — §1.6
  readonly ids: { nuevo(): string };   // inyectado, para no romper pureza
}
```

---

## 1. Tipos de entrada

### 1.1 Vocabulario de nutrientes (sin valores)

El paquete define **qué** nutrientes se evalúan, no **cuánto** hace falta de cada uno.

```ts
type NutrienteId =
  | 'energia' | 'proteina' | 'hierro' | 'zinc'
  | 'vitaminaA' | 'folato' | 'vitaminaB12' | 'calcio';

// Potenciadores/inhibidores que la evaluación puede considerar si la tabla externa los trae.
type FactorAbsorcionId = 'vitaminaC' | 'fitato' | 'tanino' | 'hemo';

type Unidad = 'g' | 'kg' | 'ml' | 'unidad' | 'taza' | 'cucharada' | 'cucharón' | 'atado' | 'lata';
```

### 1.2 Persona

```ts
type Sexo = 'F' | 'M' | 'X';
type Actividad = 'ligera' | 'moderada' | 'intensa';

type DietaEspecial =
  | 'vegetariana' | 'vegana' | 'sin_lactosa' | 'sin_gluten'
  | 'bajo_sodio' | 'sin_cerdo' | 'sin_pescado' | 'sin_huevo';

type Condicion =
  | 'menor_6m' | 'lactante_6_23m' | 'menor_5' | 'escolar' | 'adolescente'
  | 'adulto' | 'adulto_mayor' | 'discapacidad_masticacion' | 'requiere_derivacion';

interface Gestacion {
  readonly trimestre: 1 | 2 | 3;
  readonly semanas: number | null;      // opcional
  readonly controlPrenatal: boolean | null;
}

interface EstadoAnemia {
  /** Solo true si lo informó personal de salud. El motor NO diagnostica. */
  readonly diagnosticada: boolean;
  /** Dato clínico: sirve para la vista técnica, no para el veredicto público. */
  readonly hemoglobinaGdL: number | null;
  readonly altitudMetros: number | null;
  readonly fechaDiagnostico: string | null;   // ISO
}

interface Persona {
  readonly id: string;                  // requerido
  readonly edadMeses: number;           // requerido — única entrada obligatoria del cálculo
  readonly sexo: Sexo;                  // requerido (X → referencia más alta, ver §1.5)
  readonly pesoKg: number | null;       // opcional
  readonly tallaCm: number | null;      // opcional — no entra al cálculo en v1
  readonly actividad: Actividad;        // requerido; default de UI: 'moderada'
  readonly gestacion: Gestacion | null;
  readonly lactancia: 'exclusiva' | 'predominante' | 'mixta' | 'no' | null;
  readonly anemia: EstadoAnemia | null;
  readonly alergias: readonly string[];        // ids de alérgeno, no nombres libres
  readonly dietas: readonly DietaEspecial[];
  readonly condiciones: readonly Condicion[];  // derivadas por el motor, no por la UI
  readonly notas: string | null;
}
```

**Obligatorio:** `id`, `edadMeses`, `sexo`, `actividad`.
**Opcional:** todo lo demás. Ningún campo opcional puede bloquear una evaluación (§1.5).

### 1.3 Insumo (referencia a tabla externa, sin valores embebidos)

```ts
interface Insumo {
  readonly id: string;                  // 'sangrecita_pollo'
  readonly nombre: string;              // 'Sangrecita de pollo'
  readonly grupo: 'cereal' | 'menestra' | 'tuberculo' | 'verdura' | 'fruta'
              | 'carne' | 'viscera' | 'pescado' | 'huevo' | 'lacteo'
              | 'grasa' | 'azucar' | 'condimento' | 'otro';
  /** Clave con la que el proveedor de composición resuelve los valores. */
  readonly refComposicion: {
    readonly tabla: string;             // p. ej. el identificador de la tabla externa
    readonly clave: string;             // fila dentro de esa tabla
    readonly version: string;           // versión de la tabla usada al cargar
  } | null;                             // null = insumo sin dato → degradación §2.1
  readonly unidadCasera: Readonly<Partial<Record<Unidad, number>>>; // 1 cucharada = N g
  readonly alergenos: readonly string[];      // incluye 'trazas' cuando corresponde
  readonly esPerecedero: boolean;
  readonly vidaUtilDias: number | null;
  readonly notas: string | null;
}
```

El paquete **no** guarda kcal/mg/µg de ningún insumo. Solo la referencia a la fila externa.

### 1.4 Receta, Servicio y Despensa

```ts
interface IngredienteReceta {
  readonly insumoId: string;
  /** Gramos de porción comestible, crudos. Es la unidad canónica. */
  readonly gramos: number;
  /** Lo que escribió la persona, para mostrar y auditar. No se usa en el cálculo. */
  readonly captura: { readonly cantidad: number; readonly unidad: Unidad } | null;
}

interface Receta {
  readonly id: string;
  readonly nombre: string;
  readonly ingredientes: readonly IngredienteReceta[];
  readonly porcionesBase: number;       // requerido, ≥ 1
  readonly rendimientoCocidoG: number | null;   // si se pesó; null = sin corrección
  readonly tecnicas: readonly ('hervido' | 'guisado' | 'frito' | 'plancha' | 'al_vapor' | 'crudo')[];
  readonly version: number;
}

type TipoServicio = 'desayuno' | 'almuerzo' | 'cena' | 'refaccion' | 'unico';
type ModoReparto = 'igual' | 'diferenciado';

interface Servicio {
  readonly id: string;
  readonly ollaId: string;
  readonly fecha: string;               // ISO date
  readonly tipo: TipoServicio;
  readonly recetaId: string;
  readonly comensales: readonly { readonly personaId: string; readonly presente: boolean }[];
  /**
   * Fracción del día que este servicio representa (0..1].
   * [valor a confirmar con nutricionista] — no se hardcodea, viene en ReglasMotor.
   */
  readonly coberturaDia: number | null; // null = usar default de reglas por `tipo`
  readonly comidaPrincipal: boolean | null;   // null = default de reglas por `tipo`
  readonly modoReparto: ModoReparto;
  readonly bebidas: readonly { readonly tipo: 'te' | 'cafe' | 'mate' | 'jugo' | 'agua' | 'otro';
                               readonly conComida: boolean }[];
}

interface ExistenciaDespensa {
  readonly insumoId: string;
  readonly gramosDisponibles: number;
  readonly gramosReservados: number;    // comprometidos para otro servicio
  readonly venceEn: string | null;      // ISO date
  readonly costoPorKg: number | null;
}

interface Despensa {
  readonly ollaId: string;
  readonly actualizadaEn: string;
  readonly existencias: readonly ExistenciaDespensa[];
}
```

### 1.5 Qué pasa si falta un dato

| Falta | Efecto | Campo en la salida |
|---|---|---|
| `pesoKg` | energía/proteína se resuelven con la referencia por edad del proveedor; el resto no se afecta | `estimaciones: ['peso_por_edad']`, `confianza` baja |
| `tallaCm` | ninguno (v1 no la usa) | — |
| `sexo = 'X'` | se usa la referencia más alta entre F y M | `estimaciones: ['sexo_no_declarado']` |
| `anemia` | no se prioriza hierro ni se sube prioridad; el servicio se evalúa igual | — |
| `gestacion` | se evalúa como adulta no gestante | — |
| `refComposicion` de un insumo | ese insumo aporta 0 y se marca | `coberturaDatos < 1`, `insumosSinDato` |
| `gramos` de un ingrediente | el ingrediente se excluye del aporte y se marca | `insumosSinCantidad` |
| `coberturaDia` | se usa el default de `ReglasMotor` por tipo de servicio | — |
| **`edadMeses` o `sexo`** | **no se puede evaluar esa persona** | `insuficiente_datos` con `camposFaltantes` |
| Toda la despensa | se evalúa la receta **como está escrita** y se omite la parte de sugerencias con stock | `sinDespensa: true` |

Regla: la falta de un dato **degrada**, no rompe. El único caso que devuelve
`insuficiente_datos` es el que impide identificar el requerimiento (edad/sexo) o que deja el plato
sin ningún aporte calculable.

### 1.6 Proveedor de composición (frontera con el trabajo externo)

```ts
interface AporteNutrientes {
  /** Clave presente ⇒ valor conocido. Clave ausente ⇒ sin dato (no es 0). */
  readonly valores: Readonly<Partial<Record<NutrienteId, number>>>;
  /** Factores que la tabla externa pueda aportar; opcionales. */
  readonly factores?: Readonly<Partial<Record<FactorAbsorcionId, number>>>;
}

interface ProveedorComposicion {
  readonly tablaId: string;
  readonly version: string;
  /** Aporte de `gramos` de porción comestible cruda. null = insumo sin dato. */
  aporte(insumoId: string, gramos: number): AporteNutrientes | null;
  /** Factor de retención por nutriente y técnica. 1 si no hay dato. */
  retencion(nutriente: NutrienteId, tecnica: Receta['tecnicas'][number]): number;
}

interface ProveedorRequerimientos {
  readonly tablaId: string;
  readonly version: string;
  /** Requerimiento diario por persona. Las claves ausentes quedan sin dato. */
  requerimiento(p: Persona, ctx: Contexto): AporteNutrientes;
  /** Peso de referencia por edad/sexo cuando no hay balanza. */
  pesoReferencia(edadMeses: number, sexo: Sexo): number | null;
}
```

`packages/nutrition` **depende** de estas dos interfaces, nunca de un archivo de datos concreto. Los
tests usan un `ProveedorComposicion` de mentira con valores inventados por el test (permitido: es un
doble de prueba, no una recomendación nutricional).

### 1.7 Reglas del motor (todo umbral es configuración, no constante)

```ts
interface ReglasMotor {
  readonly version: string;
  readonly coberturaDia: Readonly<Record<TipoServicio, number>>;      // [a confirmar]
  readonly coberturaHierroComidaPrincipal: number;                    // [a confirmar]
  readonly umbralDeficit: number;            // ratio por debajo del cual hay hallazgo [a confirmar]
  readonly umbralesSeveridad: { critico: number; alto: number; moderado: number }; // [a confirmar]
  readonly pesos: Readonly<Record<NutrienteId, number>>;              // [a confirmar]
  readonly topesDePuntaje: readonly { si: ReglaTope; entonces: number }[]; // [a confirmar]
  readonly bandasVeredicto: readonly { min: number; veredicto: Veredicto }[]; // [a confirmar]
  readonly factorObjetivoAnemia: number;     // [a confirmar]
  readonly maxSugerencias: number;           // [a confirmar]
  readonly maxNutrientesAAjustar: number;    // [a confirmar]
  readonly escalonesGramos: readonly number[];  // cantidades candidatas a sugerir [a confirmar]
  readonly maxFrecuenciaInsumo: Readonly<Record<string, number>>; // insumo → veces/semana [a confirmar]
  readonly umbralRepeticionOverride: number; // para proponer regla local [a confirmar]
}
```

Si `ReglasMotor` viene incompleto, el motor lanza `ContratoInvalido` al construir el `Contexto`:
un umbral faltante no puede volverse un `0` silencioso.

---

## 2. Tipos de salida

### 2.1 Resultado de la evaluación

```ts
type Veredicto = 'apto' | 'deficit' | 'insuficiente_datos';

type Severidad = 'critico' | 'alto' | 'moderado';

type GrupoEtario =
  | 'menor_6m' | 'lactante_6_23m' | 'menor_5' | 'escolar'
  | 'adolescente' | 'adulto' | 'adulto_mayor' | 'gestante' | 'lactante_materna';

interface Hallazgo {
  readonly nutriente: NutrienteId;
  readonly severidad: Severidad;
  /** Cuántas personas del servicio quedan por debajo del objetivo (nunca nombres). */
  readonly personasAfectadas: number;
  /** Grupos afectados, para redactar en colectivo. */
  readonly grupos: readonly GrupoEtario[];
  /** Cubierto / objetivo. 0..N. null si no hay dato suficiente. */
  readonly ratio: number | null;
  /** Objetivo y aporte en unidad canónica del nutriente, solo para vista técnica. */
  readonly tecnico: {
    readonly objetivo: number;
    readonly aporte: number;
    readonly unidad: string;            // la declara el proveedor de requerimientos
    readonly factoresAplicados: readonly string[];
  } | null;
}

interface Sugerencia {
  readonly id: string;
  readonly insumoId: string;
  readonly nombreInsumo: string;
  readonly cantidad: number;
  readonly unidad: Unidad;
  /** A qué hallazgo responde. */
  readonly paraNutriente: NutrienteId;
  /** Frase corta, sin tecnicismos: por qué se propone. */
  readonly razon: string;
  /** true si el insumo ya está en la despensa; false si hay que conseguirlo. */
  readonly enDespensa: boolean;
  /** true si no viola alergias, dietas ni frecuencia (siempre true: lo vetado no se devuelve). */
  readonly compatible: true;
  readonly deltaPuntaje: number | null;  // cuánto subiría el puntaje, si se calculó
}

interface DesglosePuntaje {
  readonly nutriente: NutrienteId;
  readonly peso: number;
  readonly ratio: number | null;
  readonly aporte: number;
}

interface CamposFaltante {
  readonly campo: string;               // 'personas[2].edadMeses'
  readonly motivo: 'requerido' | 'sin_dato_en_tabla' | 'fuera_de_rango';
}

interface ResultadoEvaluacion {
  readonly servicioId: string;
  readonly veredicto: Veredicto;
  /** 0..100. null cuando el veredicto es insuficiente_datos. */
  readonly puntaje: number | null;
  readonly desglose: readonly DesglosePuntaje[];
  readonly hallazgos: readonly Hallazgo[];      // ordenados por severidad y personas afectadas
  readonly grupos: readonly {
    readonly grupo: GrupoEtario;
    readonly personas: number;
    readonly ratios: Readonly<Partial<Record<NutrienteId, number | null>>>;
  }[];
  /** 0..1: proporción de nutrientes×personas que se pudieron calcular. */
  readonly coberturaDatos: number;
  readonly insumosSinDato: readonly string[];
  readonly insumosSinCantidad: readonly string[];
  readonly recetaIncompleta: boolean;           // true si faltó stock de algún ingrediente
  readonly sinDespensa: boolean;
  readonly estimaciones: readonly ('peso_por_edad' | 'sexo_no_declarado'
                                   | 'rendimiento_no_pesado' | 'sin_balanza')[];
  readonly confianza: number;                   // 0..1, heurística declarada
  readonly trazabilidad: {
    readonly motorVersion: string;
    readonly reglasVersion: string;
    readonly composicionVersion: string;
    readonly requerimientosVersion: string;
    readonly inputsHash: string;
    readonly calculadoEn: string;               // ctx.ahora
  };
  readonly camposFaltantes: readonly CamposFaltante[];
  /** Texto ya redactado para la organizadora (§4). */
  readonly explicacion: TextoExplicativo;
}
```

**Semántica de los tres veredictos** (no negociable, para que la UI no improvise):

| Veredicto | Cuándo | Qué habilita la UI |
|---|---|---|
| `apto` | puntaje ≥ banda inferior de "apto" **y** ningún hallazgo `critico` | una línea de confirmación; sin acciones obligatorias |
| `deficit` | hay al menos un hallazgo de cualquier severidad | acciones concretas + sugerencias |
| `insuficiente_datos` | falta edad/sexo de alguien, o no hay ningún aporte calculable | pedir el dato que falta; **no** mostrar puntaje |

`deficit` no distingue "leve" en el enum: la graduación vive en `hallazgos[].severidad`. El enum se
mantiene de tres valores para que la UI sea trivial.

### 2.2 Resultado de sugerencias

```ts
interface ResultadoSugerencias {
  readonly servicioId: string;
  readonly sugerencias: readonly Sugerencia[];
  readonly noResoluble: readonly {
    readonly hallazgo: NutrienteId;
    readonly motivo: 'sin_stock' | 'alergia' | 'dieta' | 'sin_insumo_adecuado';
  }[];
  readonly recetaPropuesta: Receta | null;      // receta + ajustes, para "aplicar"
  readonly puntajeEstimado: number | null;      // si se aplicara todo
}
```

### 2.3 Resultado de solicitud entre ollas

```ts
interface SolicitudItem {
  readonly insumoId: string;
  readonly cantidad: number;
  readonly unidad: Unidad;
  readonly presentacion: string | null;   // "saco de 50 kg", "atado", "lata"
  readonly paraNutriente: NutrienteId;
  readonly cubreFraccion: number;         // 0..1 del faltante de ese nutriente
}

interface ResultadoSolicitud {
  readonly deficitDe: readonly { readonly nutriente: NutrienteId; readonly cantidad: number }[];
  readonly items: readonly SolicitudItem[];
  readonly cubreTotal: number;            // 0..1
  readonly destinatarios: readonly {
    readonly ollaId: string;
    readonly items: readonly string[];    // ids de SolicitudItem
    readonly mensaje: string;             // sin revelar situación de la otra olla
  }[];
  readonly prioridad: readonly { readonly personaId: string; readonly motivo: string }[];
  readonly parcial: boolean;
}
```

### 2.4 Texto explicativo

```ts
interface TextoExplicativo {
  readonly titulo: string;              // ≤ 1 línea
  readonly lineas: readonly string[];   // ≤ 3
  readonly accion: string | null;       // una sola acción concreta
  readonly reconocimiento: string | null; // algo que sí está bien
  readonly derivacion: string | null;   // "avisá al centro de salud"
  readonly notaDatos: string | null;    // "calculado con un peso promedio…"
  readonly nivelTecnico: boolean;       // false = público; true = nutricionista
}
```

---

## 3. Funciones puras esperadas

Firmas obligatorias. La implementación es libre; el contrato (entradas, salidas, pureza) no.

```ts
/**
 * Evalúa un servicio planificado contra las personas que comen.
 * Nunca lanza por datos faltantes: degrada y devuelve `insuficiente_datos` si corresponde.
 * Determinista: mismo (entradas, ctx.reglas, ctx.composicion.version) ⇒ mismo resultado.
 */
export function evaluarServicio(
  servicio: Servicio,
  personas: readonly Persona[],
  receta: Receta,
  despensa: Despensa | null,
  ctx: Contexto,
): ResultadoEvaluacion;

/**
 * Propone ajustes usando solo lo que hay en la despensa (o, si `incluirFaltantes`,
 * también lo que habría que conseguir). Devuelve como máximo ctx.reglas.maxSugerencias.
 * Garantías: ninguna sugerencia contiene alérgenos de ningún comensal ni viola dietas;
 * nunca propone nada para `menor_6m`; ordena por impacto explicable, no por costo.
 */
export function sugerirAjustes(
  evaluacion: ResultadoEvaluacion,
  servicio: Servicio,
  personas: readonly Persona[],
  receta: Receta,
  despensa: Despensa | null,
  ctx: Contexto,
  opciones?: { readonly incluirFaltantes?: boolean; readonly maxSugerencias?: number },
): ResultadoSugerencias;

/**
 * Traduce un déficit a un pedido concreto a otras ollas.
 * Prioriza personas con anemia diagnosticada, luego gestantes/lactantes, luego <24 m, luego <5 a.
 * Nunca pide más que el superávit declarado por el donante ni más que el faltante calculado.
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
): ResultadoSolicitud;

/**
 * Redacta el resultado. `audiencia` decide qué se puede decir (no es un flag cosmético:
 * con 'organizadora' el texto no puede contener tecnicismos ni cifras clínicas).
 * `nivelTecnico` en la salida debe coincidir con la audiencia.
 */
export function explicar(
  evaluacion: ResultadoEvaluacion,
  sugerencias: ResultadoSugerencias | null,
  audiencia: 'organizadora' | 'nutricionista',
  ctx: Contexto,
): TextoExplicativo;
```

### 3.1 Auxiliares permitidos (no obligatorios, misma pureza)

```ts
export function evaluarDiaCompleto(servicios: readonly Servicio[], ...): ResultadoEvaluacion;
export function aplicarSugerencias(receta: Receta, s: readonly Sugerencia[]): Receta;
export function detectarAlergias(receta: Receta, personas: readonly Persona[],
                                 insumos: readonly Insumo[]): readonly string[];
```

### 3.2 Invariantes que los tests deben poder verificar

1. `puntaje === null` ⇔ `veredicto === 'insuficiente_datos'`.
2. `puntaje ∈ [0,100]` cuando no es `null`.
3. Reordenar `personas` no cambia `puntaje`, `hallazgos` ni `sugerencias`.
4. `hallazgos` nunca incluye un `nutriente` con `ratio === null`.
5. Ninguna `Sugerencia` de un insumo en `alergias` de algún comensal presente.
6. `menor_6m` nunca recibe `Sugerencia` ni aparece en `destinatarios` de una solicitud de alimentos.
7. `ResultadoSolicitud.items[].cantidad` nunca supera el `superavit` del donante asignado.
8. `explicar(..., 'organizadora')` no contiene ninguna palabra de la lista negra (§4.1).
9. Cambiar `ctx.reglas.version` cambia `trazabilidad.reglasVersion` en toda salida derivada.
10. `evaluarServicio` no muta `servicio`, `personas`, `receta` ni `despensa` (test con `Object.freeze`).

---

## 4. Explicabilidad y override del nutricionista

### 4.1 Reglas de explicabilidad (verificables por test)

**Prohibido en el texto público** (`audiencia: 'organizadora'`):

- Tecnicismos y unidades: *déficit, adecuación, biodisponibilidad, RDA, micronutriente, mg, µg,
  kcal, porcentaje, ratio, ferropénico, antropometría, IMC*.
- Juicio sobre la comida o sobre quien cocina: *insuficiente, no alcanza, está mal, deberían, falta
  voluntad*.
- Diagnóstico: *tiene anemia, está desnutrido, en riesgo, bajo peso*.
- Promesas: *se cura, se corrige, con esto mejora la anemia*.
- Nombres, iniciales, fotos o cualquier identificador de una persona.
- Comparaciones con otras ollas.

**Obligatorio en el texto público:**

- Sujeto colectivo: "a los niños de 3 a 5", "a las gestantes".
- Una acción concreta, con cantidad en medida casera y momento ("hoy, en el almuerzo").
- Un reconocimiento real de lo que sí está bien.
- Máximo 3 líneas y una sola acción.
- Si hubo estimación de peso: decirlo en lenguaje llano.
- Línea fija de límite: *"Esto apoya la decisión de la olla. No es un diagnóstico ni reemplaza al
  centro de salud."* (la agrega la capa de presentación; `explicar` devuelve `derivacion`).

**Prohibido en el texto técnico** (`audiencia: 'nutricionista'`) — igual de importante:
- Presentar una cifra sin `trazabilidad` (versión de reglas, de tabla y de motor).
- Presentar el resultado como validado si no hay `Override` (§4.3).

`explicar` **no** inventa frases: elige entre plantillas versionadas
(`messages.<version>.json`) y rellena con `nutriente → insumo disponible → medida casera`. Si no hay
plantilla, devuelve una genérica sin cifras y marca `plantillaFaltante: true` en logs de test.

### 4.2 Orden de elección (qué se dice y qué se calla)

1. Filtrar hallazgos con `ratio !== null`.
2. Ordenar por `severidad` y luego `personasAfectadas`.
3. Mostrar como máximo **2** hallazgos en público (configurable).
4. Si el veredicto es `apto`, mostrar **una sola línea** y nada más: el silencio también comunica.
5. `insuficiente_datos`: nunca mostrar puntaje; pedir el dato con una frase que explique para qué
   sirve ("con la edad podemos calcular mejor").

### 4.3 Override del nutricionista: registro y auditoría

```ts
type Rol = 'nutricionista' | 'organizadora' | 'admin';

interface Actor {
  readonly id: string;
  readonly nombre: string;
  readonly rol: Rol;
  readonly colegiatura: string | null;   // obligatoria si rol = 'nutricionista'
}

type CampoOverride =
  | 'veredicto' | 'puntaje' | 'objetivoNutriente' | 'factorAbsorcion'
  | 'porcionesBase' | 'aporteInsumo' | 'exclusionPersona' | 'reglaLocal';

interface Override {
  readonly id: string;
  readonly ts: string;                  // ISO, hora del dispositivo
  readonly actor: Actor;
  readonly alcance: {
    readonly tipo: 'servicio' | 'persona' | 'receta' | 'grupo' | 'olla';
    readonly ref: string;
  };
  readonly campo: CampoOverride;
  readonly antes: unknown;              // valor sugerido por el sistema
  readonly despues: unknown;            // valor decidido
  readonly motivo: {
    readonly categoria: 'dato_local' | 'criterio_clinico' | 'disponibilidad'
                      | 'cultural' | 'error_de_dato';
    readonly texto: string;             // obligatorio, mínimo de longitud en reglas
  };
  readonly reglasVersion: string;       // con qué reglas se calculó el original
  readonly composicionVersion: string;
  readonly hashAnterior: string;        // cadena de integridad
}
```

**Quién puede qué:**

| Campo | Organizadora | Nutricionista | Regla |
|---|---|---|---|
| `veredicto`, `puntaje` | ❌ | ✅ | exige `motivo.texto` |
| `objetivoNutriente` | ❌ | ✅ | acotado por `ReglasMotor` (rango declarado ahí, no acá) |
| `factorAbsorcion` | ❌ | ✅ | solo valores de la lista permitida en reglas |
| `porcionesBase` | ✅ | ✅ | cambio operativo, no clínico |
| `aporteInsumo` | ❌ | ✅ | exige nota; queda atado a `insumoId` + versión |
| `exclusionPersona` (alergia) | ✅ (alta) | ✅ (baja/cambio) | baja exige motivo |
| `reglaLocal` | ❌ | ✅ (aprueba) | §4.4 |

**Garantías de auditoría:**

- El original **nunca se borra**: se persiste el par `antes`/`despues`. Siempre se puede ver qué
  dijo el sistema y qué decidió la persona.
- Sin `motivo.texto` válido, el override no se guarda (validación de contrato, no de UI).
- Un override de un servicio **no** altera la receta ni los servicios futuros; para que se repita
  hace falta una `reglaLocal` explícita y aprobada.
- Los overrides se guardan localmente y se sincronizan cuando hay red; la cadena `hashAnterior`
  permite detectar ediciones fuera de la app.
- Retención y exportación: definidas por la olla; el contrato solo exige que no se pueda eliminar
  un override sin dejar registro de la eliminación (soft delete con motivo).

### 4.4 Aprendizaje sin ML: regla local aprobada

```
si el mismo (campo, contexto) se sobrescribe ≥ N veces (N en ReglasMotor)
   y en la misma dirección y magnitud comparable
entonces el motor PROPONE una regla local; no la aplica.
```

```ts
interface PropuestaReglaLocal {
  readonly patron: { readonly campo: CampoOverride; readonly contexto: string;
                     readonly repeticiones: number };
  readonly reglaSugerida: { readonly valor: unknown; readonly alcance: string };
  readonly requiereAprobacionDe: 'nutricionista';
}

interface ReglaLocalAprobada {
  readonly id: string;
  readonly regla: { readonly valor: unknown; readonly alcance: string };
  readonly aprobadaPor: Actor;          // rol obligatorio: 'nutricionista'
  readonly aprobadaEn: string;
  readonly vigenteHasta: string | null;
  readonly revocable: true;
}
```

Se guarda como dato versionado (`reglas.locales.<version>.json`), es visible y revocable. Eso es
"aprendizaje" defendible: memoria institucional explícita, no caja negra.

### 4.5 Sugerencia vs decisión validada (badge obligatorio)

```ts
type Procedencia = 'sugerencia_sistema' | 'validado_nutricionista'
                 | 'ajustado_organizadora' | 'sin_revisar' | 'sin_datos';
```

| Badge | Condición exacta |
|---|---|
| `sugerencia_sistema` | existe `ResultadoEvaluacion` y ningún `Override` sobre ese servicio |
| `validado_nutricionista` | existe `Override` con `actor.rol === 'nutricionista'` y motivo válido |
| `ajustado_organizadora` | existe `Override` con `rol === 'organizadora'` (solo campos permitidos) |
| `sin_datos` | `veredicto === 'insuficiente_datos'` |
| `sin_revisar` | servicio pasado sin evaluación ni override |

La procedencia viaja **con el resultado**, no se calcula en la vista: `ResultadoEvaluacion` se
extiende en la capa de persistencia con `procedencia` y `overrides: readonly Override[]`. En el
ticket impreso va: `Validado por [nombre] · C.N.P. [número] · [fecha]` o, en modo automático,
`Calculado automáticamente. No reemplaza la evaluación de un profesional de salud.`

---

## 5. Ética y límites

### 5.1 Lo que el sistema NUNCA dice

| Nunca | Alternativa contractual |
|---|---|
| "Tiene anemia / desnutrición / está en riesgo" | "necesita más hierro en la comida" (`Hallazgo` sin diagnóstico) |
| "Está mal / no sirve / así no se hace" | "hoy queda corto en X; se puede sumar Y" |
| Cifras de mg, µg, kcal o % al público | medidas caseras (`unidadCasera` del `Insumo`) |
| Peso, talla, IMC, Hb individuales en pantalla compartida | solo en `audiencia: 'nutricionista'` |
| Ranking o comparación entre ollas | solo la propia olla y su evolución |
| "Dale suplemento de hierro" | `derivacion`: "consultá en el centro de salud" |
| "Con esta comida se cura la anemia" | "así se acerca a lo que necesita" |
| Reducir la porción de un niño por "exceso" | los topes generan aviso, nunca recorte |
| Nombres, fotos o iniciales de personas | grupos etarios |

Estas prohibiciones son **contrato**, no estilo: los tests de §3.2 (invariante 8) las verifican
sobre el texto generado.

### 5.2 Qué se muestra al nutricionista y no a la familia

| Dato | Organizadora / familia | Nutricionista |
|---|---|---|
| Veredicto y acción del día | ✅ | ✅ |
| `puntaje` numérico | ❌ (solo frase y color) | ✅ |
| `hallazgos[].tecnico` (objetivo, aporte, unidad) | ❌ | ✅ |
| `desglose`, `ratio`, `factoresAplicados` | ❌ | ✅ |
| Hb, altitud, fecha de diagnóstico | ❌ | ✅ (rótulo "referencial, no diagnostica") |
| Peso, talla, IMC individual | ❌ | ✅ |
| `overrides` y motivos | ❌ | ✅ |
| `coberturaDatos`, `insumosSinDato`, versión de tablas | ❌ | ✅ |
| Stock y situación de otras ollas | ❌ (solo "puede darte X") | ✅ agregado |
| Ranking de ollas | ❌ | ❌ |

La audiencia se pasa como parámetro a `explicar` y la vista técnica exige rol + sesión corta. El
motor **no** decide permisos: confía en que la capa de acceso ya autenticó, pero **sí** separa los
datos en la estructura de salida para que sea imposible renderizar de más por accidente.

### 5.3 Restricciones duras (el motor no las negocia)

1. **Alergia** = veto absoluto de insumo, sugerencia y solicitud. Solo el nutricionista puede
   cambiar el registro de una alergia, con motivo.
2. **Dieta especial** = restricción de sugerencia, nunca de evaluación. Si con la dieta no se puede
   cerrar un hallazgo, `ResultadoSugerencias.noResoluble` lo dice con `motivo: 'dieta'`.
3. **`menor_6m`** = sin ración y sin sugerencia: `noResoluble` con motivo `sin_insumo_adecuado` y
   derivación (lactancia materna exclusiva).
4. **Derivación obligatoria** (mensaje destacado, no bloqueante) si hay `requiere_derivacion`, si
   hay anemia diagnosticada con hallazgo de hierro persistente, o si la condición no es resoluble
   por alimentación (renal, celiaquía, diabetes, alergia grave, dificultad para tragar).
5. **Datos de salud** = sensibles: minimización (no pedir Hb sin personal de salud), cifrado en el
   dispositivo, exportación solo agregada, ticket sin datos clínicos.

---

## 6. Fixtures (forma real, valores a confirmar)

Convención: todo valor nutricional, cantidad de alimento, umbral o cifra clínica va en `null`, y la
ruta se lista en `_confirmar` con la marca `[valor a confirmar]`. Los ids y enums son reales porque
son el contrato, no datos.

### F1 · Niño con anemia (vista de evaluación)

```json
{
  "_caso": "niño_anemia",
  "_confirmar": {
    "comensales[0].edadMeses": "[valor a confirmar]",
    "comensales[0].pesoKg": "[valor a confirmar]",
    "receta.ingredientes[*].gramos": "[valor a confirmar con la tabla de composición]",
    "receta.porcionesBase": "[valor a confirmar]",
    "servicio.coberturaDia": "[valor a confirmar]"
  },
  "personas": [
    {
      "id": "p_001",
      "edadMeses": null,
      "sexo": "M",
      "pesoKg": null,
      "tallaCm": null,
      "actividad": "moderada",
      "gestacion": null,
      "lactancia": null,
      "anemia": { "diagnosticada": true, "hemoglobinaGdL": null,
                  "altitudMetros": null, "fechaDiagnostico": null },
      "alergias": [],
      "dietas": [],
      "condiciones": ["menor_5"],
      "notas": null
    }
  ],
  "insumos": [
    { "id": "sangrecita_pollo", "nombre": "Sangrecita de pollo", "grupo": "viscera",
      "refComposicion": { "tabla": "[tabla del usuario]", "clave": "[clave a confirmar]",
                          "version": "[version a confirmar]" },
      "unidadCasera": {}, "alergenos": [], "esPerecedero": true,
      "vidaUtilDias": null, "notas": null },
    { "id": "papa", "nombre": "Papa", "grupo": "tuberculo",
      "refComposicion": { "tabla": "[tabla del usuario]", "clave": "[clave a confirmar]",
                          "version": "[version a confirmar]" },
      "unidadCasera": {}, "alergenos": [], "esPerecedero": true,
      "vidaUtilDias": null, "notas": null }
  ],
  "receta": {
    "id": "r_sangrecita_papa", "nombre": "Sangrecita con papa",
    "ingredientes": [
      { "insumoId": "sangrecita_pollo", "gramos": null, "captura": null },
      { "insumoId": "papa", "gramos": null, "captura": null }
    ],
    "porcionesBase": null, "rendimientoCocidoG": null,
    "tecnicas": ["guisado"], "version": 1
  },
  "servicio": {
    "id": "s_001", "ollaId": "olla_demo", "fecha": "2026-11-23", "tipo": "almuerzo",
    "recetaId": "r_sangrecita_papa",
    "comensales": [{ "personaId": "p_001", "presente": true }],
    "coberturaDia": null, "comidaPrincipal": true, "modoReparto": "igual",
    "bebidas": [{ "tipo": "agua", "conComida": true }]
  },
  "despensa": {
    "ollaId": "olla_demo", "actualizadaEn": "2026-11-23T10:00:00Z",
    "existencias": [
      { "insumoId": "sangrecita_pollo", "gramosDisponibles": null, "gramosReservados": 0,
        "venceEn": null, "costoPorKg": null },
      { "insumoId": "papa", "gramosDisponibles": null, "gramosReservados": 0,
        "venceEn": null, "costoPorKg": null }
    ]
  },
  "esperado": {
    "veredicto": "deficit",
    "hallazgoPrincipal": "hierro",
    "nota": "el objetivo de hierro sube por anemia diagnosticada; la cifra la fija el nutricionista"
  }
}
```

### F2 · Gestante (tercer trimestre)

```json
{
  "_caso": "gestante",
  "_confirmar": {
    "personas[0].edadMeses": "[valor a confirmar]",
    "personas[0].pesoKg": "[valor a confirmar]",
    "receta.ingredientes[*].gramos": "[valor a confirmar]"
  },
  "personas": [
    {
      "id": "p_002", "edadMeses": null, "sexo": "F", "pesoKg": null, "tallaCm": null,
      "actividad": "moderada",
      "gestacion": { "trimestre": 3, "semanas": null, "controlPrenatal": true },
      "lactancia": null,
      "anemia": { "diagnosticada": false, "hemoglobinaGdL": null,
                  "altitudMetros": null, "fechaDiagnostico": null },
      "alergias": [], "dietas": [], "condiciones": ["gestante"], "notas": null
    }
  ],
  "receta": {
    "id": "r_higado_verduras", "nombre": "Hígado con verduras",
    "ingredientes": [
      { "insumoId": "higado_pollo", "gramos": null, "captura": null },
      { "insumoId": "zanahoria", "gramos": null, "captura": null },
      { "insumoId": "papa", "gramos": null, "captura": null }
    ],
    "porcionesBase": null, "rendimientoCocidoG": null, "tecnicas": ["guisado"], "version": 1
  },
  "servicio": {
    "id": "s_002", "ollaId": "olla_demo", "fecha": "2026-11-23", "tipo": "almuerzo",
    "recetaId": "r_higado_verduras",
    "comensales": [{ "personaId": "p_002", "presente": true }],
    "coberturaDia": null, "comidaPrincipal": true, "modoReparto": "igual",
    "bebidas": []
  },
  "despensa": null,
  "esperado": {
    "veredicto": "apto",
    "nota": "caso para verificar el aviso de frecuencia de vísceras por vitamina A preformada; el límite lo fija el nutricionista"
  }
}
```

### F3 · Adulto mayor

```json
{
  "_caso": "adulto_mayor",
  "_confirmar": {
    "personas[0].edadMeses": "[valor a confirmar]",
    "personas[0].pesoKg": "[valor a confirmar]",
    "personas[0].tallaCm": "[valor a confirmar]",
    "receta.ingredientes[*].gramos": "[valor a confirmar]"
  },
  "personas": [
    {
      "id": "p_003", "edadMeses": null, "sexo": "F", "pesoKg": null, "tallaCm": null,
      "actividad": "ligera", "gestacion": null, "lactancia": null, "anemia": null,
      "alergias": [], "dietas": ["bajo_sodio"],
      "condiciones": ["adulto_mayor", "discapacidad_masticacion"], "notas": "usa prótesis dental"
    }
  ],
  "receta": {
    "id": "r_sopa_verduras", "nombre": "Sopa de verduras con papa",
    "ingredientes": [
      { "insumoId": "papa", "gramos": null, "captura": null },
      { "insumoId": "zapallo", "gramos": null, "captura": null },
      { "insumoId": "zanahoria", "gramos": null, "captura": null }
    ],
    "porcionesBase": null, "rendimientoCocidoG": null, "tecnicas": ["hervido"], "version": 1
  },
  "servicio": {
    "id": "s_003", "ollaId": "olla_demo", "fecha": "2026-11-23", "tipo": "almuerzo",
    "recetaId": "r_sopa_verduras",
    "comensales": [{ "personaId": "p_003", "presente": true }],
    "coberturaDia": null, "comidaPrincipal": true, "modoReparto": "igual",
    "bebidas": []
  },
  "despensa": null,
  "esperado": {
    "veredicto": "deficit",
    "nota": "verifica que la sugerencia no proponga algo difícil de masticar; la restricción la define el nutricionista"
  }
}
```

### F4 · Sin balanza (datos mínimos)

```json
{
  "_caso": "sin_balanza",
  "_confirmar": {
    "personas[0].edadMeses": "[valor a confirmar]",
    "personas[1].edadMeses": "[valor a confirmar]",
    "receta.ingredientes[*].gramos": "[valor a confirmar]",
    "reglas.coberturaDia.almuerzo": "[valor a confirmar]"
  },
  "personas": [
    {
      "id": "p_004", "edadMeses": null, "sexo": "F", "pesoKg": null, "tallaCm": null,
      "actividad": "moderada", "gestacion": { "trimestre": 2, "semanas": null,
      "controlPrenatal": null }, "lactancia": null, "anemia": null,
      "alergias": [], "dietas": [], "condiciones": ["adolescente", "gestante"], "notas": null
    },
    {
      "id": "p_005", "edadMeses": null, "sexo": "M", "pesoKg": null, "tallaCm": null,
      "actividad": "moderada", "gestacion": null, "lactancia": null, "anemia": null,
      "alergias": [], "dietas": [], "condiciones": ["menor_5"], "notas": null
    }
  ],
  "receta": {
    "id": "r_quinua_leche", "nombre": "Quinua con leche",
    "ingredientes": [
      { "insumoId": "quinua", "gramos": null, "captura": null },
      { "insumoId": "leche_evaporada", "gramos": null, "captura": null }
    ],
    "porcionesBase": null, "rendimientoCocidoG": null, "tecnicas": ["hervido"], "version": 1
  },
  "servicio": {
    "id": "s_004", "ollaId": "olla_demo", "fecha": "2026-11-23", "tipo": "desayuno",
    "recetaId": "r_quinua_leche",
    "comensales": [{ "personaId": "p_004", "presente": true },
                   { "personaId": "p_005", "presente": true }],
    "coberturaDia": null, "comidaPrincipal": false, "modoReparto": "igual",
    "bebidas": []
  },
  "despensa": null,
  "esperado": {
    "veredicto": "deficit",
    "estimaciones": ["peso_por_edad", "sin_balanza"],
    "nota": "el motor debe calcular igual, con confianza baja y notaDatos; nunca debe pedir el peso como condición"
  }
}
```

### F5 · Alérgico (veto de insumo, caso no resoluble)

```json
{
  "_caso": "alergico",
  "_confirmar": {
    "personas[0].edadMeses": "[valor a confirmar]",
    "personas[0].pesoKg": "[valor a confirmar]",
    "receta.ingredientes[*].gramos": "[valor a confirmar]",
    "despensa.existencias[*].gramosDisponibles": "[valor a confirmar]"
  },
  "personas": [
    {
      "id": "p_006", "edadMeses": null, "sexo": "F", "pesoKg": null, "tallaCm": null,
      "actividad": "moderada", "gestacion": null, "lactancia": null, "anemia": null,
      "alergias": ["huevo", "pescado"], "dietas": [],
      "condiciones": ["menor_5"], "notas": "alergia referida por la familia"
    }
  ],
  "insumos": [
    { "id": "huevo", "nombre": "Huevo", "grupo": "huevo",
      "refComposicion": { "tabla": "[tabla del usuario]", "clave": "[clave a confirmar]",
                          "version": "[version a confirmar]" },
      "unidadCasera": {}, "alergenos": ["huevo"], "esPerecedero": true,
      "vidaUtilDias": null, "notas": null },
    { "id": "anchoveta", "nombre": "Anchoveta", "grupo": "pescado",
      "refComposicion": { "tabla": "[tabla del usuario]", "clave": "[clave a confirmar]",
                          "version": "[version a confirmar]" },
      "unidadCasera": {}, "alergenos": ["pescado"], "esPerecedero": true,
      "vidaUtilDias": null, "notas": null }
  ],
  "receta": {
    "id": "r_tortilla_anchoveta", "nombre": "Tortilla de huevo con anchoveta",
    "ingredientes": [
      { "insumoId": "huevo", "gramos": null, "captura": null },
      { "insumoId": "anchoveta", "gramos": null, "captura": null }
    ],
    "porcionesBase": null, "rendimientoCocidoG": null, "tecnicas": ["frito"], "version": 1
  },
  "servicio": {
    "id": "s_005", "ollaId": "olla_demo", "fecha": "2026-11-23", "tipo": "almuerzo",
    "recetaId": "r_tortilla_anchoveta",
    "comensales": [{ "personaId": "p_006", "presente": true }],
    "coberturaDia": null, "comidaPrincipal": true, "modoReparto": "igual",
    "bebidas": []
  },
  "despensa": {
    "ollaId": "olla_demo", "actualizadaEn": "2026-11-23T10:00:00Z",
    "existencias": [
      { "insumoId": "huevo", "gramosDisponibles": null, "gramosReservados": 0,
        "venceEn": null, "costoPorKg": null },
      { "insumoId": "anchoveta", "gramosDisponibles": null, "gramosReservados": 0,
        "venceEn": null, "costoPorKg": null }
    ]
  },
  "esperado": {
    "veredicto": "deficit",
    "sugerencias": [],
    "noResoluble": [{ "hallazgo": "proteina", "motivo": "alergia" }],
    "nota": "prohibido sugerir huevo o pescado; el motor debe admitir que hoy no tiene con qué resolverlo"
  }
}
```

---

## 7. Qué delega este paquete y qué no

| Responsabilidad | Dueño |
|---|---|
| Tipos, reglas de evaluación, puntaje, explicación, auditoría | `packages/nutrition` (este contrato) |
| Valores de composición por alimento, factores de retención, medidas caseras | **Externo** — entra por `ProveedorComposicion` |
| Requerimientos por edad/sexo/gestación, peso de referencia | **Externo** — entra por `ProveedorRequerimientos` |
| Valores de `ReglasMotor` (coberturas, umbrales, pesos, topes, frecuencias) | **Externo** — los fija el nutricionista, se cargan como config |
| Pantallas, permisos, impresión, sincronización | Fuera del paquete |

Los cinco valores de `ReglasMotor` que hay que cerrar con un nutricionista real (cobertura por
servicio, umbral de severidad, pesos por nutriente, factor de objetivo en anemia, topes de
frecuencia por insumo) quedan como `[valor a confirmar]` en `reglas.<version>.json`, con su
`aprobadaPor` y fecha — igual que las reglas locales de §4.4.

> **datos de composición: delegados por el usuario**
