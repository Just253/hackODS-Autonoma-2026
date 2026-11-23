# Contrato — Ingesta (`POST /functions/v1/ingest`)

> Tablas: `supabase/migrations/20261123196000_ingesta.sql` (`public.captura`,
> `public.captura_item`, bucket `capturas`). Función: `supabase/functions/ingest/index.ts`.
> Decisión: `docs/adr/0011-ingesta.md`. Lógica pura: `packages/domain/src/ingesta.ts`.
> Schemas de compute reutilizados: `packages/contracts/src/compute.ts`.

Un solo endpoint para los dos caminos de captura: **audio dictado** (→ texto) y
**boleta** (→ líneas). Cada captura termina con un embedding, una categoría y (en
boleta) sus líneas en `captura_item`.

## Request

`POST` multipart/form-data. JWT de usuario obligatorio (`Authorization: Bearer <jwt>`);
**nunca** `service_role` en el cliente — la función escribe con el JWT del usuario y
la RLS de `captura`/`captura_item`.

| Campo | Tipo | Regla |
|---|---|---|
| `archivo` | File | ≤ 10 MB. `audio/*` si `tipo=audio`; `image/png` o `image/jpeg` si `tipo=boleta`. `application/pdf` se **rechaza** (`415 TIPO_NO_SOPORTADO`): el OCR del compute no lee PDF. |
| `tipo` | `audio \| boleta` | rama de procesamiento. |
| `deviceId` | string (opcional) | etiqueta del dispositivo; si falta, se usa el `sub` del JWT. |

El binario va a Storage `capturas/<olla_id>/<uuid>.<ext>`; la olla la toma de la
membresía del usuario (`app.mis_ollas()`), el cliente no la elige.

## Response `200`

```json
{
  "capturaId": "e1f2…",
  "estado": "categorizada",
  "texto": "dos kilos de papa",
  "categoria": "tubérculo",
  "confianza": 0.812,
  "items": [
    { "linea": 1, "textoCrudo": "arroz 1 kg 2.50", "cantidad": 1, "unidad": "kg", "precioUnitarioMicrocent": 250000000 }
  ]
}
```

`estado` es el final del flujo: `transcrita` (audio), `extraida` (boleta) o
`categorizada` (embedding sobre el umbral). `categoria` es `sin_clasificar` cuando la
mejor similitud queda bajo `TAU = 0,69` (nunca se inventa una categoría). `items` va
vacío en audio (el dictado se parsea en la app con `parsearDictado`).

`precioUnitarioMicrocent`: entero, 1 = 10⁻⁶ de céntimo por unidad base. `null` significa
**importe dudoso** (D8): no se adivina dinero.

## URL del compute (normalizada)

`COMPUTE_URL` admite una barra final; la función la quita antes de concatenar
(`normalizarBase`) para que la ruta sea siempre `<base>/extract` y no `<base>//extract`
(404 en el smoke real, #98). La regla es idéntica en `packages/domain`
(`normalizarBase`) y en la Edge (que no importa el monorepo); la cubre el test de dominio
`normalizarBase` con y sin barras, con y sin ruta interna (`/api/v1`).

## Dictado tolerante a ASR

`parsearDictado` (dominio) reconoce el insumo contra un diccionario base (`arroz`,
`aceite`, `papa`, `lentejas`, `huevo`, `quinua`, `pollo`, `azúcar`, `sal`, `leche`,
`zanahoria`, `frijol`, `avena`, `cebolla`, `tomate`, `camote`, `plátano`, `atún`, `fideo`,
`trigo`, `garbanzo`, `haba`, `queso`, `mantequilla`, `panela`) con Levenshtein sobre la
forma escrita y una clave fonética aproximada (≤2, ≤1 si la palabra es corta). **Sin match
cercano no se crea ítem**: nunca se inventa un producto. Cantidades (`dos`/`2`) y unidades
(`kg`, `lt`, `unidad`…) se normalizan a número y unidad canónica.

Caso medido (#98): `"2 kilos ne arothi un litro ne afeite"` → `[{arroz, 2, kg}, {aceite, 1, lt}]`
(rojo sin el fuzzy, verde con él). El corte de trozos tolera que el ASR omita la coma entre
dos productos.

## Errores (tipados)

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `SIN_JWT` | falta `Authorization: Bearer`. |
| 400 | `SIN_ARCHIVO` / `TIPO_INVALIDO` | falta `archivo` o `tipo` fuera de `audio\|boleta`. |
| 403 | `SIN_OLLA` | el usuario no pertenece a ninguna olla. |
| 413 | `ARCHIVO_GRANDE` | supera 10 MB. |
| 415 | `MIME_NO_SOPORTADO` | mime incompatible con `tipo`. |
| 415 | `TIPO_NO_SOPORTADO` | `tipo=boleta` con `application/pdf`: "La boleta debe ser PNG o JPEG (el OCR no lee PDF)". Se responde **antes** de subir a Storage y de llamar al compute. |
| 502 | `COMPUTE_TRANSCRIBE` / `COMPUTE_EXTRACT` / `COMPUTE_EMBED` | el compute (`tools/compute`) no respondió o devolvió error. **Nunca se inventa un resultado.** |
| 500 | `MAL_CONFIGURADA` | faltan secrets `COMPUTE_URL`/`COMPUTE_TOKEN`. |

El cuerpo de error es `{ "codigo": "...", "mensaje": "..." }`.

## Ejemplo curl

```bash
# Bundle de ejemplo (audio). El JWT es el de la sesión del usuario.
curl -s -X POST "http://127.0.0.1:54321/functions/v1/ingest" \
  -H "Authorization: Bearer $USER_JWT" \
  -F "tipo=audio" \
  -F "archivo=@dictado.webm;type=audio/webm"

# Boleta
curl -s -X POST "http://127.0.0.1:54321/functions/v1/ingest" \
  -H "Authorization: Bearer $USER_JWT" \
  -F "tipo=boleta" \
  -F "archivo=@boleta.jpg;type=image/jpeg"
```

## Cómo se prueba

- **Dominio** (puro): `pnpm --filter @hackods/domain test` — `ingesta.test.ts` cubre
  dictado con kilos, boleta con total y línea, importe dudoso → `porRevisar`, coseno y
  categoría bajo umbral → `sin_clasificar` (rojo→verde rompiendo `TAU`). Dictado tolerante
  a ASR: `"2 kilos ne arothi un litro ne afeite"` → arroz 2 kg y aceite 1 lt (rojo sin el
  fuzzy). `normalizarBase` con/sin barra final y con ruta interna.
- **RLS** (`supabase/tests/011_ingesta.sql`): olla A no ve capturas de B; INSERT propio
  ok, ajeno 42501; `vector(1024)` rechaza otra dimensión; `captura_item` con precio
  `null`; UPDATE de estado por el miembro; DELETE 42501.
- **Compute real**: cuando exista el túnel (`tools/compute/tunel-url.txt`),
  `curl $COMPUTE_URL/health` con `Authorization: Bearer $COMPUTE_TOKEN` debe dar `ok:true`
  antes de probar la función de punta a punta.
