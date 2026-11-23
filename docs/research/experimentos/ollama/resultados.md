# Ollama + embeddings: ¿sirve para clasificar ítems de boletas?

**Proyecto:** hackODS-Autónoma 2026 · PWA para ollas comunes del Perú
**Fecha:** 2026-11-23 · **Máquina:** esta PC de desarrollo (Windows 11)
**Plan de referencia:** `08-clasificacion-productos.md` §4.3 (τ=0,62 · margen=0,04 · piso=0,45 · bge-m3 en producción)
**Reproducir:** `python probar.py --latencia --json resultados.json` (en esta carpeta)

> Todo lo que sigue es **medido en esta máquina**. Lo que sea estimación va marcado 🔶.
> El set de datos es **ficticio**: ninguna persona, RUC ni proveedor real.

---

## 1. Estado del entorno (números reales)

| Cosa | Valor medido | Comando |
|---|---|---|
| Ollama | **0.40.6** | `ollama --version` |
| Servicio | responde en `http://127.0.0.1:11434` | `curl.exe -s http://127.0.0.1:11434/api/version` → `{"version":"0.40.6"}` |
| CPU | **Intel i7-11700F**, 8 núcleos / 16 hilos | `wmic cpu get name,NumberOfCores,NumberOfLogicalProcessors` |
| RAM | **34.221.142.016 bytes ≈ 31,9 GiB** | `wmic ComputerSystem get TotalPhysicalMemory` |
| GPU | **NVIDIA RTX 4070 Ti SUPER, 16.376 MiB**, driver 621.01 | `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv` |

**Modelos instalados antes de empezar** (`ollama list`):

| Modelo | Tamaño | Capacidad |
|---|---|---|
| `qwen3.5:4b` | 3,3 GB | completion, vision, tools, thinking |
| `qwen3.5:2b` | 2,7 GB | completion, vision, tools, thinking |
| `gemma4-e4b-local:latest` | 5,3 GB | completion, tools, thinking |
| `embeddinggemma-2-bf16:latest` | 557 MB | **embedding** (768 dim reales) |

Es decir: **había un modelo de embeddings ya instalado**, pero ninguno de los cuatro que pedía el experimento.

### Lo que se descargó

Se bajó **un solo** modelo, el que usa el plan en producción:

```
ollama pull bge-m3
→ 1.2 GB a ~118 MB/s ≈ 10 s de transferencia + verificación sha256. Modelo: 567m, contexto 8K, 1024 dim.
```

Nada más se instaló en el sistema. `nomic-embed-text` (274 MB), `mxbai-embed-large` (335m) y `snowflake-arctic-embed` **no se probaron**: no estaban instalados y la regla era bajar uno solo. Queda anotado abajo cómo completarlos en 5 minutos si se quiere.

---

## 2. Modelos de embedding que existen hoy en Ollama

✅ Verificado el **2026-11-23** en `ollama.com/search?c=embedding` (14 modelos) y en las fichas de cada uno.

| Modelo | Parámetros | Descarga | Contexto | Dim | Nota |
|---|---|---:|---:|---:|---|
| `embeddinggemma-2` | 270m / 440m / 570m / 740m | ~557 MB (bf16) | 262k | 768 | **Multimodal** (texto+imagen+audio), familia Gemma 4. Es el que ya estaba |
| `embeddinggemma` | 300m | — | — | 768 | versión anterior |
| `bge-m3` | 567m | **1,2 GB** | 8K | **1024** | Multilingüe 100+ idiomas, denso+disperso+multi-vector. **El del plan** |
| `nomic-embed-text` | 137m | **274 MB** | 2K | 768 | El más usado del catálogo (99M descargas) |
| `nomic-embed-text-v2-moe` | MoE | — | — | — | Multilingüe, más nuevo |
| `mxbai-embed-large` | 335m | — | 512 | 1024 | Bueno en inglés, sin foco multilingüe |
| `snowflake-arctic-embed` / `-embed2` | 22m–568m | — | — | 384–1024 | Suite; `embed2` es el multilingüe |
| `qwen3-embedding` | 0.6b / 4b / 8b | — | 8K | 1024+ | Multilingüe fuerte, pesado |
| `bge-large` | 335m | — | 512 | 1024 | Inglés |
| `all-minilm` | 22m / 33m | — | — | 384 | El más chico y rápido |
| `paraphrase-multilingual` | 278m | — | — | 768 | sentence-transformers |
| `granite-embedding` | 30m / 278m | — | — | — | 30m solo inglés |
| `laya` | 421M | — | — | — | modelo de *decisión*, no de recuperación |

**Los chicos de verdad**: `all-minilm` (22m), `snowflake-arctic-embed:22m`, `granite-embedding:30m`, `nomic-embed-text` (137m), `embeddinggemma-2:270m`.

**Probados en este experimento: 2** — `bge-m3` (el del plan) y `embeddinggemma-2-bf16` (el que ya estaba). Con dos modelos que aciertan 100% en este set, un tercero no habría cambiado la decisión; lo que decide es la **separación de scores**, y eso está medido para ambos.

---

## 3. Set de prueba

`dataset.json`: **21 productos** de olla común con 2 alias cada uno + **32 ítems** (30 etiquetados + 2 negativos a propósito), escritos como salen en una boleta de mercado de abastos.

`vecinos.json` (stress): **15 productos vecinos léxicos** (papa huayro, camote, cebolla china, pallar, garbanzo, aceite de oliva, atún, azúcar blanca, sal marina, fideos cabello de ángel, queso mantecoso, leche fresca, pollo vivo, hígado de pollo, arroz añejo) + **15 ítems** que apuntan a ellos + **9 ítems con ruido de OCR** (`1→I`, `0→O`, `R→P`, `G→6`, espacio intruso, letra faltante).

**Decisión de diseño importante (y una trampa que hubo que corregir):** en la primera corrida los alias del catálogo coincidían literalmente con los ítems de prueba, así que el coseno daba **1,000** por igualdad de cadena y la "accuracy" no medía el modelo. Se reescribieron los alias para que **ningún ítem sea idéntico a una entrada del catálogo** en los niveles 0–3 de normalización. El script ahora reporta la columna `ident.`: cuando aparece, la resolución es del **alias exacto** (paso 5 del pipeline), no del embedding.

### Normalización probada (5 niveles, acumulativos)

| Nivel | Qué hace | Ejemplo |
|---|---|---|
| 0 | crudo | `PAP. BLANCA 1RA` |
| 1 | NFKC + minúsculas + tildes fuera | `pap. blanca 1ra` |
| 2 | + abreviaturas (`PAP→papa`, `CEB→cebolla`, `ZANAH→zanahoria`, `CORR→corriente`, `EVAP→evaporada`, `1RA→primera`, `FREJOL→frijol`, `ENT→entero`…) | `papa blanca primera` |
| 3 | + marcas fuera (`PRIMOR`, `GLORIA`, `ECOMUSA`, `BOLIVAR`…) | `papa blanca primera` / `aceite 1l` |
| 4 | + presentación fuera (kg, L, 1/2, saco, botella, 400g…) | `papa blanca primera` → `papa blanca` |

### Método

1. Se embebe **nombre + alias** de cada producto (21 productos → 60 entradas en nivel 0) y los ítems.
2. Similitud coseno, **máximo por producto** (no por alias), igual que el paso 7 del plan.
3. `s1` = mejor producto, `s2` = segundo producto **distinto**.
4. Decisión con los umbrales del plan: `s1 ≥ 0,62` **y** `s1−s2 ≥ 0,04` → confirmado; `s1 ≥ 0,45` → por revisar; si no, desconocido.
5. Un **negativo confirmado cuenta como falso positivo** (es el error caro: entra al presupuesto sin que nadie lo mire).

---

## 4. Resultados

### 4.1 Tabla principal (catálogo 21 productos · 32 ítems)

| Modelo | Variante | dim | ident. | acc@1 | acc@1 sin ident. | acc@3 | confirmados | prec.auto | revisión | desconoc. | difíciles |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bge-m3 | crudo | 1024 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 22/32 | 95% | 31,2% | 0,0% | 14/14 |
| bge-m3 | minus+tildes | 1024 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 28/32 | 96% | 12,5% | 0,0% | 14/14 |
| bge-m3 | +abreviaturas | 1024 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 29/32 | 97% | 9,4% | 0,0% | 14/14 |
| bge-m3 | **+marca fuera** | 1024 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 30/32 | **97%** | **6,2%** | 0,0% | 14/14 |
| bge-m3 | +presentación fuera | 1024 | 26/32 | 100,0% | 100,0% (n=4) | 100,0% | 31/32 | 97% | 3,1% | 0,0% | 14/14 |
| embeddinggemma-2 | crudo | 768 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 30/32 | 97% | 6,2% | 0,0% | 14/14 |
| embeddinggemma-2 | minus+tildes | 768 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 29/32 | 100% | 9,4% | 0,0% | 14/14 |
| embeddinggemma-2 | +abreviaturas | 768 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 30/32 | 100% | 6,2% | 0,0% | 14/14 |
| embeddinggemma-2 | **+marca fuera** | 768 | 0/32 | 100,0% | 100,0% (n=30) | 100,0% | 30/32 | **100%** | **6,2%** | 0,0% | 14/14 |
| embeddinggemma-2 | +presentación fuera | 768 | 26/32 | 100,0% | 100,0% (n=4) | 100,0% | 31/32 | 97% | 3,1% | 0,0% | 14/14 |

**Lectura:**

- **acc@1 = 100% para los dos modelos en todos los niveles**, incluidos los 14 ítems marcados difíciles. Con un catálogo de 21 productos de nombres distintos, estos modelos no fallan el ranking.
- La normalización **no cambia la accuracy**: cambia cuántos ítems se pueden **auto-confirmar sin revisión**. bge-m3 baja de 31,2% a 6,2% de revisión solo por normalizar; gemma ya arranca bien en crudo (6,2%).
- **Nivel 4 (quitar presentación) es engañoso**: convierte 26 de 32 ítems en coincidencia exacta con el catálogo (`s1 = 1,000` por igualdad de cadena). Su 3,1% de revisión no es mérito del modelo: es el alias exacto. Por eso el nivel recomendado es el **3**, no el 4.
- El único falso positivo de bge-m3 en su mejor nivel es `POLLO VIVO KG` → `pollo_beneficiado` (s1=0,682, margen=0,083). Precisión de auto-aceptados **97%**, por debajo de la meta del plan (≥95% se cumple, pero con 1 error en 31).

### 4.2 Calibración de umbral (grilla 0,50–0,95 × 0,00–0,12, precisión de auto-aceptados = 100%)

| Modelo | Variante | τ* | margen* | confirmados | revisión |
|---|---|---:|---:|---:|---:|
| bge-m3 | crudo | 0,57 | 0,10 | 27/32 | 15,6% |
| bge-m3 | minus+tildes | 0,61 | 0,09 | 29/32 | 9,4% |
| bge-m3 | +abreviaturas | 0,61 | 0,09 | 29/32 | 9,4% |
| bge-m3 | +marca fuera | **0,69** | 0,00 | 30/32 | 6,2% |
| bge-m3 | +presentación fuera | 0,86 | 0,00 | 29/32 | 9,4% |
| embeddinggemma-2 | crudo | 0,73 | 0,05 | 28/32 | 12,5% |
| embeddinggemma-2 | minus+tildes | 0,75 | 0,03 | 29/32 | 9,4% |
| embeddinggemma-2 | +abreviaturas | 0,75 | 0,03 | 30/32 | 6,2% |
| embeddinggemma-2 | **+marca fuera** | **0,82** | 0,03 | 30/32 | 6,2% |
| embeddinggemma-2 | +presentación fuera | 0,90 | 0,06 | 30/32 | 6,2% |

**Esto es lo más importante del informe:** el `τ = 0,62` del plan **no es del producto, es del modelo**, y para estos dos modelos está mal:

- **bge-m3**: con τ=0,62 y margen=0,04 se cuela `POLLO VIVO` (0,682 / 0,083). Para tener 100% de precisión hay que subir a **τ≈0,69**.
- **embeddinggemma-2**: τ=0,62 deja pasar todo; necesita **τ≈0,82**. Su escala de coseno está comprimida hacia arriba (un texto que no tiene nada que ver, `DETERGENTE BOLIVAR`, puntúa **0,647**).
- En los dos casos el **margen** aporta menos de lo que el plan supone: el punto óptimo de bge-m3 es margen 0,00. La señal que separa es la magnitud de s1, no el hueco (con este catálogo de nombres distintos).

⚠️ Esta grilla es **indicativa sobre n=32**. El procedimiento del plan (calibrar sobre 60 ítems y reportar en 40) sigue siendo el correcto; lo que muestra esta tabla es que **hay que hacerlo por modelo** y que los valores de arranque no se pueden copiar.

### 4.3 Stress: el catálogo crece de 21 a 36 productos (+15 vecinos léxicos)

| Escenario | Modelo | Variante | acc@1 | prec.auto | revisión |
|---|---|---|---:|---:|---:|
| 21 prod / 30 ítems (base) | bge-m3 | +marca fuera | 100,0% | 97% | 6,2% |
| 36 prod / 30 ítems | bge-m3 | +marca fuera | 100,0% | 100% | 9,4% |
| 36 prod / 15 vecinos | bge-m3 | +marca fuera | 100,0% | 100% | 0,0% |
| 36 prod / 9 ítems con ruido OCR | bge-m3 | +marca fuera | 100,0% | 100% | 11,1% |
| 36 prod / 47 ítems (45 etiq.) | bge-m3 | +marca fuera | **100,0%** | 98% | 6,4% |
| 21 prod / 30 ítems (base) | embeddinggemma-2 | +marca fuera | 100,0% | 100% | 6,2% |
| 36 prod / 30 ítems | embeddinggemma-2 | +marca fuera | 100,0% | 100% | 6,2% |
| 36 prod / 15 vecinos | embeddinggemma-2 | +marca fuera | 100,0% | 100% | 6,7% |
| 36 prod / 9 ítems con ruido OCR | embeddinggemma-2 | +marca fuera | 100,0% | 100% | 11,1% |
| 36 prod / 47 ítems (45 etiq.) | embeddinggemma-2 | +marca fuera | **100,0%** | 98% | 6,4% |

**Cero errores de top-1 en 45 ítems con 36 productos, incluidos los 9 con ruido de OCR.** En el escenario ampliado `POLLO VIVO` se re-etiqueta como `pollo_vivo` (existe en el catálogo), así que la precisión vuelve a 100%: **el único error del experimento era de catálogo, no del modelo**.

Matriz de confusión: **vacía**. No hay errores que contar.

### 4.4 Separación en los pares que el plan marca como peligrosos

Esto es lo que la accuracy no muestra. `gap = s1 − s2` entre los dos productos que se confunden.

| Ítem | Correcto (s1) | Rival (s2) | gap | ¿Auto-confirma con margen 0,04? |
|---|---|---:|---:|---:|---|
| `JUREL KG` · **bge-m3** | jurel 0,804 | bonito 0,442 | **0,362** | sí, con holgura |
| `BONITO KG` · bge-m3 | bonito 0,809 | jurel 0,512 | **0,297** | sí |
| `PAPA BLANCA 1K` · bge-m3 | papa blanca 0,791 | papa amarilla 0,555 | **0,235** | sí |
| `PAPA AMARILLA KG` · bge-m3 | papa amarilla 0,873 | papa blanca 0,590 | **0,283** | sí |
| `ARROZ CORRIENTE 1K` · bge-m3 | arroz corriente 0,852 | arroz extra 0,647 | 0,205 | sí |
| `JUREL KG` · **gemma** | jurel 0,763 | bonito 0,690 | **0,074** | sí, pero **al límite** |
| `BONITO KG` · gemma | bonito 0,870 | jurel 0,714 | 0,155 | sí |
| `PAPA BLANCA 1K` · gemma | papa blanca 0,818 | papa amarilla 0,758 | **0,060** | sí, pero **al límite** |
| `PAPA AMARILLA KG` · gemma | papa amarilla 0,832 | papa blanca 0,776 | **0,056** | sí, pero **al límite** |
| `ARROZ CORRIENTE 1K` · gemma | arroz corriente 0,889 | arroz extra 0,836 | 0,053 | sí, al límite |

**bge-m3 separa jurel/bonito con 0,30–0,36 de holgura. embeddinggemma-2 lo hace con 0,074** — un 80% menos de margen, sobre un umbral de 0,04. Con un ítem redactado un poco distinto ("JUREL ENT 1K" en vez de "JUREL KG"), gemma puede quedar del lado equivocado del margen. Es el argumento decisivo, y es medido, no una impresión.

### 4.5 Ruido OCR

Los 9 ítems con daño de lectura (`PAPA BLANCA IRA`, `ACEITE PRIMOR IL`, `AZUCAP RUBIA KG`, `ZANAH.` con espacio intruso, etc.) se clasificaron **9/9 bien en ambos modelos**, aunque con más revisión (11,1% en bge-m3, frente a 0% sin ruido). El embedding tolera el error de un carácter; lo que no tolera es que la palabra sea otra.

---

## 5. Rendimiento

Medido con `--latencia`: se descarga el modelo de VRAM (`keep_alive: 0`), se mide la primera llamada (fría) y después 32 llamadas de un ítem cada una, más un lote de 10 (una boleta).

| Modelo | Frío (carga incluida) | `load_duration` | p50/ítem | p90/ítem | Lote de 10 | RAM/VRAM | Procesador |
|---|---:|---:|---:|---:|---:|---:|---|
| bge-m3 | **1,78 s** | 1,71 s | **84,3 ms** | 105,1 ms | **462,7 ms** | **689,2 MB** | **100% GPU** |
| embeddinggemma-2-bf16 | **2,12 s** | 2,01 s | **89,2 ms** | 105,3 ms | **475,9 ms** | **508,7 MB** | **100% GPU** |

**Sí, la primera llamada incluye la carga del modelo.** Se ve en `load_duration`: 1,70 s y 2,01 s respectivamente, y coincide con el tiempo total de la llamada fría. Las llamadas siguientes no recargan (Ollama mantiene el modelo 5 min por defecto).

**Estabilidad:** se corrió tres veces en la misma sesión y la latencia se movió entre 55 y 90 ms por ítem suelto (lote de 10 entre 271 y 476 ms). Esta máquina tiene otras cargas, así que el número honesto es **rango, no un valor único**: **p50 ≈ 55–90 ms/ítem, y 27–48 ms/ítem cuando van en lote de 10**.

**Desglose de dónde va el tiempo:** una llamada HTTP de un solo ítem en localhost tiene ~10–20 ms de overhead (JSON + urllib). El lote de 10 tarda ~4–5× una llamada individual, no 10×: el costo fijo se amortiza. Para el caso real (1 boleta = 10 ítems = 1 lote) el número que vale es **≈0,3–0,5 s por boleta**.

🔶 **CPU**: no medido. Ollama decide solo dónde correr el modelo y en esta máquina eligió GPU al 100% (`size_vram == size`). Para forzar CPU habría que reiniciar el servicio con otra configuración, y eso afecta al resto de los modelos del usuario. Estimación marcada como tal: bge-m3 (567M, XLM-R) en un i7 de 8 núcleos debería dar **5–15× más lento → 2–5 s por boleta de 10 ítems**; en un VPS de 2 vCPU, peor. Eso sigue siendo aceptable para 100 facturas/mes, pero hay que medirlo en el VPS antes de prometerlo.

---

## 6. Limitaciones de este experimento

1. **n=32 / n=47, no n=100.** El plan calibra con 60 y reporta con 40. Estas métricas son indicativas; la accuracy del 100% **no se generaliza** a un catálogo real de 200+ productos con nombres de proveedores locales.
2. **Texto sintético, no boletas reales.** No hay letra térmica, ni papel curveado, ni truncamientos del ticket. Los ítems de ruido OCR son una aproximación, no la distribución real de errores de Tesseract/Moondream.
3. **Catálogo curado por mí.** Los alias los escribí yo con conocimiento del set de prueba. En producción los alias los aprueba una persona mirando la boleta, y esa cobertura será peor al principio.
4. **Solo 2 modelos.** Faltan `nomic-embed-text` (274 MB, el más liviano probado sería interesante) y `mxbai-embed-large`. No se bajaron por la regla de "uno solo".
5. **Un solo idioma de prueba**: español peruano de mercado. No se probó quechua ni aimara, que el plan sí menciona como posibilidad.
6. **La latencia incluye la variabilidad de la máquina** (otras cargas). No es un benchmark reproducible al milisegundo.

---

## 7. Veredicto

### ¿Ollama sirve para el prototipo? **Sí.**

- Corre en esta PC sin instalar nada raro, en GPU, con **~0,3–0,5 s por boleta de 10 ítems** y 690 MB de VRAM. Es más rápido y más privado que ir a Cloudflare para el *embedding*.
- La calidad del ranking es **suficiente con holgura**: 100% de acc@1 en 45 ítems con 36 productos, incluidos los pares que el plan marca como trampa (jurel/bonito, blanca/amarilla, corriente/extra) y 9 ítems con ruido de OCR.
- **No reemplaza al VLM.** Ollama resuelve el paso 6–7 del pipeline (embedding + búsqueda), no el paso 2 (leer la boleta). Para leer la foto hace falta un modelo de visión aparte; los `qwen3.5` instalados tienen visión pero no se probaron acá y no es el alcance de este experimento.

### ¿Cuál modelo y con qué umbral?

**bge-m3, normalización nivel 3 (crudo → minúsculas + tildes fuera + abreviaturas + marcas fuera), τ≈0,69, margen 0,04, piso 0,45.**

Razones, en orden:

1. **Es el mismo modelo que el plan pone en producción y en Cloudflare** (`@cf/baai/bge-m3`). Mismos 1024 dim → los vectores del VPS y los del prototipo son **comparables**, y `vector(1024)` en pgvector no cambia entre prototipo y producción. Con `embeddinggemma-2` (768) habría dos migraciones de columna y dos re-embeddings.
2. **Separa los pares difíciles 4–6× mejor**: gap 0,235–0,362 contra 0,053–0,074 de gemma. Sobre un margen de 0,04, eso es la diferencia entre "confío" y "estoy adivinando".
3. **Su escala de coseno es interpretable**: un ítem sin relación puntúa 0,472, por debajo del piso 0,45 (apenas) y muy por debajo de τ. En gemma el mismo ítem puntúa 0,647, o sea que **τ=0,62 y piso=0,45 son inútiles con ese modelo**: todo pasa el filtro y la decisión depende solo del margen.
4. Es 1024 dim (mejor que 768 para un catálogo que va a crecer) y pesa 1,2 GB en disco, 690 MB en VRAM.

**Ajuste obligatorio al plan:** el `τ = 0,62` de arranque **debe subir a ~0,69 con bge-m3**, porque con 0,62 se auto-confirma `POLLO VIVO` como `pollo_beneficiado`. Y el margen de 0,04, con este catálogo, no aporta: el punto óptimo medido es margen 0,00. Recomiendo **mantener el margen** (con catálogos grandes sí va a separar) pero **no confiar en él como única puerta**.

### ¿Qué NO resuelve?

| No resuelve | Evidencia medida |
|---|---|
| **La ausencia en el catálogo** | `POLLO VIVO KG` → `pollo_beneficiado` con s1=0,682 y margen 0,083: **se auto-confirma un producto que no existe en el catálogo**. El embedding no tiene noción de "esto no está". Se arregla con catálogo (al agregar `pollo_vivo` el error desaparece), no con umbral |
| **Marcas** | `ACEITE PRIMOR 1L` funciona porque el genérico está en el catálogo. `SAL ECOMUSA 1K` acierta por la palabra `sal`: la marca no aporta nada. El embedding **nunca** debe decidir la marca (el plan ya lo dice en §4.5); acá se confirma: `PRIMOR` y `ECOMUSA` no mueven el resultado |
| **jurel vs bonito, blanca vs amarilla** | **Sí los resuelve** con este catálogo y este tamaño. Pero con gemma el margen es 0,056–0,074, o sea que el acierto depende de que el texto sea casi el mismo; no es robusto. Con bge-m3 sí lo es |
| **La calidad del alias exacto** | `JUREL FRESCO KG` quedó en `por_revisar` con bge-m3 (margen 0,035) porque el alias `jurel fresco` no está en el catálogo. **Cada alias aprobado vale más que cualquier ajuste de umbral**: el paso 5 (alias exacto) resuelve con confianza 1,0 y costo 0 |
| **Un ítem sin ningún parecido léxico** | No probado. `DETERGENTE BOLIVAR` se detuvo en `por_revisar` (0,472 / margen 0,025), que es el comportamiento correcto, pero fue con suerte: el piso 0,45 está a 0,02 de distancia |

### ¿Y para producción en la PC de cómputo?

🔶 **Sí, con reservas, y hay que medirlo ahí.**

- Lo que corre en producción según el plan son **~100 facturas/mes ≈ 1.000 ítems/mes**. Aun con una CPU 10× más lenta que esta GPU, eso son **~2–5 s por boleta de 10 ítems, una vez al día**. Irrelevante.
- bge-m3 pesa **1,2 GB en disco y ~690 MB en RAM** al correr. Cualquier PC con 4 GB libres lo aguanta. **No necesita GPU.**
- **Ojo con el paso que falta**: el embedding es la parte barata. Si la PC de cómputo no corre un VLM, la lectura de la boleta sigue siendo el cuello de botella (Tesseract/PaddleOCR + reglas, o visión en la nube). Este experimento **no** dice nada sobre la lectura.
- **Recomendación operativa**: instalar `bge-m3` en la PC de cómputo con `OLLAMA_KEEP_ALIVE=-1` (o un `systemd` que lo precargue) para que nadie pague los 1,8 s de carga en la primera boleta del día. Medir el p50 real en esa máquina antes de prometer latencia en el pitch.

---

## 8. Cómo reproducir

```powershell
cd C:\Users\GAMA\FilesForDev\Github\_hackods-plan\experimentos\ollama

# todo (modelos instalados, 5 niveles, stress y rendimiento)
$env:PYTHONIOENCODING="utf-8"; python probar.py --latencia --json resultados.json

# solo bge-m3, solo nivel 3
python probar.py --modelos bge-m3 --variantes 3

# si algún día se quiere comparar nomic-embed-text (274 MB), el script lo baja solo:
python probar.py --modelos nomic-embed-text
```

Requisitos: Python 3.11 + `numpy` (ya están en esta máquina). **No** usa el paquete `ollama`: habla `http://127.0.0.1:11434/api/embed` con `urllib`. No instala nada.

Archivos:

| Archivo | Qué es |
|---|---|
| `dataset.json` | catálogo de 21 productos con alias + 32 ítems (30 etiquetados, 2 negativos) |
| `vecinos.json` | stress: 15 productos vecinos + 15 ítems + 9 con ruido OCR |
| `probar.py` | el experimento; imprime todas las tablas de este documento |
| `resultados.json` | números crudos de la última corrida |
| `salida.txt` | stdout completo de la última corrida |
| `resultados.md` | este documento |
