# compute de pruebas

Servicio HTTP local de **una sola máquina** para que un tercero pruebe tres cosas del proyecto:
**embeddings**, **transcripción** y **OCR**. Es del issue #64.

No es la app: no importa nada de `apps/` ni de `packages/`, no escribe en IndexedDB, no habla con
Supabase y no sabe qué es una olla. Es un banco de pruebas con una URL pública temporal y un token.

## Qué hace y qué no hace

| Hace | No hace |
|---|---|
| `bge-m3` por Ollama → vectores de 1024 dimensiones normalizados L2 | No clasifica ni decide nada: devuelve números |
| faster-whisper transcribe audio wav/webm en español (o el idioma que detecte) | No diariza, no traduce, no separa hablantes |
| OCR de una imagen de comprobante con Tesseract **o** un modelo de visión de Ollama | No corrige precios ni valida contra el dominio |
| Nada se guarda: los temporales se borran en el mismo pedido | No hay base, no hay historial, no hay logs de contenido |

## Requisitos (los de esta máquina, ya instalados)

- **Node 22** (el repo ya exige `>= 22`). El servicio usa sólo `http`, `child_process` y `fetch`: cero dependencias nuevas.
- **Ollama** en `http://127.0.0.1:11434` con `bge-m3` (`ollama pull bge-m3`). El OCR por visión necesita además un modelo con capacidad `vision`; acá es `qwen3.5:4b`.
- **Python** con `faster-whisper`. El modelo es `small` (~460 MB, se descarga la primera vez en `%USERPROFILE%\.cache\huggingface\hub`). Usa CUDA con `float16` si puede y cae a CPU con `int8` si no.
- **cloudflared** para el túnel (`winget install --id Cloudflare.cloudflared`).
- **Tesseract** es opcional: si está en el `PATH` se usa primero. En esta máquina **no** está.

## Arrancar y parar

```powershell
# servicio en 127.0.0.1:4400 + túnel de Cloudflare
powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/arrancar.ps1

# sin túnel (sólo local)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/arrancar.ps1 -SinTunel

# bajar todo
powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/parar.ps1

# el túnel solo, o uno nuevo explícito (cambia la URL)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/tunel.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/tunel.ps1 -Reiniciar
```

Los tres scripts son **idempotentes**: si `/health` ya responde, `arrancar.ps1` no levanta un segundo
proceso; si ya hay un `cloudflared` apuntando al 4400, `tunel.ps1` no crea otro y sólo imprime la URL
guardada. `parar.ps1` sin nada corriendo sale con 0.

La URL pública queda en `tools/compute/tunel-url.txt` (gitignored). Los logs, en
`tools/compute/servicio.log` y `tools/compute/tunel.err.log`.

## El token

Todo menos `GET /` pide `Authorization: Bearer <token>`.

- Vive en **`tools/compute/.token`** (gitignored) o en la variable de entorno `COMPUTE_TOKEN`, que gana si está.
- Se genera solo, con 32 bytes al azar, la primera vez que arranca el servicio.
- **No se imprime nunca**: ni acá, ni en el PR, ni en los logs. Quien lo necesite lo pide a quien
  administra la máquina y lo lee de ese archivo.
- Para usarlo en la consola sin escribirlo a mano:

```powershell
$COMPUTE_TOKEN = (Get-Content tools/compute/.token -Raw).Trim()
$BASE = 'https://<tu-url>.trycloudflare.com'   # o http://127.0.0.1:4400 en local
```

## Endpoints

### `GET /health`

```bash
curl -s -H "Authorization: Bearer $COMPUTE_TOKEN" $BASE/health
```

```json
{
  "ok": true,
  "version": "1.0.0",
  "embed": { "modelo": "bge-m3", "dim": 1024, "cargado": true },
  "asr": { "modelo": "small", "cargado": true },
  "ocr": { "motor": "ollama:qwen3.5:4b", "disponible": true },
  "uptime": 237
}
```

`cargado` no es optimismo: `embed` mira `/api/tags` de Ollama, `asr` mira que `model.bin` exista y
pese más de 0 bytes en la caché de Hugging Face, y `ocr` mira el `PATH` y `/api/show`.

### `POST /embed`

```bash
curl -s -X POST -H "Authorization: Bearer $COMPUTE_TOKEN" -H "Content-Type: application/json" \
  -d '{"textos":["arroz extra 5kg","pollo entero","detergente"]}' $BASE/embed
```

Devuelve `{vectores, dim: 1024, modelo, normalizado: true}`. Límites: 1 a 64 textos, 512 caracteres
cada uno, cuerpo de hasta 256 KB. Los vectores se normalizan L2 acá (norma `1.000000` verificada),
así que el producto punto es directamente el coseno.

### `POST /transcribe`

```bash
curl -s -X POST -H "Authorization: Bearer $COMPUTE_TOKEN" -H "Content-Type: audio/wav" \
  --data-binary @audio.wav $BASE/transcribe
```

Acepta `audio/wav` y `audio/webm`, hasta **8 MB** y **120 s**. Devuelve `{texto, idioma, duracionS,
segmentos, confianzaMedia: null, motor, dispositivo}`. `confianzaMedia` es `null` **a propósito**:
faster-whisper no da una confianza calibrada y poner un número inventado sería peor que no ponerlo.
El parámetro opcional `?idioma=es` fuerza el idioma; sin él se detecta.

### `POST /extract`

```bash
curl -s -X POST -H "Authorization: Bearer $COMPUTE_TOKEN" -H "Content-Type: image/png" \
  --data-binary @"boleta.png" $BASE/extract
```

Acepta `image/png` y `image/jpeg`, hasta **4 MB**. Devuelve `{items:[{linea, descripcion,
cantidadTexto, unidadTexto, precioUnitarioTexto, totalLineaTexto}], confianza, motor}`.

Si no hay motor devuelve **501** `{codigo: 'OCR_NO_DISPONIBLE', message, instruccion}` — nunca texto
inventado. `confianza` es un promedio real (0 a 1) con Tesseract y `null` con visión, porque un modelo
generativo no da confianza calibrada.

## Prueba real hecha en esta máquina

Salidas reales, no de ejemplo. Las de "por el túnel" son contra
`https://immediate-olympic-tattoo-howard.trycloudflare.com` (URL de un túnel rápido: si está muerta,
`arrancar.ps1` levanta otro túnel y da una nueva).

### `/health`

```
local   GET /health → 200 (115 ms)   ok:true, embed.cargado:true, asr.cargado:true, ocr:ollama:qwen3.5:4b
túnel   GET /health → 200 (826 ms)   ok:true, embed.cargado:true, asr.cargado:true, ocr:ollama:qwen3.5:4b
túnel   GET /health sin token → 401  {"codigo":"SIN_TOKEN",...}
```

### `/embed` — dimensión y normalización

```
dim: 1024 · normalizado: true · cantidad: 3
norma L2 de cada vector: 1.000000, 1.000000, 1.000000   (local y por el túnel)
```

Similitudes con los tres textos del pedido, **tal como salieron**:

| par | coseno |
|---|---|
| "arroz extra 5kg" ~ "pollo entero" | **0.4358** |
| "arroz extra 5kg" ~ "detergente" | **0.4418** |
| "pollo entero" ~ "detergente" | 0.4324 |

Ojo con esto, porque no es lo que uno espera: con **dos palabras sueltas** el orden se da vuelta
(detergente queda 0,006 arriba de pollo) y los tres pares caen en una banda de 0,43. No es un bug del
servicio ni del modelo instalado (`bge-m3` está completo, `F16`, 1024 dimensiones): es cómo se comporta
un modelo denso con sustantivos sin contexto, donde pesa más la dirección común "producto de bodega"
que el significado. Con una frase mínima el orden esperado aparece en el mismo modelo:

| par (con contexto) | coseno |
|---|---|
| "arroz extra de cinco kilos para la olla común" ~ "pollo entero para el almuerzo de la olla" | **0.4960** |
| "arroz extra de cinco kilos para la olla común" ~ "detergente en polvo para lavar la ropa" | **0.3710** |
| "El arroz se compró en la bodega" ~ "El pollo se compró en el mercado" | **0.6690** |
| "El arroz se compró en la bodega" ~ "La lejía sirve para desinfectar" | **0.3258** |

Para quien consuma el endpoint: mandá el ítem con algo de contexto, no dos palabras, y no esperes
que un umbral fijo tipo 0,7 separe productos con bge-m3 sin normalizar contra un corpus.

### `/transcribe`

Audio de 5,96 s generado con SAPI (`Microsoft Helena Desktop`, es-ES), 257 KB de wav:

```
local  POST /transcribe → 200 (11681 ms)  dispositivo: cuda
túnel  POST /transcribe → 200 ( 8466 ms)  dispositivo: cuda

"En la olla común compramos arroz extra de 5 kilos y pollo entero para el almuerzo de hoy."
idioma: "es" · duracionS: 5.96 · segmentos: 1 (0.00 → 5.12) · confianzaMedia: null
```

### `/extract`

PNG de 14,4 KB generado con `System.Drawing`, cuatro líneas impresas:

```
local  POST /extract → 200 (56357 ms en frío, 41456 ms en tibio)
túnel  POST /extract → 200 (40155 ms)
motor: ollama:qwen3.5:4b · confianza: null
```

```json
{"items":[
  {"linea":"ARROZ EXTRA 5KG 24.50","descripcion":"arroz extra 5kg","cantidadTexto":"5","unidadTexto":"kg","precioUnitarioTexto":null,"totalLineaTexto":"24.50"},
  {"linea":"POLLO ENTERO KG 14.00","descripcion":"pollo entero kg","cantidadTexto":null,"unidadTexto":"kg","precioUnitarioTexto":null,"totalLineaTexto":"14.00"},
  {"linea":"DETERGENTE 1UN 9.90","descripcion":"detergente 1un","cantidadTexto":"1","unidadTexto":"un","precioUnitarioTexto":null,"totalLineaTexto":"9.90"}
]}
```

Leyó las tres líneas de productos con sus precios y **no inventó** la cuarta línea de la imagen
(`BODEGA SAN JUAN`, que no tiene números: el modelo no la devolvió como ítem). Tarda ~40 s por imagen
en esta máquina: es un modelo de 4 mil millones de parámetros, no un OCR clásico. El servicio corta a
los 120 s.

### El 501 cuando no hay motor

Tesseract no está instalado acá, así que el OCR sale por visión. Para probar el camino honesto se
levantó una segunda instancia (`COMPUTE_PORT=4401`, `OLLAMA_URL` apuntando a un puerto muerto), que es
exactamente una máquina sin ningún motor:

```
GET /health → 200  {"ok":false,...,"ocr":{"motor":null,"disponible":false}}
POST /extract → 501
{"codigo":"OCR_NO_DISPONIBLE",
 "message":"No hay motor de OCR en esta máquina. Instalá Tesseract o un modelo de visión en Ollama y volvé a probar.",
 "instruccion":[
   "Opción A (Tesseract): winget install --id UB-Mannheim.TesseractOCR, después abrí una consola nueva y rearrancá el servicio.",
   "Opción B (visión): ollama pull qwen3.5:4b, después rearrancá el servicio para que lo detecte."]}
```

## Seguridad, en corto

- Escucha **sólo en `127.0.0.1`**: el único camino desde afuera es el túnel de Cloudflare, y Ollama nunca se expone.
- Un token de 32 bytes, comparado con `timingSafeEqual` sobre el SHA-256 (no se comparan strings a mano).
- Límites de cuerpo antes de leer: 256 KB / 8 MB / 4 MB, y de tiempo por pedido (60 s embed, 180 s audio, 120 s OCR).
- Los temporales van a `%TEMP%\compute-pruebas` y se borran en el `finally` del mismo pedido.
- El log es una línea por pedido: método, ruta, estado y milisegundos. Nunca el contenido, nunca el token.
- Sin persistencia: no hay base, ni archivos de salida, ni caché de resultados.

## Archivos

```
tools/compute/
├── servicio.mjs     el HTTP: rutas, token, límites, detección de motores
├── transcribir.py   faster-whisper → JSON de una línea (lo llama servicio.mjs)
├── arrancar.ps1     servicio + túnel, idempotente
├── parar.ps1        baja servicio y túnel, idempotente
├── tunel.ps1        un solo cloudflared hacia 127.0.0.1:4400
├── .gitignore       .token, *.pid, *.log, tunel-url.txt
└── LEEME.md         esto
```
