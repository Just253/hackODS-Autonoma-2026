# 09 · Captura sin boleta: texto y voz

> Copia integrada de `_hackods-plan/09-captura-manual-voz.md`. En este repo manda `docs/DECISIONES.md` (D9).

**Proyecto:** hackODS-Autónoma 2026 · PWA offline-first para ollas comunes del Perú
**Base obligatoria:** `06-decisiones.md` **D9** (captura manual|voz) y **D8** (nada entra al presupuesto sin confirmar), `08-clasificacion-productos.md` (pipeline de clasificación), `07-comprobantes-presupuesto.md` (dinero, estados, cola, roles).
**Alcance:** especificación implementable y testeable. **Sin código de producción**: tipos, estados, reglas, contratos, casos con números.
**Fecha de consulta de docs:** 2026-11-23.

**Regla de este documento:** igual que `08`, cada afirmación va marcada
✅ **verificado en docs** (URL y fecha) · 🔶 **estimado / hay que medirlo** · ⚠️ **decisión de diseño** (no es un dato).

---

## 0. Resumen ejecutivo

| # | Decisión | Elegido | Por qué |
|---|---|---|---|
| 1 | Entrada | Tres caminos, un mismo destino: **boleta**, **texto** y **voz** | Muchas compras son en efectivo y sin papel; el presupuesto no puede quedar ciego |
| 2 | Pantallas | **3**: capturar → revisar → resultado; corregir es una hoja dentro de revisar | Baja alfabetización digital: una acción por pantalla |
| 3 | Parseo | **Local, determinista, en el celular**; el servidor solo transcribe y clasifica | El parser es puro: no necesita red ni cuesta plata, y el demo no depende de latencia |
| 4 | Transcripción del demo | `@cf/openai/whisper-large-v3-turbo` (Workers AI) | ✅ 143 ms de RTT medidos, ✅ US$ 0,000513/min, ✅ retención cero, ✅ 720 req/min |
| 5 | Transcripción de producción | **faster-whisper** en la PC/VPS (`small` int8 en CPU, `turbo` si hay GPU) | El audio de la cocina no sale de la infraestructura propia; costo marginal 0 |
| 6 | Voz por defecto | **No se sube**: se transcribe en el dispositivo si el equipo puede; si no, se pide permiso explícito | D9 + el audio tiene voces de terceros |
| 7 | Números | **Nunca se auto-aceptan**. La persona confirma cada monto; lo dudoso se muestra aparte | Un número mal oído mueve el disponible y la serie de precios |
| 8 | Ambigüedad | Si una frase trae 2 productos y 1 monto, **no se reparte**: queda `monto_sin_repartir` y se pregunta | Repartir “parejo” inventa plata |
| 9 | Offline | Grabación local + cola con `idempotency_key`; estado `pendiente_compute` visible y honesto | D9: “esperando para procesar”, nunca fingir que calculó |
| 10 | Alternativa | **Texto siempre disponible**, al mismo nivel que el micrófono | Ninguna función depende de un permiso o de una red |

**Costo del demo:** una frase de 30 s cuesta **US$ 0,00026** y **23,3 neurons**; el free tier de 10.000 neurons/día alcanza para **≈429 frases de 30 s** al día. El número completo, en §3.4.

---

## 1. Flujo UX

### 1.1 Principios (no negociables)

1. **Una decisión por pantalla.** El botón primario es uno solo y ocupa el ancho.
2. **Letra 18 px, objetivos ≥ 48×48 px**, estado nunca solo por color (ni `07` §10 ni `02` §3.5 se contradicen acá).
3. **Nada de jerga**: no se dice “transcripción”, “ASR”, “procesar”, “sincronizar”, “error”. Se dice “tu voz”, “leer”, “guardar”, “mandar”.
4. **La persona nunca ve un número que ella no confirmó.** El resultado del parser es una *propuesta*, con la misma jerarquía visual que un borrador.
5. **Siempre hay salida a texto.** El botón “Escribir a mano” está en todas las pantallas de captura, no escondido en un menú.

### 1.2 Pantalla 1 · Capturar

```
┌──────────────────────────────────────────────┐
│  ¿Qué compraste hoy?                         │
│                                              │
│        ┌────────────────────────┐            │
│        │                        │            │
│        │      🎤  HABLAR        │  ← 160×160  │
│        │                        │            │
│        └────────────────────────┘            │
│         Mantén apretado y habla              │
│                                              │
│  ──────────── o ────────────                 │
│                                              │
│   [ ✏️  ESCRIBIR A MANO ]                    │
│                                              │
│  Hoy: 2 compras anotadas · S/ 41,50         │
└──────────────────────────────────────────────┘
```

- El micrófono es **un solo botón grande** (push-to-talk, no “iniciar/detener”): mantener apretado, hablar, soltar. Se detiene solo a los **30 s** con cuenta regresiva visible desde los 20 s.
- Debajo, un medidor de voz simple (3 barras) y el texto “Te escucho…” mientras graba.
- **Un ejemplo en voz** la primera vez: “Di, por ejemplo: *dos kilos de papa a tres cincuenta*”, con botón “Escuchar ejemplo” (voz del sistema, sin red).
- Si ya hay capturas esperando: una línea discreta arriba, “2 esperando para leer”, que lleva a la pantalla 3.

**Atajos que no se muestran como atajos** (para quien ya aprendió):
- Tocar el micrófono sin mantener → graba 5 s y para (modo “una frase corta”).
- Escribir a mano abre el mismo formulario de la pantalla 2, vacío, con el catálogo local.

### 1.3 Pantalla 2 · Revisar y confirmar

```
┌──────────────────────────────────────────────┐
│  Esto entendí                                 │
│                                              │
│  🎤  “dos kilos de papa a tres cincuenta”     │
│      (tocar para volver a escuchar)           │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Papa                      $ 7,00  ✔    │  │
│  │ 2 kilos × S/ 3,50                      │  │
│  │ ⚠️ ¿Blanca, amarilla o huayro?          │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ + Agregar otra cosa                    │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  Total: S/ 7,00                              │
│                                              │
│   [ ✅  ESTÁ BIEN, GUARDAR ]                  │
│   [ ✏️  CORREGIR ]   [ 🗑  BORRAR ]          │
└──────────────────────────────────────────────┘
```

- Cada ítem es **una tarjeta con el número grande**; el detalle (cantidad × precio) va en letra chica debajo.
- **Dos chips, no cinco:** `✔ Seguro` y `⚠️ Revisar`. El chip ámbar no bloquea la confirmación, pero la tarjeta se abre con el campo a corregir ya enfocado.
- El monto total de la captura se muestra **siempre**, aunque haya ítems con precio pendiente: “Total: **S/ 7,00** · falta el precio de 1 cosa” (nunca se suma un 0 inventado).
- Si el parser detectó ambigüedad de monto (§4.6), arriba de la lista aparece una tarjeta aparte:
  *“Dijiste S/ 30 para papa y arroz. ¿Cuánto fue de cada uno?”* con las dos filas y el botón “No sé separar”.
- Confirmar sin red está permitido (queda provisional, `07` §3.5) y el botón lo dice: **“Está bien, guardar”**, con la confirmación `aria-live`: *“Guardado en este celular. Se suma al presupuesto cuando haya internet.”*

### 1.4 Pantalla 3 · Resultado y pendientes

Tres variantes, mismo layout:

| Situación | Qué se ve | Acción primaria |
|---|---|---|
| Todo listo y con red | “Listo. Ya está en el presupuesto.” + `Disponible: S/ 158,50` | “Hacer otra” |
| Confirmado sin red | “Guardado. **Falta mandarlo**.” + “Se suma cuando haya internet.” | “Hacer otra” |
| Voz esperando lectura | “**Esperando para leer tu voz.**” + posición (“1 de 2”) + “No se perdió.” | “Escribir a mano” |

### 1.5 Estados de espera, sin jerga y sin mentir

| Momento | Texto exacto | Lo que **no** se dice |
|---|---|---|
| Grabando | “Te escucho…” | “Grabando audio” |
| Guardado local | “Guardado en este celular.” | “Sincronizando” |
| Sin red, voz | “Guardado. Se lee cuando haya internet.” | “Error de conexión” |
| Esperando turno | “Esperando para leer tu voz.” | “En cola de procesamiento” |
| Leyendo | “Leyendo tu voz…” + Cancelar | “Transcribiendo” |
| Falló la lectura | “No pudimos entender la voz. **Escríbelo acá.**” | “Error 500 / ASR failed” |
| Duplicado | “Esto ya está anotado.” + “Ver lo anotado” | “Conflicto de idempotencia” |
| Presupuesto pendiente | “Todavía no se sumó. Falta mandarlo.” | “Pendiente de sincronización” |

**Regla de honestidad (D9):** la UI nunca muestra un total recalculado mientras el envío está pendiente. Muestra el número local con la etiqueta “en este celular”.

### 1.6 Permisos y errores de micrófono

| Caso | Qué ve la persona | Qué hace la app |
|---|---|---|
| Permiso denegado | “El micrófono está apagado. Puedes escribir igual.” + 3 pasos con íconos para activarlo | Micrófono deshabilitado con explicación; “Escribir a mano” pasa a primario |
| Sin micrófono | “Este celular no tiene micrófono. Escribe.” | Se oculta el botón, no se rompe |
| Permiso concedido y luego revocado | Igual que denegado | Se detecta al apretar, no al cargar |
| Ruido de cocina | “Acércate y habla despacio. Una compra por vez.” | VAD + medidor + “Volver a grabar” |

---

## 2. Modelo

### 2.1 Convenciones (heredadas, no se reinventan)

- **Dinero en céntimos enteros**: `*_centavos bigint`, 1 = S/ 0,01 (`07` §1.1).
- **Cantidad en milésimas de unidad base**: `cantidad_milesimas` (1 kg = 2 000 000; 1 unidad = 1 000).
- **Precio normalizado**: `precio_microcent_por_base` (S/ 2,20/kg = 220 000).
- IDs **UUIDv7 generados en el cliente**; `lamport`, `device_id`, `deleted_at` en toda tabla sincronizable.
- **Actor opaco** `actor_ref` (`M-xxxx`); nunca nombre ni DNI (D2).
- Zona de negocio `America/Lima`; `fecha_negocio` no se deriva de un `timestamptz` UTC.

### 2.2 `captura`

Es la **bandeja de entrada** de una compra sin papel. No es un comprobante todavía: recién al confirmar se materializa en `comprobante` + `comprobante_item` (§2.6).

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | UUIDv7 del cliente; **es** la `idempotency_key` de la captura |
| `olla_id` | uuid FK | sí | RLS y partición |
| `origen` | enum | sí | `manual` \| `voz` |
| `fecha_negocio` | date | sí | Default hoy (Lima); la persona puede corregir (“fue ayer”) |
| `estado` | enum | sí | §2.5 |
| `texto` | text | condicional | Obligatorio si `origen = manual`; en `voz` se llena al transcribir |
| `texto_norm` | text | no | Normalización de §4.2; se recalcula, nunca se edita a mano |
| `audio_ref` | text | condicional | Obligatorio si `origen = voz` y el audio existe; FK lógica al blob local `audio:<id>` |
| `audio_hash` | char(64) | condicional | SHA-256 del blob; obligatorio si hay audio |
| `audio_ms` | int | condicional | Duración; ≤ 30 000 |
| `audio_bytes` | int | condicional | ≤ 2 097 152 (2 MB) |
| `audio_borrado_en` | timestamptz | no | Se setea al borrar la voz (§8) |
| `transcripcion_id` | uuid FK | no | Obligatorio desde `transcrita` |
| `monto_declarado_centavos` | bigint | no | Un monto suelto que la persona dijo sin producto |
| `monto_sin_repartir_centavos` | bigint | no | Monto de 2+ productos que no se reparte (§4.6) |
| `cobertura_monto_bp` | int | sí | `10000 × Σ conocidos / Σ declarados`; 10000 = completo |
| `confianza_global` | numeric(4,3) | sí | `min` de confianza ASR, parseo y clasificación (0..1) |
| `duplicada_de_id` | uuid FK self | condicional | Obligatorio si `estado = duplicada` |
| `nota` | text | no | Texto corto, sin datos personales |
| `creado_en`, `updated_at`, `lamport`, `device_id` | — | sí | Sync |
| `confirmada_en`, `confirmada_por_ref` | — | condicional | Obligatorio desde `confirmada` |
| `asentada_en` | timestamptz | condicional | Lo pone el servidor, nunca el cliente |

**Checks**

- `origen = 'voz'` ⇒ (`audio_ref is not null` **o** `audio_borrado_en is not null`) y `audio_ms ≤ 30000`.
- `origen = 'manual'` ⇒ `texto is not null` (mínimo 3 caracteres) **o** existe ≥ 1 ítem cargado a mano.
- `estado = 'confirmada'` ⇒ `confirmada_en is not null and confirmada_por_ref is not null`.
- `estado = 'asentada'` ⇒ `asentada_en is not null`.
- `monto_sin_repartir_centavos > 0` ⇒ `estado in ('propuesta','error_parseo','descartada')` (no se confirma con un monto colgado).
- `cobertura_monto_bp` entre 0 y 10000.
- Único `(olla_id, huella_debil)` donde `huella_debil is not null and estado not in ('descartada','duplicada')`.
- `deleted_at` lógico; no hay `DELETE` físico salvo el borrado del audio (§8).

### 2.3 `captura_item`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | UUIDv7 |
| `captura_id` | uuid FK | sí | — |
| `olla_id` | uuid | sí | Denormalizado para RLS |
| `linea_no` | int | sí | 1..n, único por captura |
| `descripcion_cruda` | text | sí | Lo que dijo o escribió: `"papa"` |
| `descripcion_norm` | text | sí | `08` §1.4 (minúsculas, sin tildes, abreviaturas) |
| `cantidad_cruda` | text | no | `"dos kilos"`, `"medio"`, `"1/4"` |
| `cantidad_milesimas` | bigint | condicional | > 0; obligatorio para entrar a la serie |
| `unidad_cruda` | text | no | `"kilo"`, `"bolsa"`, `"atado"`, `"el kilo"` |
| `unidad_base` | enum | condicional | `g` \| `ml` \| `unidad`; obligatorio para la serie |
| `equivalencia_id` | uuid FK | no | Obligatorio si se convirtió una presentación |
| `precio_total_centavos` | bigint | condicional | > 0; **la verdad del dinero de esa línea** |
| `precio_unitario_centavos` | bigint | no | Solo si se dijo (“a tres cincuenta”); se guarda tal cual |
| `precio_microcent_por_base` | bigint | no | Derivado al confirmar; `null` si falta unidad |
| `origen_precio` | enum | sí | `dicho` \| `calculado` (cantidad × unitario) \| `pendiente` |
| `producto_id` | uuid FK | condicional | Obligatorio si `estado = confirmado` y no excluido; `null` ⇒ `sin_clasificar` |
| `producto_confianza` | numeric(4,3) | no | Del clasificador (`08` §4) |
| `confianza` | numeric(4,3) | sí | Del parser + ASR, 0..1; lo escribe el parser |
| `estado` | enum | sí | `propuesto` \| `confirmado` \| `excluido` \| `sin_precio` \| `sin_cantidad` \| `monto_pendiente` |
| `motivo_codigo` | text | condicional | Uno de §4.7; nunca prosa con nombres |
| `avisos` | jsonb | no | Lista de códigos para pintar los chips |
| `corregido_de` | uuid FK self | no | Trazabilidad de correcciones (§5.4) |
| `created_at`, `updated_at`, `lamport`, `device_id` | — | sí | — |

**Checks**

- `linea_no` único por `captura_id`.
- `estado = 'confirmado'` ⇒ `precio_total_centavos is not null`.
- `estado = 'confirmado'` y `producto_id is null` ⇒ `producto_id` queda `null` **con** `motivo_codigo='sin_clasificar'` (el dinero es real aunque el nombre no esté en el catálogo, `08` §5.4).
- `unidad_base is not null` y `cantidad_milesimas > 0` ⇒ puede generar `precio_observado`; si no, `excluido_de_serie = true`.
- `cantidad_milesimas` fuera de `[cantidad_min, cantidad_max_linea]` del producto ⇒ fuerza `motivo_codigo='cantidad_imposible'`.

### 2.4 `transcripcion`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `captura_id` | uuid FK | sí | Único: una captura tiene a lo sumo una transcripción vigente |
| `texto` | text | sí | Lo que devolvió el motor, tal cual |
| `texto_norm` | text | sí | Normalización de §4.2 |
| `motor` | enum | sí | `cf_whisper_turbo` \| `cf_whisper` \| `faster_whisper_pc` \| `transformers_js` \| `whisper_cpp_wasm` \| `humano` (tipeado) |
| `modelo_id` | text | sí | ID exacto: `@cf/openai/whisper-large-v3-turbo`, `Systran/faster-whisper-small`, `onnx-community/whisper-tiny` |
| `modelo_version` | text | sí | Hash o tag del artefacto |
| `idioma` | char(5) | sí | `es`; **se fuerza**, no se autodetecta (ver §7.5) |
| `duracion_ms` | int | sí | Del audio, no del reloj |
| `latencia_ms` | int | sí | Tiempo de pared del motor |
| `confianza_media` | numeric(4,3) | no | Si el motor la expone; `null` es válido |
| `vad` | boolean | sí | Si se aplicó detección de voz |
| `idioma_detectado` | char(5) | no | Solo diagnóstico; no se usa para decidir |
| `revisada_por_humano` | boolean | sí | `true` si la persona editó el texto |
| `created_at`, `lamport`, `device_id` | — | sí | — |

**Regla:** el texto transcrito **se conserva** aunque la persona lo corrija; `texto` es evidencia, `captura_item` es lo confirmado. Si el audio se borra, la transcripción queda (es la única evidencia).

### 2.5 Estados y transiciones

```
                    (offline)
  borrador ──guardar──► capturada
                           │
        ┌──────────────────┼─────────────────────┐
        │ texto/ítems      │ voz sin texto        │
        ▼                  ▼                     │
    propuesta      pendiente_compute(etapa=transcripcion)
        ▲                  │ lease                │
        │                  ▼                      │
        │             procesando ──fallo──► error_compute
        │                  │ ok                   │
        │                  ▼                      │
        │             transcrita ──parse local──► propuesta
        │                                         │
        ├──confirmar──► confirmada ──asentar──► asentada ──anular──► anulada
        │                  │
        │                  └──corregir antes de asentar──► propuesta
        └──descartar──► descartada
```

| # | Transición | Actor | Guardas | Efecto |
|---|---|---|---|---|
| 1 | ∅ → `borrador` | cocinera, organizadora | Olla activa | Se abre el formulario; nada se persiste hasta guardar |
| 2 | `borrador` → `capturada` | cocinera | Texto ≥ 3 chars, o ≥ 1 ítem, o audio ≤ 30 s / 2 MB | Fila local + blob + hash; `aria-live` de guardado |
| 3 | `capturada` → `propuesta` | sistema (local) | Hay texto (dicho, tipeado o transcrito) y el parser devuelve ≥ 1 ítem **o** un monto | Ítems `propuesto`; nunca toca el presupuesto |
| 4 | `capturada` → `pendiente_compute` | sistema | `origen='voz'` y sin texto | Entra a la cola con `idempotency_key` |
| 5 | `pendiente_compute` → `procesando` | sistema (compute) | Lease libre; `intentos < 8` | Marca `lease_hasta` |
| 6 | `procesando` → `transcrita` | sistema | Texto no vacío | Guarda `transcripcion`; **no** crea ítems |
| 7 | `procesando` → `error_compute` | sistema | Timeout de lease, 4xx/5xx, audio ilegible | Código estable; alerta suave, sin modal |
| 8 | `error_compute` → `pendiente_compute` | cocinera, sistema | `intentos < 8` | Reintento con backoff |
| 9 | `transcrita` → `propuesta` | sistema (local) | Parser devuelve algo | Ítems propuestos |
| 10 | `propuesta` → `propuesta` | cocinera | Corrige cantidad, precio, unidad o producto | Nueva versión del ítem (`corregido_de`) |
| 11 | `propuesta` → `confirmada` | **organizadora, admin** | 0 ítems en `monto_pendiente`; `monto_sin_repartir = 0`; total > 0 | Congela ítems, calcula `precio_microcent_por_base`, crea comprobante (§2.6) |
| 12 | `confirmada` → `asentada` | sistema (RPC) | Idempotente; período vigente o alerta `sin_periodo` | Escribe `gasto` + `precio_observado` |
| 13 | `confirmada` → `propuesta` | organizadora | Solo si **no** está `asentada` | Reabre; conserva historial |
| 14 | `propuesta` → `descartada` | cocinera | Motivo obligatorio | No asienta; el audio se borra |
| 15 | pre-confirmada → `duplicada` | sistema, organizadora | `huella_debil` coincide | No se suma dos veces |
| 16 | `asentada` → `anulada` | organizadora (mismo período) / admin | Motivo | `anulacion` negativa; observaciones a `excluido` |

**Regla de rol (`07` P8):** la cocinera **captura y corrige**; **confirma dinero** la organizadora o el admin. Si la olla tiene una sola persona con rol de confirmación, se permite y se registra `mismo_actor = true` (no se finge una separación que no existe).

**Estados terminales para edición:** `asentada`, `anulada`, `descartada`, `duplicada`. Un `asentada` se corrige con otra captura (`reemplaza_a`) o un ajuste, nunca editando.

### 2.6 Mapeo al presupuesto (enmienda explícita a `07`)

Al confirmar, la captura se materializa así:

| Origen | `comprobante.tipo` | `comprobante.evidencia` | `huella_fuerte` | `comprobante_item.origen_valor` |
|---|---|---|---|---|
| Boleta/factura (`07`) | `boleta` \| `factura` | `imagen` | calculada | `comprobante` |
| Texto | **`declaracion`** | `texto` | `null` | **`declarado`** |
| Voz | **`declaracion`** | `audio` | `null` | **`declarado`** |

- **Cambios de enum que este documento agrega** (hay que aplicarlos en la migración):
  1. `comprobante.tipo` += `declaracion`.
  2. `comprobante.evidencia` ∈ `imagen | texto | audio` (nuevo campo, obligatorio).
  3. `comprobante_item.origen_valor` += `declarado`.
  4. `precio_observado.calidad_evidencia` ∈ `papel | declarado` (nuevo campo).
- `proveedor_nombre` en una declaración es `"Sin boleta"` (texto fijo, no un proveedor real). No se inventa RUC.
- **Dedupe sin papel:** `huella_debil = SHA-256(olla_id | fecha_negocio | total_centavos | líneas ordenadas)`. Atrapa el doble toque y el reenvío; **no** confunde dos compras distintas del mismo monto (las líneas difieren o la fecha cambia).
- **Serie de precios:** una observación `declarado` entra a la serie solo si tiene producto, cantidad y unidad base. ⚠️ Decisión: para un producto con **≥ 3 observaciones de papel** en la ventana, la mediana usa solo papel; si no hay 3, usa declarado y la UI lo rotula (“precios declarados, sin boleta”). Nunca se mezclan sin decirlo.
- El presupuesto usa `Σ precio_total_centavos` de los ítems confirmados, **nunca** una estimación.

---

## 3. Transcripción

### 3.1 Lo que hay que resolver

Frase típica: **5–15 s**, una sola toma, ruido de cocina, español peruano con léxico de mercado (“jurel”, “huayro”, “pallar”, “chuno”), números hablados. No es dictado de oficina: es **una persona apurada, con las manos mojadas**.

Tres candidatos reales, no inventados.

### 3.2 (a) En el navegador, en el dispositivo

**Transformers.js + Whisper ONNX.** ✅ `transformers.js` corre modelos ONNX en el navegador vía **WASM por defecto** y **WebGPU opcional** (`device: 'webgpu'`), con `dtype` `q8` por defecto en WASM, y soporta la tarea `automatic-speech-recognition` (docs de Transformers.js, consultadas 2026-11-23). ✅ El repo oficial publica los ONNX por tamaño (`onnx-community/whisper-tiny`, `whisper-base`).

**Tamaño real de descarga** (✅ tamaños de archivo del repo HF, consultados 2026-11-23):

| Modelo | Archivos que carga | Total 1.er uso |
|---|---|---|
| `whisper-tiny` int8 | encoder 10,1 MB + decoder_merged 30,7 MB + tokenizer/vocab ≈ 4,5 MB | **≈ 45 MB** |
| `whisper-base` int8 | encoder 23,2 MB + decoder_merged 53,7 MB + tokenizer/vocab ≈ 4,5 MB | **≈ 81 MB** |
| `whisper-base` fp32 | 82,5 MB + 208,5 MB | ≈ 296 MB (descartado) |

**whisper.cpp WASM** es la otra vía ✅ (el repo lista `examples/whisper.wasm` y `examples/stream.wasm`). Sus modelos GGML pesan ✅ **tiny 75 MiB, base 142 MiB, small 466 MiB** en disco (sin cuantizar; el repo documenta cuantización Q5_0). Integrarlo implica compilar/empaquetar WASM con SIMD: más trabajo que `pipeline()`.

- **Offline real:** sí, después de la primera descarga, si el modelo queda en Cache Storage/IndexedDB y el Service Worker lo precachea. Sin red y sin modelo descargado, no hay transcripción.
- **Costo:** S/ 0.
- **Riesgo:** 45–81 MB de descarga y de cuota en un Android de 2 GB que ya guarda fotos; y la latencia en CPU de gama baja, que **no está medida** (🔶). Un `tiny` en WASM suele ir a varias veces el tiempo real: 10 s de audio podrían tardar 10–40 s. **Medir antes de prometer.**

### 3.3 (b) Workers AI (nube)

✅ Catálogo consultado el 2026-11-23 en `developers.cloudflare.com/workers-ai/models/`:

| Modelo | ID real | Precio | Rate limit | Retención |
|---|---|---|---|---|
| **Whisper large-v3-turbo** | `@cf/openai/whisper-large-v3-turbo` | **US$ 0,000513/min** · 46,63 neurons/min | 720 req/min (ASR) | **Cero** |
| Whisper (modelo base de la ficha) | `@cf/openai/whisper` | US$ 0,0005/min · 41,14 neurons/min | 720 req/min | **Cero** |
| Deepgram Nova-3 | `@cf/deepgram/nova-3` | US$ 0,0052/min · 472,73 neurons/min | 720 req/min | (no declarada en la tabla) |

- ✅ `whisper-large-v3-turbo` acepta **audio en base64** o `{body, contentType}` y expone parámetros útiles: `language`, `vad_filter`, `initial_prompt`, `beam_size`, `condition_on_previous_text` (poner `false` evita bucles de alucinación), `no_speech_threshold`, `log_prob_threshold`.
- ⚠️ **Trampa de formato:** `@cf/openai/whisper` (el no-turbo) **no** acepta base64: su esquema pide binario o `{ audio: number[] }` con valores 0–255. Usar **turbo**, que sí acepta base64.
- ✅ Free tier: 10.000 neurons/día (reset 00:00 UTC), luego US$ 0,011/1.000 neurons.
- ✅ Cuerpo máximo de request: **100 MB** (plan Free/Pro) — irrelevante con clips de 30 s, pero es el techo real.
- **Offline real:** no.
- **Precisión:** large-v3-turbo es “una versión optimizada de large-v3 con velocidad mayor y degradación mínima de precisión” ✅ README de `openai/whisper`. Para español peruano de mercado **no hay benchmark público** (🔶).

### 3.4 (c) PC de cómputo con faster-whisper

✅ `faster-whisper` es una reimplementación de Whisper con CTranslate2, “hasta 4× más rápida que openai/whisper con la misma precisión y menos memoria”, con cuantización int8 en CPU y GPU; decodifica audio con PyAV (no requiere FFmpeg del sistema) e incluye VAD Silero. ✅ Soporta `turbo` (`WhisperModel("turbo")`) y `small`.

Benchmark ✅ publicado en su README (13 min de audio, `small`, int8, 8 hilos, Intel i7-12700K): **1m42s**, **1.477 MB de RAM**. Eso da **≈ 7,6× tiempo real**: un clip de 30 s tarda **≈ 4 s** en ese CPU. En un VPS de 2 vCPU, 🔶 10–20 s.

Tamaños/VRAM de referencia ✅ (README de `openai/whisper`): tiny 39 M (~1 GB), base 74 M (~1 GB), small 244 M (~2 GB), medium 769 M (~5 GB), turbo 809 M (~6 GB), large 1550 M (~10 GB).

- **Offline real:** no para el celular; **sí para la institución** (el audio va a tu PC/VPS, no a un tercero). En el venue, si el celular y la PC están en la misma wifi, el “offline de internet” sigue funcionando.
- **Costo:** S/ 0 marginal (la PC ya está).
- **Riesgo:** hay que operarla (arranque, TLS, `cloudflared` efímero — D9 ya lo advierte). Si la PC duerme, no hay transcripción.

### 3.5 Tabla comparativa

| | A1 · Transformers.js `tiny` int8 | A2 · whisper.cpp WASM `base` | B1 · **CF whisper-large-v3-turbo** | B2 · CF whisper | C1 · faster-whisper `small` int8 (CPU) | C2 · faster-whisper `turbo` (GPU) |
|---|---|---|---|---|---|---|
| Descarga 1.er uso | ✅ **≈ 45 MB** | ✅ 142 MiB (+WASM) | 0 | 0 | 0 en el celular (1,5 GB en la PC) | 0 en el celular (~6 GB VRAM) |
| Latencia 30 s de audio | 🔶 15–40 s en gama baja | 🔶 25–60 s | 🔶 2–5 s (sobre RTT ✅ 143 ms) | 🔶 3–8 s | ✅ 7,6× real medido ⇒ ≈4 s en i7 · 🔶 10–20 s en 2 vCPU | 🔶 1–2 s |
| Precisión es-PE mercado | 🔶 baja (tiny); números frágiles | 🔶 media-baja | **la mejor disponible** 🔶 | 🔶 similar/peor | 🔶 alta (small) | 🔶 alta |
| Offline real | ✅ tras descargar | ✅ tras descargar | ❌ | ❌ | ❌ en el celular | ❌ en el celular |
| Costo | S/ 0 | S/ 0 | **US$ 0,00026 / 30 s** | US$ 0,00025 | S/ 0 | S/ 0 |
| Privacidad | **máxima** (no sale) | **máxima** | media (sale el audio; retención cero) | media | **alta** (sale a tu server) | alta |
| Esfuerzo | bajo (`pipeline`) | alto (WASM propio) | **muy bajo** (binding) | bajo | medio (servicio + túnel) | alto (GPU) |
| Riesgo principal | lentitud + cuota del celular | peso + integración | depende de la red | depende de la red | la PC dormida | costo GPU |

**Costo del demo, explícito:**

```
frase de 30 s = 0,5 min
B1: 0,5 × US$ 0,000513 = US$ 0,00026   ·  0,5 × 46,63 = 23,3 neurons
free tier 10.000 neurons/día ÷ 23,3 = ≈ 429 frases de 30 s/día
1.000 frases de 30 s = US$ 0,26
```

> El costo no está en transcribir: está en **leer mal un número**. 1.000 frases cuestan menos que un pasaje, y un solo “350” en vez de “3,50” descuadra el mes.

### 3.6 Recomendación

**Demo: B1 (`@cf/openai/whisper-large-v3-turbo`).**
Razones, en orden: (1) es el único camino con latencia y precio verificados hoy; (2) no depende de que la PC del equipo esté despierta ni del túnel; (3) retención cero declarada; (4) `initial_prompt` permite sesgar el vocabulario al catálogo, que es la mejora más barata que existe para “jurel” y “huayro”.
**Seguro del demo:** si no hay red o hay 429, se cae a **texto** (instantáneo, siempre funciona) y se muestra la captura de voz en “esperando”. No se hace pasar una transcripción pregrabada por una en vivo; si se usa un clip de respaldo, se rotula **“ejemplo”** (mismo criterio que `08` §7.2).

**Producción: C1/C2 (faster-whisper en la PC/VPS).**
Razones: (1) el audio de la cocina —con voces de terceros— no sale de la infraestructura; (2) 23 ollas × pocas frases/día es un volumen trivial para una PC (US$ 0 marginal); (3) la confirmación es offline-tolerante: 15 s de espera no rompen nada porque la persona ya guardó; (4) el contrato `AsrPort` deja cambiar a la nube sin tocar UI ni parser.
**On-device (A1/A2)** queda como opción de privacidad para el día que se mida y dé < 15 s en el Android objetivo; hoy **no** es la base.

### 3.7 Contrato `AsrPort` (congelado)

```ts
// packages/domain/src/captura/asr.ts — solo tipos
export type MotorAsr =
  | 'cf_whisper_turbo' | 'cf_whisper' | 'faster_whisper_pc'
  | 'transformers_js' | 'whisper_cpp_wasm' | 'humano';

export interface PeticionAsr {
  readonly capturaId: string;        // = idempotency_key
  readonly audio: Blob;              // opus/webm o wav 16 kHz mono
  readonly mime: string;
  readonly duracionMs: number;
  readonly idioma: 'es';
  readonly vocabulario?: readonly string[]; // initial_prompt, ≤ 40 palabras
}

export interface ResultadoAsr {
  readonly ok: boolean;
  readonly codigo?: 'sin_audio'|'formato'|'silencio'|'timeout'|'cuota'|'motor';
  readonly texto: string;
  readonly motor: MotorAsr;
  readonly modeloId: string;
  readonly idiomaDetectado?: string;
  readonly confianzaMedia?: number;  // null si el motor no la expone
  readonly latenciaMs: number;
}

export interface AsrPort {
  transcribir(p: PeticionAsr): Promise<ResultadoAsr>; // nunca lanza
  readonly modeloId: string;
}
```

**Reglas del adaptador:**

1. `language: 'es'` explícito. Autodetectar en una frase de 8 s con ruido es cómo termina traducido al inglés.
2. `vad_filter: true` en la nube/PC (hay VAD en CF turbo ✅ y Silero en faster-whisper ✅).
3. `condition_on_previous_text: false` en CF (evita el bucle de alucinación documentado en el esquema).
4. `initial_prompt` con **máximo 40 palabras** del catálogo local + “soles, kilo, bolsa, atado”. Más contexto no ayuda y puede inducir texto.
5. El adaptador **nunca** devuelve ítems ni números: solo texto. El parseo es local.
6. Timeout duro: 20 s. Al vencer, `error_compute` con reintento.
7. **Formato:** se sube el `opus` grabado (30 s ≈ 60–120 KB). ⚠️ La aceptación de `webm/opus` por Workers AI **no está documentada**: el día 1 se prueba con 1 clip; si falla, el cliente recodifica a **WAV 16 kHz mono** (≈ 960 KB por 30 s) y reintenta una vez. En la PC, faster-whisper decodifica opus sin problema.

---

## 4. Parseo de la frase a ítems

### 4.1 Lo que la gente realmente dice (frases del requisito)

| Frase | Qué significa | Trampa |
|---|---|---|
| “compré dos kilos de papa a tres cincuenta” | 2 kg, S/ 3,50/kg, total **S/ 7,00** | El total no se dijo: hay que multiplicar |
| “jurel ocho soles el kilo” | S/ 8,00, **1 kg supuesto** | “el kilo” no dice cuánto compró |
| “gasté veinte en arroz” | S/ 20,00, sin cantidad | Sin cantidad no hay serie de precio |
| “medio kilo de queso” | 0,5 kg, sin precio | Falta la mitad del dato |
| “un cuarto de queso” | 0,25 kg (si es de peso) | “un cuarto” no dice de qué |
| “tres bolsas de arroz a cuatro cincuenta” | 3 × S/ 4,50 | “bolsa” no es unidad aprobada |
| “compré papa y arroz, treinta” | 2 productos, **1 monto** | Repartir es inventar |
| “pollo dos kilos y medio a nueve ochenta” | 2,5 kg | “y medio” no es “y” de lista |
| “docena de huevos cinco veinte” | 12 unidades, S/ 5,20 | Unidad física distinta |
| “cebolla china un atado a dos soles” | 1 atado | “atado” sin equivalencia; y “cebolla china” ≠ “cebolla” |

### 4.2 Pipeline (todo local, todo puro)

```
texto (dicho, tipeado o transcrito)
  │
  ├─(1) NORMALIZAR     NFKC · minúsculas · tildes fuera · puntuación fuera
  │                    "S/", "S/." fuera · "kg"→"kilo" · números con coma
  │
  ├─(2) PROTEGER       unir números hablados antes de partir:
  │                    "treinta y cinco" · "dos kilos y medio" · "ciento veinte"
  │
  ├─(3) SEGMENTAR      separadores de ítem: " y ", " también ", " más ", ",", " luego "
  │                    (nunca dentro de un número ni de "y medio")
  │
  ├─(4) SLOTS          por segmento: [cantidad] [unidad] [producto] [precio] [unidad_precio]
  │                    patrones de §4.3 y §4.4
  │
  ├─(5) NORMALIZAR NÚMEROS  palabras → valor; fracciones → decimal
  │
  ├─(6) RESOLVER       total vs unitario vs calculado (§4.5)
  │
  ├─(7) VALIDAR        guardas de precio, cantidad, unidad, aritmética
  │
  └─(8) MARCAR         avisos + confianza (§4.7, §5)
```

**Nada de esto usa un modelo.** Es TypeScript puro en `packages/domain`, testeable con `vitest` sin red, sin audio y sin Supabase — exactamente como el parser de dinero de `07` §4.3.

### 4.3 Números hablados

| Se dice | Se parsea | Regla |
|---|---|---|
| `un`, `una`, `uno` | 1 | — |
| `dos` … `veinte` | 2…20 | tabla fija |
| `treinta y cinco` | 35 | decena + `y` + unidad, **antes** de segmentar |
| `tres cincuenta` | **3,50** | dos números seguidos, el segundo < 100 ⇒ decimales |
| `tres con cincuenta` | 3,50 | conector `con` ⇒ decimales |
| `tres punto cincuenta` | 3,50 | `punto` ⇒ decimales |
| `dieciocho noventa` | 18,90 | **no** 1890 |
| `ciento veinte` | 120 | `ciento` + unidad |
| `doscientos` | 200 | tabla de centenas |
| `mil` | 1000 | raro, se acepta |
| `medio` | 0,5 | fracción |
| `un cuarto` | 0,25 | fracción |
| `tres cuartos` | 0,75 | fracción |
| `kilo y medio` | 1,5 | “y medio” suma 0,5 a la cantidad previa |
| `dos kilos y medio` | 2,5 | idem |
| `S/ 3.50`, `3,50`, `3.50` | 350 céntimos | parser de dinero de `07` §4.3 |
| `un sol` | 1,00 | unidad monetaria |
| `medio sol` | 0,50 | — |

**Regla de desempate decimal (la que evita el error de 10×):** si hay dos tokens numéricos seguidos y el segundo tiene valor < 100 **y** no está seguido de una unidad de cantidad, el segundo son decimales. Si el segundo token es una decena (“treinta”), es un número compuesto y se suma. Si queda duda (`tres cuatro`), se emite `NUMERO_AMBIGUO` y se muestran las dos lecturas.

⚠️ **Jerga local, no implementada por defecto:** “luca” (S/ 1), “china” (S/ 0,50) y similares **no** entran al léxico hasta validarlas con 5 ollas reales; una “luca” mal entendida multiplica por 1.000. Se dejan como extensión del léxico, con test propio.

### 4.4 Unidades y presentaciones

| Se dice | Unidad | ¿Aprobada? |
|---|---|---|
| `kilo`, `kilos`, `kg`, `kilogramo` | kg (base g) | ✅ global (`07` §6.1) |
| `gramo`, `gramos`, `gr` | g | ✅ |
| `litro`, `litros`, `l`, `lt` | L (base ml) | ✅ |
| `medio litro` | 0,5 L | ✅ |
| `unidad`, `unidades`, `un` | unidad | ✅ |
| `docena` | 12 unidad | ✅ (`07` §6.1) |
| `libra` | 453,59237 g | ✅ exacta (`07` §6.1) |
| `saco`, `bolsa`, `caja`, `atado`, `bandeja`, `manojo`, `lata`, `botella` | **presentación** | ⚠️ solo con equivalencia **por producto** aprobada |
| `el kilo` | **marcador de precio unitario**, no cantidad | ✅ regla propia |
| `la bolsa` (sin número) | presentación, cantidad 1 | ⚠️ sin equivalencia ⇒ `UNIDAD_SIN_EQUIVALENCIA` |

**Reglas duras:**

1. Si la presentación no tiene equivalencia aprobada para **ese** producto: `unidad_base = null`, el dinero **sí** cuenta (si la persona confirma) y el ítem **no** entra a la serie (`07` §6.1, D8).
2. “el kilo” / “el litro” **no** crean cantidad: convierten el precio en unitario. Si no hay cantidad dicha, la cantidad es **1** y se marca `CANTIDAD_SUPUESTA` (nunca se asume 2, ni el peso del saco).
3. “un cuarto” / “medio” sin unidad: si el producto es de peso (`unidad_base = g`), se asume **kg** y se marca `FRACCION_SIN_UNIDAD`; si no, se pregunta.
4. La unidad `docena` es exacta y no se pregunta.

### 4.5 Total, unitario y calculado

Tres números distintos, y **el que manda es el que se dijo**:

```
A) "dos kilos a tres cincuenta"      → unitario 3,50 · cantidad 2 · total = 7,00  (calculado)
B) "aceite tres litros, 18,90"       → total 18,90 · cantidad 3 · unitario = 6,30 (derivado)
C) "gasté veinte en arroz"           → total 20,00 · sin cantidad
D) "papa y arroz, 30"                → monto_sin_repartir 30,00 · ítems sin total
```

- Si se dijeron **total y unitario** y no coinciden con `cantidad × unitario`: gana el **total dicho**, y se emite `ARITMETICA_NO_CUADRA` (revisión). Nunca se “corrige” el total para que cuadre.
- Si el total es `calculado`, se marca `origen_precio='calculado'` y la tarjeta lo dice en letra chica: “2 kilos × S/ 3,50”. La persona puede tocar y poner el total real.
- `precio_microcent_por_base` se calcula **solo al confirmar**, con la fórmula de `07` §1.1, en enteros.
- Redondeo: una sola vez por línea, `round_half_up`; nunca `toFixed` sobre floats.

### 4.6 Ambigüedad: “compré papa y arroz, 30”

**Prohibido repartir.** Regla:

```
2+ productos  + 1 monto suelto  ⇒
  items: papa (total null), arroz (total null)
  monto_sin_repartir_centavos = 3000
  aviso: MONTO_COMPARTIDO
  estado: propuesta, confirmación BLOQUEADA
```

Opciones que se ofrecen, en este orden:

1. **“¿Cuánto fue de cada uno?”** → dos campos numéricos; al completar, la suma **debe** dar exactamente 30,00 (si no, no se puede guardar).
2. **“Todo fue de papa”** → un ítem con 30,00 y el otro se borra (decisión de la persona, no del sistema).
3. **“No sé separar”** → **un** ítem `"Compra de papa y arroz (sin detalle)"` por 30,00, `producto_id = null`, excluido de la serie. El dinero cuenta; el detalle se pierde, y se dice.

Lo mismo aplica a “compré varias cosas, cuarenta”: un ítem sin detalle es **mejor** que cuatro ítems inventados.

### 4.7 Contrato y códigos

```ts
export interface ContextoParseo {
  readonly fecha: string;                       // YYYY-MM-DD (Lima)
  readonly productos: readonly ProductoLigero[]; // catálogo local cacheado
  readonly equivalencias: readonly Equivalencia[];
  readonly preciosReferencia: ReadonlyMap<string, number>; // P50 por producto, puede estar vacío
}

export interface ItemPropuesto {
  readonly lineaNo: number;
  readonly descripcion: string;
  readonly cantidad: number | null;   // en unidad base, o null
  readonly unidadBase: 'g'|'ml'|'unidad' | null;
  readonly unidadCruda: string | null;
  readonly precioTotalCentavos: number | null;
  readonly precioUnitarioCentavos: number | null;
  readonly productoId: string | null;
  readonly confianza: number;          // 0..1
  readonly avisos: readonly CodigoAviso[];
}

export interface ResultadoParseo {
  readonly items: readonly ItemPropuesto[];
  readonly montoSinRepartirCentavos: number | null;
  readonly montoDeclaradoCentavos: number | null;
  readonly coberturaMontoBp: number;   // 0..10000
  readonly requiereRevision: boolean;
  readonly bloqueaConfirmacion: boolean;
  readonly avisos: readonly CodigoAviso[];
}

export function parsearCaptura(texto: string, ctx: ContextoParseo): ResultadoParseo;
```

| Código | Significado | ¿Bloquea confirmar? | Chip |
|---|---|---|---|
| `NUMERO_AMBIGUO` | dos lecturas posibles del monto | **sí** | ⚠️ Revisar |
| `PRECIO_FUERA_DE_RANGO` | fuera de `[P50/3, 3×P50]` (`07` P4) | **sí** | ⚠️ Revisar |
| `ARITMETICA_NO_CUADRA` | total ≠ cantidad × unitario | **sí** | ⚠️ Revisar |
| `MONTO_COMPARTIDO` | 2+ productos, 1 monto | **sí** | ⚠️ Revisar |
| `SIN_PRECIO` | falta el monto | no (incompleta) | ⚠️ Revisar |
| `SIN_CANTIDAD` | falta cantidad | no (sin serie) | ✔ Seguro |
| `CANTIDAD_SUPUESTA` | “el kilo” ⇒ 1 kg | no | ⚠️ Revisar |
| `TOTAL_CALCULADO` | total = cantidad × unitario | no | ✔ Seguro |
| `FRACCION_SIN_UNIDAD` | “un cuarto” sin unidad | no | ⚠️ Revisar |
| `UNIDAD_SIN_EQUIVALENCIA` | bolsa/atado sin tabla | no (sin serie) | ⚠️ Revisar |
| `PRODUCTO_AMBIGUO` | papa: blanca/amarilla/huayro | no | ⚠️ Revisar |
| `SIN_CLASIFICAR` | el catálogo no lo conoce | no | ✔ Seguro |
| `ASR_DUDOSO` | confianza del motor baja | **sí** (si toca un número) | ⚠️ Revisar |
| `CANTIDAD_IMPOSIBLE` | fuera del rango del producto | **sí** | ⚠️ Revisar |

**Regla de oro:** un código que toca **dinero** bloquea; un código que toca **detalle** (producto, unidad, cantidad) no bloquea el dinero pero excluye la línea de la serie de precios.

### 4.8 ¿Y un LLM para el parseo?

⚠️ Solo como **sugeridor de spans**, nunca como calculadora: recibe el texto y devuelve *qué fragmento* es producto / cantidad / precio; el parser determinístico convierte los números y valida. Es la misma regla que `07` §4.1 aplica al extractor de comprobantes (“el modelo devuelve texto, no el importe”). No entra en el camino crítico ni en el demo.

---

## 5. Confianza y revisión

### 5.1 La regla que manda

> **Ningún número toca el presupuesto sin que una persona lo haya visto y confirmado.** Ni con confianza 1,0 (D8, `07` §0.3).

La confianza sirve para **ordenar la atención**, no para saltarse el paso.

### 5.2 Cómo se calcula

```
confianza_item = min(conf_parseo, conf_asr, conf_producto)
```

| Señal | Valor |
|---|---|
| Número dicho explícitamente y sin ambigüedad | 1,0 |
| Total calculado (cantidad × unitario) | 0,9 |
| Cantidad supuesta (“el kilo”) | 0,7 |
| Fracción sin unidad | 0,7 |
| Palabra que el motor marcó con baja probabilidad | 0,5 |
| Producto `por_revisar` (`08`) | 0,5 |
| Sin precio / sin cantidad | 0,4 |

Chips: **`✔ Seguro`** si `confianza ≥ 0,8` y no hay avisos de dinero; **`⚠️ Revisar`** en cualquier otro caso. **Dos chips, no una escala.** Una escala de 5 niveles no la lee nadie con baja alfabetización.

### 5.3 Cómo se muestra lo dudoso sin abrumar

1. **Ordenar, no marcar todo:** las tarjetas `⚠️` van primero; las `✔` se colapsan en una línea (“2 cosas más, S/ 12,00”).
2. **Un solo motivo por tarjeta**, en castellano y con el número grande: “¿S/ **3,50** o S/ **350**?” (no “precio fuera de rango”).
3. **Máximo 3 tarjetas abiertas**; el resto se agrupa: “3 cosas para revisar”.
4. **Nunca un modal.** Se corrige en la misma lista.
5. Si el ítem es dudoso **pero el monto no** (p. ej. “papa” sin variedad), la tarjeta dice: “Está bien el monto. Solo falta decir qué papa era.” Confirmar no se bloquea.

### 5.4 Corrección

| Qué se equivocó | Cómo se corrige | Qué pasa |
|---|---|---|
| Un número | Tocar el número → teclado numérico grande (+ “decir de nuevo” graba solo ese ítem) | Ítem nuevo con `corregido_de`; historial |
| El producto | Tocar el nombre → top-3 del clasificador + buscar | Alias **no** se aprueba solo (`08` §5.2) |
| La unidad | Tocar “kilo” → lista corta (kilo, litro, unidad, bolsa…) | Si no hay equivalencia, aviso y sin serie |
| Falta algo | “+ Agregar otra cosa” | Ítem nuevo, mismo flujo |
| Sobra algo | “Borrar” en la tarjeta | Se marca `excluido`, no se borra la fila |
| Ya confirmó y estaba mal | Solo antes de `asentada`: “Corregir” reabre. Después: nueva captura con `reemplaza_a` o ajuste | El presupuesto nunca se edita en silencio |

### 5.5 “No sé” y silencios

| La persona dice/hace | Respuesta del sistema |
|---|---|
| “no sé cuánto fue” (precio) | El ítem queda `sin_precio`; **no se estima**. Total = suma de lo conocido + “falta el precio de 1 cosa” |
| “no sé cuánto trae la bolsa” | `unidad_base = null`; el dinero cuenta, la serie no |
| “no me acuerdo” (producto) | `sin_clasificar`; el dinero cuenta (D8: el dinero es real aunque el nombre no esté) |
| Silencio / solo ruido | El motor devuelve texto vacío ⇒ “No escuché nada. Prueba otra vez o escribe.” Se conserva el audio para reintentar |
| Se arrepiente de todo | “Borrar” ⇒ `descartada`; el audio se borra (§8) |

**Prohibido:** completar un precio con el promedio del catálogo, con la última compra, o con “lo que suele costar”. Eso es exactamente el dato que después se defiende frente a un jurado y no se puede sostener.

### 5.6 Confirmación incompleta

Se permite confirmar con `cobertura_monto_bp < 10000` (por ejemplo, falta un precio). El presupuesto muestra “**1 compra sin monto**” como contador aparte, y el reporte de cobertura lo refleja. **Nunca se muestra un total que parezca completo cuando no lo es.**

---

## 6. Cola offline

### 6.1 Dónde vive cada cosa

| Dato | Dónde | Cifrado |
|---|---|---|
| `captura`, `captura_item`, `transcripcion` | Dexie | AES-GCM con PIN de la olla (D5) |
| Audio (Blob) | Dexie, tabla `audio_blobs` | Sí, mismo PIN |
| Evento de sync | `outbox` | — |
| Audio en la nube | **no por defecto**; bucket privado solo si la olla lo autoriza | RLS por olla |

Blobs **nunca** en `localStorage` (`02` §4).

### 6.2 Secuencia

```
[1] MediaRecorder → Blob (opus, ~90 KB/30 s)
[2] Guardar blob + captura (estado=capturada) en una transacción Dexie
[3] Si origen=voz y hay que transcribir fuera:
      outbox += { tipo:'asr.transcribir', captura_id, audio_ref,
                  idempotency_key: captura.id, intentos:0 }
    Si se transcribe local: paso [5] directo, sin red
[4] Worker/compute: descarga el audio por URL firmada o multipart,
    transcribe, responde texto; cachea por idempotency_key 24 h
[5] Parser local → ítems propuestos (estado=propuesta)
[6] Persona confirma → outbox += { tipo:'captura.confirmar', idempotency_key }
[7] Servidor asienta; responde `asentado` o `ya_asentado`
[8] Confirmado el asiento → borrar el blob local (§8)
```

### 6.3 Reintentos

| Parámetro | Valor |
|---|---|
| Backoff | 5 s, 15 s, 1 min, 5 min, 30 min, 2 h (con jitter) |
| Intentos máximos | 8 |
| Al agotar | `error_compute` + botón “Reintentar” + “Escribir a mano” |
| Timeout por intento | 20 s (ASR), 15 s (confirmar) |
| Al volver la red | se dispara la cola; no se espera al siguiente arranque |

### 6.4 `idempotency_key`

- **Es el `id` de la captura** (UUIDv7). No se genera una clave nueva por reintento: la misma captura reintentada es la misma operación.
- El servidor hace `insert ... on conflict (id) do nothing` + `select` del ganador (mismo patrón que `02` §4 y `07` T12).
- El compute cachea el resultado de ASR por `idempotency_key` **y** por `audio_hash`: reintentar no vuelve a cobrar ni a transcribir.
- Reenviar 10 veces produce **un** gasto y **una** transcripción.

### 6.5 Límites y pérdida de audio

| Situación | Comportamiento |
|---|---|
| Audio > 30 s | Se corta solo a los 30 s (cuenta regresiva visible) |
| Blob > 2 MB | Se rechaza al guardar con mensaje claro; nunca se sube a medias |
| Cola > 10 capturas | Se avisa “Termina de mandar lo anterior” y se bloquea una captura nueva **solo si** no hay red |
| El navegador borra el blob (presión de almacenamiento) | Al detectar `audio_ref` sin blob ⇒ `audio_perdido`; si hay texto, se sigue; si no, “No encontramos la voz. ¿Escribís lo que gastaste?” |
| Se cierra la app a mitad de la subida | El blob sigue en Dexie; se reintenta |
| Almacenamiento lleno | Se avisa **antes** de grabar (cuota estimada) y se ofrece borrar audios ya confirmados |

- Al enrolar se pide **almacenamiento persistente** (`navigator.storage.persist()`), que reduce —no elimina— el desalojo del navegador. Se le dice a la persona: “Guardamos tus compras en este celular. No borres los datos del navegador.”
- **Nada se pierde en silencio:** si un audio desaparece, hay un estado visible (`audio_perdido`), no un error genérico.

### 6.6 Borrado del audio

| Momento | Qué se borra |
|---|---|
| Al confirmar la captura | Blob local, **inmediatamente** (se conserva `audio_hash`, `audio_ms` y el texto) |
| Si la persona elige “no guardar mi voz” | Blob borrado apenas vuelve la transcripción |
| En la nube (CF) | ✅ Retención cero declarada en `whisper` y `whisper-large-v3-turbo` |
| En la PC de cómputo | Se borra al responder; tope duro 24 h (job de limpieza) |
| Captura descartada | Blob borrado al instante |
| Pedido explícito “borrar mi voz” | Borra blobs y marca `audio_borrado_en`; conserva el texto |

---

## 7. Accesibilidad

### 7.1 Permiso de micrófono denegado

- No es un error técnico: es un estado. Pantalla con ícono, 3 pasos ilustrados (“Ajustes → Aplicaciones → Micrófono”) y **“Escribir a mano”** como botón primario.
- La app **sigue siendo 100 % usable**: capturar a texto, revisar, confirmar, ver presupuesto.
- Se detecta con `getUserMedia` al apretar (no al cargar la pantalla, que asusta).

### 7.2 Ruido de cocina

| Medida | Detalle |
|---|---|
| VAD | ✅ `vad_filter: true` en CF turbo; ✅ Silero VAD en faster-whisper |
| Una compra por toma | “Una cosa por vez” + 30 s máximo |
| Medidor | 3 barras en vivo; si no hay voz en 3 s, “Acércate al teléfono” |
| Reintento barato | “Volver a grabar” siempre visible, sin costo para la persona |
| Vocabulario | `initial_prompt` con productos del catálogo (mejora “jurel”, “huayro”, “pallar”) |
| Silencio | `no_speech_threshold` por defecto; si el texto viene vacío, no se inventa |

### 7.3 Personas que no leen (o leen poco)

1. **Ícono + número + una palabra.** La tarjeta de ítem se entiende sin leer el detalle.
2. **Lectura en voz alta de la confirmación** (opcional, apagable): al confirmar, el sistema dice “Siete soles, papa. Guardado.” con `speechSynthesis` del sistema. Si el dispositivo no tiene voz, no se usa y no se rompe nada.
3. **Un solo botón primario** por pantalla; el resto son secundarios con borde.
4. **Números grandes y con separador peruano**: `S/ 7,00`, no `7.00` ni `700`.
5. **Sin texto instructivo largo**: máximo 8 palabras por línea de instrucción.
6. **Ejemplo escuchable** la primera vez, no un tutorial de 5 pantallas.

### 7.4 Idioma

- **es-PE** en toda la UI. Se evita “chequear”, “subir”, “procesar”. Se usa “anotar”, “mandar”, “leer”.
- Números y fechas en formato peruano (`S/ 1 234,50`, `23/11/2026`).
- El motor se fuerza a `language: 'es'`; no se autodetecta.

### 7.5 Quechua (opcional, sin prometer de más)

- ⚠️ **Whisper no lista quechua entre sus idiomas**: no se promete dictado en quechua. Prometerlo y fallar en la demo es peor que no ofrecerlo.
- Lo que sí se puede: **UI con texto en quechua** (traducción revisada por una persona hablante) y **audio de ayuda grabado** por una persona. El dictado sigue en español.
- Si en el piloto el quechua aparece, se evalúa un modelo específico (fuera de alcance) y se documenta.

### 7.6 Alternativa 100 % texto (siempre)

- Campo de texto libre + autocompletar del catálogo local + teclado numérico grande para el monto.
- Formulario mínimo: **qué** (texto o producto), **cuánto** (monto), **cuándo** (hoy/ayer). Nada más obligatorio.
- El texto pasa por **el mismo parser**: “papá 2 kilos 3.50” escrito a mano produce el mismo ítem que dicho. Un solo camino de validación.
- En el demo, el texto es el **plan B** y también el **plan A** para quien no quiere hablar.

---

## 8. Privacidad

### 8.1 El audio contiene voces de terceros

En una cocina, un clip de 10 s captura a la cocinera, a quien pasa, a quien grita un pedido. Por eso:

| Regla | Implementación |
|---|---|
| **No se sube por defecto** | `modo_transcripcion = local`; el botón de nube es un opt-in explícito por olla/dispositivo |
| Se graba lo mínimo | 30 s tope; un ítem por toma |
| Se avisa antes | “Tu voz se queda en este celular. Si quieres que la lea mejor, se manda solo este pedacito.” |
| Nada de nombres | La UI sugiere: “No digas nombres de personas” |
| Se borra | §6.6 |

### 8.2 Dónde va, si va

| Modo | A dónde | Qué viaja | Retención |
|---|---|---|---|
| `local` (default) | Nada | Nada | — |
| `nube` (opt-in) | Workers AI, binding `AI` (el token nunca está en el navegador) | Solo el clip + `language` + prompt corto | ✅ **Cero** (fichas de `whisper` y `whisper-large-v3-turbo`) |
| `pc` (opt-in) | PC de cómputo por `cloudflared` (prototipo) | Solo el clip | Borrado al responder; tope 24 h |
| Producción | VPS propio | Solo el clip | Borrado al responder |

- ⚠️ **Nunca** se manda el audio junto con nombre, DNI, padrón ni datos de salud. El módulo de captura no toca `personas`.
- El túnel rápido es de prototipo (D9): exige token de servicio, límite de tamaño y de tasa, y **nunca** expone Postgres.
- La transcripción se guarda como **texto** (evidencia mínima); también se puede borrar a pedido.

### 8.3 Texto en la nube

El texto sí se manda para clasificar (`08` §2). Contiene “papa”, “jurel”, montos. **No** contiene identidad. Se aplica la misma regla de retención cero del clasificador.

### 8.4 Repo público: cero datos reales

| Prohibido en el repo | Alternativa |
|---|---|
| Audios de personas reales | Los tests del parser son **texto**; no necesitan audio |
| Audios de evaluación | Se guardan **fuera del repo**, con consentimiento escrito; al repo solo va la transcripción de referencia |
| Boletas, RUC, nombres de proveedores | Fixtures `Proveedor Demo 01` (ya en `07`/`08`) |
| Capturas de pantalla con montos reales | Montos ficticios de las tablas públicas |
| Frases con nombres propios | Se reemplazan por roles (“la cocinera dijo…”) |

- CI: además de `gitleaks`, un test que falla si aparece `*.webm`, `*.wav`, `*.m4a`, `*.mp3`, `*.ogg` en `qa/`, `fixtures/` o `supabase/`.
- Los 12 casos de §9 son **texto**: se pueden versionar sin ningún audio.

---

## 9. Pruebas

### 9.1 Los 12 casos del parser (texto, sin audio, sin red)

Formato: `frase` → ítems esperados. `q` = cantidad en unidad base (kg → g), `$` = total en céntimos, `PU` = unitario en céntimos. `∅` = `null`.

| # | Frase (como la oye el parser) | Ítems esperados | Avisos | ¿Confirma? |
|---|---|---|---|---|
| **T1** | “compré dos kilos de papa a tres cincuenta” | papa · q 2 000 000 (2 kg) · PU 350 · **$ 700** (calculado) | `TOTAL_CALCULADO`, `PRODUCTO_AMBIGUO` | sí (monto firme) |
| **T2** | “jurel ocho soles el kilo” | jurel · q 1 000 000 (1 kg supuesto) · PU 800 · $ 800 | `CANTIDAD_SUPUESTA` | sí, con chip ámbar |
| **T3** | “gasté veinte en arroz” | arroz · q ∅ · unidad ∅ · **$ 2 000** | `SIN_CANTIDAD`, `PRODUCTO_AMBIGUO` | sí; **no** genera serie |
| **T4** | “medio kilo de queso” | queso · q 500 000 (0,5 kg) · **$ ∅** | `SIN_PRECIO` | sí, **incompleta** (`cobertura 0`) |
| **T5** | “un cuarto de queso a doce el kilo” | queso · q 250 000 (0,25 kg) · PU 1 200 · **$ 300** | `FRACCION_SIN_UNIDAD`, `TOTAL_CALCULADO` | sí |
| **T6** | “tres bolsas de arroz a cuatro con cincuenta” | arroz · q 3 · unidad **bolsa** (sin base) · PU 450 · **$ 1 350** | `UNIDAD_SIN_EQUIVALENCIA` | sí; **no** genera serie |
| **T7** | “compré papa y arroz, treinta” | papa ($ ∅) + arroz ($ ∅) · `monto_sin_repartir = 3 000` | `MONTO_COMPARTIDO` | **NO** hasta resolver |
| **T8** | “pollo dos kilos y medio a nueve ochenta” | pollo · q 2 500 000 (2,5 kg) · PU 980 · **$ 2 450** | `TOTAL_CALCULADO` | sí |
| **T9** | “aceite tres litros dieciocho noventa y fideos dos kilos a cuatro” | aceite vegetal · q 3 000 000 (3 L) · **$ 1 890** · PU derivado 630 por L · fideos · q 2 000 000 · PU 400 · **$ 800** | `TOTAL_CALCULADO`, `PRODUCTO_AMBIGUO` (aceite oliva/vegetal) | sí |
| **T10** | *(error de ASR)* “papa trescientos cincuenta el kilo” (la persona dijo “tres cincuenta”) | papa · q 1 000 000 · PU **35 000 céntimos** (S/ 350) · $ 35 000 | **`PRECIO_FUERA_DE_RANGO`** (S/ 350/kg ≫ 3 × S/ 2,20/kg) | **NO**; ofrece “¿S/ 3,50 o S/ 350?” |
| **T11** | “docena de huevos cinco veinte” | huevo · q 12 000 (12 unidades) · **$ 520** · PU 43 333 333 microcent/unidad | — | sí |
| **T12** | “cebolla china un atado a dos soles” | cebolla china · q 1 atado (sin base) · **$ 200** | `UNIDAD_SIN_EQUIVALENCIA` | sí; **no** genera serie |

**Cálculos de control (para el test):**

```
T1  PU 3,50/kg ⇒ 700 × 10^9 / 2 000 000 = 350 000 microcent/g   (✅ S/ 3,50/kg)
T3  sin cantidad ⇒ precio_microcent_por_base = null             (✅ sin serie)
T5  0,25 kg × 12,00 = 3,00 ⇒ 300 céntimos                       (✅)
T8  2,5 × 9,80 = 24,50 ⇒ 2 450 céntimos                         (✅)
T9  1 890 céntimos / 3 L ⇒ 630 000 microcent/ml                 (✅ S/ 6,30/L)
    2 kg × 4,00 = 8,00 ⇒ 800 céntimos                           (✅)
T10 guarda P4: papa P50 = 22 000 microcent/g; 3 × 22 000 = 66 000;
    S/ 350/kg = 35 000 000 microcent/g ⇒ muy fuera ⇒ sospechoso      (✅)
T11 520 × 10^9 / 12 000 = 43 333 333                           (✅ S/ 0,4333/unidad)
```

### 9.2 Casos de estado y cola (además de los 12)

| # | Caso | Esperado |
|---|---|---|
| C1 | Grabar sin red, cerrar la app, abrir con red | Se transcribe una vez; no se duplica el gasto (`idempotency_key`) |
| C2 | Reenviar el mismo push 3 veces | Un solo `gasto`; la 2.ª y 3.ª responden `ya_asentado` |
| C3 | Audio borrado por el navegador | `audio_perdido` visible; ofrece escribir; no hay excepción sin manejar |
| C4 | Confirmar con 1 ítem `sin_precio` | `confirmada` con `cobertura 0`; el panel muestra “1 compra sin monto” |
| C5 | Confirmar T7 sin resolver el reparto | **Bloqueado** con motivo legible |
| C6 | Permiso de micrófono denegado | Se puede completar todo por texto |
| C7 | CF devuelve 429 | `error_compute` suave, reintento con backoff, texto disponible |
| C8 | Transcripción vacía (solo ruido) | “No escuché nada”; no se crea ítem con 0 |
| C9 | Dos capturas idénticas el mismo día | `huella_debil` igual ⇒ `duplicada`, no se suma |
| C10 | Corrección de un monto ya confirmado pero no asentado | Reabre `propuesta`, conserva `corregido_de` |

### 9.3 Métricas de calidad (medir, no asumir)

| Métrica | Definición | Meta |
|---|---|---|
| **Exactitud de números** | clips donde **todos** los montos quedaron bien tras la revisión / clips | 100 % (por diseño) |
| Tasa de corrección de números | ítems con aviso de dinero / ítems | ≤ 15 % |
| Exactitud de producto top-1 | producto elegido sin cambiar / ítems | ≥ 80 % |
| Tiempo por captura | de abrir a confirmar | ≤ 45 s |
| Frases que necesitan texto | capturas abandonadas en voz / voz | ≤ 10 % |
| Tasa de "no entendí" | `error_compute` / capturas de voz | ≤ 5 % |

**Protocolo de medición (día 1):** 20 frases dichas por 3 personas, con el ruido real de una cocina, leídas de una lista fija; se mide p50/p95 de latencia y % de números correctos **antes** de congelar el guion del demo.

---

## 10. Implementación por stream

| Pieza | Dónde | Dueño | Esfuerzo | ¿Mockeable? |
|---|---|---|---|---|
| Tipos, estados, parser, guardas | `packages/domain/src/captura/**` | P1 | L | No (es el corazón) |
| 12 casos + property-based | `packages/domain/src/captura/__tests__` | P1 | M | No |
| Tablas + RLS + migración de enums (`declaracion`, `declarado`) | `supabase/migrations/**` | P1 | M | No |
| `AsrPort` + adaptador CF | `supabase/functions/transcribir/**` | P1 | M | Sí: stub de texto |
| Adaptador faster-whisper | `compute/asr/**` | P3 | M | Sí |
| Grabación, Dexie, blobs, cola | `apps/web/src/features/captura/**` + `packages/sync` | P3 | L | No |
| Pantallas 1–3 | `apps/web/src/features/captura/**` | P2 | L | No |
| Seed + fixtures de texto | `supabase/seed.sql` | P1 | S | — |

**Corte mínimo para el hackathon (si el reloj aprieta):**

1. Captura **manual** (texto) + parser + confirmación + asiento.
2. Micrófono que graba y guarda (aunque la transcripción sea la de la nube en vivo).
3. Adaptador CF turbo con `language:'es'` y `vad_filter`.
4. Los 12 casos del parser en verde.
5. Estado “esperando para leer” con la captura conservada.

Eso ya cuenta la historia completa (“dicto lo que gasté, el sistema me muestra los números, yo los confirmo, y el presupuesto queda bien”) sin depender de la latencia de un modelo.

**Orden recomendado:** parser y estados → captura de texto → grabación y cola → ASR → chips de confianza → accesibilidad fina. **Nunca al revés:** si la voz entra antes que la confirmación, el equipo depura números inventados.

---

## 11. Verificado vs estimado

### 11.1 Verificado en docs (2026-11-23)

| Dato | Fuente |
|---|---|
| `@cf/openai/whisper-large-v3-turbo`: US$ 0,000513/min, 46,63 neurons/min, retención cero, batch, parámetros `language`/`vad_filter`/`initial_prompt`/`beam_size`/`condition_on_previous_text`, entrada base64 | `developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/` |
| `@cf/openai/whisper`: US$ 0,0005/min, 41,14 neurons/min, entrada binaria o `{audio:number[]}` (0–255), retención cero | `.../models/whisper/` + `.../platform/pricing/` |
| Ficha de `whisper`: “Unit Pricing $0.000453 per audio minute” (difiere de la tabla de pricing, US$ 0,0005) | `.../models/whisper/` |
| Rate limit ASR: **720 req/min** | `.../workers-ai/platform/limits/` (`dateModified` 2026-09-17) |
| Free tier: 10.000 neurons/día, US$ 0,011/1.000 neurons, reset 00:00 UTC | `.../workers-ai/platform/pricing/` (`dateModified` 2026-11-18) |
| Deepgram Nova-3: US$ 0,0052/min, 472,73 neurons/min | `.../platform/pricing/` |
| Workers: request body 100 MB (Free/Pro), memoria 128 MB/isolate | `developers.cloudflare.com/workers/platform/limits/` (`dateModified` 2026-11-19) |
| Transformers.js: ONNX en el navegador, WASM por defecto, `device:'webgpu'`, `dtype` q8 por defecto en WASM, tarea `automatic-speech-recognition` | `huggingface.co/docs/transformers.js/en/index` |
| `whisper-tiny` int8: encoder 10.124.990 B + decoder_merged 30.719.241 B; `whisper-base` int8: 23.201.314 B + 53.693.315 B | listado de archivos de `huggingface.co/onnx-community/whisper-tiny` y `.../whisper-base` |
| whisper.cpp: soporte WebAssembly (`whisper.wasm`, `stream.wasm`); disco tiny 75 MiB, base 142 MiB, small 466 MiB; cuantización Q5_0 | `github.com/ggml-org/whisper.cpp` README |
| faster-whisper: hasta 4× más rápido que openai/whisper, int8 CPU/GPU, PyAV sin FFmpeg, VAD Silero; `small` int8 13 min → 1m42s con 1.477 MB en i7-12700K | `github.com/SYSTRAN/faster-whisper` README |
| Whisper: 6 tamaños y requisitos de VRAM (tiny 39M/1GB … large 1550M/10GB, turbo 809M/6GB); `turbo` es large-v3 optimizado con “minimal degradation in accuracy”; `--language Spanish` | `github.com/openai/whisper` README |
| Latencia Perú→Cloudflare: 143 ms promedio, 49–215 ms, `colo=MIA` | medición propia, `02-arquitectura.md` §5.1 |
| Dinero en céntimos, cantidades en milésimas, precio en microcent por base; fórmulas y redondeo | `07-comprobantes-presupuesto.md` §1.1 |
| Unidades aprobadas, `libra = 453,59237 g`, `docena = 12`, saco/caja/atado solo con equivalencia | `07` §6.1 |
| Umbrales de clasificación y regla de `por_revisar` | `08-clasificacion-productos.md` §4.3 |
| D9: tres orígenes, cola única, `pendiente_compute`, audio no se sube por defecto | `06-decisiones.md` D9 |

### 11.2 Estimado (medir el día 1)

1. 🔶 **Latencia de ASR**: 2–5 s en CF turbo; 4 s en la PC con `small` int8 en i7; 10–20 s en 2 vCPU. Medir p50/p95 con 20 clips.
2. 🔶 **Precisión en español peruano de mercado.** No hay benchmark público. El riesgo no es el idioma: son **los números y el léxico** (“jurel”, “huayro”, “pallar”). Medir con 20 frases reales y contar montos correctos.
3. 🔶 **Transformers.js en el Android objetivo**: 45 MB de descarga y latencia de 15–40 s por 10 s de audio. Sin medición, no se promete.
4. 🔶 **`webm/opus` aceptado por Workers AI.** No está documentado; probar 1 clip. Fallback: WAV 16 kHz mono.
5. 🔶 **Quechua**: Whisper no lo lista; verificar la lista de idiomas del tokenizer antes de cualquier promesa.
6. 🔶 **Costo de la PC/VPS**: no se cita proveedor; es infraestructura existente.
7. 🔶 **Tasa de corrección de números** (meta ≤ 15 %): se mide con el piloto, no se asume.

### 11.3 Lo que este documento no decide

- No fija el modelo on-device definitivo ni compra hardware.
- No define el léxico completo de jerga (“luca”, “china”): requiere validación con ollas.
- No implementa detección de intención multi-turno (“y también…”): v1 es una toma por compra.
- No resuelve el reconocimiento de voz simultánea de dos personas.
- No promete que la transcripción sea perfecta: promete que **un número mal oído no entra al presupuesto**.

---

## 12. Fuentes

Consultadas el **2026-11-23**.

- Cloudflare — Workers AI Models: `https://developers.cloudflare.com/workers-ai/models/`
- Cloudflare — `whisper-large-v3-turbo`: `https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/` (+ `schema-input.json`)
- Cloudflare — `whisper`: `https://developers.cloudflare.com/workers-ai/models/whisper/` (+ `schema-input.json`)
- Cloudflare — Workers AI Pricing: `https://developers.cloudflare.com/workers-ai/platform/pricing/`
- Cloudflare — Workers AI Limits: `https://developers.cloudflare.com/workers-ai/platform/limits/`
- Cloudflare — Workers Limits (body 100 MB, memoria): `https://developers.cloudflare.com/workers/platform/limits/`
- Hugging Face — Transformers.js: `https://huggingface.co/docs/transformers.js/en/index`
- Hugging Face — `onnx-community/whisper-tiny`: `https://huggingface.co/onnx-community/whisper-tiny`
- Hugging Face — `onnx-community/whisper-base`: `https://huggingface.co/onnx-community/whisper-base`
- whisper.cpp: `https://github.com/ggml-org/whisper.cpp`
- faster-whisper: `https://github.com/SYSTRAN/faster-whisper`
- OpenAI Whisper: `https://github.com/openai/whisper`
- MDN — `MediaRecorder` / `getUserMedia`: `https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder` · `https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia`
- Documentos del proyecto: `06-decisiones.md` (D8, D9), `07-comprobantes-presupuesto.md`, `08-clasificacion-productos.md`, `02-arquitectura.md` (§3.5, §4, §11).
