# 11 · Ollama como proveedor de embeddings (experimento local)

**Proyecto:** hackODS-Autónoma 2026 · PWA para ollas comunes del Perú
**Base:** `08-clasificacion-productos.md` (§1.3 `EmbeddingsPort`, §4.3 umbrales, §3.1 opción VPS con Ollama)
**Fecha:** 2026-11-23 · **Dónde:** esta PC de desarrollo (Windows, i7-11700F, 32 GB RAM, RTX 4070 Ti SUPER 16 GB)
**Evidencia completa:** `../historical/experimentos-ollama/ollama/resultados.md` (todas las tablas, comandos y salidas reales; el directorio es histórico)

**Regla de este documento:** ✅ medido en esta máquina · 🔶 estimado, hay que medirlo en el destino · ⚠️ decisión de diseño.

---

## 0. Resumen ejecutivo

| Pregunta | Respuesta |
|---|---|
| ¿Ollama sirve para el prototipo? | ✅ **Sí**, para el paso de *embedding* (§1.1 pasos 6–7). No para leer la boleta |
| Modelo | **`bge-m3`** (1,2 GB, 567m, 8K contexto, **1024 dim**) |
| Normalización | **Nivel 3**: NFKC + minúsculas + tildes fuera + abreviaturas + marcas fuera. **No** nivel 4 (quitar presentación) |
| Umbral | **τ ≈ 0,69** con bge-m3 (el 0,62 del plan deja pasar un falso positivo). Margen 0,04 y piso 0,45 se mantienen |
| accuracy@1 | ✅ **100,0%** (45 ítems etiquetados, catálogo de 36 productos, incluidos 9 con ruido de OCR) |
| Precisión de auto-aceptados | ✅ **97–100%** según variante; el único error fue de **catálogo**, no del modelo |
| Latencia | ✅ **≈0,3–0,5 s por boleta de 10 ítems** en GPU; p50 55–90 ms por ítem suelto. Frío 1,8 s (carga del modelo) |
| RAM / VRAM | ✅ **689 MB** en VRAM, 100% GPU. En CPU corre sin GPU 🔶 |
| Producción en la PC de cómputo | 🔶 **Sí** (1,2 GB disco, ~690 MB RAM, sin GPU, ~100 facturas/mes), medir el p50 ahí antes de prometer latencia |

---

## 1. Qué se probó (y qué no)

`ollama --version` → **0.40.6**, servicio OK en `127.0.0.1:11434`.

Modelos de **embedding** disponibles hoy en la librería de Ollama: **14** ✅ (`ollama.com/search?c=embedding`). Los relevantes y su tamaño real de descarga:

| Modelo | Parámetros | Descarga | Dim | Nota |
|---|---:|---:|---:|---|
| `bge-m3` | 567m | 1,2 GB | **1024** | **el del plan** (`@cf/baai/bge-m3`), multilingüe 100+ |
| `embeddinggemma-2` | 270m–740m | 557 MB (bf16) | 768 | multimodal, ya estaba instalado |
| `nomic-embed-text` | 137m | **274 MB** | 768 | el más popular; no se probó |
| `mxbai-embed-large` | 335m | — | 1024 | sin foco multilingüe; no se probó |
| `snowflake-arctic-embed` / `-embed2` | 22m–568m | — | 384–1024 | no se probó |
| `all-minilm` | 22m | — | 384 | el más chico |
| `qwen3-embedding` | 0.6b / 4b / 8b | — | 1024+ | pesado |

**Probados: 2** — `bge-m3` (descargado en este experimento: **1,2 GB a ~118 MB/s ≈ 10 s**) y `embeddinggemma-2-bf16` (ya instalado). No se bajó ninguno más: la regla era uno solo. `nomic-embed-text` se puede agregar en un minuto con `python probar.py --modelos nomic-embed-text` (el script lo descarga solo).

**Set de prueba (ficticio, cero datos reales):** 21 productos de olla común con alias + 32 ítems de boleta peruana (30 etiquetados + 2 negativos a propósito), más un stress set de 15 productos vecinos léxicos y 9 ítems con ruido de OCR.

⚠️ **Corrección metodológica que quedó documentada:** la primera corrida daba coseno **1,000** en casi todos los ítems porque los alias del catálogo coincidían literalmente con los textos de prueba. Se reescribieron para que el s1 alto viniera de la semántica y no de una igualdad de cadena; el script ahora reporta cuántos ítems resuelve el **alias exacto** en vez del modelo. Sin esa corrección el experimento habría "demostrado" un 100% que no medía nada.

---

## 2. Resultados que importan

### 2.1 Ranking: los dos modelos aciertan todo

acc@1 = **100,0%** con bge-m3 y con embeddinggemma-2, en los 5 niveles de normalización, en los 14 ítems marcados difíciles, en el catálogo ampliado a 36 productos y en 9 ítems con ruido de OCR. **Cero errores de top-1 en 45 ítems.** La matriz de confusión está vacía.

Esto tiene una lectura doble: ✅ el ranking sirve, ⚠️ y con un catálogo de nombres distintos **la accuracy no discrimina entre modelos**. Para elegir hay que mirar otra cosa.

### 2.2 Lo que sí discrimina: la normalización cambia la **revisión**, no la accuracy

| Modelo | Variante | acc@1 | auto-confirmados | revisión | prec. auto |
|---|---|---:|---:|---:|---:|
| bge-m3 | crudo | 100% | 22/32 | 31,2% | 95% |
| bge-m3 | +marca fuera | 100% | 30/32 | **6,2%** | 97% |
| embeddinggemma-2 | crudo | 100% | 30/32 | 6,2% | 97% |
| embeddinggemma-2 | +marca fuera | 100% | 30/32 | **6,2%** | 100% |

**La normalización es lo que convierte "hay candidato" en "se puede confirmar".** En bge-m3 baja la revisión de 31,2% a 6,2% sin tocar la accuracy: sube las similitudes, no el orden. Es el paso más barato del pipeline y el que más rinde.

⚠️ **Nivel 4 (quitar presentación) es una trampa de medición**: deja 26 de 32 ítems idénticos a una entrada del catálogo (`s1 = 1,000` por igualdad de cadena). Su 3,1% de revisión no es mérito del embedding, es el alias exacto. **El nivel recomendado es el 3.**

### 2.3 La separación en los pares difíciles es el argumento decisivo

`gap = s1 − s2` entre los dos productos que se confunden:

| Ítem | bge-m3 (gap) | embeddinggemma-2 (gap) |
|---|---:|---:|
| `JUREL KG` → jurel vs bonito | **0,362** | 0,074 |
| `BONITO KG` → bonito vs jurel | **0,297** | 0,155 |
| `PAPA BLANCA 1K` → blanca vs amarilla | **0,235** | 0,060 |
| `PAPA AMARILLA KG` → amarilla vs blanca | **0,283** | 0,056 |
| `ARROZ CORRIENTE 1K` → corriente vs extra | 0,205 | 0,053 |

bge-m3 separa **4–6× mejor** los pares que el plan marca como peligrosos. Con un margen de 0,04, los 0,053–0,074 de gemma son el filo de la navaja: un ítem redactado un poco distinto lo cruza.

### 2.4 Los umbrales del plan no son del producto, son del modelo

| Modelo | τ para precisión 100% | margen óptimo | revisión resultante |
|---|---:|---:|---:|
| bge-m3 (+marca fuera) | **0,69** | 0,00 | 6,2% |
| embeddinggemma-2 (+marca fuera) | **0,82** | 0,03 | 6,2% |

- Con `τ = 0,62` **bge-m3 auto-confirma `POLLO VIVO KG` como `pollo_beneficiado`** (0,682 / margen 0,083). Es el único falso positivo del experimento.
- `embeddinggemma-2` tiene el coseno **comprimido hacia arriba**: un texto sin relación (`DETERGENTE BOLIVAR`) puntúa **0,647**. Con el umbral de arranque y piso=0,45 **nada quedaría fuera**: la decisión dependería solo del margen.
- El **margen 0,04** aporta menos de lo que el plan supone con este catálogo (el óptimo medido es 0,00). Se mantiene porque con 200 productos sí va a separar, pero **no debe ser la única puerta**.

⚠️ Grilla medida sobre n=32: **indicativa**. El procedimiento de §4.3 (calibrar con 60, reportar con 40) sigue siendo el correcto; lo que este experimento agrega es que **hay que calibrar por modelo** y que los valores de arranque no se copian entre modelos.

### 2.5 Rendimiento (GPU, esta máquina)

| | bge-m3 | embeddinggemma-2 |
|---|---:|---:|
| Frío, carga incluida | **1,78 s** (`load_duration` 1,71 s) | 2,12 s |
| p50 ítem suelto | 84,3 ms (rango 55–90 en 3 corridas) | 89,2 ms |
| p90 | 105,1 ms | 105,3 ms |
| **Lote de 10 = 1 boleta** | **462,7 ms** (rango 271–476) | 475,9 ms |
| VRAM / procesador | **689,2 MB · 100% GPU** | 508,7 MB · 100% GPU |

La primera llamada **sí** incluye la carga: se ve en `load_duration` (1,7 s) y en que el total frío coincide. Después Ollama mantiene el modelo en memoria 5 min.

🔶 **CPU no medido**: Ollama eligió GPU al 100% (`size_vram == size`) y forzar CPU exigía reiniciar el servicio del usuario. Estimación: **5–15× más lento → 2–5 s por boleta** en un i7, peor en un VPS de 2 vCPU. Suficiente para 1.000 ítems/mes, pero **hay que medirlo en el destino**.

---

## 3. Veredicto

✅ **Ollama sirve para el prototipo y para producción, en el rol de embeddings.** Es más rápido, más barato (0 por ítem) y más privado que la nube para este paso, y la calidad del ranking es suficiente con holgura en el set probado.

**Configuración recomendada:**

```
modelo      bge-m3            (1024 dim · 1,2 GB · mismos vectores que @cf/baai/bge-m3)
normalizar  NFKC · minúsculas · tildes fuera · abreviaturas · marcas fuera   (nivel 3)
τ           0,69              (NO 0,62: deja pasar POLLO VIVO)
margen      0,04              (se mantiene; aporta poco con 21 productos, sí con 200)
piso        0,45
```

**Por qué bge-m3 y no embeddinggemma-2** (que también acierta todo): mismas 1024 dim que el plan y que Cloudflare — sin migración de columna ni re-embedding al pasar de prototipo a VPS; separa los pares difíciles 4–6× mejor; y su escala de coseno es interpretable (un ítem ajeno puntúa 0,47, no 0,65), así que τ y piso significan algo.

### Qué NO resuelve

1. **La ausencia del catálogo.** `POLLO VIVO KG` → `pollo_beneficiado` (0,682) se auto-confirma. El embedding no tiene noción de "esto no está". **Se arregla con catálogo** (al agregar `pollo_vivo` el error desaparece y la precisión vuelve a 100%), no con umbrales. Refuerza D8 y §5.4: el ítem desconocido necesita su propio camino.
2. **Las marcas.** `ACEITE PRIMOR` y `SAL ECOMUSA` aciertan por el genérico (`aceite`, `sal`); la marca no aporta. Confirma §4.5: **el embedding nunca decide la marca**, se extrae aparte por diccionario.
3. **La cobertura de alias.** `JUREL FRESCO KG` quedó en `por_revisar` (margen 0,035) porque el alias `jurel fresco` no existía. **Cada alias aprobado vale más que cualquier ajuste de umbral**: el paso 5 resuelve con confianza 1,0 y costo 0. El trabajo de curación de §5.2 tiene retorno directo y medible.
4. **Leer la boleta.** Esto es solo el paso 6–7. Sin VLM u OCR no hay texto que embeber. El cuello de botella sigue siendo la extracción (2–8 s y la calidad de lectura), no el embedding.

### Qué cambiaría en `08-clasificacion-productos.md`

| Dónde | Ahora dice | Debería decir |
|---|---|---|
| §4.3 valores de arranque | `τ = 0,62` | ✅ **`τ = 0,69` para bge-m3** (0,62 auto-confirma un producto inexistente); recalibrar por modelo, nunca copiar |
| §4.3 "el umbral es del modelo" | ya lo dice | ✅ confirmado y cuantificado: misma tarea, τ 0,69 vs 0,82 entre dos modelos |
| §1.4 normalización | lista los pasos | ✅ medido: la normalización **no cambia la accuracy, cambia la tasa de revisión** (31,2% → 6,2%). Y **no hay que quitar la presentación** (nivel 4): produce igualdades triviales |
| §5.2 curación de alias | "es gobernanza" | ✅ es además **la palanca de precisión más barata**: un alias faltante manda a revisión un ítem que el modelo tenía bien |
| §3.1 opción VPS con Ollama | "bge-m3 corre en CPU, 1,2 GB" | ✅ con números: **689 MB en VRAM, 0,3–0,5 s por boleta en GPU**, 1,8 s de carga fría. En CPU 🔶 2–5 s/boleta |
| §5.4 producto desconocido | el dinero es real | ✅ ahora con evidencia: **el embedding va a confirmar un producto parecido que no existe**; el estado `desconocido` necesita un camino propio, no confiar en el umbral |

---

## 4. Reproducir

```powershell
cd C:\Users\GAMA\FilesForDev\Github\_hackods-plan\experimentos\ollama
$env:PYTHONIOENCODING="utf-8"; python probar.py --latencia --json resultados.json
```

Python 3.11 + numpy, sin el paquete `ollama` (usa `/api/embed` con `urllib`). No instala nada salvo que se le pida otro modelo con `--modelos`, en cuyo caso hace el `pull`.

| Archivo | Qué es |
|---|---|
| `dataset.json` | 21 productos con alias + 32 ítems (30 etiquetados + 2 negativos) |
| `vecinos.json` | stress: 15 productos vecinos + 15 ítems + 9 con ruido OCR |
| `probar.py` | el experimento completo |
| `resultados.md` | tablas, comandos y salidas reales |
| `resultados.json` · `salida.txt` | números crudos y stdout de la última corrida |

**Limitaciones declaradas:** n=32 (indicativo, no definitivo), texto sintético (no boletas térmicas reales), catálogo curado por el autor del test, solo 2 modelos, solo español peruano, latencia con la variabilidad de una máquina de trabajo.
