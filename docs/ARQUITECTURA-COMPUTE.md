# 10 · Dos backends: Supabase (registro) + Compute (`ComputePort`)

> Copia integrada de `_hackods-plan/10-dos-backends-compute.md`. En este repo manda `docs/DECISIONES.md` (D9).

**Proyecto:** hackODS-Autónoma 2026 · PWA para ollas comunes del Perú
**Base:** `06-decisiones.md` **D8 y D9** (mandan), `08-clasificacion-productos.md` (pipeline, modelos y costos), `07-comprobantes-presupuesto.md` (estados, `idempotency_key`), `02-arquitectura.md` §4–§6, §11.
**Alcance:** topología, contrato, autenticación, operación de la PC, cola, degradación y plan de demo. **Sin código de producción.**
**Fecha de consulta de docs:** **2026-11-23**. Los límites de Cloudflare y Supabase cambian: cada número lleva fuente o marca.

**Regla de marcado (misma que `08`):** ✅ verificado en docs (URL + fecha) · 🔶 estimado (hay que medirlo) · ⚠️ decisión de diseño (es una elección, no un dato).

---

## 0. Resumen ejecutivo

| # | Decisión | Elegido | Por qué |
|---|---|---|---|
| 1 | Quién es la verdad | **Supabase** = registro único (datos, auth, RLS, storage, cola) | Ya es el ADR de `02`. D9 no lo cambia: agrega un **ejecutor**, no un segundo registro |
| 2 | Qué es el cómputo | **Stateless puro**: recibe bytes/texto, devuelve resultado, no escribe nada | Si el cómputo guardara estado, habría dos fuentes de verdad y dos backups |
| 3 | Quién habla con la PC | **Solo la fachada** (Pages Function); el navegador nunca ve la URL | La URL del túnel es un secreto de servidor, no un `VITE_*` |
| 4 | Transporte al prototipo | `cloudflared` **quick tunnel** (`*.trycloudflare.com`) | ✅ Cero cuenta, cero dominio, cero puertos abiertos. Es de **desarrollo**, no de producción (docs) |
| 5 | Autenticación | JWT **ES256 de 90 s** firmado por la fachada; la PC solo tiene la **clave pública** | Si roban la PC, no pueden emitir tokens: solo verificar |
| 6 | Idempotencia | `idempotency_key` (UUIDv7) en la fachada **y** `unique` en Supabase | Reintentar no cobra dos veces ni duplica ítems |
| 7 | Si la PC no está | `pendiente_compute` + backoff + **modo local** (Tesseract.js + alias exacto + cálculo en cliente) | La olla nunca se bloquea: capturar, confirmar a mano e imprimir no dependen del cómputo |
| 8 | Qué se guarda en la PC | **Nada**: ni imágenes, ni audio, ni texto, ni credenciales de Supabase | La PC no es una copia de la base; es una calculadora con modelos |
| 9 | Producción | **Named tunnel + Access** o **VPS + Caddy**; el contrato no cambia | Cambia la URL y el borde, no `ComputePort` |

**Los tres riesgos que pueden tumbar el demo** (detalle en §8.2): **(a)** el túnel o la PC caen en vivo, **(b)** la latencia de ida y vuelta hace que el presentador espere frente al jurado, **(c)** el token o la URL quedan mal configurados y todo devuelve 401/404 sin que nadie lo note hasta el escenario.

### 0.1 Reconciliación con `07` y `08` (no hay contradicción)

`07` §0.3 dice: «Supabase sigue siendo el único backend; Workers AI se usa solo como inferencia sin estado». `D9` dice: «el cómputo corre en una PC remota en el prototipo». **Las dos frases son compatibles si se separa registro de ejecución:**

```
REGISTRO  (1)  Supabase ......................... guarda, autentica, ordena, cobra
EJECUCIÓN (3)  Workers AI │ PC por túnel │ navegador ....... calcula y devuelve
                  └──────── todos detrás del mismo puerto ────────┘
```

- `ComputePort` tiene **tres implementaciones intercambiables**: `RemotePCCompute` (túnel), `WorkersAICompute` (binding `env.AI`, el de `08` §2.3) y `LocalCompute` (Tesseract.js + alias).
- Nada de lo que decide el producto (revisión humana, alias aprobado, serie de precios, presupuesto) vive en el cómputo. Eso ya está en `07`.
- La regla de honestidad de D9 se cumple igual con las tres: **el presupuesto solo cambia con ítems confirmados**.

> ⚠️ **Regla dura de este documento:** *el registro nunca depende del cómputo.* Si se cae el segundo backend, la olla sigue operando: captura, confirma a mano, registra movimiento, imprime. Se degrada la comodidad, no la operación.

---

## 1. Topología

### 1.1 Diagrama

```
┌─────────────────────────────┐
│  Celular de la olla         │
│  PWA (Cloudflare Pages)     │
│  · Dexie cifrado (AES-GCM)  │
│  · Outbox + cola local      │
└──────┬───────────────┬──────┘
       │ (1) datos     │ (2) cómputo (nunca directo a la PC)
       │  JWT Supabase │      JWT Supabase  →  token de 90 s
       ▼               ▼
┌──────────────────┐  ┌──────────────────────────────────────────┐
│  SUPABASE        │  │  FACHADA · Pages Function /api/compute/* │
│  ─────────────   │  │  ──────────────────────────────────────  │
│  Postgres + RLS  │  │  · verifica JWT de Supabase (JWKS)       │
│  Auth (device)   │◄─┤  · acuña token ES256 (90 s, por olla)    │
│  Storage privado │  │  · límite de tamaño y de tasa            │
│  Realtime        │  │  · idempotencia + circuit breaker        │
│  ─────────────   │  │  · enruta: pc │ workers-ai │ local       │
│  REGISTRO        │  │  · NO escribe en Postgres                │
│  (verdad única)  │  └───────────────┬──────────────────────────┘
└──────────────────┘                  │ (3) HTTPS + Bearer 90 s
       ▲                              ▼
       │                    ┌───────────────────────────┐
       │ (5) resultado      │  Cloudflare edge          │
       │  escrito por el    │  https://xxx.trycloudflare│
       │  cliente (RLS) o   └───────────┬───────────────┘
       │  por el drenador               │ túnel saliente
       │  (service_role)                │ (la PC no abre puertos)
       │                    ┌───────────▼───────────────┐
       └────────────────────┤  PC DE CÓMPUTO (Windows)  │
                            │  127.0.0.1:8787           │
                            │  · /health /transcribe    │
                            │  · /extract /embed        │
                            │  · /classify /calc        │
                            │  STATELESS: no guarda nada│
                            └───────────────────────────┘
```

### 1.2 Qué llamada va a cada lado, y por qué

| Llamada | Va a | Por qué ahí y no del otro lado |
|---|---|---|
| Login, enrolamiento del dispositivo, refresh de sesión | **Supabase Auth** | La identidad es estado durable; el cómputo no puede tener identidad (sería una segunda auth) |
| Leer/escribir `comprobante`, `item`, `persona`, `movimiento`, `presupuesto` | **Supabase/PostgREST con RLS** | RLS es la única barrera que no se puede olvidar en un endpoint nuevo |
| `POST /sync/push` y `GET /sync/pull` | **Supabase Edge Function** (D1) | Orden `(lamport, device_id)` y `unique(idempotency_key)` son transaccionales: necesitan Postgres |
| Subir la foto del comprobante, si el usuario lo eligió | **Supabase Storage** (bucket privado, RLS, 30 días) | Es el único lugar con retención y borrado auditables |
| Top-5 vectorial sobre el catálogo | **Supabase RPC con pgvector** | El catálogo **vive** en Postgres. Si el cómputo también lo tuviera, habría dos catálogos |
| Cola `compute_job` y su estado | **Supabase** | Es estado durable y compartido entre dispositivos |
| Transcribir audio | **PC** → `/transcribe` | CPU/GPU intensivo, sin estado: el caso ideal del segundo backend |
| Leer la foto del comprobante (VLM) | **PC** → `/extract` (si hay GPU) o **Workers AI** | 🔶 Un VLM en CPU es inviable (>20 s). Sin GPU, la visión se queda en Workers AI (`08` §2.2) |
| Calcular un embedding | **PC** → `/embed` | `bge-m3` local = costo marginal 0 y el texto no sale del país |
| Medianas, MAD, proyección al cierre, factor de equivalencia | **PC** → `/calc` (o el cliente) | Es aritmética pura: el resultado se **muestra**, no se persiste como verdad |
| ¿Está vivo el cómputo? | **PC** → `/health` (a través de la fachada) | Un solo punto de verdad sobre la salud, con versión de modelos |

**Tres cosas que NUNCA cruzan el túnel** (⚠️ y hay que probarlo con un test):
1. La `service_role` key, el `JWT secret` de Supabase o cualquier credencial de Postgres.
2. Datos de `persona` (`P-XXXX` incluido): el cómputo recibe texto de productos y audio de dictado, nunca un padrón.
3. El saldo o el monto asignado de la olla como dato a persistir: `/calc` recibe números y devuelve números; la verdad del dinero es un `SUM` en Postgres (`07` §1.1).

### 1.3 La regla de las tres responsabilidades

| Componente | Puede | No puede |
|---|---|---|
| **Supabase** | Guardar, autenticar, ordenar, aplicar RLS, encolar | Calcular embeddings ni transcribir |
| **Fachada** (Pages Function) | Verificar, acuñar token, limitar, enrutar, cortar el circuito | **Escribir en Postgres** (no tiene `service_role`), guardar payloads, decidir reglas de negocio |
| **PC de cómputo** | Calcular y devolver | Escribir en Supabase, autenticar personas, tener estado durable, ver la URL de otro cliente |

Que la fachada **no escriba** es lo que evita el riesgo clásico del hackathon: una Function con `service_role` que bypassea RLS y se convierte en un segundo backend de facto. Los que escriben son solo dos: **el cliente con su JWT** (RLS) y **el drenador** (`service_role`, §6.1).

### 1.4 Consecuencia operativa: dos modos de drenaje

| Modo | Quién llama | Para qué | Riesgo |
|---|---|---|---|
| **Interactivo** (demo) | La PWA → fachada → PC | El usuario está mirando la pantalla y espera el resultado | Si cierra la app, el trabajo se pierde; se reintenta desde la cola |
| **Drenador** (producción) | Edge Function `compute-drain` por `pg_cron`, con `service_role` | Procesar `pendiente_compute` de noche o al volver la red | Un `service_role` mal usado es peligroso: solo toca `compute_job` y `item`, nada más |

⚠️ El drenador es **el único componente con `service_role`** y su token vive como secreto de la Edge Function. La fachada sigue sin credenciales de Supabase.

---

## 2. Contrato `ComputePort`

### 2.1 Principios que el contrato hace cumplir

1. **Stateless de verdad.** El servidor puede tener *cachés derivadas y regenerables* (pesos del modelo, índice del catálogo, LRU de idempotencia). **Nada** que no se pueda reconstruir desde Supabase en < 10 minutos.
2. **Sin sesión.** Cada request trae su token; no hay cookies, no hay login, no hay "recordarme".
3. **La unidad es la operación, no la entidad.** El cómputo no conoce `comprobante_id`: conoce bytes y devuelve JSON. El mapeo a filas lo hace el cliente.
4. **Todo límite es explícito y del lado del servidor.** El cliente puede equivocarse; el servidor cobra 413/429 sin piedad.
5. **La versión viaja en la respuesta.** Cada respuesta declara `api_version` y `modelo`. Un vector sin `modelo`+`dim` es basura (`08` §1.1, invariante 3).

### 2.2 Envelope común

**Request**

```http
POST /v1/embed HTTP/1.1
Host: <subdominio>.trycloudflare.com
Authorization: Bearer <JWT ES256 · 90 s>
Content-Type: application/json
Idempotency-Key: 0192f0c4-7a1e-7c3b-9f0a-2b6d8e1a4c55
X-Request-Id: 0192f0c4-7a1e-7c3b-9f0a-2b6d8e1a4c56
X-Client: pwa/0.9.3
```

**Response (éxito)**

```json
{
  "ok": true,
  "request_id": "0192f0c4-…",
  "api_version": "1.2.0",
  "modelo": { "nombre": "bge-m3", "dim": 1024, "hash": "sha256:9f2c…" },
  "data": { }
}
```

**Response (error)** — el cliente decide por `code` y `retryable`, nunca por el texto.

```json
{
  "ok": false,
  "request_id": "0192f0c4-…",
  "error": { "code": "RATE_LIMITED", "message": "límite por olla", "retryable": true, "retry_after_s": 20 }
}
```

| `code` | HTTP | `retryable` | Qué hace el cliente |
|---|---|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | no (pide token nuevo) | Pide token a la fachada y reintenta **una** vez |
| `SCOPE_DENIED` | 403 | no | Bug de configuración: no reintentar; caer a local |
| `RATE_LIMITED` | 429 | sí | Respeta `retry_after_s`; si > 30 s, cae a local |
| `TOO_LARGE` / `UNSUPPORTED_MEDIA` | 413 / 415 | no | Redimensionar/comprimir o pedir entrada manual |
| `UNPROCESSABLE` | 422 | no | El modelo no devolvió un JSON válido → todo a revisión (`08` §1.2) |
| `MODEL_NOT_READY` | 503 | sí | La PC está cargando pesos; reintentar con backoff |
| `MODEL_ERROR` | 502 | sí (1 vez) | Reintento único; si persiste, local |
| `TIMEOUT` | 504 | sí | Igual |
| `VERSION_MISMATCH` | 409 | no | El cliente está viejo: recargar la PWA |

### 2.3 Los seis endpoints

#### `GET /health` (sin token de cómputo: solo red)

Devuelve lo mínimo para decidir si enrutar. **No** expone rutas, versiones de SO ni nombres de usuario.

```json
{
  "ok": true,
  "api_version": "1.2.0",
  "uptime_s": 4210,
  "gpu": { "presente": true, "vram_libre_mb": 3210 },
  "modelos": {
    "embed": { "nombre": "bge-m3", "dim": 1024, "cargado": true },
    "asr":   { "nombre": "faster-whisper-small", "cargado": true },
    "vlm":   { "nombre": "moondream3", "cargado": false }
  },
  "catalogo_cache": "catalogo.v1#sha256:7d1a…",
  "cola_local": 0,
  "presupuesto_gpu_min_restantes": 24
}
```

- **Timeout duro: 2 s.** Si no contesta en 2 s, para la fachada está caído (no hay "casi vivo").
- La fachada cachea el resultado **20 s** para no golpear el túnel con cada request.

#### `POST /transcribe`

| | |
|---|---|
| Body | `multipart/form-data`: `audio` (webm/ogg/m4a/wav), opcional `idioma` (`es-PE`), `pista` (texto de vocabulario: nombres de productos del catálogo) |
| Límite | **≤ 8 MB** y **≤ 120 s** de audio. Más que eso: 413 |
| Timeout | **45 s** (🔶 un clip de 20 s en CPU con `whisper-small` tarda 5–15 s; en GPU, 1–3 s) |
| Respuesta | `{ "texto": "...", "idioma": "es", "duracion_s": 18.4, "segmentos": [{"t0":0.0,"t1":2.1,"texto":"…"}], "confianza_media": 0.82 }` |
| Idempotencia | Sí, por `Idempotency-Key` (misma tecla → misma transcripción, 0 cómputo) |

⚠️ `texto` **no se loguea nunca** (§7.2). `confianza_media` existe para que la UI pueda decir "revisá los números" sin inventar certeza: el audio **siempre** pasa por confirmación humana (D9).

#### `POST /extract`

| | |
|---|---|
| Body | `multipart/form-data`: `archivo` (imagen JPEG/PNG/WebP o PDF) + `tipo` |
| Límite | Imagen **≤ 4 MB** (ya viene a 1280 px lado mayor, JPEG 0.7, `08` §6.1); PDF **≤ 8 MB** y **≤ 10 páginas** |
| Timeout | **30 s** (demo: **8 s**, porque el guion no espera — `08` §2.4) |
| Respuesta | El JSON cerrado de `08` §1.2: `proveedor`, `fecha`, `folio`, `total`, `items[]`, más `confianzaExtraccion` y `origen` |
| Nota | Si el PDF trae capa de texto, **esto no se llama**: se parsea en el cliente con `pdf.js` (costo 0, error 0) |

#### `POST /embed`

| | |
|---|---|
| Body | `{ "textos": ["pap. blanca 1ra", …], "modelo_esperado": "bge-m3" }` |
| Límite | **≤ 64 textos**, **≤ 512 caracteres** cada uno, body **≤ 32 KB** |
| Timeout | **10 s** |
| Respuesta | `{ "vectores": [[...1024]], "modelo": {...}, "dim": 1024, "normalizado": true }` |
| Idempotencia | Sí; además se cachean por `sha256(modelo + texto)` en LRU de 10 min |

**Este es el endpoint que más se usa y el que mejor paga.** Cuesta milisegundos de GPU y reemplaza una llamada de red a un tercero con datos de la olla.

#### `POST /classify` (opcional, nunca en camino crítico)

| | |
|---|---|
| Body | `{ "items": [...], "catalogo_version": "catalogo.v1#sha256:7d1a…", "umbrales": {"tau":0.62,"margen":0.04,"piso":0.45} }` |
| Límite | ≤ 100 ítems, ≤ 128 KB |
| Timeout | 15 s |
| Respuesta | `ClasificacionProducto[]` de `08` §1.3 |

⚠️ **Decisión de diseño:** el camino recomendado es `/embed` + `RPC` con pgvector en Supabase, y la decisión final la toma el cliente con los umbrales congelados. `/classify` existe para (a) el caso "PC con catálogo cacheado y red mala hacia Supabase" y (b) comparar implementaciones. **Si el `catalogo_version` no coincide con el que la PC tiene cacheado, responde `409 VERSION_MISMATCH`; jamás clasifica contra un catálogo viejo en silencio.**

#### `POST /calc`

| | |
|---|---|
| Body | `{ "op": "tendencia|proyeccion|equivalencia", ... }` con `bigint` como **string** (para no perder precisión en JSON) |
| Límite | ≤ 2 MB, ≤ 10 000 puntos por serie |
| Timeout | 5 s |
| Respuesta | enteros, no floats: `{ "mediana_microcent": "220000", "mad": "18000", "outliers": [3, 9], "proyeccion_centavos": "41200" }` |
| Determinismo | Misma entrada → mismo resultado, siempre. Sin `Date.now()`, la fecha viene en el body |

⚠️ `/calc` **no es** la verdad del dinero. Sirve para lo caro de calcular en un Android gama baja (mediana + MAD sobre 200 observaciones, factor de equivalencia). El saldo sigue siendo un `SUM` en Postgres (`07` §1.1: se suma desde `total_linea_centavos`, nunca desde cantidad × precio).

### 2.4 OpenAPI resumido

```yaml
openapi: 3.1.0
info:
  title: ComputePort
  version: 1.2.0
  description: >
    Ejecutor stateless de la PWA de ollas comunes. No persiste payloads,
    no autentica personas, no conoce comprobantes. Solo cálculo.
servers:
  - url: https://{tunnel_host}/v1     # prototipo: *.trycloudflare.com (efímero)
security:
  - bearerJWT: []                      # ES256, 90 s, aud=compute
paths:
  /health:
    get:
      security: []                     # sin token: solo dice si está vivo
      responses: { "200": { description: HealthReport }, "default": { description: Error } }
  /transcribe:
    post:
      parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }]
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [audio]
              properties:
                audio:    { type: string, format: binary, description: "≤ 8 MB, ≤ 120 s" }
                idioma:   { type: string, default: es-PE }
                pista:    { type: string, description: "vocabulario de productos" }
      responses: { "200": { description: TranscribeResponse }, "413": {}, "429": {}, "503": {} }
  /extract:
    post:
      parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }]
      requestBody:
        content:
          multipart/form-data:
            schema:
              type: object
              required: [archivo, tipo]
              properties:
                archivo: { type: string, format: binary, description: "img ≤ 4 MB · pdf ≤ 8 MB / 10 pág" }
                tipo:    { type: string, enum: [imagen, pdf] }
      responses: { "200": { description: ExtractResponse }, "422": {}, "413": {}, "504": {} }
  /embed:
    post:
      parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }]
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [textos]
              properties:
                textos:           { type: array, maxItems: 64, items: { type: string, maxLength: 512 } }
                modelo_esperado:  { type: string, default: bge-m3 }
      responses: { "200": { description: EmbedResponse }, "409": {}, "429": {} }
  /classify:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                items:            { type: array, maxItems: 100 }
                catalogo_version: { type: string }
                umbrales:         { type: object }
      responses: { "200": { description: ClasificacionProducto[] }, "409": {} }
  /calc:
    post:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                op:    { type: string, enum: [tendencia, proyeccion, equivalencia] }
                serie: { type: array, maxItems: 10000 }
      responses: { "200": { description: CalcResponse } }
components:
  securitySchemes:
    bearerJWT: { type: http, scheme: bearer, bearerFormat: JWT }
  parameters:
    IdempotencyKey: { name: Idempotency-Key, in: header, required: true, schema: { type: string, format: uuid } }
  schemas:
    Error:
      type: object
      properties:
        ok:      { type: boolean, const: false }
        error:   { $ref: "#/components/schemas/ErrorBody" }
    ErrorBody:
      type: object
      required: [code, message, retryable]
      properties:
        code:          { type: string, enum: [UNAUTHORIZED, TOKEN_EXPIRED, SCOPE_DENIED, RATE_LIMITED, TOO_LARGE, UNSUPPORTED_MEDIA, UNPROCESSABLE, MODEL_NOT_READY, MODEL_ERROR, TIMEOUT, VERSION_MISMATCH, INTERNAL] }
        message:       { type: string }
        retryable:     { type: boolean }
        retry_after_s: { type: integer }
```

### 2.5 El puerto en TypeScript (extiende `08` §1.3, no lo reemplaza)

```ts
// packages/domain/src/compute.ts — CONTRATO CONGELADO
// Extiende EmbeddingsPort y ExtractorComprobante de 08 §1.3.
// Ningún tipo de acá importa un SDK: los adaptadores viven en packages/compute/src/*.

export interface ComputePort extends EmbeddingsPort {
  readonly version: string;             // "1.2.0"
  readonly provider: 'pc' | 'workers-ai' | 'local';

  health(signal?: AbortSignal): Promise<HealthReport>;
  transcribe(req: TranscribeRequest, signal?: AbortSignal): Promise<TranscribeResponse>;
  extract(req: ExtractRequest, signal?: AbortSignal): Promise<ExtractResponse>;
  classify(req: ClassifyRequest, signal?: AbortSignal): Promise<readonly ClasificacionProducto[]>;
  calc(req: CalcRequest, signal?: AbortSignal): Promise<CalcResponse>;
}

export interface Envelope { readonly idempotencyKey: string; readonly requestId: string; }

export interface TranscribeRequest extends Envelope {
  readonly audio: Blob;                 // ≤ 8 MB · ≤ 120 s
  readonly idioma: 'es-PE';
  readonly pista?: string;              // vocabulario del catálogo
}

export interface HealthReport {
  readonly apiVersion: string;
  readonly gpuPresente: boolean;
  readonly modelos: Readonly<Record<'embed' | 'asr' | 'vlm', { nombre: string; cargado: boolean }>>;
  readonly catalogoCache: string | null;
  readonly presupuestoSegundosRestantes: number;
}
```

**Por qué este contrato sobrevive a producción:** igual que `08` §3.4. `RemotePCCompute`, `WorkersAICompute` y `LocalCompute` implementan lo mismo; migrar a VPS es cambiar `COMPUTE_URL` y `provider`. Nada de la UI cambia.

---

## 3. Autenticación

### 3.1 Flujo: JWT de Supabase → token de 90 s

```
 PWA                     Fachada (Pages Fn)              PC (túnel)
  │                              │                          │
  │ 1. Authorization: Bearer     │                          │
  │    <JWT Supabase, 1 h>       │                          │
  ├─────────────────────────────►│                          │
  │                              │ 2. verifica firma con    │
  │                              │    JWKS del proyecto     │
  │                              │    (cache 10 min)        │
  │                              │    · exp, aud, role      │
  │                              │    · olla_id del claim   │
  │ 3. { token, exp: now+90s }   │ 3. acuña ES256           │
  │◄─────────────────────────────┤    claims mínimos        │
  │                              │                          │
  │ 4. Authorization: Bearer <token 90 s>                   │
  ├─────────────────────────────┼─────────────────────────►│
  │                              │ 5. verifica con clave    │
  │                              │    PÚBLICA (offline)     │
  │                              │    · aud=compute         │
  │                              │    · scope incluye op    │
  │                              │    · jti no usado        │
  │ 6. resultado                 │                          │
  │◄─────────────────────────────┼──────────────────────────┤
```

**Verificación del JWT de Supabase (paso 2).** ✅ Supabase expone las claves públicas en `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json` y soporta **ES256 / RS256**; el endpoint se cachea 10 minutos en el edge de Supabase y el cliente puede cachear otros 10. Usar HS256 (el `JWT secret` compartido) está **explícitamente desaconsejado para producción** por la propia doc (*JWT Signing Keys*, consultado 2026-11-23). Consecuencia: la fachada **no guarda ningún secreto de Supabase**, solo verifica firmas.

**Claims del token de cómputo** (lo que la PC puede leer, y nada más):

```json
{
  "iss": "hackods-fachada",
  "aud": "compute",
  "sub": "D-7f3a…",          // device_id opaco, no persona
  "olla_id": "O-2b91…",
  "rol": "organizadora",
  "scope": ["embed", "extract"],
  "cupo": { "ops": 40, "seg_gpu": 120 },
  "jti": "0192f0c4-…",
  "iat": 1763942400,
  "exp": 1763942490
}
```

- **TTL 90 s.** Si se filtra, sirve menos que un café.
- **`scope` por endpoint.** Un token para `/embed` no abre `/transcribe` (audio es más caro y más sensible).
- **`jti` de un solo uso** en una LRU en memoria de la PC (90 s): el mismo token no procesa dos veces.
- **`olla_id`** es lo que permite el rate limit por olla y la contabilidad de cupo.

### 3.2 Por qué no se manda el JWT de Supabase directo a la PC

| Razón | Detalle |
|---|---|
| Vive 1 h | El túnel es público: un token de 1 h filtrado (logs de proxy, `Referer`, captura de pantalla) es una hora de cómputo gratis |
| No se puede revocar rápido | Con firma asimétrica la revocación es automática **en Supabase**, no en la PC, que no consulta a Supabase |
| Trae de más | El JWT de Supabase no sabe de `olla_id` ni de `scope`; habría que meterle claims de negocio |
| Acopla el borde | La PC tendría que conocer el proyecto Supabase (URL, JWKS, aud). El día que se mude a VPS, arrastra esa dependencia |

### 3.3 Por qué no un HMAC compartido… y por qué sí ES256

⚠️ Un `COMPUTE_HMAC_SECRET` compartido entre fachada y PC **funciona** y es más simple. Se descarta por una razón concreta: **si roban la PC, con HMAC el atacante puede firmar tokens válidos**; con ES256 solo tiene la clave pública y no puede emitir nada. La diferencia cuesta ~15 líneas de código.

| | HMAC (HS256) | **ES256 (elegido)** |
|---|---|---|
| Claves | Un secreto en dos máquinas | Privada en la fachada (Pages secret), pública en la PC |
| Si roban la PC | Puede **emitir** tokens | Solo puede **verificar** |
| Rotación | Cambiar el secreto en dos lados a la vez (downtime) | Publicar nueva pública; la PC acepta ambas durante la transición |
| Costo | ~0,05 ms | ~1–2 ms (relevante: 10 ms de CPU en Workers Free, §3.7) |

**Qué NO se hace:** poner el secreto (ni el HMAC ni la privada) en la PWA. Cualquier `VITE_*` está en el bundle; es público por definición. La PWA **solo** tiene su JWT de Supabase (que ya es su credencial normal).

### 3.4 Por qué el quick tunnel no puede quedar abierto (y por qué `--allowed-mail` no salva)

✅ Verificado en docs (2026-11-23, `dateModified: 2026-09-30`):

> «**Anyone with the URL can access your local service.** The URL stops working when you stop the `cloudflared` process.»

Es decir: el quick tunnel **no tiene autenticación propia**. Existe un flag `--allowed-mail <email>` que exige un PIN de un solo uso por email, pero la misma página aclara en **Limitations**:

> «Email authentication requires an interactive browser session. **It does not support non-interactive clients.**»

Nuestro llamador es una Pages Function (máquina a máquina). **No puede pasar el PIN interactivo.** Por lo tanto `--allowed-mail` es inútil para este caso: la única autenticación posible es la nuestra (§3.1).

Y no se puede poner Cloudflare Access delante: Access requiere una aplicación sobre **un dominio del propio account** (✅ la guía de túneles exige «add a website to Cloudflare» antes de publicar), y un `*.trycloudflare.com` no es tuyo. ⚠️ Consecuencia de diseño: **el borde del quick tunnel no protege nada; toda la seguridad está en el token y en el binding a `127.0.0.1`.**

### 3.5 Límite de tasa por olla

Tres capas, de la más barata a la más exacta:

| Capa | Dónde | Qué hace | Precisión |
|---|---|---|---|
| 1. Tamaño | Fachada | 413 antes de tocar el túnel | Exacta |
| 2. Cubeta de tokens por `olla_id` | Fachada (contador en KV) | 429 temprano, sin gastar red | Aproximada (KV es eventualmente consistente) 🔶 |
| 3. Cubeta autoritativa | PC (memoria) | 429 exacto, con `Retry-After` | Exacta |

**Cuotas iniciales por olla** (⚠️ valores de arranque; se ajustan con la medición del día 1):

| Endpoint | Por minuto | Ráfaga | Por día | Concurrencia |
|---|---|---|---|---|
| `/embed` | 60 | 10 | 2 000 | 2 |
| `/extract` | 10 | 3 | 120 | 1 |
| `/transcribe` | 6 | 2 | 60 | 1 |
| `/classify` | 20 | 5 | 500 | 1 |
| `/calc` | 120 | 20 | 5 000 | 2 |

Además, un **presupuesto de GPU por día** (p. ej. 30 min de `seg_gpu` sumados): cuando se agota, `/transcribe` y `/extract` devuelven 429 con `X-Quota-Reset`, pero `/embed` y `/calc` siguen (son baratos). Esto protege el demo de que una olla curiosa consuma la máquina antes de que suba el jurado.

**Por qué por olla y no por IP:** en un comedor hay un solo celular con datos móviles y NAT; tres personas comparten IP. Limitar por IP castiga a la olla correcta. La IP solo se usa como techo anti-abuso global (p. ej. 600 req/min por IP).

### 3.6 Si alguien encuentra la URL

Escenario: la URL se filtró (una captura de pantalla del `cloudflared`, un log, un `curl` mostrado en una demo). **Qué pasa y qué se hace:**

| Paso | Acción | Tiempo | Efecto |
|---|---|---|---|
| 0 | Nada, mientras no haya token | — | Todas las llamadas responden **401**. La URL sola no hace nada |
| 1 | `COMPUTE_MODE=off` en KV (o el botón de pánico, §9.4) | < 5 s | La fachada deja de enrutar; la UI pasa a modo local |
| 2 | `Ctrl+C` en `cloudflared` | 1 s | ✅ «The URL stops working when you stop the `cloudflared` process» |
| 3 | Reiniciar el túnel | ~10 s | URL nueva y aleatoria; la vieja no vuelve |
| 4 | Actualizar `COMPUTE_URL` en Pages y redesplegar | ~60 s 🔶 | La fachada apunta al túnel nuevo |
| 5 | Rotar la clave ES256 (opcional) | 10 min | Invalida tokens ya emitidos. **Normalmente innecesario**: expiran en 90 s |

**Lo que evita el escenario desde el principio:** la URL **nunca** está en el bundle del cliente, ni en el repo, ni en un `VITE_*`. Vive como variable de entorno de Pages (server-side). Un test de CI falla si aparece `trycloudflare.com` en `apps/web/src` o en cualquier `.ts` de `packages/` (excepto `compute/src/adapters/remote.ts`, que la lee de `env`).

⚠️ Detalle honesto: la fachada es el único cliente del túnel. Si el atacante encuentra la URL, ve un servidor que solo responde `401` y `404`; no puede enumerar endpoints útiles porque todos exigen token (salvo `/health`, que devuelve lo mínimo de §2.3).

### 3.7 Presupuesto de CPU de la fachada (esto sí puede romper el demo)

✅ Workers/Pages Functions **Free**: **10 ms de CPU por invocación**; Paid: hasta 5 min. La fachada hace: verificar JWT (JWKS cacheado, ~1 ms), validar claims, acuñar ES256 (~1–2 ms), leer un flag en KV (~1 ms de CPU; la latencia de red no cuenta contra CPU), enrutar. **Total ≈ 3–5 ms.** Entra, pero **no hay margen para lógica de negocio**: la fachada tiene que quedar delgada a propósito.

Regla: si alguien quiere "aprovechar" la fachada para normalizar textos o sumar líneas, eso va al cliente o a `/calc`. Una fachada que hace trabajo es una fachada que devuelve `Error 1102` en el peor momento.

---

## 4. `cloudflared` quick tunnel

### 4.1 Qué es exactamente (verificado)

| Afirmación | Estado | Fuente |
|---|---|---|
| Crea una URL temporal `*.trycloudflare.com` para un servicio local | ✅ | Quick Tunnels, `dateModified: 2026-09-30` |
| No requiere cuenta de Cloudflare ni dominio | ✅ | idem |
| «Anyone with the URL can access your local service» | ✅ | idem |
| La URL deja de funcionar al detener el proceso | ✅ | idem |
| El hostname **cambia cada vez** que se crea un túnel | ✅ | idem, Limitations |
| **Sin garantía de uptime** | ✅ | idem, Limitations |
| Hasta **200 requests en vuelo**; el resto recibe **429** | ✅ | idem, Limitations |
| **No soporta Server-Sent Events** | ✅ | idem, Limitations |
| Está pensado para **testing y desarrollo** | ✅ | idem, Note inicial |
| El origen puede quedar cerrado: no hace falta abrir puertos entrantes | ✅ | Tunnels FAQ: «you can keep your web server otherwise completely locked down» |
| Es un proceso saliente (el conector marca 7844 hacia Cloudflare) | ✅ | Create a tunnel, pre-check de conectividad |

### 4.2 Qué transporta y qué no

| Atraviesa el túnel | No atraviesa |
|---|---|
| HTTPS con terminación TLS en el edge de Cloudflare | Puertos entrantes en la PC (nada de `netsh advfirewall` abriendo 443) |
| JSON, `multipart/form-data` (imagen, audio), hasta el límite que pongamos | Server-Sent Events (✅ no soportado) |
| ~200 requests concurrentes | WebSockets (sí soportados por Cloudflare Tunnel según FAQ, pero **no los usamos**: el contrato es request/response) |
| Requests con token ES256 | Tráfico sin auth (no hay borde propio) |

**Tamaño de body:** el límite de Cloudflare para un plan Free es **100 MB** (✅ Workers *Limits*, `dateModified: 2026-11-19`). Nuestros límites (4–8 MB) están muy por debajo: **el límite que manda es el nuestro**, no el de Cloudflare. Eso es deliberado: no queremos que una foto de 40 MB llegue a la PC solo porque Cloudflare la dejó pasar.

### 4.3 Por qué no sirve para producción

Cinco razones, todas verificables, ninguna opinable:

1. **Sin SLA ni garantía de uptime** (✅ doc). Un servicio de salud comunitaria no puede depender de un endpoint de desarrollo.
2. **La URL cambia** (✅ doc). Sin DNS estable no hay `COMPUTE_URL` fija, ni monitoreo externo, ni certificado pinneado.
3. **Sin autenticación de borde** (✅ doc) y **sin Access posible** (el hostname no es tuyo).
4. **Techo de 200 requests en vuelo** con 429 (✅ doc), y **sin SSE** (✅ doc): no hay streaming de progreso.
5. **Un solo proceso en una sola máquina doméstica**, sin réplicas ni balanceo: si se corta la luz, se cae el servicio. (Cloudflare Tunnel sí permite **25 réplicas activas por túnel** ✅ *Account limits* — un quick tunnel, no.)

⚠️ Consecuencia: el quick tunnel es **de prototipo y de demo**, exactamente como dice D9. Y como es de demo, el plan de demo (§9) asume que puede caerse.

### 4.4 Las tres opciones

| | **Quick tunnel** (prototipo) | **Named tunnel + Access** | **VPS + Caddy/TLS** |
|---|---|---|---|
| Requisitos | `cloudflared` y un puerto local | Cuenta Cloudflare + **dominio agregado** ✅ | VPS, dominio, IP pública |
| URL | `*.trycloudflare.com`, **aleatoria** ✅ | `compute.tudominio.org`, estable | `compute.tudominio.org`, estable |
| Auth de borde | **Ninguna** ✅ | **Access + Service Token** (`CF-Access-Client-Id/Secret`, política **Service Auth**) ✅ | mTLS o bearer propio |
| Auth propia (token ES256) | **Obligatoria** (es la única) | Recomendada igual (defensa en profundidad) | Obligatoria |
| Puertos entrantes | Ninguno ✅ | Ninguno ✅ | **443 abierto** |
| SLA | **Ninguno** ✅ | El de Cloudflare (sin SLA formal en Free) 🔶 | El del proveedor del VPS |
| Concurrencia | 200 en vuelo ✅ | Sin techo de producto comparable; 25 réplicas por túnel ✅ | La de la máquina |
| SSE / streaming | **No** ✅ | Sí (WebSockets y HTTP normales) | Sí |
| Operación | Cero (hasta que se cae) | Baja: servicio de Windows/Linux + política | **Alta**: SO, TLS, backups, parches, monitoreo |
| Costo | $0 | $0 en Free (hasta 50 service tokens por cuenta ✅) | 🔶 US$ 5–12/mes |
| Riesgo principal | Caerse en vivo y no poder volver a la misma URL | Que la política de Access bloquee al llamador legítimo (401 silencioso) | Que nadie lo parchee |
| Para qué sirve acá | **Demo de 3 minutos** | **Producción razonable sin VPS** | **Producción con datos que no salen del país** |

**Recomendación:** quick tunnel para el hackathon; **named tunnel + Access** como primer paso de producción (mismo `ComputePort`, se cambia la URL y se agregan dos headers en la fachada); VPS + Caddy cuando el requisito sea que nada salga del país o cuando haya que operar varios modelos con GPU.

### 4.5 Named tunnel + Access en 10 pasos (para producción)

1. Agregar el dominio a Cloudflare (nameservers). ✅ prerrequisito.
2. **Networking → Tunnels → Create a tunnel** (remotely-managed). ✅
3. Copiar el comando de instalación que muestra el dashboard en la PC. ✅
4. **Routes → Published application**: `compute.tudominio.org` → `http://127.0.0.1:8787`. ✅
5. Crear la **Access application** (self-hosted) sobre ese hostname.
6. Crear un **Service Token** (Client ID + Client Secret) ✅. Límite: 50 por cuenta.
7. Política con acción **Service Auth** e Include = ese token ✅.
8. En la fachada: agregar `CF-Access-Client-Id` y `CF-Access-Client-Secret` a cada llamada.
9. Verificar que un `curl` **sin** headers reciba 302/401 y **con** headers reciba 200.
10. Instalar `cloudflared` como **servicio de Windows** con `tunnel` + `credentials-file` (✅ la doc de Windows exige esos dos argumentos) para que sobreviva al reinicio.

⚠️ Costo de este paso: el 80% del trabajo es el paso 1 (DNS). Si el equipo no tiene dominio, **la opción real es VPS + Caddy o seguir en quick tunnel con la demo grabada**.

### 4.6 VPS + Caddy (esbozo, ~10 líneas)

```
compute.tudominio.org {
    encode zstd gzip
    request_body {
        max_size 10MB
    }
    reverse_proxy 127.0.0.1:8787
}
```

- Caddy obtiene y renueva el certificado solo (ACME). ✅ característica documentada del producto; 🔶 el tiempo exacto de emisión depende del DNS.
- El token ES256 **sigue siendo obligatorio**: TLS protege el transporte, no autentica al llamador.
- La PC de Windows se reemplaza por un VPS Linux; el contrato y los límites **no cambian**.

---

## 5. La PC de cómputo en Windows

### 5.1 Inventario mínimo

| Recurso | Mínimo | Recomendado | Nota |
|---|---|---|---|
| CPU | 4 núcleos | 8 núcleos | `/embed` y `/calc` van bien en CPU |
| RAM | 8 GB | 16 GB | `bge-m3` ~1,2 GB ✅ (ficha Ollama) + `whisper-small` ~0,5 GB 🔶 + SO |
| GPU | — | 6–8 GB VRAM | Sin GPU, **`/extract` se queda en Workers AI** (un VLM en CPU > 20 s) |
| Disco | 20 GB libres | 60 GB SSD | Modelos + logs rotados |
| Red | Ethernet | Ethernet + UPS | Wi-Fi + túnel + demo en vivo = mala idea |
| Energía | — | UPS | Un microcorte de 2 s son 3 minutos de demo |

### 5.2 Arranque, auto-start y reinicio

⚠️ **Hecho que condiciona todo:** `cloudflared` **sí** se instala como servicio de Windows, pero la doc exige `tunnel` (UUID) y `credentials-file` ✅ — es decir, **solo para túneles con nombre**. Un quick tunnel **no puede** instalarse así: no tiene UUID ni credentials. Por eso, en el prototipo, tanto el servidor como el túnel se envuelven con un *service wrapper*:

| Pieza | Cómo se levanta | Reinicio |
|---|---|---|
| Servidor de cómputo (`127.0.0.1:8787`) | Servicio Windows (NSSM o equivalente) con `AppExit Default Restart` | Automático, 5 s de espera |
| `cloudflared --url http://127.0.0.1:8787` | Servicio Windows (mismo wrapper) | Automático; **URL nueva en cada arranque** |
| Modelos | Precargados al arrancar el servidor (`/health` → `cargado: true`) | Sin cold start en el demo |

**Reglas de la máquina:**
- El servidor **escucha solo en `127.0.0.1`**, nunca en `0.0.0.0`. Así, aunque el Wi-Fi del lugar sea el de la organización, nadie de la LAN entra.
- Suspensión e hibernación **desactivadas** (ni por inactividad ni por tapa).
- Inicio rápido de Windows **desactivado** (deja drivers en estado raro).
- Actualizaciones automáticas **pausadas** durante la ventana del hackathon (una actualización reiniciando a mitad de pitch es un clásico).
- Un `.ps1` idempotente de arranque: crea carpetas, verifica modelos (hash), levanta servicios, espera `/health`, imprime la URL del túnel y la deja en un archivo local **fuera del repo**.

### 5.3 Dónde viven los modelos

```
C:\compute\
├─ bin\            cloudflared.exe, servidor, wrapper
├─ models\         pesos, versionados y con hash
│  ├─ bge-m3\      1,2 GB ✅ (Ollama) — SHA-256 en models.lock
│  ├─ whisper-small\  ~0,5 GB 🔶
│  └─ vlm\         solo si hay GPU
├─ cache\          índice del catálogo (regenerable desde Supabase)
├─ logs\           metadatos, rotados 7 días
└─ tmp\            se vacía en cada arranque y cada 15 min
```

- **Nada de `C:\Users\...`**: un servicio corre como `LocalSystem`/`NetworkService` y no ve el perfil del usuario (la doc de Windows lo demuestra: hay que copiar `cert.pem` a `C:\Windows\System32\config\systemprofile\.cloudflared` ✅).
- `models.lock` con nombre + SHA-256 + fecha de descarga. Si el hash no coincide, el servidor **no arranca** (mejor un error claro que un vector de 1023 dimensiones).
- Sin auto-actualización de modelos. ⚠️ Cambiar de modelo cambia la **dimensión** del vector y exige re-embedding del catálogo completo (`08` §1.3).

### 5.4 Si se apaga o cambia la URL

| Evento | Qué detecta | Qué hace el sistema | Qué ve la olla |
|---|---|---|---|
| PC apagada / suspendida | `/health` no responde en 2 s | Circuit breaker abierto (§6.4); trabajos a `pendiente_compute` | «Esperando para procesar» + sigue operando en local |
| `cloudflared` caído, servidor vivo | `/health` da 502/1033 | Igual | Igual |
| Túnel reiniciado (URL nueva) | 404/530 del edge | **Falla ruidosa**: alerta en el panel de la demo, no reintento ciego | Igual, hasta que se actualiza `COMPUTE_URL` |
| Internet de la PC caído | timeouts | Breaker abierto | Igual |
| Reloj de la PC desfasado | tokens rechazados por `exp` | 401 → la fachada reacuña; si persiste, alerta | «Error de configuración» en el panel, no en la cara del usuario |

**La URL nueva es el único caso que exige intervención humana.** Mitigación del demo: **no reiniciar el túnel** después del *dry run*. Si hubo que reiniciarlo, el checklist (§5.7) incluye "actualizar `COMPUTE_URL` y probar `/health`".

### 5.5 Actualizar sin romper el demo

| Momento | Política |
|---|---|
| **T-24 h hasta el pitch** | **Congelado.** Nada se actualiza en la PC salvo un bug que impida el demo |
| Cambio de código | Proceso nuevo en el puerto **8788**, se prueba con `/health` y una llamada real, y recién ahí se conmuta |
| Conmutación | Con un proxy local mínimo en `8787` (Caddy o equivalente) → cambia el upstream y recarga; **0 s de caída**. Sin proxy: 30 s de caída aceptable **fuera** de la ventana del demo |
| Cambio de modelo | **Prohibido** cerca del demo: rompe dimensiones y exige re-embedding |
| Rollback | Se conserva el binario anterior y `models.lock` anterior; volver es reiniciar el servicio con el path viejo |

⚠️ Regla de oro: **el día del demo la PC no se toca**. Cualquier mejora se hace en el repo y se prueba en otra máquina.

### 5.6 Logs sin datos sensibles

Una línea JSON por request, **sin contenido**:

```json
{"ts":"2026-11-23T14:02:11.482Z","req":"0192f0c4-…","op":"embed","status":200,"ms":142,
 "in_bytes":1840,"out_bytes":41120,"olla":"sha256:2b91…","jti":"sha256:9a3c…",
 "modelo":"bge-m3@sha256:9f2c","ip":"edge","err":null}
```

| Campo | Se guarda | Por qué |
|---|---|---|
| `req` (`request_id`) | Sí | Correlaciona con el log de la fachada sin contenido |
| `op`, `status`, `ms`, bytes | Sí | Es lo único que sirve para diagnosticar latencia y tamaño |
| `olla` | **Hash**, no el id | Contar por olla sin poder reconstruir el padrón |
| `jti` | **Hash** | Detectar reuso de token sin guardar el token |
| `modelo@hash` | Sí | Reproducir qué versión calculó qué (§8, versionado) |
| Texto transcripto, descripciones, OCR, precios | **Nunca** | Es el contenido del negocio de la olla |
| Bytes de la imagen/audio | **Nunca** | No hay volcado de payloads ni en error |
| IP del cliente | **No** (la PC solo ve a Cloudflare) | No hace falta |

- Rotación diaria, retención **7 días**, límite de 50 MB (se borra lo más viejo).
- **Prohibido** en producción: `--debug`, access logs con query string, volcados de crash de Windows (`%LOCALAPPDATA%\CrashDumps` desactivado), y `--logfile` con nivel `debug`.
- Los errores se loguean **por código** (`MODEL_ERROR:oom`), no con el texto del modelo: un stack trace puede arrastrar fragmentos del prompt, y el prompt puede arrastrar la descripción del producto.

### 5.7 Checklist de la PC (T-24 h y T-15 min)

```
[ ] Servicios "compute" y "tunnel" en estado RUNNING y con reinicio automático
[ ] /health (por la fachada, no por localhost) → ok:true, api_version 1.2.0
[ ] modelos.cargado = true en embed, asr (y vlm si hay GPU)
[ ] Un /embed real de 10 textos < 1,5 s
[ ] Un /transcribe de 15 s < 20 s (o desactivado si no hay GPU/CPU suficiente)
[ ] Presupuesto de GPU del día > 60 % restante
[ ] logs/ con < 5 MB y rotación configurada
[ ] tmp/ vacío
[ ] tmp/%TEMP%/compute vacío (Starlette puede dejar archivos, §7.3)
[ ] Suspensión, hibernación e inicio rápido: OFF
[ ] Windows Update pausado hasta después del evento
[ ] URL del túnel anotada y COMPUTE_URL actualizada en Pages
[ ] Reloj sincronizado (w32time) — un desfase invalida los tokens
[ ] UPS conectado / batería de la laptop al 100 %
```

---

## 6. Cola y degradación

### 6.1 Estados

```
                   ┌──────────────┐
captura ──────────►│ pendiente_   │  (hay red y el cómputo está vivo)
(texto, voz,       │ compute      │
 foto, boleta)     └───┬──────┬───┘
                        │      │ sin red / breaker abierto / 429 largo
             hay cupo   │      └──────────────────────────┐
                        ▼                                 ▼
                  ┌──────────┐                     ┌─────────────┐
                  │ en_proceso│                    │ pendiente_  │
                  └──┬────┬──┘                     │ compute     │
              ok     │    │ error retryable        │ (esperando) │
                     ▼    └──────► reintento con backoff
              ┌───────────────┐
              │ listo_para_   │   ← la persona confirma (obligatorio, D8)
              │ revision      │
              └───┬───────┬───┘
        confirma  │       │  abandona / falla permanente
                  ▼       ▼
           ┌──────────┐  ┌──────────┐
           │confirmado│  │ fallido  │ → modo local / entrada manual
           └──────────┘  └──────────┘
```

**Regla:** `en_proceso` **no** es un estado de negocio. Si un `compute_job` queda en `en_proceso` más de 3 minutos (proceso muerto), un barrido lo devuelve a `pendiente_compute` **con el mismo `idempotency_key`**. Eso es lo que evita el trabajo perdido y el duplicado.

### 6.2 Tabla `compute_job`

| Campo | Tipo | Regla |
|---|---|---|
| `id` | uuid | UUIDv7 del cliente |
| `olla_id` | uuid | RLS |
| `kind` | enum | `transcribe` \| `extract` \| `embed` \| `classify` \| `calc` |
| `idempotency_key` | text | **`unique` global**; es la misma clave del `08`/`07` |
| `payload_ref` | text | Ruta en Storage **o** JSON inline si es chico (texto) |
| `payload_bytes` | int | Se rechaza > límite del endpoint antes de encolar |
| `estado` | enum | Ver §6.1 |
| `intentos` | smallint | `≤ 5` |
| `next_attempt_at` | timestamptz | Backoff |
| `provider` | enum | `pc` \| `workers-ai` \| `local` — **se fija al despachar y no se cambia** (§8, doble cobro) |
| `resultado` | jsonb | Solo lo que el cómputo devolvió; se borra a los 7 días si está `confirmado` |
| `error_code` | text | Código, nunca mensaje del modelo |
| `expira_en` | timestamptz | Hard delete del payload: **7 días** |

**Por qué `unique` en `idempotency_key` y no un `select` antes de insertar:** dos dispositivos sin red pueden encolar la misma captura; el `unique` lo resuelve en la base en una sola operación atómica. El segundo `insert` recibe `23505` y el cliente lo trata como "ya está encolado" (mismo criterio que `07` §2.7 y §5.3).

### 6.3 Reintentos con backoff

```
intento 1:  inmediato
intento 2:  +1 s   ±20%
intento 3:  +4 s   ±20%
intento 4:  +15 s  ±20%
intento 5:  +60 s  ±20%
luego:      fallido permanente → modo local / entrada manual
```

| Situación | ¿Reintenta? | Nota |
|---|---|---|
| 5xx, timeout, corte de red | **Sí** | Con backoff |
| 429 con `retry_after_s ≤ 30` | **Sí** | Respeta el valor del servidor |
| 429 con `retry_after_s > 30` o cuota diaria agotada | **No** | Cae a local; se reencola al día siguiente |
| 401 `TOKEN_EXPIRED` | **Sí, una vez** | Reacuña token; si repite, es configuración → alerta |
| 413 / 415 / 422 | **No** | Permanente: comprimir o entrada manual |
| `VERSION_MISMATCH` | **No** | Recargar la PWA |
| Breaker abierto | **No** | Se queda en `pendiente_compute` sin gastar intento |

⚠️ **Nunca dos proveedores en paralelo** para la misma `idempotency_key`. El dispatch fija `provider` y espera; el fallback a otro proveedor es un **nuevo intento con el mismo provider fijado o degradación a local**, no una carrera.

### 6.4 Circuit breaker (en la fachada)

```
estado: cerrado ──5 fallos consecutivos en 60 s──► abierto (120 s)
        abierto ──expira──► medio_abierto (1 request de prueba)
        medio_abierto ──ok──► cerrado
        medio_abierto ──fallo──► abierto (240 s)
```

- **Por endpoint.** `/extract` puede estar caído (OOM de VRAM) mientras `/embed` funciona perfecto. Un breaker global apagaría lo que sí sirve.
- **Por proveedor.** `pc` abierto no implica `workers-ai` abierto.
- El estado vive en KV, con `closed` por defecto: **fail-open**, porque preferimos intentar y que falle rápido (2 s) antes que negar un servicio que está sano.
- Al abrirse, la fachada responde `503` con `X-Compute-Mode: degraded` y el cliente **no** reintenta: va directo a local.

### 6.5 Modo local (sin segundo backend)

| Operación | Cómo se hace en local | Qué se pierde |
|---|---|---|
| Extracción de texto | `Tesseract.js` (`spa` fast precacheado) + parser por proveedor | Precisión en fotos torcidas; nada de manuscrito (✅ Tesseract no lo soporta) |
| Clasificación | Alias exacto + fuzzy (Levenshtein/trigramas) sobre el catálogo de Dexie | El vector; sube la tasa de `por_revisar` |
| Embeddings | **No se generan** | El ítem queda `por_revisar` hasta que vuelva la red |
| Transcripción | **No se hace** | La UI ofrece dictado por teclado; el audio queda cifrado en Dexie |
| Cálculo | Funciones puras en el cliente (mediana, MAD, proyección) | Nada: es aritmética |
| Presupuesto | Igual: se suma en local sobre lo confirmado | Nada |

⚠️ **El modo local nunca miente.** No dice "transcribí tu audio" si no lo hizo, ni "clasifiqué" si adivinó por trigramas. El badge cambia y el ítem queda `por_revisar`, que es el estado honesto.

### 6.6 Cómo la UI dice la verdad

Microcopy exacto (⚠️ se congela y se testea; no se improvisa en el escenario):

| Situación real | Lo que dice la UI | Lo que **no** dice |
|---|---|---|
| Encolado, sin red | «Guardado. Se procesa cuando vuelva la conexión.» | «Procesando…» |
| Encolado, con red pero cómputo caído | «Esperando para procesar. Podés seguir cargando.» | «Error del servidor» |
| Procesando ahora | «Leyendo el comprobante…» con barra indeterminada y botón **Cancelar** | Un porcentaje inventado |
| Resultado listo, sin confirmar | «Leído. Revisá los números antes de guardar.» | «Gastado: S/ 47,30» |
| Ítem sin clasificar | «Sin clasificar (S/ 14,50)» con acción *crear producto* | «Otros» |
| Cómputo caído, se usó local | «Leído en este dispositivo.» | Nada sobre la nube |
| El papel no se pudo leer | «No pudimos leer el papel. Escribilo acá.» | «Error de OCR» |
| Presupuesto con ítems pendientes | Monto confirmado + línea «3 ítems esperando (no suman)» | Un total que incluya lo no confirmado |

**La regla que las une:** el dinero mostrado es siempre el de ítems confirmados. Un pendiente se ve como pendiente, con su monto estimado entre paréntesis y **sin sumar**. Nunca `S/ 0` (mentira) ni el total especulativo (mentira más caras).

---

## 7. Datos y privacidad

### 7.1 El cómputo no guarda imágenes ni audio

| Dato | Ciclo de vida en la PC | En disco |
|---|---|---|
| Imagen del comprobante | Decodificada en memoria, inferencia, se libera al responder | **0 bytes** |
| PDF | Páginas renderizadas en memoria (≤ 10) | **0 bytes** |
| Audio | Buffer en memoria, transcrito, se libera al responder | **0 bytes** ⚠️ ver §7.3 |
| Texto transcripto | Devuelto en la respuesta; se loguea solo su hash | **0 bytes** |
| Vectores | Devueltos; LRU en memoria por `sha256(texto)` 10 min | **0 bytes** |
| `idempotency_key` → respuesta | LRU en memoria, 10 min | **0 bytes** |

### 7.2 Qué se loguea (y qué jamás)

**Sí:** `request_id`, endpoint, status, latencia, bytes de entrada/salida, `sha256(olla_id)`, `sha256(jti)`, `modelo@hash`, código de error.

**Jamás:** texto transcripto, descripciones de productos, precios, montos, RUC, razón social, folio, la imagen, el audio, el prompt completo, y **ningún** dato de `persona`.

- Para depurar una extracción rara: `sha256(descripcion)` + longitud. Alcanza para decir "el modelo devolvió 12 ítems, 3 vacíos" sin guardar el contenido.
- **El log de la fachada y el de la PC se cruzan por `request_id`**, así que ninguno de los dos necesita contenido para ser útil.

### 7.3 Duración de los buffers (y una trampa real)

| Buffer | Máximo | Destino al terminar |
|---|---|---|
| Request body | 8 MB (hard limit) | Memoria del proceso |
| Audio decodificado | ~120 s a 16 kHz mono ≈ 4 MB 🔶 | Memoria |
| Imagen decodificada | 1280 px ≈ 5 MB en RAM 🔶 | Memoria |
| Resultado | ≤ 256 KB (se rechaza más) | Respuesta |
| `tmp/` | **0 bytes esperados** | Se vacía al arrancar y cada 15 min (tarea programada) |

⚠️ **Trampa concreta:** los frameworks tipo FastAPI/Starlette suben archivos con `UploadFile`, que internamente usa un archivo temporal que **se derrama a disco** cuando supera un umbral (1 MB por defecto). Es decir: "no guardo nada" puede ser falso sin querer. Mitigación obligatoria en la implementación: leer el stream manualmente a memoria con tope, o subir el umbral en memoria y verificar con un test que `%TEMP%` queda vacío después de un `/transcribe` de 8 MB. Este test va en CI.

### 7.4 Cómo se evita que la PC sea una copia de la base

**La PC no tiene, por diseño:**

| No tiene | Consecuencia |
|---|---|
| Credenciales de Supabase (ni URL, ni `anon`, ni `service_role`) | No puede leer ni escribir la base; ni siquiera sabe en qué proyecto está |
| Cliente de Postgres | No hay conexión posible a la base |
| Llaves de Storage | No puede listar ni bajar comprobantes |
| IMÁGENES o audio persistidos | No hay copia de la evidencia |
| Datos de `persona` | No hay padrón |
| La `JWT signing key` de Supabase | No puede emitir sesiones |
| La clave **privada** del token de cómputo | Solo verifica; no emite |

**Lo que sí tiene:** pesos de modelos (públicos), un índice del catálogo (**público**: nombres de producto y precios de referencia, no compras de ninguna olla), y logs de metadatos de 7 días.

**Si roban o pierden la PC:**
1. Se detiene el túnel (la URL muere) y se revoca el token del túnel.
2. Se rota la clave ES256 → los tokens vivos mueren en 90 s.
3. Lo que se llevan: modelos públicos + metadatos sin contenido. **No hay fuga de datos de personas ni de compras.**
4. Lo único sensible son los logs: por eso son hashes y duran 7 días.

⚠️ Excepción honesta: **el audio ES contenido sensible** (la voz de una persona). Por eso D9 dice «el audio crudo no se sube por defecto». Cuando se sube, va por TLS, vive en RAM, y el usuario lo consiente en el momento (§7.5).

### 7.5 Consentimiento del audio (una línea de UI)

Antes de mandar audio a la PC: «Tu voz se envía para transcribirla y no se guarda. ¿Continuar?» con dos opciones: **Transcribir** y **Escribir a mano**. Negarse **no** impide registrar el gasto (D9: la captura manual es camino de primera clase).

---

## 8. Riesgos

### 8.1 Tabla completa

| Riesgo | Prob. | Impacto | Mitigación | Detección |
|---|---|---|---|---|
| **URL filtrada** | Media | Bajo | Token ES256 de 90 s + `/health` sin datos + binding a `127.0.0.1` | 401 en ráfaga en el log |
| **Túnel caído en el demo** | Media | **Alto** | Demo con resultados precargados; modo local a un clic; video de respaldo | `/health` no responde en 2 s |
| **Latencia** (cliente → edge → PC → vuelta) | Alta | Medio | Llamadas de < 1 s en vivo (`/embed`, `/calc`); lo lento, precargado | p95 medido en el dry run |
| **Doble cobro de cómputo** | Media | Medio | `unique(idempotency_key)` + `provider` fijado al despachar + sin fan-out | Dos jobs con la misma clave (debe ser imposible) |
| **Versionado de modelos** | Baja | **Alto** (silencioso) | `modelo@hash` en cada respuesta; vectores de modelos distintos **no se comparan**; re-embedding como job | Vector con `dim` distinta al del índice |
| **PC apagada / suspendida** | Media | Alto | Servicios con auto-restart, suspensión OFF, UPS, checklist | `/health` |
| **Internet de la PC caído / CGNAT raro** | Media | Alto | Ethernet, prueba de 30 min antes, plan local | timeouts |
| **OOM de VRAM en `/extract`** | Media | Medio | Breaker por endpoint; `provider=workers-ai` como alternativa; límite de 1 concurrente | `MODEL_ERROR:oom` |
| **Token mal configurado (401 en todo)** | Media | **Alto** | Test `curl` en el checklist; reloj sincronizado; `aud`/`scope` verificados en el dry run | 401 en el primer request del demo |
| **Fachada con demasiada CPU** (10 ms) | Baja | Alto | Fachada delgada; nada de lógica de negocio | `Error 1102` en métricas |
| **Audio sin consentimiento** | Baja | Alto (legal) | Diálogo explícito por captura (§7.5) | Revisión de UI |

### 8.2 Los tres que pueden tumbar el demo

**1. El túnel o la PC se caen en vivo.**
Es el más probable y el más visible. Un quick tunnel es un proceso en una PC doméstica: sin SLA (✅ doc), con URL que cambia (✅ doc) y 200 requests en vuelo (✅ doc). Mitigación en tres capas: (a) los resultados que se muestran **ya están calculados** en Supabase; (b) el botón de pánico pasa a modo local en < 5 s; (c) video de 60–90 s grabado con el flujo completo sin red (`08` §7.2).

**2. La latencia convierte el demo en una espera.**
El viaje es celular → edge de Cloudflare (Miami, medido: 143 ms de promedio en `02` §5.1) → túnel → PC en Lima → vuelta. 🔶 **300–600 ms de base**, más el cómputo. Si además se pide una visión de boleta (3–8 s), el jurado mira una barra de progreso. Mitigación: en vivo se llama **solo** `/embed` (150–600 ms con red) y `/calc` (decenas de ms); la visión se muestra **ya hecha**, con el badge "leído en este dispositivo" o "procesado antes".

**3. Un 401/404 silencioso por configuración.**
Token vencido por reloj desfasado, `aud` mal escrito, `COMPUTE_URL` apuntando al túnel anterior, o Access bloqueando al llamador legítimo. Es el riesgo más traicionero porque **el sistema "funciona"**: la UI dice "esperando para procesar" y nadie sospecha. Mitigación: en el checklist, una llamada **real de punta a punta por la fachada** (no por `localhost`), y un panel de diagnóstico visible que muestre `compute: ok|degradado|off`, `api_version` y `modelos` antes de empezar.

### 8.3 Qué se muestra si el segundo backend no está

| Lugar | Estado | Texto |
|---|---|---|
| Header de la app | `degradado` | «Modo sin conexión al procesador. Todo se guarda igual.» |
| Captura de boleta | `local` | «Leído en este dispositivo.» |
| Captura de voz | `sin procesar` | «Guardamos tu audio. Se transcribe cuando vuelva.» |
| Ítems | `por_revisar` | «3 ítems esperando (no suman)» |
| Presupuesto | normal | Monto confirmado, con la línea de pendientes aparte |
| Panel de demo (interno) | `off` | `compute: off · breaker: abierto · última ok: hace 4 min` |

⚠️ El panel interno **no** se muestra al jurado: es para el equipo. Pero existe, porque el peor escenario es no saber por qué no responde.

---

## 9. Plan de demo

### 9.1 Qué corre dónde

| Pieza | Dónde | Estado en el demo |
|---|---|---|
| PWA | Cloudflare Pages | Estable, `DEMO_MODE=1` (timeout 8 s, un reintento, sin toasts de error) |
| Auth, datos, RLS, storage, cola | Supabase | Estable; 3 ollas sembradas |
| Fachada `/api/compute/*` | Pages Function | Delgada; una variable `COMPUTE_MODE` |
| `/embed` | PC | **Vivo** (rápido y barato: es la única llamada en vivo) |
| `/extract` | PC (con GPU) o Workers AI | **Precargado**; en vivo solo si el dry run dio < 5 s |
| `/transcribe` | PC | **Precargado**; el audio ya transcripto se muestra como resultado |
| `/calc` | PC o cliente | Vivo (no depende del túnel si el cliente lo hace) |
| Modo local | Navegador | Listo y probado: es el botón de pánico |

### 9.2 Qué se precarga

1. **3 comprobantes sintéticos** ya procesados, clasificados y confirmados (RUC falso `20123456789`, proveedor `Proveedor Demo 01`; `08` §6.4).
2. **1 audio de 15 s** ya transcripto, con su texto y sus ítems por confirmar.
3. **Presupuesto del mes** con historial de 3 períodos → la tendencia ya calculada (no se calcula en vivo).
4. **Catálogo `catalogo.v1`** embebido y versionado en Supabase, con su hash.
5. **Una boleta "sorpresa"** sin procesar, solo para el caso "el jurado pide una nueva".

### 9.3 Guion técnico del cómputo (60 s)

| t | Qué se hace | Qué demuestra |
|---|---|---|
| 0:00 | Panel de diagnóstico: `compute: ok · api_version 1.2.0 · bge-m3 cargado` | Hay un segundo backend real y se puede ver |
| 0:10 | Se escribe a mano «pap. blanca 1ra, 49 kg, 1.95» | El camino que nunca falla |
| 0:25 | Se clasifica: alias exacto → confirmado, **sin red** | Precisión 1.0 y costo 0 |
| 0:35 | Se dicta (o se muestra el audio ya transcripto) y se confirma el monto | La voz no entra al presupuesto sin humano |
| 0:45 | Se muestra el badge **"esperando para procesar"** en un ítem | El sistema sabe cuándo no sabe |
| 0:55 | Se apaga el túnel `Ctrl+C` y se sigue operando | **La olla no se bloquea** |

⚠️ El apagado del túnel en vivo, si se hace, se hace **al final** y a propósito. Es el momento más fuerte del pitch: demostrar que el diseño tolera la caída del segundo backend es más convincente que cualquier latencia.

### 9.4 Botón de pánico (tres niveles)

| Nivel | Acción | Efecto | Quién |
|---|---|---|---|
| **1** | `COMPUTE_MODE=local` (flag en KV, desde el panel de demo) | La fachada deja de enrutar; **todo** va a local; los pendientes quedan visibles | Cualquiera del equipo, < 5 s |
| **2** | `COMPUTE_MODE=off` + cerrar el túnel | Igual, y la URL muere (✅ al detener el proceso) | Quien opera la PC |
| **3** | Abrir el **lote de ejemplo** y el video de respaldo | Demo igual de coherente, sin depender de nada | Presentador |

⚠️ El flag vive en KV y **no** requiere redesplegar: es la diferencia entre arreglarlo en 5 segundos o en 60, con el jurado mirando.

---

## 10. Verificado vs estimado

### 10.1 ✅ Verificado (2026-11-23)

| Dato | Fuente |
|---|---|
| Quick tunnel: URL `trycloudflare.com` temporal, sin cuenta ni dominio, «Anyone with the URL can access your local service», muere al detener el proceso | `developers.cloudflare.com/.../do-more-with-tunnels/trycloudflare/` (`dateModified` 2026-09-30) |
| Quick tunnel: sin garantía de uptime, 200 requests en vuelo → 429, sin SSE, hostname cambia cada vez, `--allowed-mail` no sirve para clientes no interactivos | idem, sección Limitations |
| Quick tunnel es «for testing and development» | idem, nota inicial |
| Tunnel mantiene el origen cerrado (sin puertos entrantes) | `.../faq/cloudflare-tunnels-faq/` (`dateModified` 2026-09-16) |
| Tunnel soporta WebSockets y gRPC (gRPC solo en private network) | idem |
| Named tunnel: hay que agregar un sitio a Cloudflare antes de publicar | `.../get-started/create-remote-tunnel/` (`dateModified` 2026-06-23) |
| Túneles por cuenta: 1 000; réplicas activas por túnel: 25; service tokens Access: 50 | `.../cloudflare-one/account-limits/` (`dateModified` 2026-11-17) |
| Access service tokens: Client ID + Secret, headers `CF-Access-Client-Id`/`-Secret`, política **Service Auth** | `.../access-controls/service-credentials/service-tokens/` (`dateModified` 2026-11-17) |
| `cloudflared` como servicio de Windows exige `tunnel` (UUID) y `credentials-file` | `.../local-management/as-a-service/windows/` (`dateModified` 2026-04-17) |
| Límite de body por request: **100 MB** en plan Free (y `413` al excederlo) | `developers.cloudflare.com/workers/platform/limits/` (`dateModified` 2026-11-19) |
| Workers Free: **10 ms de CPU** por invocación, 100 000 req/día, 128 MB de memoria | idem |
| Edge Functions: 256 MB de memoria, **150 s** de wall clock (Free) / 400 s (pago), 2 s de CPU, 150 s de idle timeout | `supabase.com/docs/guides/functions/limits` |
| Supabase JWKS en `/auth/v1/.well-known/jwks.json`, ES256/RS256, cache 10 min, HS256 desaconsejado para producción | `supabase.com/docs/guides/auth/signing-keys` |
| `bge-m3` en Ollama: 1,2 GB, contexto 8K | `ollama.com/library/bge-m3` (vía `08` §8.1) |
| Latencia Perú → edge Cloudflare: 143 ms promedio, `colo=MIA` | medición propia, `02-arquitectura.md` §5.1 |
| Tesseract no sirve para manuscrito | `tesseract-ocr.github.io/tessdoc/FAQ.html` (vía `08` §7.2) |

### 10.2 🔶 Estimado (medir el día 1)

1. **Latencia extremo a extremo cliente → fachada → túnel → PC → vuelta.** Estimado 300–600 ms de base + cómputo. Medir con 20 llamadas a `/embed` desde la conexión del venue.
2. **`/transcribe` real:** 5–15 s para 20 s de audio en CPU con `whisper-small`; 1–3 s con GPU. Medir p50/p95 por hardware.
3. **`/extract` en CPU:** > 20 s (por eso se descarta sin GPU). En GPU 3–8 s. Medir con la GPU real.
4. **Derrame a disco de `UploadFile`:** verificar en la implementación concreta (§7.3). Es un test, no una suposición.
5. **Consistencia de contadores de rate limit en KV:** la cuota exacta la lleva la PC; el contador de la fachada es aproximado. No prometer precisión en el borde.
6. **Costo real de un VPS** para producción: US$ 5–12/mes según `08` §3.2; el proveedor y la región no están fijados.
7. **Tiempo de propagación de un cambio de env var en Pages:** ~60 s (verificar en el primer cambio).
8. **Que `bge-m3` separe bien jurel/bonito con este pipeline:** es la hipótesis central de `08` §8.2 y **no cambia** por correr en la PC.

### 10.3 Lo que este documento no decide

- No fija el proveedor de VPS ni la región (tampoco lo hace `08`).
- No implementa el servidor de cómputo: define el contrato que debe cumplir.
- No promete que el quick tunnel aguante un demo público con 50 personas escaneando el QR a la vez: la demo es de una olla, en un celular.
- No decide si el audio se sube por defecto: **no se sube** (D9). Si se habilita, hay consentimiento explícito por captura.

---

## 11. Fuentes

Todas consultadas el **2026-11-23**.

**Cloudflare**
- Quick Tunnels: `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/` (`dateModified` 2026-09-30)
- Create a tunnel (requisito de dominio): `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/create-remote-tunnel/` (2026-06-23)
- `cloudflared` como servicio en Windows: `https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/as-a-service/windows/` (2026-04-17)
- Tunnels FAQ (WebSockets, gRPC, origen cerrado): `https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/` (2026-09-16)
- Service tokens (Access, Service Auth, headers): `https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/` (2026-11-17)
- Account limits (túneles, réplicas, service tokens): `https://developers.cloudflare.com/cloudflare-one/account-limits/` (2026-11-17)
- Workers Limits (100 MB de body, 10 ms de CPU en Free): `https://developers.cloudflare.com/workers/platform/limits/` (2026-11-19)

**Supabase**
- Edge Functions limits (150 s / 256 MB / 2 s CPU): `https://supabase.com/docs/guides/functions/limits`
- JWT Signing Keys (JWKS, ES256, cache, HS256 desaconsejado): `https://supabase.com/docs/guides/auth/signing-keys`

**Modelos y documentos del proyecto**
- `bge-m3` (Ollama): `https://ollama.com/library/bge-m3`
- Tesseract FAQ: `https://tesseract-ocr.github.io/tessdoc/FAQ.html`
- `06-decisiones.md` (D8, D9), `08-clasificacion-productos.md` (§1.2, §1.3, §2.2, §6.1, §7), `07-comprobantes-presupuesto.md` (§1.1, §2.7, §3.2, §5), `02-arquitectura.md` (§4, §5.1, §6, §11)
