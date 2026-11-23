# 08 · Clasificación de productos en comprobantes

> Copia integrada de `_hackods-plan/08-clasificacion-productos.md`. En este repo manda `docs/DECISIONES.md` (D8).

**Proyecto:** hackODS-Autónoma 2026 · PWA para ollas comunes del Perú
**Base:** `06-decisiones.md` (D8) y `02-arquitectura.md` (§4 offline, §5 backend, §8 escaneo, §11 privacidad).
**Fecha de consulta de docs:** 2026-11-23. Los precios y límites de free tier cambian sin aviso: cada número lleva fuente o marca.

**Regla de este documento:** cada afirmación va marcada como
✅ **verificado en docs** (con URL y fecha) · 🔶 **estimado** (hay que medirlo) · ⚠️ **decisión de diseño** (no es un dato, es una elección).

---

## 0. Resumen ejecutivo

| # | Decisión | Elegido | Por qué |
|---|---|---|---|
| 1 | Extracción | PDF con capa de texto → `pdf.js`; foto → VLM en Worker | El PDF ya trae los ítems como texto: gastar visión ahí es pagar por adivinar |
| 2 | Visión del prototipo | `@cf/moondream/moondream3.1-9B-A2B` (fallback `@cf/meta/llama-3.2-11b-vision-instruct`) | Moondream declara OCR y salida estructurada; ambos con retención cero |
| 3 | Embeddings | `@cf/baai/bge-m3` (1024 dim, multilingüe, 100+ idiomas) | Es el único del catálogo con multilingüismo explícito y probado en español |
| 4 | Búsqueda | Alias exacto primero; si falla, vectorial sobre catálogo **y alias** | El alias exacto tiene precisión 1.0 y cuesta $0 |
| 5 | Confianza | Dos puertas: `s1 ≥ τ` **y** `s1 − s2 ≥ margen`; además validación aritmética | Un coseno alto no alcanza cuando hay 5 productos parecidos |
| 6 | Producción | VPS con `bge-m3` local + Postgres/pgvector (o servicio gestionado si no se quiere operar) | Costo marginal 0 y los datos no salen; el contrato no cambia |
| 7 | Precio unitario | `precio_por_unidad_base` derivado de una tabla de equivalencias aprobada | "Saco 49 kg = S/ 119,80" no se compara con "S/ 2,44/kg" sin convertir |
| 8 | Producto desconocido | Se confirma la factura igual; el ítem queda `sin_clasificar` | El presupuesto no se bloquea por un nombre que el catálogo no conoce |
| 9 | Demo sin red | Tesseract.js local + alias difuso + entrada manual + lote precargado | El guion nunca depende de que el modelo responda |

**Costo del prototipo: US$ 0,10–0,40 por 100 facturas** (≈1.000 ítems, 10 por boleta). El free tier cubre ≈60 boletas/día con Moondream, así que un demo de ≤5 no lo toca. El número completo está en §2.5.

---

## 1. Pipeline

### 1.1 Diagrama

```
┌─ DISPOSITIVO (Android gama baja) ────────────────────────────────────────────┐
│                                                                              │
│  foto / PDF                                                                  │
│    │                                                                         │
│    ├─ (1) PDF con capa de texto ──► pdf.js getTextContent()  ──┐             │
│    │        (no se manda imagen: se lee el texto, cuesta $0)    │             │
│    │                                                            │             │
│    └─ (2) foto ──► recorte a la tabla de ítems                  │             │
│                    · 1280 px lado mayor, JPEG 0.7                │             │
│                    · EXIF fuera                                  │             │
│                    · encabezado (RUC, razón social, dirección)   │             │
│                      tapado en el bitmap                         │             │
│                    └──► Worker /extraer ──► VLM ──► JSON  ──────┤             │
│                                                                 ▼             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (3) VALIDACIÓN ARITMÉTICA (local, determinista)                        │  │
│  │     Σ líneas ≈ total · cantidad × P.U. ≈ total · fecha · folio         │  │
│  │     si no cuadra → el ítem nace "por_revisar"                          │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (4) NORMALIZACIÓN                                                      │  │
│  │     NFKC · minúsculas · tildes fuera · abreviaturas · marcas           │  │
│  │     unidades y presentación ("saco 49 kg", "bandeja 30 un", "3 L")     │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (5) ALIAS EXACTO (tabla `catalogo_texto`, alias_norm único)            │  │
│  │     hit → confianza 1.0 → CONFIRMADO   (sin embedding, sin red)        │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   │ miss                                     │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (6) EMBEDDING  bge-m3  →  vector(1024)                                 │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (7) BÚSQUEDA VECTORIAL  top-5 sobre producto + alias                   │  │
│  │     similitud = 1 − (embedding <=> query)   ·   max por producto       │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (8) DECISIÓN                                                           │  │
│  │     s1 ≥ τ  Y  (s1 − s2) ≥ margen   → CONFIRMADO                       │  │
│  │     s1 ≥ piso                        → POR_REVISAR (top 3)             │  │
│  │     s1 < piso                        → DESCONOCIDO                     │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (9) REVISIÓN HUMANA (obligatoria si no es CONFIRMADO)                  │  │
│  │     aceptar candidato · corregir buscando · crear producto             │  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ (10) ALIAS APROBADO  (aprobado_por, fecha) → recién ahí entra al índice │  │
│  │      Se escribe en Dexie + outbox; el índice global se re-embebe por job│  │
│  └────────────────────────────────┬───────────────────────────────────────┘  │
│                                   ▼                                          │
│  PRECIO OBSERVADO  (producto, unidad_base, precio_por_unidad_base,          │
│                     fecha, proveedor_hash, canal)  → serie inmutable        │
└──────────────────────────────────────────────────────────────────────────────┘

  Nada entra al presupuesto sin (9). La factura puede confirmarse con ítems
  sin clasificar: el dinero es real aunque el nombre no esté en el catálogo.
```

**Tres invariantes que no se negocian:**

1. **La extracción nunca escribe directo al presupuesto.** El VLM propone; la aritmética y la persona confirman.
2. **El catálogo no aprende solo.** Un alias entra al índice únicamente con `aprobado_por`. Sin autoaprendizaje silencioso (D8).
3. **El vector y el modelo viajan juntos.** Cada embedding guarda `modelo` y `dim`; jamás se comparan vectores de modelos distintos.

### 1.2 Extracción: qué se le pide al modelo

El VLM no devuelve prosa: devuelve JSON con un esquema cerrado. El prompt (en español, con ejemplos) pide **solo** lo que está impreso y prohíbe inventar:

```json
{
  "proveedor": "texto tal cual (se descarta después)",
  "fecha": "YYYY-MM-DD",
  "folio": "string|null",
  "total": 0.00,
  "items": [
    {
      "descripcion": "PAP. BLANCA 1RA",
      "cantidad": 49,
      "unidad": "kg",
      "precio_unitario": 1.95,
      "precio_total": 95.55,
      "presentacion": { "cantidad": 49, "unidad": "kg" }
    }
  ]
}
```

Reglas del extractor:

- `temperature: 0` y `max_tokens` explícito. **Trampa verificada:** en `llama-3.2-11b-vision-instruct` el default de `max_tokens` es **256**, que trunca un JSON de 10 ítems. Hay que subirlo (~1.500–2.000). En Moondream el default es 8.192 (máx. 28.672). ✅ docs de cada modelo.
- Si el JSON no parsea o falta `total` → `origen: 'vision'`, `confianzaExtraccion` baja y **todo el comprobante a revisión**.
- La validación aritmética es una señal de confianza, no un adorno: un modelo que "lee bien" pero suma mal se detecta en 1 línea de código.
- PDF: si `getTextContent()` devuelve texto suficiente, se parsea con reglas por proveedor (las boletas peruanas tienen layouts repetidos) y **no se usa visión**. Ahorra costo y elimina el error de lectura.

### 1.3 Contrato TS `ClasificadorProducto`

Va en `packages/domain/src/clasificacion.ts` y se congela el día 1, junto con `schema.ts` y `sync/types.ts`. Es el contrato que **no cambia** al migrar de Cloudflare a VPS.

```ts
// packages/domain/src/clasificacion.ts — CONTRATO CONGELADO
// Nada de este archivo importa un SDK: solo tipos. Los adaptadores viven en
// packages/clasificacion/src/adapters/*.

export type UnidadBase = 'kg' | 'L' | 'unidad';

/** Una línea del comprobante, tal como se leyó (antes de clasificar). */
export interface ItemComprobante {
  readonly id: string;                      // UUIDv7 generado en el cliente
  readonly descripcionOriginal: string;     // "PAP. BLANCA 1RA"
  readonly descripcionNormalizada: string;  // "papa blanca primera"
  readonly cantidad: number | null;         // 49
  readonly unidadOriginal: string | null;   // "kg" | "saco 49 kg" | "bandeja 30 un"
  readonly precioUnitario: number | null;   // como lo imprime la boleta
  readonly precioTotal: number | null;
  readonly marca: string | null;            // "Primor" (extraída aparte)
  readonly presentacion: { cantidad: number; unidad: string } | null;
}

export interface ProductoCatalogo {
  readonly id: string;
  readonly nombre: string;                  // "Papa blanca"
  readonly categoria: string;               // "tuberculos"
  readonly unidadBase: UnidadBase;
  readonly marca: string | null;            // null = genérico
  readonly equivalencias: readonly {
    readonly cantidad: number;
    readonly unidad: string;
    readonly base: number;
  }[];
}

export interface CandidatoProducto {
  readonly productoId: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly similitud: number;               // 0..1, coseno
  readonly origen: 'alias' | 'embedding';
}

export type EstadoClasificacion =
  | 'confirmado'    // auto-aceptado con confianza
  | 'por_revisar'   // hay candidato pero no alcanza
  | 'desconocido';  // ningún candidato plausible

export type MotivoClasificacion =
  | 'alias_exacto'
  | 'similitud_alta'
  | 'margen_insuficiente'
  | 'similitud_baja'
  | 'sin_catalogo'
  | 'unidad_incompatible'
  | 'aritmetica_inconsistente';

export interface ClasificacionProducto {
  readonly itemId: string;
  readonly estado: EstadoClasificacion;
  readonly productoId: string | null;
  readonly candidatos: readonly CandidatoProducto[]; // top 3, ordenados
  readonly confianza: number;              // 0..1
  readonly motivo: MotivoClasificacion;
  readonly unidadBase: UnidadBase | null;
  readonly cantidadBase: number | null;    // 49 (kg) · 3 (L) · 30 (unidad)
  readonly precioPorUnidadBase: number | null; // S/ por kg | L | unidad
  readonly requiereRevision: boolean;
}

export interface OpcionesClasificacion {
  readonly umbralSimilitud: number;   // τ — calibrado, nunca hardcodeado
  readonly margenMinimo: number;      // s1 − s2
  readonly umbralPiso: number;        // debajo: "desconocido"
  readonly topK: number;              // 5
  readonly catalogoVersion: string;   // hash del catálogo usado
  readonly modeloEmbeddings: string;  // 'baai/bge-m3@cf' | 'baai/bge-m3@vps'
}

export interface ClasificadorProducto {
  clasificar(
    items: readonly ItemComprobante[],
    opts: OpcionesClasificacion,
  ): Promise<readonly ClasificacionProducto[]>;

  /** Solo con aprobación humana. Escribe alias + embedding en el catálogo. */
  aprenderAlias(
    alias: string,
    productoId: string,
    aprobadoPor: string,
  ): Promise<void>;
}

/** Puerto de embeddings: lo único que cambia entre prototipo y producción. */
export interface EmbeddingsPort {
  readonly modelo: string;
  readonly dimension: number;
  embed(textos: readonly string[]): Promise<readonly number[][]>;
}

/** Puerto de extracción: PDF-texto, VLM, OCR local o manual. */
export interface ExtractorComprobante {
  extraer(entrada: {
    tipo: 'pdf' | 'imagen';
    bytes: Uint8Array;
    mime: string;
  }): Promise<{
    fecha: string;
    folio: string | null;
    total: number;
    items: readonly ItemComprobante[];
    confianzaExtraccion: number;
    origen: 'pdf_texto' | 'vision' | 'ocr_local' | 'manual';
  }>;
}
```

**Por qué este contrato sobrevive a la migración:** `ClasificadorProducto` no sabe si el vector lo produjo Cloudflare, Ollama o OpenAI. Solo recibe `EmbeddingsPort`. Cambiar de proveedor es escribir otro adaptador de ~40 líneas y **re-embeder el catálogo**, no tocar UI, presupuesto, alias ni revisión.

⚠️ Lo único que sí cambia con el proveedor es la **dimensión** del vector. `vector(1024)` en Postgres es fijo: si el modelo nuevo tiene otra dimensión, hay migración de columna y re-embedding completo. Se diseña para que sea un job, no una sorpresa: `producto_embedding(modelo, dim, embedding)`.

### 1.4 Normalización del texto

La normalización es la etapa más barata y la que más precisión aporta. Todo en `packages/domain/src/normalizar.ts`, puro y testeable sin red.

| Paso | Ejemplo |
|---|---|
| NFKC + minúsculas | `PAP. BLANCA` → `pap. blanca` |
| Tildes fuera | `AZÚCAR` → `azucar` · `JUREL FRESCO` → `jurel fresco` |
| Puntuación y espacios | `PAP.  BLANCA  1RA.` → `papa blanca 1ra` |
| Abreviaturas | `PAP`→`papa`, `CEB`→`cebolla`, `ZANAH`→`zanahoria`, `FRJ`→`frijol`, `ACEIT`→`aceite`, `ARR`→`arroz`, `PLLO`→`pollo`, `HVO`→`huevo` |
| Marcas fuera del nombre | `ACEITE PRIMOR VEGETAL 3L` → nombre `aceite vegetal`, marca `primor`, presentación `3 L` |
| Unidades | `KG`, `KGR`, `KILO` → `kg`; `LT`, `LTS`, `LITRO` → `L`; `UN`, `UND`, `UNID` → `unidad` |
| Presentación | `SACO 49 KG`, `BANDEJA 30 UN`, `BOTELLA 3 L` → `presentacion` + `equivalencias` |
| Números peruanos | `1,95` y `1.95` → `1.95`; `S/` y `S/.` fuera |

**No** se normaliza la marca hacia el genérico: `aceite oliva` y `aceite vegetal` son productos distintos. La marca se guarda como atributo, no se borra.

---

## 2. Prototipo en Cloudflare

### 2.1 Qué hay hoy en Workers AI (verificado)

✅ Catálogo y precios consultados el **2026-11-23** en `developers.cloudflare.com/workers-ai/models/` y `/platform/pricing/` (páginas con `dateModified: 2026-08-12` y `2026-11-18`).

**Visión (image-to-text):**

| Modelo | ID real | Precio | Límite de salida | Notas |
|---|---|---|---|---|
| **Moondream 3** | `@cf/moondream/moondream3.1-9B-A2B` | $0,30/M in · $1,00/M out | `max_tokens` 8.192 por defecto, máx. 28.672 | Declara **OCR y salida estructurada**; acepta URL HTTPS pública o **data URI base64**; retención cero; 9B MoE (2B activos) |
| Llama 3.2 11B Vision | `@cf/meta/llama-3.2-11b-vision-instruct` | $0,0485/M in · $0,676/M out | 128.000 tokens | 11B denso; `max_tokens` default **256**; pide aceptar licencia una vez (`prompt: "agree"`); retención cero |
| Mistral Small 3.1 24B | `@cf/mistralai/mistral-small-3.1-24b-instruct` | $0,351/M in · $0,555/M out | 128k | Alternativa si Moondream no lee bien letra pequeña |
| Llama 4 Scout 17B | `@cf/meta/llama-4-scout-17b-16e-instruct` | $0,270/M in · $0,850/M out | — | Multimodal; más caro que Llama 3.2 Vision |

**Embeddings:**

| Modelo | ID real | Precio | Contexto | Dim | Idioma |
|---|---|---|---|---|---|
| **BGE-M3** | `@cf/baai/bge-m3` | $0,0118/M in | 60.000 tokens (CF) · 8.192 (ficha BAAI) | **1024** | **100+ idiomas** (ficha BAAI); retención cero |
| Qwen3 Embedding 0.6B | `@cf/qwen/qwen3-embedding-0.6b` | $0,0118/M in | 8.192 tokens | (no publicada en la ficha CF) | Multilingüe; retención cero |
| EmbeddingGemma 2 | `@cf/google/embeddinggemma-2` | **$0,0017/M in** | — | 768 | Multimodal, 100+ idiomas; 6× más barato que BGE-M3 |
| BGE Reranker Base | `@cf/baai/bge-reranker-base` | $0,003/M in | — | — | Reranker opcional para desempatar top-3 |

**Límites de tasa** ✅ (`/platform/limits/`, `dateModified: 2026-09-17`): Image-to-Text **720 req/min**; Text Embeddings **3.000 req/min** (bge-large 1.500); Text Generation 300 req/min.

**Free tier** ✅ (`/platform/pricing/`): **10.000 neurons/día**, reset 00:00 UTC; después **$0,011 por 1.000 neurons**. En el plan Free no se puede pasar de 10.000/día; en Workers Paid se paga el excedente. Algunos modelos (DeepSeek V4, Kimi, GLM 5.x, Inkling) **exigen plan pago**, pero Moondream, Llama Vision y BGE-M3 **no**.

> **Lectura honesta del free tier:** 10.000 neurons ≈ **US$ 0,11** de inferencia por día. No es "mil facturas gratis": es un presupuesto diario chico. Ver §2.5.

### 2.2 ¿Sirve Workers AI para visión de boletas?

**Respuesta corta: sirve para el prototipo, con revisión humana; no está probado para boletas peruanas y no se debe prometer precisión.**

- ✅ Moondream 3 declara explícitamente OCR y *structured output* en su ficha. Es el mejor candidato del catálogo para una tabla de ítems.
- 🔶 **No encontramos benchmark público** de estos modelos sobre boletas térmicas peruanas (papel curveado, letra condensada, `S/`, `P.U.`, `Dscto.`). Hay evidencia de capacidad (OCR declarado), **no** de precisión en este dominio.
- 🔶 La apuesta razonable: boletas impresas en buen estado y foto recta → 85–95 % de líneas correctas; papel arrugado, poca luz o letra de matriz de puntos → 50–75 %. **Medir el día 1 con 20 fotos** (anonimizadas) antes de escribir el guion.
- ⚠️ Si la extracción de líneas baja de ~70 %, no se insiste: se cambia el extractor, no el contrato. Alternativas concretas:
  1. **Google Cloud Document AI – Invoice Parser** o **Azure AI Document Intelligence – prebuilt-invoice**: OCR especializado en facturas, mejor con layouts raros. Costo y retención a verificar antes de usarlos (no se citan precios acá porque no se pudieron verificar hoy).
  2. **PaddleOCR/Tesseract en el VPS** + parser por proveedor: sin costo por llamada, funciona con texto impreso, requiere escribir reglas.
  3. **Entrada manual asistida**: el último fallback y el que nunca falla.

**Conclusión:** el prototipo se hace con Moondream; la calidad se mide, no se asume. El diseño ya tolera que el modelo falle porque la revisión es obligatoria.

### 2.3 Cómo se llama desde una Worker

✅ Binding oficial (`/workers-ai/get-started/workers-wrangler/`): en `wrangler.jsonc`

```jsonc
{ "ai": { "binding": "AI" } }
```

y en el código `env.AI.run(modelo, params)`.

```ts
// apps/clasificador/src/index.ts  (Worker independiente del front)
export interface Env {
  AI: Ai;
  CATALOGO: KVNamespace;      // catálogo + alias versionados
  TOKEN_INTERNO: string;      // el front no habla con Workers AI directo
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { imagenBase64, items } = await req.json();

    // 1) extracción (solo si vino imagen)
    let extraido = null;
    if (imagenBase64) {
      const r = await env.AI.run("@cf/moondream/moondream3.1-9B-A2B", {
        task: "query",
        image: imagenBase64,                       // data URI base64
        question: PROMPT_EXTRACCION,               // pide JSON estricto
        reasoning: false,
        temperature: 0,
        max_tokens: 2000,
      });
      extraido = parsearJSONEstricto(r.answer);     // si falla: 422, no inventar
    }

    // 2) embeddings de las descripciones normalizadas
    const textos = (items ?? extraido.items).map((i: any) => i.descripcionNormalizada);
    const emb = await env.AI.run("@cf/baai/bge-m3", { text: textos });

    // 3) búsqueda contra el catálogo (en el Worker o en Supabase/pgvector)
    //    devuelve candidatos; la decisión final la toma el cliente con el
    //    mismo contrato ClasificadorProducto.
    return Response.json({ extraido, embeddings: emb.data });
  },
};
```

**Reglas de arquitectura:**

- El **token de Cloudflare nunca va al navegador**. La PWA llama a la Worker; la Worker tiene el binding `AI`. Si se usara la API REST, el token vive como secreto de la Worker.
- La Worker es **stateless**: no guarda comprobantes ni embeddings. El catálogo vive en Supabase (o KV versionado) y la verdad local en Dexie.
- La clasificación puede correr **en la Worker** (si el catálogo está en KV) o **en el cliente** (si ya bajó el catálogo y llama solo a `/embeddings`). Para el demo: Worker, una sola llamada, menos latencia de ida y vuelta.
- Si se cae la Worker, el cliente ya tiene el camino local (§7).

### 2.4 Latencia esperada

| Etapa | Medición / estimación |
|---|---|
| Red Perú → edge Cloudflare | ✅ **143 ms promedio, mínimo 49 ms, máximo 215 ms** (6 muestras, conexión doméstica en Lima, `02-arquitectura.md` §5.1). El PoP observado fue **Miami** (`colo=MIA`), no Lima |
| Inferencia de visión | 🔶 **2–8 s** por boleta en Moondream (9B MoE, 2B activos). Cold start puede sumar 2–5 s. **Medir 20 muestras** y reportar p50/p95 |
| Embeddings (1 lote de 10 textos) | 🔶 **150–600 ms** incluyendo red; el cálculo es milisegundos |
| Ida y vuelta total | 🔶 **3–10 s** por boleta con visión; **<1 s** si el PDF trae texto |

⚠️ Para un demo de 3 minutos, 3–10 s por boleta es demasiado si se hace en vivo con público. El guion usa **una** boleta precargada y, si se muestra la lectura, se muestra el resultado ya calculado con el badge "leído en este dispositivo". La latencia real se muestra en un anexo o en el panel de diagnóstico.

### 2.5 Cuota y costo: cuentas explícitas

**Supuestos** (🔶 todos medibles, se declaran para que la cuenta sea auditable):

- 1 factura = 1 foto = **10 ítems**.
- Entrada al VLM: **2.000 tokens** (imagen + prompt). Salida: **1.200 tokens** (JSON de 10 ítems).
- Embeddings: **25 tokens por ítem** → 1.000 ítems = 25.000 tokens.
- Workers AI factura la imagen como tokens de entrada; no hay precio aparte por imagen en la ficha. ✅ (solo hay columnas input/output).

**Moondream 3:**

```
entrada  2.000 × $0,30/1M   = $0,00060
salida   1.200 × $1,00/1M   = $0,00120
                         → $0,0018 por factura
100 facturas              → $0,18
```

**Neurons:** 2.000 × 27.273/1M = 54,5 + 1.200 × 90.909/1M = 109,1 → **163,6 neurons/factura**.
Free tier 10.000/día → **≈61 facturas/día**. 100 facturas = 16.360 neurons → **6.360 de excedente = $0,07** (más el plan Workers Paid si se quiere pasar del límite diario).

**Llama 3.2 11B Vision (alternativa más barata):**

```
entrada  2.000 × $0,0485/1M = $0,000097
salida   1.200 × $0,676/1M  = $0,000811
                          → $0,00091 por factura
100 facturas               → $0,09
neurons: 8,8 + 73,8 = 82,6/factura → 100 facturas = 8.260 neurons (entra en el free tier)
```

**Embeddings BGE-M3:**

```
1.000 ítems × 25 tokens = 25.000 tokens
25.000 × $0,0118/1M = $0,000295   (menos de 3 centésimas de centavo)
```

**Total por 100 facturas (≈1.000 ítems):**

| Componente | Moondream | Llama Vision |
|---|---|---|
| Visión | $0,18 | $0,09 |
| Embeddings | $0,0003 | $0,0003 |
| **Total** | **$0,18** | **$0,09** |
| Con 50 % de reintentos | ~$0,27 | ~$0,14 |

**Rango a presupuestar: US$ 0,10–0,40 por 100 facturas.** El extremo alto cubre imágenes que cuestan 5.000 tokens de entrada y una salida de 2.000. Aun así, **100 facturas cuestan menos que un café**.

> **El costo no está en el embedding: está en leer la boleta.** Un servicio de embeddings cobra centésimas de centavo por 1.000 ítems; una llamada de visión cuesta 100–1.000× más. Cualquier comparación que mire solo embeddings está mirando la parte barata del problema.

### 2.6 ¿Y si el free tier no alcanza en el demo?

- El demo usa **≤5 facturas**. Con Moondream son ~820 neurons: **8 % del free tier diario**. No hay riesgo.
- El riesgo real es que otra persona del equipo haya consumido los 10.000 neurons ese día (el límite es por cuenta). Mitigación: **una cuenta solo para el demo**, y `wrangler` con un token de esa cuenta.
- Si se agota: la Worker devuelve 429 y el cliente cae al plan B (§7) sin mostrar error.

---

## 3. Producción: VPS, embeddings gestionados o seguir en Cloudflare

### 3.1 Las tres opciones, sin maquillaje

**(a) VPS con embeddings locales + Postgres/pgvector**

- `bge-m3` corre en CPU con **Ollama** (1,2 GB, contexto 8K ✅ ficha de Ollama) o `multilingual-e5-large` con **fastembed** (1024 dim, 2,24 GB ✅ tabla oficial de fastembed). Ojo: fastembed **no lista bge-m3** en su tabla de modelos de texto; Ollama sí.
- La lectura del comprobante es el problema: un VPS de 2 vCPU/4 GB **no corre un VLM**. Opciones: PaddleOCR/Tesseract + reglas (bueno para impreso), o un VPS con GPU (el costo se multiplica), o mantener la visión en la nube y solo mover el embedding.
- Ventaja decisiva: **el texto de los productos y los precios no salen del servidor**. Costo marginal por ítem: 0.

**(b) Servicio de embeddings gestionado (OpenAI, Cohere, Jina)**

- OpenAI `text-embedding-3-small`: **$0,02/M tokens**; `3-large`: **$0,13/M** ✅ pricing oficial consultado hoy. Para 1.000 ítems (25k tokens): **$0,0005**. Es ruido.
- Cohere y Jina: sus páginas de precio **no exponen la tarifa en el HTML** (render dinámico). No se citan números para no inventar. 🔶 Verificar en el dashboard antes de comprometer.
- Ventaja: cero operación, calidad buena, SDKs maduros. Desventaja: el texto sale del país y hay que **re-embeder todo** si se cambia de proveedor (los vectores de modelos distintos no son comparables ✅ Jina FAQ).

**(c) Seguir en Cloudflare**

- Ventaja: todo en un lugar, free tier, retención cero documentada, sin servidor que actualizar. Desventaja: 10.000 neurons/día es un techo real para 23 ollas subiendo a fin de mes; lock-in en IDs de modelo y en el esquema de facturación; el PoP desde Lima puede ser Miami.

### 3.2 Tabla comparativa

Costos por **1.000 ítems clasificados** (100 facturas de 10 ítems). La columna "incluye" dice qué parte del pipeline cubre; comparar solo embeddings engaña.

| | (a) VPS + pgvector | (b) Embeddings gestionados | (c) Cloudflare |
|---|---|---|---|
| **Costo / 1.000 ítems** | 🔶 **US$ 0,005–0,012** (VPS US$ 5–12/mes amortizado a 1.000 ítems/mes) + **US$ 0** marginal | ✅ **US$ 0,0005** (OpenAI small) + lectura aparte | ✅ **US$ 0,09–0,40** (incluye visión; típico 0,18) |
| **Qué incluye** | Embedding + OCR local + Postgres | **Solo embedding** | Visión + embedding (todo el pipeline) |
| **Latencia desde Perú** | 🔶 120–200 ms RTT a un VPS US/EU + 30–150 ms de cómputo → **0,3–1 s** (+ OCR 1–4 s) | 🔶 150–300 ms RTT + 50–150 ms → **0,3–0,6 s** | ✅ 143 ms RTT medido + 🔶 2–8 s de visión → **3–10 s** |
| **Privacidad** | **La mejor**: nada sale del VPS; el proveedor del VPS ve el disco (cifrar) | Media: los nombres de productos y precios salen; las imágenes quedan si el OCR es local | Media-alta: sale el recorte + texto; **retención cero** documentada en los 3 modelos |
| **Esfuerzo de operación** | **Alto**: SO, TLS, backups, Postgres, modelo, monitoreo, actualizaciones | **Bajo**: una API key y reintentos | **Muy bajo**: binding + deploy |
| **Lock-in** | **Bajo**: Postgres estándar, modelos abiertos | **Medio**: re-embedding al cambiar; esquema OpenAI-compatible ayuda | **Alto**: IDs de modelo, neurons, KV |
| **Escala** | 1 VPS aguanta decenas de miles de ítems/mes | Ilimitada con presupuesto | Techo diario de neurons; se resuelve pagando |
| **Riesgo principal** | Que nadie lo opere (parchear, backup, TLS) | Costo y dependencia del proveedor | Cuota diaria y latencia de visión |

### 3.3 Recomendación

**Prototipo: Cloudflare (c). Producción: VPS (a), con salida intermedia (b) si el equipo no quiere operar.**

El razonamiento, en orden:

1. **El prototipo no justifica un servidor.** 3 días, 3 personas, 5 facturas de demo: Workers AI + Pages es cero infraestructura. Y el free tier alcanza.
2. **En producción, el volumen es chico y el dato es sensible.** 23 ollas × ~4 comprobantes/mes ≈ **100 facturas/mes ≈ 1.000 ítems/mes**. Un VPS de US$ 6–12/mes lo absorbe con costo marginal 0, y los precios de compra de una olla no viajan a un tercero.
3. **El embedding es la parte fácil; la lectura es la difícil.** Si el VPS no puede correr un VLM, la visión queda en Cloudflare o se reemplaza por OCR local. Esa es la decisión real, y por eso el contrato separa `ExtractorComprobante` de `ClasificadorProducto`.
4. **Si el equipo no va a operar un VPS, (b) es mejor que (c) para producción**: el embedding es baratísimo y el OCR puede quedarse local (Tesseract/PaddleOCR), con lo que solo salen nombres de productos, no imágenes ni RUC.

**Cuándo migrar de (c) a (a):** más de ~2.000 facturas/mes, o cuando aparezca un requisito de que los datos no salgan del país, o cuando haga falta ajustar el modelo con el catálogo real. Antes de eso, migrar es trabajo sin retorno.

### 3.4 Qué NO cambia cuando se migra

| No cambia | Por qué |
|---|---|
| `ClasificadorProducto`, `ItemComprobante`, `CandidatoProducto`, `ClasificacionProducto` | Son tipos puros; ningún SDK los toca |
| `EmbeddingsPort` (firma) | Cambia la implementación, no el método |
| El flujo de revisión humana y el estado `por_revisar` | Es producto, no infraestructura |
| La tabla de alias y la regla "solo con aprobación" | Es gobernanza del catálogo |
| El procedimiento de calibración de umbrales | Se recalibra con el set de 100, pero el método es el mismo |
| El modelo de precio observado y la serie inmutable | Es el dominio (D8) |
| La UI de corrección y el "producto desconocido" | No sabe dónde corre el modelo |

**Lo que sí cambia:** el adaptador (~40 líneas), la dimensión del vector (migración de columna + re-embedding), la latencia, y la postura de privacidad (mejor en VPS). **Nunca se mezclan vectores de dos modelos en un mismo índice** ✅ (Jina FAQ: "embeddings from different model families are not comparable").

---

## 4. Calidad: cómo se mide y qué umbral usar

### 4.1 Métricas

| Métrica | Definición | Meta inicial |
|---|---|---|
| **accuracy@1** | top-1 correcto / ítems con respuesta correcta | ≥ 80 % |
| **precisión de auto-aceptados** | correctos / auto-aceptados (`confirmado`) | **≥ 95 %** (la que manda) |
| **tasa de revisión** | `por_revisar` + `desconocido` / total | ≤ 30 % al lanzar; baja con alias |
| **tasa de desconocidos** | sin candidato sobre el piso / total | ≤ 10 % |
| **precisión por categoría** | macro-promedio por categoría | ninguna categoría < 70 % |
| **cobertura de unidad** | ítems con `precioPorUnidadBase` / total | ≥ 90 % |
| **tiempo humano por ítem** | segundos en revisar | < 5 s |
| **cobertura de clasificación por olla** | ítems confirmados / ítems | se muestra; si < 80 %, se pide curar |

**Por qué la precisión de auto-aceptados manda:** un falso positivo entra al presupuesto sin que nadie lo mire y **miente en la serie de precios**. Un falso negativo solo cuesta 5 segundos de revisión. El sistema debe preferir revisar de más.

### 4.2 Set etiquetado de 100 ítems

**Composición: 10 categorías × 10 ítems, con casos difíciles a propósito.**

| Categoría | Ejemplos | Trampa incluida |
|---|---|---|
| Pescado | jurel, bonito, jurel entero, filete | **jurel ≠ bonito** (la tabla T-01 los separa; T-02 los fusiona). Nunca auto-fusionar |
| Tubérculos | papa blanca, amarilla, huayro, camote | blanca ≠ amarilla ≠ huayro; "papa" sola es ambigua |
| Cereales | arroz corriente, extra, fideos tallarín, fideo cabello de ángel | corriente ≠ extra; fideos por kg vs paquete |
| Aceites | aceite vegetal, oliva, girasol | oliva ≠ vegetal; botella 3 L vs litro |
| Menestras | frijol castilla, pallar, lenteja, garbanzo | castilla ≠ pallar; "frejol" vs "frijol" |
| Verduras | cebolla, tomate, zanahoria, zapallo | "cebolla china" ≠ "cebolla roja" |
| Pollo/huevo | pollo vivo, pollo beneficiado, huevo rosado, huevo pardo | vivo ≠ beneficiado; huevo por kg vs bandeja 30 |
| Abarrotes | azúcar rubia, azúcar blanca, sal, atún | rubia ≠ blanca; atún en aceite vs agua |
| No alimento | detergente, bolsas, gas | debe caer en "no alimento", no forzarse a comida |
| Desconocidos | marcas locales, nombres truncados por el ticket | **debe** devolver `desconocido`, no adivinar |

**Cómo se construye sin datos reales en el repo:**

1. **80 ítems de boletas reales anonimizadas** (equipo, familia, mercado de Villa El Salvador), con RUC tapado y proveedor reemplazado por `proveedor-1`. Se guardan **fuera del repo** (carpeta privada) y al repo solo va el **texto de la descripción + etiqueta**, sin imagen ni RUC.
2. **20 ítems sintéticos** generados a partir de las listas públicas de precios (GMML 20/11/2026 y Plaza Vea 23/11/2026, ya citadas en `10-texto.md`): sirven para las variantes de abreviatura y presentación.
3. **Etiquetado a ciegas por 2 personas**, cada una con la descripción impresa y el catálogo. Discrepancias: las resuelve P1 con una regla escrita ("si el ticket dice solo JUREL, es jurel; bonito solo si dice BONITO").
4. **Split 60/40**: 60 para calibrar umbrales (dev), 40 para reportar (test). El test **no se toca** hasta el informe final.
5. **Versionado**: `qa/set-100.v1.jsonl` (solo texto + etiqueta + unidad + precio), hash en el commit. Cuando cambie el catálogo, se agregan casos, no se reescriben los viejos.

**Formato de cada línea:**

```json
{"id":"q001","texto":"PAP. BLANCA 1RA","esperado":"papa_blanca","unidad":"kg","cantidad":49,"precio":1.95,"categoria":"tuberculos","dificil":false}
```

### 4.3 Umbral: cómo se elige (no se inventa)

El coseno de BGE-M3 sobre nombres cortos es **comprimido**: dos productos distintos pueden dar 0,55 y dos variantes del mismo producto 0,85. Por eso un umbral absoluto solo no alcanza. ⚠️ Decisión de diseño: **dos puertas + piso**.

```
alias exacto                          → confirmado (confianza 1.0)
s1 ≥ τ  Y  s1 − s2 ≥ margen          → confirmado
s1 ≥ piso                             → por_revisar (top 3)
s1 < piso                             → desconocido
```

**Procedimiento de calibración (1 hora, con el set de 60):**

1. Calcular `s1` y `s2` para cada ítem.
2. Para cada par `(τ, margen)` de una grilla (τ de 0,50 a 0,85 en pasos de 0,01; margen de 0,00 a 0,10 en pasos de 0,01), medir **precisión de auto-aceptados** y **tasa de revisión**.
3. Elegir el punto con **precisión ≥ 0,95** y la **menor tasa de revisión**.
4. Reportar el resultado en el set de test de 40, una sola vez.

**Valores de arranque (🔶 estimados, no medidos):** `τ = 0,62`, `margen = 0,04`, `piso = 0,45`. Se usan para la primera corrida y **se reemplazan** por los calibrados. Si el catálogo usa `embeddinggemma-2` (768 dim) los valores cambian: **el umbral es del modelo, no del producto**.

**Señales extra que suben la confianza sin costo:**

- Coincidencia de tokens poco frecuentes (`jurel`, `pallar`, `huayro`) → +0,05.
- Unidad compatible (`kg` vs `kg`) → +0,05; incompatible (`bandeja` vs `kg` sin equivalencia) → fuerza `por_revisar` con motivo `unidad_incompatible`.
- Aritmética consistente → no sube confianza de clasificación, pero **baja** todo el comprobante si falla.
- Reranker `bge-reranker-base` sobre el top-3 en los ambiguos (cuesta $0,003/M, centésimas) → opcional v1.1, no en el camino crítico.

### 4.4 Precio por kilo vs por unidad

Es el problema que más ensucia una serie de precios. Casos reales de las tablas del proyecto:

| Ítem | Cómo viene | Trampa |
|---|---|---|
| Arroz corriente | `S/ 2,44/kg` **y** `saco 49 kg = S/ 119,80` | 119,80/49 = 2,445 → coincide; pero si se carga el precio del saco como "precio unitario", la serie salta 49× |
| Aceite | `S/ 6,30/L` **y** `botella 3 L = S/ 18,90` | 18,90/3 = 6,30; hay que dividir, no comparar botella con litro |
| Huevo | `S/ 5,20/kg` **y** `bandeja 30 un = S/ 17,80` (S/ 0,59/un) | **unidad física distinta para el mismo insumo**; nunca mezclar kg y unidad en la misma serie |
| Papa | `S/ 1,95/kg`, a veces `saco` | el saco no siempre declara kilos; si no declara, no se convierte |

**Regla de implementación:**

```
cantidadBase = cantidad × factorEquivalencia(unidadOriginal → unidadBase)
precioPorUnidadBase = precioTotal / cantidadBase
```

- `factorEquivalencia` sale de una **tabla aprobada** (`equivalencia`: `saco_arroz_49kg → 49 kg`, `botella_aceite_3L → 3 L`, `bandeja_huevo_30 → 30 unidad`). Si no hay fila, **no se inventa**: `unidadBase = null`, el ítem se guarda con su unidad original y **se excluye de la comparación** (D8).
- Se guardan **tres** números distintos, no uno: `precioUnitarioImpreso` (lo que dice el ticket), `precioTotal` (la línea) y `precioPorUnidadBase` (el derivado). El presupuesto usa el total; la tendencia usa el derivado; la UI muestra el impreso.
- La validación aritmética compara `cantidad × precioUnitario ≈ precioTotal`. Si no cuadra, el ítem va a revisión **aunque la clasificación sea perfecta**.

### 4.5 Marcas

- **Producto genérico** (`aceite vegetal`) y **marca** (`Primor`, `Cocinero`) son campos separados. El embedding clasifica el genérico; la marca se extrae por diccionario + campo del VLM.
- `variante = (producto, marca|null, presentacion)`. La serie de precios se guarda por variante.
- La tendencia "aceite vegetal" se puede mostrar agregando marcas, pero **rotulada como "mezcla de marcas"** y solo si hay ≥3 observaciones.
- El embedding **nunca** decide la marca: `aceite oliva` y `aceite vegetal` son productos distintos, y `Primor` vs `Cocinero` es un atributo, no una identidad.
- Alias con marca (`ACEITE PRIMOR 3L`) se indexan, pero apuntan al producto genérico **con marca**; no crean un producto nuevo salvo que la persona lo pida.

---

## 5. Catálogo

### 5.1 Cómo arranca

- **23 filas de precio** de la tabla normalizada T-03 (`precios_seed`): unidad limpia (`kg`/`litro`/`unidad`) y canal (`mayorista`/`minorista`). ✅ `11-tablas.md` §T-03.
- De esas 23, **14 están nombradas** en `10-texto.md` §103: papa blanca 1,95; papa amarilla 3,93; arroz corriente 2,44; pollo vivo 6,10; huevo rosado 5,20; jurel/bonito 9,00; cebolla 2,25; tomate 3,38; zanahoria 3,04; zapallo 3,05; aceite 6,30/L; frijol castilla 13,20; azúcar 4,80; fideos 4,33. Las 9 restantes se leen de T-01/T-03 al cargar el seed; **no se inventan**.
- A esas 23 se les agregan los **alias frecuentes** (2–4 por producto). Es un **borrador** con las abreviaturas observadas en las tablas y en boletas de ejemplo; se cierra con boletas reales anonimizadas antes de congelar `catalogo.v1`:

```json
[
  {"producto":"papa_blanca","alias":["pap blanca","papa blanca 1ra","papa blanca saco","pap. blanca"]},
  {"producto":"jurel","alias":["jurel fresco","jurel entero","jurel ent","pescado jurel"]},
  {"producto":"bonito","alias":["bonito fresco","bonito entero","pescado bonito"]},
  {"producto":"arroz_corriente","alias":["arroz corriente","arroz corriente saco","arroz 49 kg"]},
  {"producto":"aceite_vegetal","alias":["aceite vegetal","aceite 3l","aceite botella"]},
  {"producto":"frijol_castilla","alias":["frejol castilla","frijol castilla","frj castilla"]}
]
```

> `arroz extra` no es un alias de `arroz corriente`: es otro producto. La regla es que **cada alias apunta a un solo producto** y `alias_norm` es único en la base. Si dos personas proponen el mismo alias para productos distintos, gana la revisión, no el último que escribe.

- **Jurel y bonito quedan separados.** La tabla T-02 los fusiona para mostrar; el catálogo **no**. Fusionarlos arruina la serie de precios y es el error más caro que puede cometer este módulo.
- El catálogo inicial se versiona (`catalogo.v1`) con hash; cada comprobante guarda `catalogoVersion`, para poder reproducir por qué clasificó lo que clasificó.

### 5.2 Quién lo cura

| Rol | Qué hace | Qué no hace |
|---|---|---|
| **P1 (datos/dominio)** | Esquema, seed, revisión de alias, job de re-embedding | Aprobar un alias "porque sí" sin ver la boleta |
| **Organizadora** | Propone alias desde la revisión ("esto es papa blanca") | Crear productos globales ni borrar |
| **Nutricionista** | Valida categoría y unidad base (kg/L/unidad) | Editar precios |
| **Admin** | Promueve un alias local a global, resuelve conflictos | Autoaprobar lotes |

**Regla dura:** un alias global necesita **una** aprobación humana identificada (`aprobado_por`). No hay "aprobar todo". El botón dice "Aprobar alias", no "Guardar".

### 5.3 Cómo crece sin ensuciarse

1. **Estados:** `propuesto → aprobado | rechazado`. Solo `aprobado` entra al índice de búsqueda.
2. **Un alias, un producto.** Constraint único sobre `alias_norm` (por olla si es local). El intento de duplicado abre una pantalla de conflicto, no un `insert` silencioso.
3. **Umbral de promoción:** un producto nuevo se crea cuando hay **2 observaciones en comprobantes distintos** o una aprobación explícita. Un typo de una boleta no se vuelve catálogo.
4. **Tope de alias por producto:** 5 sugeridos. Si se pasa, la UI obliga a revisar duplicados (`papa blanca` vs `pap blanca` vs `papa bca`).
5. **Job de re-embedding:** cuando se aprueba un alias, se encola; el índice se reconstruye por versión. Nada de escribir el vector en el request del usuario.
6. **Auditoría:** `alias_historial(alias, producto_anterior, producto_nuevo, quien, cuando)`. Si alguien "arregla" 200 alias, queda registro.
7. **Métrica de salud:** alias que nunca matchean (candidatos a borrar), productos con 0 observaciones en 90 días (candidatos a archivar), y % de ítems que caen en `desconocido` por olla.

### 5.4 "Producto desconocido" sin bloquear la factura

⚠️ Decisión: **el dinero es real aunque el nombre no esté en el catálogo.**

```
Factura confirmada
  ├─ ítem clasificado   → producto_id, categoría, serie de precio
  ├─ ítem por_revisar   → se resuelve en la revisión (obligatoria)
  └─ ítem desconocido   → producto_id = null, categoria = 'sin_clasificar'
                          · cuenta en `gastado` (tiene precio)
                          · NO cuenta en el desglose por categoría
                          · NO entra a la serie de precios
                          · la factura se confirma igual
```

- `factura.estado = 'confirmada_con_pendientes'`; la UI muestra "2 ítems sin clasificar (S/ 14,50)" con dos acciones: **crear producto** o **dejar así**.
- El presupuesto muestra `gastado` completo y una línea separada "sin clasificar". Nunca se oculta plata.
- El reporte entre ollas agrega "cobertura de clasificación"; si una olla está bajo 80 %, se le sugiere curar, no se le bloquea nada.
- Un ítem desconocido **no** se auto-crea. Si se repite 3 veces en 3 boletas, aparece como sugerencia ("¿Crear 'pallar'?"), con la persona decidiendo.

---

## 6. Privacidad

La boleta trae **RUC del proveedor, razón social, dirección, a veces DNI del comprador y el detalle de lo que compró la olla**. Nada de eso necesita salir completo.

### 6.1 Qué se queda en el dispositivo

| Dato | Dónde vive | Sale del dispositivo |
|---|---|---|
| Foto original | Dexie cifrada (AES-GCM con PIN de la olla, D5) | **Nunca** por defecto |
| Recorte de la tabla de ítems | Memoria, se envía solo si se usa visión | Sí, si el usuario elige la nube |
| Texto del PDF | Memoria | **No** (se procesa local) |
| RUC / razón social / dirección | **No se guarda**; se tapa en el bitmap antes de subir | **No** |
| Nombre del cajero, DNI del comprador | Se descarta en el recorte | **No** |
| Folio | Se guarda como `folio_hash` | Solo el hash |
| Proveedor | `proveedor_hash = HMAC-SHA256(ruc, salt_olla)` | Solo el hash |

**Antes de cualquier subida, en el cliente:**

1. Recortar a la región de ítems (detección simple por bordes o recorte manual con guía).
2. Reescalar a 1280 px lado mayor, JPEG 0.7 (mismo presupuesto que `02-arquitectura.md` §4.5).
3. Quitar EXIF (incluye GPS).
4. Tapar el encabezado con un rectángulo negro: RUC, razón social, dirección, teléfono.
5. Si el PDF tiene capa de texto: **no se genera imagen**.

### 6.2 Qué se guarda en la nube

- `comprobante(id, olla_id, fecha, total, proveedor_hash, folio_hash, hash_imagen, estado)`.
- `item(comprobante_id, descripcion_normalizada, cantidad, unidad_base, precio_total, precio_por_unidad_base, producto_id, estado)`.
- **No** se guarda RUC en claro, ni razón social, ni dirección, ni la imagen original por defecto.
- La imagen recortada, si se guardó, va a bucket privado con RLS por olla y **retención de 30 días** (mismo criterio que las fotos de cuaderno, `02-arquitectura.md` §11.4).
- En el reporte entre ollas, el proveedor **no aparece**: solo agregados por categoría y período (D8).

### 6.3 Qué sale a un tercero

| Proveedor | Qué recibe | Retención |
|---|---|---|
| Cloudflare Workers AI (prototipo) | El **recorte** de ítems + el prompt; después, los nombres normalizados | ✅ **Zero data retention** en Moondream 3, Llama 3.2 Vision y BGE-M3 (fichas de modelo) |
| OpenAI / Cohere / Jina (si se elige) | Nombres de productos y precios (texto) | 🔶 Verificar DPA y retención; Jina declara que no entrena con las entradas ✅ FAQ |
| VPS propio (producción) | Nada sale | N/A |

**Lo que nunca sale, ni en el prototipo:** la foto completa, el RUC, la razón social, la dirección, el DNI, el nombre de la persona que atendió, y cualquier dato de una persona del padrón. Son mundos separados: el módulo de comprobantes no toca `personas`.

### 6.4 Reglas para el repo público

- **Cero boletas reales**, ni en `supabase/seed.sql`, ni en fixtures, ni en capturas del pitch. El historial de git es irreversible (`02-arquitectura.md` §11.5).
- Fixtures sintéticos: RUC `20123456789` (obviamente falso), proveedor `Proveedor Demo 01`, ítems con precios de las tablas públicas.
- `qa/set-100.v1.jsonl` contiene **solo descripciones y etiquetas**, sin imagen, sin RUC, sin proveedor. Aun así, se revisa antes de commitear: una descripción puede identificar a un proveedor local ("PESCADERIA DON JOSE") y se reemplaza por `PESCADERIA 1`.
- CI: `gitleaks` para secretos y un test que falla si aparece un archivo `*.jpg`/`*.pdf` en `qa/` o `supabase/`.
- El consentimiento de primer uso explica, en español simple: "la foto se lee en tu celular; si eliges la lectura en la nube, se manda solo el recorte de los productos, sin tu RUC".

---

## 7. Riesgo de demo

### 7.1 Modos de falla reales

| Falla | Probabilidad | Impacto | Detección |
|---|---|---|---|
| Sin red en el venue | Alta | Alto | `navigator.onLine` + timeout |
| Workers AI 429 (neurons agotados) | Media | Alto | HTTP 429 |
| Visión devuelve JSON inválido o truncado | Media | Medio | `JSON.parse` + esquema |
| Foto movida / poco luz → líneas mal leídas | Alta | Medio | aritmética no cuadra |
| Producto desconocido en la boleta del jurado | Alta | Bajo | `desconocido` (no es error) |
| Latencia 10 s en vivo | Media | Medio | timeout de 8 s |
| Catálogo desactualizado en el dispositivo | Baja | Bajo | `catalogoVersion` |

### 7.2 Plan B en escalera (cada uno entra solo)

```
1. Nube disponible        → Worker + Moondream + BGE-M3          (camino ideal)
2. Nube lenta o 429       → timeout 8 s → se aborta y baja al 3
3. Sin red                → Tesseract.js local (spa.traineddata fast, precacheado)
                            + alias exacto + fuzzy (Levenshtein/trigramas)
4. OCR local falla        → formulario manual con autocompletar del catálogo
                            (cantidades con −/+, precio, unidad)
5. Todo falla             → "Lote de ejemplo" precargado en Dexie,
                            3 comprobantes sintéticos ya clasificados
```

**Reglas de implementación:**

- `VITE_CLASIFICADOR=cloud | local` (default `cloud`; el botón de pánico es `local`).
- `DEMO_MODE=1`: timeout 8 s, **un** reintento, sin toasts de error, badge de estado mudo (verde/ámbar), y el resultado siempre cae en un formulario editable.
- **Nunca** se muestra "Error de OCR". Se dice: **"No pudimos leer el papel. Escribilo acá."** (mismo criterio que `02-arquitectura.md` §8.4).
- Tesseract.js: `spa.traineddata` fast precacheado por el Service Worker; corre en un worker; nunca bloquea la UI; botón "Cancelar". ✅ El FAQ de Tesseract dice que no sirve para manuscrito, y una boleta es texto impreso: es el caso donde sí sirve.
- El lote precargado se rotula **"ejemplo"** en la UI. No se hace pasar por una lectura en vivo: el jurado técnico perdona un fallback, no una simulación.
- Video de respaldo de 60–90 s, grabado con el flujo completo y sin red.

### 7.3 Qué se muestra en los 3 minutos

1. Se abre el lote de ejemplo (3 boletas ya cargadas) y se ve el presupuesto de la olla.
2. Se abre **una** boleta y se muestra la línea "JUREL FRESCO 2 kg S/ 18,00 → Jurel · confirmado (0,91)".
3. Se muestra **una** línea `por_revisar`: el sistema dijo "no estoy seguro", la persona elige, y el alias queda aprobado.
4. Se muestra el ítem `desconocido`: la factura se confirma igual y el gasto aparece en "sin clasificar".
5. Cierre: "todo esto funciona sin red; cuando vuelve, se sincroniza".

La inteligencia del pitch no es "la IA acierta siempre": es **"el sistema sabe cuándo no sabe, y no deja que un error entre al presupuesto"**. Eso es lo que se defiende.

---

## 8. Verificado vs estimado

### 8.1 Verificado en docs (2026-11-23)

| Dato | Fuente |
|---|---|
| Free tier Workers AI: 10.000 neurons/día, reset 00:00 UTC; $0,011/1.000 neurons | `developers.cloudflare.com/workers-ai/platform/pricing/` (`dateModified` 2026-11-18) |
| Rate limits: Image-to-Text 720/min; Text Embeddings 3.000/min | `.../workers-ai/platform/limits/` (`dateModified` 2026-09-17) |
| Moondream 3: `@cf/moondream/moondream3.1-9B-A2B`, $0,30/M in, $1,00/M out, OCR + structured output, data URI base64, retención cero, `max_tokens` 8.192/28.672 | `.../workers-ai/models/moondream3.1-9B-A2B/` |
| Llama 3.2 11B Vision: `@cf/meta/llama-3.2-11b-vision-instruct`, 128k contexto, $0,0485/M in, $0,676/M out, `max_tokens` default 256, requiere `"agree"`, retención cero | `.../models/llama-3.2-11b-vision-instruct/` |
| BGE-M3: `@cf/baai/bge-m3`, $0,0118/M, contexto 60k declarado por CF, retención cero | `.../models/bge-m3/` |
| BGE-M3: 1024 dimensiones, 8.192 tokens, 100+ idiomas | ficha `huggingface.co/BAAI/bge-m3` |
| Qwen3 Embedding 0.6B: 8.192 contexto, $0,0118/M, retención cero | `.../models/qwen3-embedding-0.6b/` |
| EmbeddingGemma 2: 768 dim, $0,0017/M | `.../models/embeddinggemma-2/` |
| Reranker BGE base: $0,003/M | `.../workers-ai/platform/pricing/` |
| Binding `env.AI` + `{ "ai": { "binding": "AI" } }` | `.../workers-ai/get-started/workers-wrangler/` (`dateModified` 2026-08-27) |
| OpenAI `text-embedding-3-small` $0,02/M; `3-large` $0,13/M | `platform.openai.com/docs/pricing` |
| pgvector: extensión `vector`, `<=>` coseno, HNSW `vector_cosine_ops`, dim ≤ 2.000, 4×dim+8 bytes | `github.com/pgvector/pgvector` README |
| Supabase: `create extension vector with schema extensions`, HNSW/IVFFlat | `supabase.com/docs/guides/database/extensions/pgvector` |
| Ollama `bge-m3`: 1,2 GB, 567M, 8K contexto | `ollama.com/library/bge-m3` |
| fastembed: `multilingual-e5-large` 1024 dim, 2,24 GB; **no lista bge-m3** | `qdrant.github.io/fastembed/examples/Supported_Models/` |
| Jina: vectores de modelos distintos no son comparables; no entrena con las entradas | `jina.ai/embeddings/` FAQ |
| Latencia Perú→Cloudflare: 143 ms promedio, 49–215 ms, `colo=MIA` | medición propia, `02-arquitectura.md` §5.1 |
| 23 precios, 14 nombrados, trampas de unidad (saco 49 kg, botella 3 L, bandeja 30 un) | `docs-entrada/11-tablas.md` T-01/T-03 · `10-texto.md` §103 |

### 8.2 Estimado (hay que medirlo el día 1)

1. 🔶 **Precisión real de Moondream/Llama Vision en boletas peruanas.** No existe benchmark público. Medir 20 fotos anonimizadas: % de líneas correctas, % de totales correctos, tiempo.
2. 🔶 **Tokens por imagen.** La ficha no publica cuántos tokens consume una foto. Se asume 2.000; verificar con el campo `usage` de la respuesta y ajustar la cuenta de §2.5.
3. 🔶 **Latencia de visión (2–8 s).** Medir p50/p95 con 20 llamadas desde la conexión del venue.
4. 🔶 **Umbrales `τ=0,62`, `margen=0,04`, `piso=0,45`.** Puntos de partida; se reemplazan por los calibrados con el set de 60.
5. 🔶 **Costo de VPS (US$ 5–12/mes).** No se citó proveedor; verificar precio y región antes de comprometer.
6. 🔶 **Precio de Cohere y Jina.** Las páginas consultadas no exponen la tarifa en HTML (render dinámico). No se inventan números.
7. 🔶 **Precio de Google Document AI / Azure Document Intelligence.** Alternativa si la visión de Workers AI no alcanza; verificar antes de usarla.
8. 🔶 **Tiempo de OCR local (Tesseract.js) en el Android objetivo.** 10–40 s es una estimación de `02-arquitectura.md` §8.3, no una medición.
9. 🔶 **Que el coseno de BGE-M3 separe bien jurel/bonito y papa blanca/amarilla.** Es la hipótesis central; si no separa, se agrega el reranker o se sube el margen (y la tasa de revisión).

### 8.3 Lo que este documento no decide

- No fija el proveedor de VPS ni la región.
- No fija el precio de la boleta promedio ni el volumen real por olla: se mide con el piloto.
- No implementa el parser por proveedor para PDFs: es trabajo de P1 cuando haya 3 PDFs reales de muestra.
- No promete que el prototipo clasifique bien marcas locales: promete que **sabe cuándo no sabe**.

---

## 9. Fuentes

Todas consultadas el **2026-11-23**.

- Cloudflare — Workers AI Models: `https://developers.cloudflare.com/workers-ai/models/`
- Cloudflare — Workers AI Pricing (10.000 neurons/día, $0,011/1.000): `https://developers.cloudflare.com/workers-ai/platform/pricing/`
- Cloudflare — Workers AI Limits (rate limits por tarea): `https://developers.cloudflare.com/workers-ai/platform/limits/`
- Cloudflare — Workers Bindings (`env.AI`, `wrangler`): `https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/`
- Cloudflare — Moondream 3.1: `https://developers.cloudflare.com/workers-ai/models/moondream3.1-9B-A2B/`
- Cloudflare — Llama 3.2 11B Vision: `https://developers.cloudflare.com/workers-ai/models/llama-3.2-11b-vision-instruct/`
- Cloudflare — BGE-M3: `https://developers.cloudflare.com/workers-ai/models/bge-m3/`
- Cloudflare — Qwen3 Embedding 0.6B: `https://developers.cloudflare.com/workers-ai/models/qwen3-embedding-0.6b/`
- Cloudflare — EmbeddingGemma 2: `https://developers.cloudflare.com/workers-ai/models/embeddinggemma-2/`
- BAAI — BGE-M3 model card (1024 dim, 8192 tokens, 100+ idiomas): `https://huggingface.co/BAAI/bge-m3`
- OpenAI — Pricing (embeddings): `https://platform.openai.com/docs/pricing`
- Supabase — pgvector: `https://supabase.com/docs/guides/database/extensions/pgvector`
- pgvector — README (operadores, HNSW, dimensiones): `https://github.com/pgvector/pgvector`
- Ollama — bge-m3 (1,2 GB, 8K): `https://ollama.com/library/bge-m3`
- FastEmbed — Supported Models: `https://qdrant.github.io/fastembed/examples/Supported_Models/`
- Jina AI — Embeddings (FAQ de modelos/vectores): `https://jina.ai/embeddings/`
- Tesseract — FAQ (no sirve para manuscrito): `https://tesseract-ocr.github.io/tessdoc/FAQ.html`
- Documentos del proyecto: `06-decisiones.md` (D8), `02-arquitectura.md` (§4, §5, §8, §11), `docs-entrada/11-tablas.md` (T-01/T-03), `docs-entrada/10-texto.md` §103.
