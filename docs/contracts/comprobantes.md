# 07 — Comprobantes, clasificación de productos y presupuesto por olla

> Copia integrada de `_hackods-plan/07-comprobantes-presupuesto.md`. En este repo manda `docs/DECISIONES.md` (D8).

**Proyecto:** hackODS-Autónoma 2026 · PWA offline-first para ollas comunes.
**Base obligatoria:** `06-decisiones.md` **D8** (manda sobre todo lo demás), `02-arquitectura.md` §4 (offline), §6 (auth/RLS), §8 (escaneo), §11 (privacidad), `04-plan.md` §2.2 (unidades base g/ml/unidad).
**Alcance de este documento:** especificación implementable y testeable del módulo. **No hay código de producción**: hay tipos, estados, fórmulas, contratos de función y casos con números.
**Fecha:** 2026-11-23.

---

## 0. Qué resuelve y qué no

### 0.1 El requisito, en una frase

Cada olla fotografía o sube sus boletas/facturas; el sistema lee los ítems, **una persona los revisa y confirma**, cada ítem se clasifica contra un catálogo, se registra el precio observado y el gasto entra al presupuesto del período. Con eso se responde: *¿cuánto ha subido o bajado cada producto?*, *¿cuánto le queda a esta olla hoy?* y *¿cómo se compara con las demás ollas?* — sin mostrar proveedores ni personas.

### 0.2 Lo que este módulo **no** es

| No es | Por qué |
|---|---|
| Contabilidad ni declaración tributaria | La olla es consumidora final; el módulo registra **dinero gastado**, no crédito fiscal. `validez_tributaria` es informativa. |
| Un validador de comprobantes ante SUNAT | No se consulta el CPE ni se valida el dígito de RUC en v1 `[a confirmar: alcance]`. La evidencia es la foto + revisión humana. |
| Un lector de manuscrito | Igual que ADR-007: solo texto impreso. Si la boleta es ilegible, se tipea a mano. |
| Un pagador | No mueve dinero, no paga proveedores, no aprueba compras. |
| Un ranking de ollas | Se compara contra una banda; nunca se publica un ranking nominal ni un monto de otra olla. |
| Un módulo de personas | No toca `personas` ni datos de salud. Si la boleta trae nombre/DNI del comprador, se **redacta antes de subir**. |

### 0.3 Reconciliación con las decisiones vigentes

- **Supabase sigue siendo el único backend** (ADR-004). Cloudflare Workers AI se usa **solo como inferencia sin estado** (visión + embeddings) desde una Edge Function; no guarda datos, no reemplaza Postgres, no crea una segunda fuente de verdad.
- **Local-first** (ADR-003): capturar y confirmar funciona sin red. La extracción por IA **sí** necesita red; por eso la entrada manual es camino de primera clase, no fallback vergonzante.
- **Nada entra al presupuesto sin confirmación humana** (D8). No hay auto-confirmación, ni siquiera con confianza 1.0.
  - Contrato: `itemPresupuestableSchema` (`packages/contracts/src/comprobantes.ts`) exige `estado === 'confirmado'`; el guard `esItemPresupuestable` sirve al consumidor en memoria. Test: `comprobantes.test.ts` (#5).
- **Precio como serie inmutable**, tendencia contra mediana (D8), no contra promedio.
- **k ≥ 10** para agregados entre ollas, tomado del documento del usuario (`nxtqbsr` §7.6; `10-texto` §7), donde se declara **criterio de privacidad, no obligación legal**.

### 0.4 Decisiones de diseño propias (no están en D8)

Están marcadas así en todo el documento. Si el equipo las cambia, no se rompe el modelo:

| # | Decisión propia | Valor inicial | Dónde |
|---|---|---|---|
| P1 | N de la mediana móvil | **7** observaciones, mínimo 3 | §8 |
| P2 | Umbrales de clasificación | Los de `packages/domain/src/clasificacion/config.ts` (τ, margen y piso calibrados; hoy τ=0,69). Este documento **no repite los números**. El antiguo 0,90/0,05 era una **segunda puerta de sugerencia fuerte** (presentación), no el umbral de clasificación τ, y queda retirado | §4 |
| P3 | Filtro de outlier | z modificado > 3,5 sobre MAD (Iglewicz–Hoaglin) | §8 |
| P4 | Guarda de precio | fuera de `[P50/3, 3×P50]` ⇒ `sospechoso` | §8 |
| P5 | Período por defecto | mensual (día 1 al último día del mes), `America/Lima` | §7 |
| P6 | Retención de imagen | 24 meses, configurable `[a confirmar con contabilidad]` | §13 |
| P7 | Reporte entre ollas | **opt-in por olla**; si no consiente, no aporta ni recibe comparación | §9 |
| P8 | Quién confirma | `organizadora` o `admin`; `cocinera` captura y corrige pero no confirma dinero | §3 |
| P9 | Tolerancia de IGV | ±S/ 0,20 entre el IGV declarado y el 18 % calculado | §6.2 |
| P10 | Dominancia en agregados | si una olla aporta > 50 % del peso de la celda, se suprime | §9.3 |

---

## 1. Convenciones (leer antes de las tablas)

### 1.1 Dinero: enteros, nunca float

| Concepto | Campo | Escala | Ejemplo |
|---|---|---|---|
| Importe | `*_centavos bigint` | 1 = S/ 0,01 | S/ 553,30 = `55330` |
| Cantidad | `cantidad_milesimas bigint` | 1 = 0,001 unidad base (g, ml o unidad) | 25 kg = `25000000` |
| Precio normalizado | `precio_microcent_por_base bigint` | 1 = 10⁻⁶ céntimo **por unidad base** | S/ 2,20/kg = `220000` (por g) |
| Porcentaje | `*_bp int` | puntos base: 10 000 = 100 % | 89,07 % = `8907` |

Conversión de un precio “de góndola”:

```
S/ por kg   → microcent por g   : × 100 000
S/ por L    → microcent por ml  : × 100 000
S/ por unid → microcent por unid: × 100 000 000
```

Comprobación: S/ 2,20/kg × 100 000 = **220 000**; S/ 0,50/unidad × 100 000 000 = **50 000 000**.

Fórmula de línea (la única que produce dinero):

```
total_linea_centavos = round_half_up( cantidad_milesimas × precio_microcent_por_base / 1_000_000_000 )
precio_microcent_por_base = round_half_up( total_neto_con_igv_centavos × 1_000_000_000 / cantidad_milesimas )
```

> **Regla dura:** los importes se **suman desde `total_linea_centavos`**, nunca desde `cantidad × precio_normalizado`. El precio normalizado es para comparar series; los céntimos vienen del comprobante. Esto evita el error clásico de que 6 líneas no sumen el total por redondeo.

> **Precio de la serie = precio final pagado, con IGV.** Si el comprobante discrimina IGV, el bruto de cada línea se obtiene repartiendo el IGV (mayor residuo) y se guarda en `total_neto_con_igv_centavos`; ese es el importe que alimenta `precio_observado`. Comparar un precio sin IGV de una factura contra el precio con IGV de una boleta sería comparar dos cosas distintas.

### 1.2 Precisión y redondeo

- `round_half_up` sobre valores positivos, en una sola división entera. Nada de `toFixed` sobre floats.
- El redondeo ocurre **una vez por línea**, al confirmar. Después es inmutable.
- Sumas y medianas se calculan en enteros; la mediana par promedia dos valores y redondea al entero más cercano.
- Diferencias de ±1 céntimo entre líneas y total son tolerables y se guardan en `diferencia_conciliacion_centavos`; más de eso **bloquea la confirmación**.

### 1.3 Fechas

| Campo | Tipo | Significado |
|---|---|---|
| `fecha_emision` | `date` | La que imprime el comprobante |
| `fecha_imputacion` | `date` | A qué día se imputa el gasto; por defecto = emisión; la persona puede corregirla |
| `ocurrido_en` | `date` | Fecha de negocio del movimiento de presupuesto (normalmente = imputación) |
| `asentado_en` | `timestamptz` | Cuándo el **servidor** aplicó el movimiento. Es la base del “presupuesto en ese momento” |
| `capturado_en` | `timestamptz` | Cuándo el dispositivo guardó. Solo se usa para lo provisional |

Zona horaria de negocio: **`America/Lima`**. Una boleta de las 23:30 del 30/11 pertenece a noviembre, no a diciembre. Prohibido derivar la fecha de negocio de un `timestamptz` en UTC sin convertir.

### 1.4 Identidad y sync

- `id uuid` **UUIDv7 generado en el cliente** (ADR-003).
- Toda tabla sincronizable lleva `lamport bigint`, `device_id text`, `updated_at timestamptz`, `deleted_at timestamptz null`.
- Actores: `actor_ref text` opaco (`M-xxxx` o `D-xxxx`). **Nunca** nombre, DNI ni teléfono (D2).
- Movimientos y observaciones de precio son **append-only**: se corrigen con otra fila, no con `update`.
- Comprobante confirmado: sus ítems quedan **congelados**. Corregir = nota de crédito o anulación + nuevo comprobante.

### 1.5 Regla de nulabilidad

“Obligatorio” = `not null` + check. “Condicional” = obligatorio solo en el estado indicado. **Nunca** se usa `null` para significar “0”: si no hay descuento, `descuento_centavos = 0`.

---

## 2. Entidades y campos

Todas las tablas llevan RLS activo y `olla_id` salvo las globales (`producto_catalogo`, `producto_alias` global, `unidad_equivalencia` global).

### 2.1 `comprobante`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | UUIDv7 del cliente |
| `olla_id` | uuid FK | sí | RLS y partición lógica |
| `periodo_id` | uuid FK `presupuesto` | condicional | `null` hasta confirmar; **obligatorio al asentar**. Si no hay presupuesto vigente, se bloquea con `SIN_PERIODO` y se ofrece crearlo |
| `tipo` | enum | sí | `boleta` \| `factura` \| `nota_credito` \| `otro` |
| `origen` | enum | sí | `compra` \| `donacion_especie` \| `transferencia_entre_ollas` \| `ajuste_interno` |
| `proveedor_nombre` | text | sí | Tal como figura; 1–120 chars |
| `proveedor_nombre_norm` | text | sí | Mayúsculas, sin tildes, espacios colapsados (dedupe) |
| `proveedor_id` | uuid FK | no | Catálogo interno; **nunca** se expone en reportes |
| `proveedor_ruc` | char(11) | no | Solo dígitos; no se valida dígito verificador en v1 |
| `serie` | text | no | Ej. `B001`, `F001` |
| `folio` | text | no | Número correlativo tal como figura |
| `folio_norm` | text | no | Mayúsculas, sin ceros a la izquierda |
| `fecha_emision` | date | sí | ≤ hoy + 1 día (tolera desfase de celular) |
| `fecha_imputacion` | date | sí | Default = emisión |
| `moneda` | char(3) | sí | Default `PEN` |
| `tipo_cambio` | numeric(12,6) | condicional | Obligatorio si `moneda <> 'PEN'` |
| `total_pen_centavos` | bigint | condicional | Obligatorio al confirmar si `moneda <> 'PEN'` |
| `lineas_incluyen_igv` | boolean | sí | `true` en boleta típica; define la conciliación |
| `tratamiento_igv` | enum | sí | `incluido_no_discriminado` \| `discriminado` \| `exonerado` \| `inafecto` \| `desconocido` |
| `subtotal_centavos` | bigint | condicional | Obligatorio si `discriminado` |
| `igv_centavos` | bigint | condicional | Obligatorio si `discriminado` |
| `descuento_centavos` | bigint | sí | Default 0; descuento global |
| `total_centavos` | bigint | sí | > 0; es la verdad del dinero |
| `diferencia_conciliacion_centavos` | int | no | Calculado al confirmar |
| `imagen_hash` | char(64) | no | SHA-256 hex de la imagen normalizada; `null` si entrada manual |
| `imagen_phash` | text | no | pHash perceptual (hex 64 bits) para fotos recomprimidas |
| `imagen_path` | text | no | Ruta en bucket privado `comprobantes` |
| `paginas_total` | smallint | sí | Default 1 |
| `huella_fuerte` | char(64) | condicional | Obligatoria al confirmar (§5) |
| `huella_debil` | char(64) | no | Para comprobantes sin folio |
| `estado` | enum | sí | §3 |
| `motivo_estado` | text | no | Código legible, no prosa libre con nombres |
| `duplicado_de_id` | uuid FK self | no | Obligatorio si `estado = duplicado` |
| `comprobante_afectado_id` | uuid FK self | condicional | Obligatorio si `tipo = nota_credito` |
| `reparto_modo` | enum | sí | `no` \| `por_monto` (v1) \| `por_items` (fuera de v1) |
| `extraccion` | jsonb | no | Salida cruda del extractor, sin PII, versionada |
| `extractor_version` | text | no | Ej. `vision-v1` |
| `clasificador_version` | text | no | Ej. `emb-v1` |
| `confianza_extraccion` | numeric(4,3) | no | 0–1, global |
| `confirmado_en` | timestamptz | condicional | Obligatorio desde `confirmado` |
| `confirmado_por_ref` | text | condicional | Obligatorio desde `confirmado` |
| `asentado_en` | timestamptz | condicional | Obligatorio desde `asentado` |
| `created_at`, `updated_at`, `lamport`, `device_id`, `deleted_at` | — | sí/no | Sync |

**Checks**

- `total_centavos > 0`, salvo `origen = 'donacion_especie'` donde `total_centavos ≥ 0` (puede no tener valor declarado).
- `tipo = 'nota_credito'` ⇒ `comprobante_afectado_id is not null` y `origen = 'ajuste_interno'`.
- `origen = 'donacion_especie'` ⇒ no genera `gasto` (solo valorización, §6.6).
- `estado = 'asentado'` ⇒ `asentado_en is not null and confirmado_por_ref is not null and periodo_id is not null`.
- `tratamiento_igv = 'discriminado'` ⇒ `subtotal_centavos + igv_centavos - descuento_centavos = total_centavos ± 1`.
- Único `(olla_id, huella_fuerte)` donde `huella_fuerte is not null and estado not in ('rechazado','duplicado') and deleted_at is null`.

**Auxiliar `comprobante_adjunto`** (fotos de varias páginas): `id`, `comprobante_id`, `imagen_hash`, `imagen_phash`, `imagen_path`, `pagina_no`, `created_at`. Permite que una boleta de 2 páginas sea **un** comprobante; `comprobante.imagen_hash` guarda la principal.

### 2.2 `comprobante_item`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | UUIDv7 |
| `comprobante_id` | uuid FK | sí | Cascade lógico |
| `olla_id` | uuid | sí | Denormalizado para RLS |
| `linea_no` | int | sí | 1..n, único por comprobante |
| `descripcion_cruda` | text | sí | Exactamente lo impreso: `ARROZ EXTRA 1 SACO 50KG` |
| `cantidad_cruda` | text | no | `2.5`, `1/2`, `1 SACO` — se conserva el original |
| `unidad_cruda` | text | no | `KG`, `LB`, `SACO`, `CAJA`, `ATADO`, `UN` |
| `presentacion_cruda` | text | no | `SACO 50 KG`, `CAJA 12×1 L` |
| `cantidad_milesimas` | bigint | condicional | Obligatoria para `normalizado`; > 0 |
| `unidad_base` | enum | condicional | `g` \| `ml` \| `unidad` |
| `equivalencia_id` | uuid FK | no | Obligatoria si se convirtió una presentación |
| `precio_unitario_crudo_centavos` | bigint | no | El precio unitario impreso, si existe |
| `total_linea_centavos` | bigint | sí | > 0; importe con el que se concilia: **bruto** si el comprobante incluye IGV, **neto** si lo discrimina |
| `descuento_linea_centavos` | bigint | sí | Default 0; incluye descuento global prorrateado |
| `total_neto_centavos` | bigint | sí | `total_linea − descuento_linea`; ≥ 0; conserva el tratamiento de IGV de `total_linea` (neto si discrimina, bruto si incluye) |
| `igv_linea_centavos` | bigint | condicional | IGV repartido a la línea; 0 si incluido/exonerado; `Σ = comprobante.igv_centavos` |
| `total_neto_con_igv_centavos` | bigint | sí | Bruto pagado por la línea: `total_neto + igv_linea`; `Σ = comprobante.total_centavos` |
| `es_peso_variable` | boolean | sí | `true` si el peso lo fija la balanza (`1.037 kg`) |
| `producto_id` | uuid FK | condicional | Obligatorio si `estado = confirmado` y no excluido |
| `producto_confianza` | numeric(4,3) | no | Similitud del clasificador |
| `candidatos` | jsonb | no | Top-3 `{producto_id, similitud}`, para la UI de revisión |
| `estado` | enum | sí | `extraido` \| `normalizado` \| `clasificado` \| `por_revisar` \| `confirmado` \| `excluido` |
| `motivo_estado` | text | no | Código: `unidad_ambigua`, `confianza_baja`, `empate`, `cantidad_imposible`, `sin_equivalencia`, `duplicado_linea` |
| `origen_valor` | enum | sí | `comprobante` \| `estimado` \| `referencia_donacion` |
| `precio_microcent_por_base` | bigint | condicional | Se calcula al confirmar sobre `total_neto_con_igv_centavos`; > 0 |
| `excluido_de_serie` | boolean | sí | Default `false`; `true` si no debe alimentar tendencias |
| `created_at`, `updated_at`, `lamport`, `device_id` | — | sí | Sync |

**Checks**

- `linea_no` único por `comprobante_id`.
- `total_linea_centavos > 0`, salvo ítems de `origen='donacion_especie'` sin valor declarado (`≥ 0`). Las notas de crédito no llevan ítems en v1: llevan monto.
- `estado = 'confirmado'` ⇒ `producto_id is not null` y `unidad_base is not null` y `cantidad_milesimas > 0`.
- `estado = 'excluido'` ⇒ `motivo_estado is not null`.
- `descuento_linea_centavos ≤ total_linea_centavos`.
- `Σ igv_linea_centavos = comprobante.igv_centavos` cuando `tratamiento_igv = 'discriminado'`.
- `Σ total_neto_con_igv_centavos = comprobante.total_centavos` (±1 céntimo).

> No confundir `estado = 'excluido'` (el ítem no se usa para nada, pero su importe sigue en el total del comprobante) con `excluido_de_serie = true` (el ítem sí cuenta como gasto, pero no alimenta la tendencia de precios).

### 2.3 `producto_catalogo` (global)

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | UUIDv5 determinístico desde `slug` (seedeable) |
| `slug` | text | sí | Único: `papa-blanca`, `arroz-extra` |
| `nombre` | text | sí | `Papa blanca` |
| `categoria` | enum | sí | `abarrotes` \| `verduras` \| `frutas` \| `carnes` \| `lacteos` \| `bebidas` \| `limpieza` \| `otros` |
| `subcategoria` | text | no | `tuberculos`, `menestras`… |
| `unidad_base` | enum | sí | `g` \| `ml` \| `unidad` |
| `perecedero` | boolean | sí | — |
| `peso_variable` | boolean | no | Default `false` |
| `rango_precio_min_microcent` | bigint | no | Guarda de cordura, editable por admin |
| `rango_precio_max_microcent` | bigint | no | Idem |
| `cantidad_min_linea_milesimas` | bigint | no | Guarda de cantidad por línea |
| `cantidad_max_linea_milesimas` | bigint | no | Idem |
| `activo` | boolean | sí | Default `true` |
| `version` | int | sí | Sube con cada cambio semántico |
| `created_at`, `updated_at`, `deleted_at` | — | sí | — |

Sin `olla_id`: es un catálogo compartido. Lectura para todo autenticado; escritura solo `admin`. Los cambios se versionan; un producto no se borra si tiene observaciones (se desactiva).

### 2.4 `producto_alias`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `producto_id` | uuid FK | sí | — |
| `olla_id` | uuid FK | no | `null` = alias global aprobado por admin; con valor = alias de esa olla |
| `texto` | text | sí | Como lo escribe el proveedor |
| `texto_norm` | text | sí | Minúsculas, sin tildes, sin puntuación, unidades expandidas (`kg`→`kilogramo`) |
| `estado` | enum | sí | `propuesto` \| `aprobado` \| `rechazado` |
| `origen` | enum | sí | `humano` \| `modelo` \| `importacion` |
| `aprobado_por_ref` | text | condicional | Obligatorio si `aprobado` |
| `aprobado_en` | timestamptz | condicional | Idem |
| `veces_usado` | int | sí | Default 0; se incrementa al confirmar |
| `ultima_vez` | timestamptz | no | — |

Único `(coalesce(olla_id,'00000000-0000-0000-0000-000000000000'), texto_norm)`. Un alias global solo lo crea `admin`; una olla **no** puede redefinir un alias global (si discrepa, crea uno propio y gana el de la olla).

> El catálogo aprende **solo** con alias aprobados por una persona (D8). El clasificador puede *proponer* alias; nunca los activa solo. Un alias mal aprobado mezcla precios de dos productos y arruina la serie; por eso la pantalla de aprobación muestra **5 usos previos y 3 precios de ejemplo**.

### 2.5 `precio_observado` (inmutable)

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `olla_id` | uuid | sí | Olla que observó (la que pagó) |
| `producto_id` | uuid FK | sí | — |
| `comprobante_item_id` | uuid FK | no | `null` si es encuesta de mercado |
| `fecha` | date | sí | = `fecha_emision` |
| `canal` | enum | sí | `mayorista` \| `minorista` \| `no_declarado` |
| `unidad_base` | enum | sí | Copia del ítem |
| `cantidad_milesimas` | bigint | sí | > 0 |
| `precio_microcent_por_base` | bigint | sí | > 0; calculado del **total neto con IGV** de la línea |
| `moneda` | char(3) | sí | — |
| `precio_pen_microcent_por_base` | bigint | condicional | Obligatorio si `moneda <> 'PEN'` |
| `proveedor_ref` | uuid | no | Para dedupe interno; **jamás** en reportes |
| `zona_id` | uuid | no | Distrito/red; nunca dirección |
| `origen` | enum | sí | `compra` \| `encuesta` \| `donacion_valorizada` |
| `estado` | enum | sí | `valido` \| `sospechoso` \| `excluido` |
| `motivo_exclusion` | text | no | Código |
| `reemplaza_a_id` | uuid FK self | no | Corrección de una observación |
| `created_at`, `lamport`, `device_id` | — | sí | Sin `updated_at`: no se edita |

Reglas:

- Único `comprobante_item_id` donde `estado = 'valido'`: **una línea produce como máximo una observación**.
- Corregir = insertar nueva observación + `estado='excluido'` en la anterior con `reemplaza_a_id`. La serie conserva la historia.
- `estado = 'sospechoso'` no entra a la mediana; se muestra en revisión.
- Solo se crea con ítem `confirmado`, `producto_id` no nulo, unidad normalizada y `excluido_de_serie = false`.
- Donación valorizada: se registra con `origen='donacion_valorizada'` y `estado='sospechoso'` por defecto; solo entra a la serie si una persona la aprueba (evita que un “valor referencial” inventado mueva la tendencia).

### 2.6 `presupuesto`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `olla_id` | uuid | sí | — |
| `ambito` | enum | sí | `mensual` \| `quincenal` \| `evento` \| `anual` |
| `periodo_desde` | date | sí | — |
| `periodo_hasta` | date | sí | ≥ desde |
| `moneda` | char(3) | sí | PEN en v1 |
| `monto_asignado_inicial_centavos` | bigint | sí | ≥ 0; **inmutable** |
| `estado` | enum | sí | `borrador` \| `vigente` \| `cerrado` |
| `version` | int | sí | Sube con cada ajuste; el histórico está en el ledger |
| `nota` | text | no | Texto corto, sin datos personales |
| `created_at`, `updated_at`, `lamport`, `device_id` | — | sí | — |

Único `(olla_id, ambito, periodo_desde)` para presupuestos no cerrados. Puede haber un `mensual` y un `anual` a la vez, pero **solo el mensual alerta y gobierna el gasto operativo**; sumar ambos duplica el dinero (§7.4).

> **`gastado`, `comprometido` y `disponible` NO son columnas.** Son vistas calculadas desde `movimiento_presupuesto`, igual que la despensa calcula su saldo desde movimientos (ADR-003). Un contador mutable aquí es un bug de dinero garantizado.

### 2.7 `movimiento_presupuesto` (append-only)

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `olla_id` | uuid | sí | — |
| `presupuesto_id` | uuid FK | sí | — |
| `tipo` | enum | sí | Ver tabla de signos |
| `monto_centavos` | bigint | sí | **Con signo**; nunca 0 |
| `comprobante_id` | uuid FK | condicional | Obligatorio para `gasto`, `credito`, `anulacion` |
| `comprobante_item_id` | uuid FK | no | Solo si el asiento es por ítem (v1: no) |
| `compromiso_id` | uuid FK self | condicional | Para `liberacion_compromiso` |
| `ocurrido_en` | date | sí | Fecha de negocio |
| `asentado_en` | timestamptz | sí | Hora del servidor |
| `actor_ref` | text | sí | Quién lo provocó (persona o `sistema`) |
| `motivo` | text | condicional | Obligatorio en `ajuste`, `anulacion`, `traslado_*` |
| `idempotency_key` | text | sí | Único global |
| `lamport`, `device_id`, `created_at` | — | sí | — |

| `tipo` | Signo | Qué representa |
|---|---|---|
| `asignacion` | + | Dinero asignado al período (apertura) |
| `ajuste` | ± | Aumento o reducción del asignado; motivo obligatorio |
| `traslado_entrada` | + | Recibe saldo de otro período |
| `traslado_salida` | − | Envía saldo a otro período |
| `gasto` | + | Comprobante confirmado y asentado |
| `credito` | − | Nota de crédito o descuento posterior |
| `anulacion` | − | Reverso total de un gasto |
| `compromiso` | + | Compra comprometida, aún sin comprobante |
| `liberacion_compromiso` | − | Se cumple, se vence o se cancela el compromiso |

Invariantes (RPC + tests, no todos expresables en un `check`):

1. `idempotency_key` único ⇒ reintentar no duplica.
2. Para un `comprobante` con `origen='compra'`: la suma de **todos** los movimientos de reparto en **todas** las ollas (`gasto + credito + anulacion`) = `total_pen_centavos`; en cada olla, la suma de sus movimientos = su parte. En una compra no compartida, la parte es el 100 %.
3. `liberacion_compromiso` no puede superar el `compromiso` vivo.
4. No hay `gasto` de un comprobante que no esté `asentado`.
5. `update`/`delete` revocados: solo `insert`.
6. `asentado_en` lo pone el servidor. El valor del cliente se ignora (los relojes de Android mienten, D5).

### 2.8 `alerta`

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `olla_id` | uuid | sí | — |
| `tipo` | enum | sí | `presupuesto_80` \| `presupuesto_100` \| `proyeccion_excede` \| `comprobante_duplicado` \| `comprobante_reutilizado` \| `item_por_revisar` \| `precio_outlier` \| `serie_insuficiente` \| `conciliacion_fallida` \| `sin_periodo` \| `periodo_cerrado_con_gasto` |
| `severidad` | enum | sí | `info` \| `atencion` \| `critica` |
| `estado` | enum | sí | `abierta` \| `vista` \| `resuelta` \| `descartada` |
| `clave_dedup` | text | sí | Ej. `presupuesto_80:<presupuesto_id>` |
| `entidad`, `entidad_id` | text, uuid | sí | A qué apunta |
| `payload` | jsonb | no | Números para pintar la alerta |
| `creada_en`, `vista_en`, `resuelta_en` | timestamptz | sí/no | — |
| `resuelta_por_ref` | text | no | — |
| `silenciada_hasta` | timestamptz | no | Para no repetir una alerta ya vista |

Único `(olla_id, clave_dedup)` donde `estado in ('abierta','vista')`. Así la alerta del 80 % se dispara **una vez por período y versión**, no en cada comprobante.

### 2.9 Auxiliares

**`unidad_equivalencia`** (tabla aprobada del D8)

| Campo | Tipo | Oblig. | Regla |
|---|---|---|---|
| `id` | uuid | sí | — |
| `olla_id` | uuid | no | `null` = global |
| `producto_id` | uuid | no | `null` = genérica (`saco` no sirve genérica; `docena` sí) |
| `texto_norm` | text | sí | `saco 50 kg`, `caja 12x1 l`, `libra`, `atado` |
| `factor_milesimas_base` | numeric(18,4) | sí | Cuántas milésimas de unidad base hay en 1 unidad del texto |
| `unidad_base` | enum | sí | `g` \| `ml` \| `unidad` |
| `estado` | enum | sí | `propuesto` \| `aprobado` \| `rechazado` |
| `aprobado_por_ref`, `aprobado_en` | — | condicional | — |
| `ejemplo` | text | no | `saco de papa = 50 kg` |

Equivalencias exactas y verificables: `libra = 453,59237 g` (definición internacional), `docena = 12 unidad`. **No** se inventan pesos de “saco”, “caja” o “atado”: si no están aprobados para ese producto, el ítem queda `por_revisar`.

**`proveedor`**: `id`, `nombre_norm`, `ruc` (nullable, único cuando no es null), `zona_id`, `created_at`. Sirve para dedupe y para no repetir variantes (`MERCADO DEMO 01` / `MKT DEMO 1`). **Nunca** se expone en el reporte entre ollas.

**`comprobante_huella`** (global, solo servidor): `huella_fuerte` (pk), `olla_id`, `comprobante_id`, `fecha`. La escribe un trigger `security definer` al confirmar; **sin grants** al cliente. Permite detectar el mismo comprobante en dos ollas sin violar RLS (§5.3).

**`comprobante_participante`**: `comprobante_id`, `olla_id`, `monto_centavos`, `estado` (`pendiente` \| `aceptado` \| `rechazado`). Permite que la olla B vea el comprobante compartido sin ver el presupuesto de A; la policy de `select` de `comprobante` **y de sus ítems** acepta al participante. `Σ monto_centavos = total_pen_centavos`.

---

## 3. Ciclo de vida

### 3.1 Diagrama

```
                 (offline)
  capturado ──► en_cola ──► extrayendo ──► extraido ──► clasificando
      │             │            │                          │
      │             │            └──► error_extraccion ◄────┘
      │             │                        │
      │             ▼                        ▼
      │        (manual) ───────────────► por_revisar ──► confirmado ──► asentado
      │                                     │  ▲            │            │
      └──────────── rechazado ◄─────────────┘  └────────────┘            │
                        ▲                                                 │
                        └──────────── duplicado ◄───────────────────────┘
                                                                          │
                                                              anulado ◄───┘
```

### 3.2 Estados exactos

| Estado | Dónde vive | Significado |
|---|---|---|
| `capturado` | solo local | Foto/PDF o entrada manual guardada; aún sin red |
| `en_cola` | local + servidor | En outbox; espera extracción |
| `extrayendo` | servidor | Worker con lease vigente |
| `extraido` | servidor | Hay ítems crudos; aún sin clasificar |
| `clasificando` | servidor | Emparejando contra catálogo/alias |
| `por_revisar` | servidor | Requiere persona (confianza, unidad, conciliación o duplicado) |
| `confirmado` | servidor | Una persona aprobó; ítems congelados |
| `asentado` | servidor | Movimientos de presupuesto escritos (éxito final) |
| `rechazado` | servidor | No se usará; motivo obligatorio |
| `duplicado` | servidor | Ya existe otro comprobante equivalente |
| `error_extraccion` | servidor | Falló el extractor; reintentable |
| `anulado` | servidor | Se revirtió con nota de crédito o anulación |

Terminales para edición: `asentado`, `anulado`, `duplicado`, `rechazado`. Un `asentado` solo se corrige con otro documento, nunca editando.

### 3.3 Transiciones, actor y guardas

| # | Transición | Actor | Guardas | Efecto |
|---|---|---|---|---|
| 1 | ∅ → `capturado` | `cocinera`, `organizadora` | Olla activa; imagen ≤ 8 MB o entrada manual con total > 0 | Fila local + blob en Dexie |
| 2 | `capturado` → `en_cola` | sistema (cliente) | Hay red; imagen subida o entrada manual | Outbox con `idempotency_key` |
| 3 | `en_cola` → `extrayendo` | sistema (worker) | Lease libre; `intentos < 3` | Marca `extraccion_iniciada_en` |
| 4 | `extrayendo` → `extraido` | sistema | ≥ 1 ítem parseado o entrada manual | Crea `comprobante_item` en `extraido` |
| 5 | `extrayendo` → `error_extraccion` | sistema | Timeout de lease o fallo del proveedor | Alerta; reintento manual |
| 6 | `error_extraccion` → `en_cola` | `organizadora`, sistema | `intentos < 5` | Reintento |
| 7 | `extraido` → `clasificando` | sistema | — | Embeddings/alias |
| 8 | `clasificando` → `por_revisar` | sistema | Algún ítem bajo el piso de `config.ts`, empate, unidad no aprobada, conciliación > ±1 céntimo, duplicado posible | Ítems quedan `por_revisar` con motivo |
| 9 | `clasificando` → `por_revisar` | sistema | Incluso si todo salió bien | **Siempre** pasa por revisión humana (D8) |
| 10 | `por_revisar` → `por_revisar` | `organizadora` | Corrige producto/unidad/total; guarda | No asienta |
| 11 | `por_revisar` → `confirmado` | `organizadora`, `admin` | 0 ítems en `por_revisar`; conciliación ±1; duplicado resuelto; `total_pen` si aplica; **presupuesto vigente** para `fecha_imputacion` | Congela ítems; calcula precios |
| 12 | `confirmado` → `asentado` | sistema (RPC) | Idempotente; `periodo_id` no nulo | Escribe `gasto` y `precio_observado` |
| 13 | `por_revisar` → `rechazado` | `organizadora`, `admin` | Motivo obligatorio | No asienta |
| 14 | pre-confirmado → `duplicado` | `organizadora`, `admin`, o sistema si la huella fuerte coincide | `duplicado_de_id` obligatorio | Alerta al otro extremo si es de otra olla |
| 15 | `asentado` → `anulado` | `organizadora` (mismo período) / `admin` (fuera) | Motivo; NC o error | `anulacion` negativo; precios quedan excluidos |
| 16 | `rechazado` → `por_revisar` | `organizadora` | No es duplicado | Reabre |

**Nadie** puede: editar un `asentado`, borrar un movimiento, confirmar su propio comprobante si es el mismo actor que lo capturó **y** la olla tiene más de una persona con rol de confirmación (segregación de funciones; si hay una sola, se permite y se registra `mismo_actor=true`).

### 3.4 Permisos por rol

| Acción | `cocinera` | `organizadora` | `nutricionista` | `admin` |
|---|---|---|---|---|
| Capturar comprobante | ✅ | ✅ | ❌ | ✅ |
| Corregir ítems | ✅ | ✅ | ❌ | ✅ |
| Confirmar (asienta dinero) | ❌ | ✅ | ❌ | ✅ |
| Rechazar / marcar duplicado | ❌ | ✅ | ❌ | ✅ |
| Anular | ❌ | ✅ mismo período | ❌ | ✅ |
| Ver presupuesto de su olla | solo totales | ✅ | agregados | ✅ |
| Ajustar presupuesto | ❌ | ✅ | ❌ | ✅ |
| Ver comparación entre ollas | ❌ | ✅ | ✅ agregados | ✅ |
| Aprobar alias | propone | ✅ su olla | ❌ | ✅ global |

`RLS` implementa esto con `app.mis_ollas()` y `app.mi_rol()`. La UI no es la frontera: un `POST` directo con JWT de `cocinera` a `fn_confirmar_comprobante` debe fallar.

### 3.5 Modo offline

| Paso | Sin red | Con red |
|---|---|---|
| Capturar | ✅ local | ✅ |
| Extraer con IA | ❌ (queda `en_cola`) | ✅ |
| Clasificar por alias exacto local | ✅ (catálogo cacheado en Dexie) | ✅ |
| Revisar y confirmar | ✅ (movimientos locales **provisionales**) | ✅ |
| Asentar oficial | ❌ | ✅ RPC |

La UI muestra dos cifras cuando hay pendientes: **“Disponible oficial”** y **“Disponible en este celular (incluye S/ X sin enviar)”**. Nunca se mezclan sin etiqueta. El servidor, al recibir, revalida: si otra persona ya registró la misma boleta, el conflicto se muestra como tarjeta (“Otra persona registró esta boleta”), no como error técnico.

---

## 4. Extracción y clasificación

### 4.1 Puertos (contrato estable prototipo → producción)

```ts
// packages/domain/src/comprobantes/ports.ts
export interface ExtractorPort {
  extraer(input: { imagen: Blob | string; mime: 'image/jpeg' | 'application/pdf' }):
    Promise<ExtraccionCruda>;           // nunca lanza: devuelve {ok:false, codigo}
  version(): string;
}

export interface ClasificadorPort {
  clasificar(input: { descripcion: string; unidad?: string; ollaId: string }):
    Promise<Candidato[]>;               // ordenados por similitud desc
  version(): string;
}
```

- **Prototipo:** Edge Function `extraer-comprobante` → Cloudflare Workers AI (visión) y embeddings. La imagen se envía **recortada y sin metadatos**; no se registra en logs; no se retiene.
- **Producción:** mismo contrato contra VPS o servicio de embeddings; el frontend no cambia una línea.
- **Nunca** el modelo devuelve el número que se usa como dinero: devuelve **texto** (`"S/ 1,234.50"`) y nuestro parser determinístico lo convierte. Así un dígito alucinado no se convierte en un importe válido sin pasar por la revisión.

### 4.2 `ExtraccionCruda`

```ts
type ExtraccionCruda = {
  ok: boolean;
  codigo?: 'ilegible' | 'sin_items' | 'timeout' | 'pdf_no_soportado';
  proveedor: { nombre?: string; ruc?: string };
  tipo_documento?: 'boleta' | 'factura' | 'otro';
  serie?: string; folio?: string;
  fecha?: string;                       // texto, se parsea después
  moneda?: string;
  items: Array<{
    linea: number;
    descripcion: string;
    cantidad_texto?: string;
    unidad_texto?: string;
    presentacion_texto?: string;
    precio_unitario_texto?: string;
    total_linea_texto?: string;
  }>;
  subtotal_texto?: string; igv_texto?: string; total_texto?: string;
  confianza: number;                    // 0..1 global
  advertencias: string[];               // códigos, no prosa
};
```

### 4.3 Parser de dinero y cantidad (determinístico, testeado)

- Acepta `S/ 1,234.50`, `S/. 1234,50`, `1.234,50`, `1234.50`, `12`.
- Si hay ambos separadores, el **último** es decimal.
- Si hay un solo separador y le siguen exactamente 2 dígitos, es decimal; si le siguen 3 y el patrón es de miles, es miles (`1.234` → 1234). Si es ambiguo (`1.234` con precios de mercado), se marca `por_revisar` y se muestra el texto grande para que la persona decida.
- Cantidades: `1/2` → 0,5; `1 1/2` → 1,5; `2,5` → 2,5. Unidades expandidas con tabla de sinónimos (`KG`, `KILO`, `KILOS` → `kg`).
- **Nunca** se usa `parseFloat` directo sobre el texto del OCR.

### 4.4 Clasificación en dos pasos

1. **Alias exacto (determinístico, offline):** `texto_norm` en `producto_alias` aprobados (primero de la olla, luego globales). Si hay match único → `producto_id` con `confianza = 1.0`, origen `alias`.
2. **Embeddings (online):** similitud coseno contra `nombre + alias aprobados`. Se aplican los
   umbrales de `packages/domain/src/clasificacion/config.ts` (τ, margen y piso; D8), que son los
   únicos vigentes:
   - `sim ≥ τ` **y** margen ≥ `MARGEN` ⇒ sugerencia, pero **sigue** yendo a revisión humana.
   - `PISO ≤ sim < τ`, o margen < `MARGEN` ⇒ `por_revisar` con top-3.
   - `sim < PISO` ⇒ `por_revisar` sin sugerencia; la persona elige del catálogo o propone alias.

Guardas adicionales que fuerzan `por_revisar` aunque la similitud sea alta:

- Unidad no reconocida o presentación sin equivalencia aprobada.
- `cantidad × precio` no cuadra con el total de línea (±1 céntimo).
- Producto con `unidad_base` incompatible (ej. “aceite” en g).
- Empate entre dos productos de la misma categoría con diferencia < 0,02.

### 4.5 Privacidad de la imagen

- Recortar al comprobante; si aparece nombre/DNI/teléfono del comprador, **redactar** antes de subir (el canvas local pinta un rectángulo negro). La boleta > S/ 700 lleva documento del adquiriente por norma SUNAT; no lo necesitamos.
- EXIF eliminado al recomprimir (1280 px, JPEG 0.7, igual que arquitectura §4.5).
- Bucket privado, URL firmada de 5 min, sin listado público.
- Si el usuario elige “no guardar la foto”, se conserva `imagen_hash` + ítems y se borra el blob al asentar. `[a confirmar con contabilidad]` si la evidencia es obligatoria.

---

## 5. Deduplicación

### 5.1 Las tres huellas

| Huella | Cómo se calcula | Para qué |
|---|---|---|
| `imagen_hash` | SHA-256 de la imagen **normalizada** (mismo pipeline: 1280 px, JPEG 0.7, sin EXIF) | Reenvío exacto de la misma foto |
| `huella_fuerte` | SHA-256 de `norm(proveedor_ruc o proveedor_nombre) + '#' + serie_norm + '#' + folio_norm + '#' + total_centavos + '#' + fecha_emision + '#' + moneda` | Mismo comprobante físico, otra foto u otro celular |
| `huella_debil` | SHA-256 de `norm(proveedor) + '#' + total_centavos + '#' + fecha (±1 día)` | Comprobantes sin folio (informales, recibos internos) |

`pHash` (perceptual, 64 bits) es el puente cuando la imagen se recomprimió: distancia de Hamming ≤ 6 con misma `huella_fuerte` ⇒ duplicado automático; ≤ 10 con misma `huella_debil` ⇒ **candidato**, requiere persona.

### 5.2 Reglas por caso

| Caso | Decisión | Efecto |
|---|---|---|
| Misma foto subida dos veces | `imagen_hash` igual ⇒ `duplicado`, `duplicado_de_id` | No se suma; se muestra “ya está registrada” |
| Misma boleta, otra foto, mismo celular | `huella_fuerte` igual ⇒ `duplicado` automático | Idem |
| Misma boleta, dos personas de la **misma olla** | `huella_fuerte` igual ⇒ el segundo queda `duplicado`; alerta informativa | No se suma; se conserva quién la subió (ref opaca) |
| Misma boleta, **dos ollas** (compra compartida real) | **No** se auto-marca duplicado. Se crea `alerta tipo comprobante_duplicado`, severidad `atencion`, y se ofrece “compra compartida” | Ambas ollas eligen: repartir o marcar duplicado |
| Misma boleta en **otro período** (reutilización) | `huella_fuerte` existe en otro período o fecha > 30 días ⇒ alerta `comprobante_reutilizado` y queda `por_revisar` | Bloquea confirmación hasta que una persona lo resuelva |
| Foto parcial (solo ítems, sin total) | No hay `huella_fuerte`; `huella_debil` + `pHash` ⇒ candidato | No asienta hasta resolver; se puede **completar** el comprobante con la otra página |
| Boleta de 2 páginas | Dos `comprobante_adjunto` del mismo `comprobante`; ítems de ambas páginas | Un solo gasto, una sola serie de precios |
| Dos fotos de la misma compra, una con ítems y otra con total | Se ofrece “unir”: la segunda aporta folio/total al comprobante existente y queda `duplicado` | Un solo comprobante; se registra la unión |
| Reintento de red | La `idempotency_key` corta antes de la dedupe | No crea segunda fila |

### 5.3 Carrera entre dos dispositivos

La unicidad la garantiza el índice `(olla_id, huella_fuerte)` y, para el servidor, un `insert ... on conflict do nothing` + `select` del ganador. El perdedor recibe el `id` ganador y su estado pasa a `duplicado`; la UI muestra “ya registrada por otro celular” con hora, **sin nombre**.

**Duplicado entre ollas sin romper RLS:** el cliente de A no puede leer comprobantes de B. Se mantiene una tabla global mínima `comprobante_huella(huella_fuerte pk, olla_id, comprobante_id, fecha)` escrita por un trigger `security definer`; el cliente no la puede leer, y la RPC devuelve solo un aviso (“esta huella ya existe en otra olla”) sin revelar cuál, monto ni fecha exacta. La persona decide si es compra compartida o duplicado.

### 5.4 Lo que la dedupe **no** hace

- No compara importes “parecidos”: dos compras distintas de S/ 50 el mismo día en el mismo proveedor son válidas.
- No borra el duplicado: lo deja visible como evidencia (append-only).
- No usa la imagen como hash único: dos fotos distintas del mismo papel deben converger por `huella_fuerte`.

---

## 6. Unidades y dinero

### 6.1 Normalización de unidades

| Texto | ¿Aprobada? | Resultado |
|---|---|---|
| `kg`, `kilo`, `kilogramo` | sí (global) | `cantidad_milesimas = valor × 1 000 000`, base `g` |
| `g`, `gr`, `gramo` | sí | `× 1 000`, base `g` |
| `lb`, `libra` | sí (global, exacta 453,59237 g) | `× 453,59237 × 1 000`, redondeo half-up a milésima |
| `l`, `lt`, `litro` | sí | `× 1 000 000`, base `ml` |
| `ml`, `cc` | sí | `× 1 000`, base `ml` |
| `un`, `pza`, `unidad` | sí | `× 1 000`, base `unidad` |
| `docena` | sí (global) | `× 12 × 1 000`, base `unidad` |
| `saco`, `caja`, `atado`, `balde` | **solo con equivalencia por producto aprobada** | Si no, `por_revisar` |
| `1/2 saco`, `1 1/2 caja` | se parsea la fracción, pero la equivalencia sigue siendo obligatoria | Si no, `por_revisar` |

Regla D8: si no se puede normalizar, el ítem conserva su unidad original, queda `por_revisar` y **no entra a la comparación de precios**. El dinero sí puede contarse (como “no clasificado”) si la persona decide excluirlo de la serie, pero la confirmación exige decidir.

### 6.2 IGV

Hechos citados (SUNAT, consultado 2026-11-23):

- La tasa aplicable del IGV es **18 %** sobre la operación gravada; se compone de IGV + Impuesto de Promoción Municipal, y la composición cambia por Ley N.º 32387 sin cambiar el 18 % total (orientación SUNAT).
- La **boleta de venta** se emite a consumidores finales y **no permite crédito fiscal**; la **factura** se emite a quien tiene RUC y sí puede sustentar crédito fiscal (SUNAT).
- El **Reglamento de Comprobantes de Pago** (art. 8) exige, entre otros: RUC del emisor, denominación, serie y número correlativo, fecha, descripción/cantidad, precios unitarios, valor de venta e importe total. Nuestro modelo replica esos mínimos; no inventa campos tributarios.
- La **nota de crédito** procede por anulaciones, descuentos, bonificaciones y devoluciones, al mismo adquirente (art. 10). En operaciones con consumidores finales, el descuento debe constar en el mismo comprobante.

Fórmulas:

```
// Caso A: líneas incluyen IGV (boleta típica)
Σ total_neto_lineas = total_centavos  (±1 céntimo)
igv_informativo = round_half_up(total_centavos × 18 / 118)   // NO afecta el presupuesto
base_informativa = total_centavos − igv_informativo

// Caso B: IGV discriminado (factura)
Σ total_neto_lineas = subtotal_centavos − descuento_centavos  (±1 céntimo)
total_centavos = subtotal_centavos + igv_centavos − descuento_centavos
|igv_centavos − round_half_up((subtotal_centavos − descuento_centavos) × 18 / 100)| ≤ 20 céntimos
```

- Si la diferencia de IGV supera **S/ 0,20**, se marca `igv_inconsistente` y se pide revisión. El umbral es nuestro (P9), no una norma: los comprobantes redondean por línea.
- **Reparto del IGV por línea (solo discriminado):** `igv_linea` se prorratea por `total_neto` con mayor residuo, de modo que `Σ igv_linea = igv_centavos` exacto. El bruto es `total_neto + igv_linea`; la suma de brutos = `total_centavos`. El precio observado usa el bruto, para que una factura y una boleta del mismo producto den la misma serie.
- **El presupuesto usa `total_pen_centavos` (o `total_centavos` si es PEN): lo que salió del bolsillo, con IGV incluido.** La olla es consumidora final; no se asume crédito fiscal. Si alguna vez una olla puede usarlo `[a confirmar: forma legal/RUC]`, se agrega `igv_recuperable` y se resta solo en reportes contables, nunca en el disponible operativo.
- No se asume que un alimento esté gravado, exonerado o inafecto: **manda el comprobante**. Sin dato, `tratamiento_igv = 'desconocido'` y el IGV no se calcula.

### 6.3 Redondeo y descuentos

- Descuento global: se prorratea por `total_linea` con **mayor residuo** (Hamilton), para que la suma de descuentos sea exactamente el descuento y la suma de netos sea exactamente el total.

```
cuota_i = floor(D × total_i / Σ total)
residuo_i = D × total_i / Σ total − cuota_i
repartir las unidades faltantes a los mayores residuo_i (desempate: mayor total_i, luego linea_no)
```

- Descuento de línea: se resta directo de esa línea.
- El total del comprobante **nunca se recalcula** desde los ítems: es el dato del papel. Los ítems se reconcilian contra él.

### 6.4 Notas de crédito

- `tipo = nota_credito`, `comprobante_afectado_id` obligatorio, `total_centavos` positivo (el signo lo pone el movimiento `credito`).
- v1: monto a nivel de comprobante; no ítems. `[fuera de v1: NC por ítem]`.
- Efecto: `gasto` original + `credito` negativo = neto. La serie de precios **no** crea observación con la NC; si la NC anula todo, las observaciones del comprobante pasan a `excluido` con `motivo_exclusion='nota_credito_total'`.
- Si la NC llega después del cierre del período: se asienta en el período original (fecha de negocio) y dispara `periodo_cerrado_con_gasto`; el ajuste al período corriente es un `traslado` manual con motivo.

### 6.5 Compras compartidas entre ollas

- El comprobante pertenece a la olla que **pagó** (`olla_id`). `reparto_modo='por_monto'`.
- El presupuesto mide **costo asumido, no flujo de caja**: A pagó el total, pero su `gasto` es su parte; el resto es un derecho de cobro a B y no entra al presupuesto. Si B reembolsa, se registra como transferencia, no como gasto.
- Se crean N movimientos `gasto`, uno por olla participante, con `comprobante_id` y `monto_centavos` = su parte. **La suma debe ser exactamente `total_pen_centavos`**, con el mismo algoritmo de mayor residuo.
- Cada olla ve su gasto y su disponible. La olla que no pagó **no** genera `precio_observado` (la observación es una sola, de la que pagó): así el agregado no cuenta dos veces la misma compra. La olla participante **sí** ve el comprobante y sus ítems (es su compra), pero no el presupuesto ni los movimientos de la pagadora.
- El reparto solo se escribe por la RPC `fn_reparto_compra` (`security definer`): un cliente no puede insertar un `gasto` en el presupuesto de otra olla.
- El reparto se registra con `actor_ref` de quien lo acordó y `motivo` “compra compartida”. La otra olla recibe una solicitud visible (no un cambio silencioso de su presupuesto): **aceptar o rechazar**. Hasta aceptar, el gasto está `comprometido` en la olla receptora, no `gastado`.
- Si una olla rechaza, la pagadora absorbe el 100 %: se registra un `gasto` por el resto en la olla pagadora (mismo comprobante) y se libera el `compromiso` de la receptora. No se usa `ajuste`: el asignado no cambia, cambia quién pagó.
- **Transferencia de insumos ya comprados** (`origen='transferencia_entre_ollas'`): no genera `gasto` ni `precio_observado`; mueve despensa y acta de entrega. El dinero se contó donde se compró, una sola vez.

### 6.6 Donaciones en especie

- `origen='donacion_especie'`. **No genera movimiento de gasto.** Se valoriza con `total_centavos` si hay valor declarado; si no, `total_centavos = 0` y `origen_valor='referencia_donacion'` en los ítems.
- Se muestra aparte: “Recibido en especie: S/ 60,00 (no es dinero)”.
- No alimenta la serie de precios por defecto; si se aprueba, entra como `origen='donacion_valorizada'` y `estado='sospechoso'` (nunca `valido` sin aprobación explícita).
- **Prohibido** sumar donaciones al “ahorro” o al “gasto”. Es la fuente más fácil de inflar un número (ver §13).

### 6.7 Moneda extranjera

- `tipo_cambio` manual (no hay API en el camino crítico). `total_pen = round_half_up(total × tipo_cambio)`.
- Se guardan ambos importes; el presupuesto y las series usan `total_pen_centavos` / `precio_pen_microcent_por_base`.
- El tipo de cambio lo ingresa una persona y queda auditado; no se actualiza solo.

---

## 7. Presupuesto

### 7.1 Modelo y definición de “presupuesto en ese momento”

Para una olla y un período, en el instante `t`:

```
A(t) = Σ monto_centavos  de movimientos {asignacion, ajuste, traslado_entrada, traslado_salida}
       con asentado_en ≤ t
G(t) = Σ monto_centavos  de movimientos {gasto, credito, anulacion}
       con asentado_en ≤ t
C(t) = Σ monto_centavos  de movimientos {compromiso, liberacion_compromiso}
       con asentado_en ≤ t
D(t) = A(t) − G(t) − C(t)
```

`monto_centavos` ya viene con signo (`credito` y `liberacion_compromiso` negativos). **No se suman valores absolutos.**

Dos lecturas que no se mezclan: **corte** (snapshot con `asentado_en ≤ t`, para auditoría y para “en ese momento”) y **período** (atribución por `ocurrido_en`, para el reporte del mes). Un gasto tardío puede aparecer en el período aunque no estuviera en el corte de ese día; ambas vistas se muestran con su nombre.

> **Invariante de apertura:** al crear un `presupuesto` con estado `vigente` se escribe, en la misma transacción, un movimiento `asignacion` por `monto_asignado_inicial_centavos` con `ocurrido_en = periodo_desde`. Sin esa fila, `A(t)` valdría 0 y todo el panel mentiría.

**Definición operativa (la frase que faltaba):**

> *“Presupuesto en ese momento”* = el objeto `{A(t), G(t), C(t), D(t), consumo_bp(t), tasa_consumo(t), proyeccion(t), desvio(t), alertas}` calculado sobre los movimientos **asentados por el servidor** con `asentado_en ≤ t`, para el `presupuesto_id` que corresponde al período de imputación (vigente o ya cerrado). Si `t` es ahora y hay movimientos locales sin enviar, se devuelve además `{pendientes_centavos, disponible_provisional}` y la UI los rotula como tales.

### 7.2 Consumo, tasa y proyección

```
dias_transcurridos = max(0, (min(t, periodo_hasta) − periodo_desde) + 1)   // días calendario, Lima
dias_restantes     = max(0, periodo_hasta − t)
consumo_bp         = round_half_up(10 000 × (G(t) + C(t)) / A(t))          si A(t) > 0; si no, null
tasa_consumo       = G(t) / max(1, dias_transcurridos)                     // céntimos/día (se muestra en S/)
proyeccion         = G(t) + round_half_up(tasa_consumo × dias_restantes)
piso_comprometido  = G(t) + C(t)
desvio             = max(proyeccion, piso_comprometido) − A(t)
```

- `C` entra en el consumo (dinero ya decidido no está disponible) pero **no** se suma a la proyección, para no contar dos veces: la tasa diaria ya refleja el ritmo de compra. `piso_comprometido` es el mínimo que se gastará.
- Con `dias_transcurridos < 3`, la proyección se marca `insuficiente` y **no** dispara alerta de proyección.
- Si `t < periodo_desde`, `proyeccion = null` y el panel dice “el período no empezó”; no se extrapola hacia atrás.
- La proyección es lineal y se declara como tal. No es un pronóstico estadístico; es una regla explicable.

### 7.3 Alertas 80 / 100 y proyección

| Alerta | Disparo | Clave de deduplicación | Severidad |
|---|---|---|---|
| `presupuesto_80` | `consumo_bp ≥ 8000` | `presupuesto_80:<presupuesto_id>` | `atencion` |
| `presupuesto_100` | `consumo_bp ≥ 10000` | `presupuesto_100:<presupuesto_id>` | `critica` |
| `proyeccion_excede` | `dias_transcurridos ≥ 3` y `max(proyeccion,piso) > A` y `consumo_bp < 10000` | `proyeccion:<presupuesto_id>:<yyyy-mm-dd>` (una por día) | `atencion` |

- Se evalúan **después** de asentar un movimiento, dentro de la misma transacción (o en un job idempotente).
- La clave **no** incluye `version`: un ajuste que sube el asignado no vuelve a avisar del 80 % si la alerta sigue abierta. Si el consumo baja de 80 % (por una nota de crédito o un ajuste grande), la alerta abierta pasa a `resuelta`; si vuelve a subir, se dispara otra vez.
- `silenciada_hasta` evita repetir la misma alerta mientras la persona la haya pospuesto.
- `D(t) < 0` se muestra en rojo con la palabra “excedido”, no solo color (accesibilidad, arquitectura §3.5).

### 7.4 Cambios de período y ajustes

| Situación | Qué se hace | Qué **no** se hace |
|---|---|---|
| Ajuste de monto | Nuevo movimiento `ajuste` (±) con motivo y actor; sube `version` | Editar `monto_asignado_inicial_centavos` |
| Cambio de fechas | Cerrar el período, crear uno nuevo, `traslado_salida` del saldo y `traslado_entrada` al nuevo, ambos en la fecha del cambio | Mover filas o reescribir `ocurrido_en` |
| Cierre | `estado='cerrado'`; no se aceptan nuevos `compromiso`; sí pueden llegar gastos tardíos | Borrar movimientos |
| Gasto tardío en período cerrado | Se asienta en el período original; alerta `periodo_cerrado_con_gasto`; `D` puede quedar negativo | Reabrir el período solo |
| Solapamiento mensual/anual | Permitido por `ambito`; solo el mensual alerta y gobierna | Sumar ambos para “disponible” |
| Sin presupuesto vigente al confirmar | Bloquear con `SIN_PERIODO` y ofrecer “Crear presupuesto del mes” (monto editable, por defecto el del mes anterior o 0) | Asentar un gasto sin período o inventar un asignado |
| Presupuesto en 0 | `consumo_bp = null`; alerta `sin_presupuesto` | División por cero o “100 %” falso |

### 7.5 Ejemplo trabajado (el de las pruebas)

Período 01/11–30/11, `A = S/ 1 800,00`, `G` previo `S/ 900,00`, `C = S/ 150,00`. Se confirma la boleta de S/ 553,30 el 18/11 a las 15:00.

```
G = 1 453,30        C = 150,00        D = 1 800,00 − 1 453,30 − 150,00 = 196,70
consumo_bp = round(10 000 × 1 603,30 / 1 800) = 8 907  → 89,07 %  ⇒ alerta 80
dias_transcurridos = 18        tasa = 1 453,30 / 18 = 80,7389 S/ día
dias_restantes = 12            proyeccion = 1 453,30 + 968,87 = 2 422,17
piso = 1 603,30                desvio = 2 422,17 − 1 800 = +622,17  ⇒ alerta proyección
```

### 7.6 “Comprometido” en la práctica

- Se crea al aceptar una compra programada o al aceptar una compra compartida de otra olla.
- Se libera cuando llega el comprobante (`liberacion_compromiso` − y `gasto` + en la misma transacción) o cuando vence/cancela.
- Sin este mecanismo, dos ollas pueden “comprometerse” a gastar el mismo saldo y el disponible miente.

---

## 8. Tendencias de precio

### 8.1 Serie

Una serie es el conjunto de `precio_observado` con `estado='valido'` para `(producto_id, unidad_base, canal, moneda)` en una ventana de 90 días. Se separa por canal: mayorista y minorista no se mezclan (D8).

### 8.2 Mediana móvil y variación

Parámetros P1: `N = 7`, `N_min = 3`, ventana actual `[t−30, t]`, ventana previa `[t−60, t−31]`.

```
M_actual = mediana(últimas N observaciones válidas en la ventana actual)
M_previa = mediana(últimas N observaciones válidas en la ventana previa)
var_pct  = (M_actual − M_previa) / M_previa × 100      si M_previa > 0
min, max = mínimo y máximo de las observaciones de la ventana actual (después del filtro)
```

- Si en cualquiera de las dos ventanas hay `< N_min` observaciones ⇒ `sin_tendencia` (se muestra el precio actual pero no una flecha).
- La mediana se elige sobre el promedio porque un solo error de unidad mueve el promedio (ver T7: +128 % falso).
- `min`/`max` se muestran **después** del filtro, y con la etiqueta “observados”, no “del mercado”.

### 8.3 Filtro de outlier (P3/P4)

1. **Guarda de cordura del producto:** si `precio < P50_estable/3` o `> 3×P50_estable` ⇒ `sospechoso`, `motivo='fuera_de_rango'`. `P50_estable` = mediana de observaciones con más de 7 días de antigüedad (para que el outlier no mueva su propia guarda). Si no hay base, se omite la guarda.
2. **z modificado sobre MAD:**

```
MAD = mediana(|x_i − mediana(X)|)
z_i = 0,6745 × (x_i − mediana(X)) / MAD
|z_i| > 3,5  ⇒ excluido de la serie (no se borra: estado 'sospechoso'/'excluido')
```

Si `MAD = 0`, se usa `|x_i − mediana| > 3 × mediana` como regla de respaldo.
3. **Guarda de cantidad:** `cantidad_milesimas` fuera de `[cantidad_min, cantidad_max]` del producto ⇒ `sospechoso` (`cantidad_imposible`).
4. **Sin unidad aprobada:** nunca entra a la serie.
5. **Sin auto-corrección:** el outlier se muestra en “Precios para revisar”; una persona lo excluye o corrige la unidad. Nunca se “winsoriza” en silencio.

### 8.4 Variación por categoría: índice de canasta fija

No se promedian porcentajes (matemáticamente mal: un producto de S/ 0,50 pesaría igual que uno de S/ 20). Se usa un índice tipo Laspeyres con la canasta del período anterior:

```
b_p = cantidad_base del producto p consumida en [t−30, t] por la olla (o por la red, según el reporte)
I   = Σ_p (b_p × M_actual(p)) / Σ_p (b_p × M_previa(p))
var_categoria_pct = (I − 1) × 100
```

- Solo entran productos con `M_actual` y `M_previa` disponibles.
- `cobertura = Σ b_p (con ambas medianas) / Σ b_p (todos)`; si `< 0,80`, el índice se publica como **parcial** con ese porcentaje. Sin cobertura, no se muestra.
- Es un índice **nuestro**, explicable; no es el INEI ni un índice oficial.

### 8.5 Ejemplo (T7)

```
Papa (microcent/g): 210 000, 215 000, 220 000, 225 000, 230 000, 220 000, 2 200 000
mediana = 220 000 (S/ 2,20/kg);  MAD = 5 000
z del último = 0,6745 × 1 980 000 / 5 000 = 267,1  ⇒ excluido
mediana final (6 obs) = 220 000;  min 210 000; max 230 000
M_previa = 200 000  ⇒ var = +10,0 %  (el promedio daría +128,6 %: por eso no se usa)
```

---

## 9. Reporte entre ollas

### 9.1 Principio

Cada olla ve **su detalle**; las demás, **solo agregados**. El agregado existe si y solo si agrupa **≥ 10 ollas** (`k = 10`, criterio de privacidad del documento del usuario). El parámetro `k` no puede bajarse desde la API.

### 9.2 Qué ve cada olla

| Dato | Propia olla | Otras ollas / red |
|---|---|---|
| Comprobantes, ítems, fotos | ✅ | ❌ |
| Proveedores (nombre/RUC) | ✅ | ❌ **nunca** |
| Gasto del período (S/) | ✅ | ❌ (solo bandas/medianas) |
| Precio por producto (S/ por kg/L/un) | ✅ | ✅ mediana, p25, p75, n ollas (si k ≥ 10) |
| Variación % del producto | ✅ | ✅ agregada |
| Posición | — | cuartil (“estás en el cuartil 2”), no ranking nominal |
| Personas | ❌ (no aplica) | ❌ |
| Costo por ración | ✅ | ✅ mediana (si k ≥ 10 y hay raciones) |

### 9.3 Reglas de supresión

1. `n_ollas_distintas ≥ 10` en la celda. Se cuentan **ollas**, no observaciones: 40 boletas de 3 ollas no son 40.
2. Si una sola olla aporta **> 50 %** del peso de la celda (kg o monto), se suprime o se agrupa con la categoría padre. Regla propia (P10), no legal.
3. Redondeo: precios a 1 céntimo; porcentajes a 1 decimal; montos agregados a S/ 1. Percentiles p25/p75 por **rango más cercano** (`ceil(p × n)`), sin interpolación.
4. Sin series temporales finas: agregado **mensual** como mínimo. Nada de “la compra de ayer de la red”.
5. `k` insuficiente ⇒ `{suprimido: true, faltan: 10 − n}`. Se dice cuántas faltan, no se insinúa el valor.
6. Solo ollas con `reportes_agregados_opt_in = true` aportan y reciben (P7). Revocar implica dejar de aportar desde el siguiente período; lo ya agregado no se re-identifica.

### 9.4 Qué **no** se compara

- **Proveedores**: ni nombres, ni RUC, ni “quién compra más barato”. Comparar proveedores expone relaciones comerciales y habilita represalias.
- **Personas**: no existen en este módulo.
- **Montos individuales por olla**: ni en un ranking ni en un “top 3”.
- **Frecuencia de compra** y número de comprobantes (revela operación y tamaño).
- **Direcciones** o zonas cuando la zona tenga < 10 ollas.
- **Ahorro** atribuido a una olla: no hay contrafactual válido (§13).

### 9.5 Contrato del agregado

```ts
type AgregadoRed = {
  periodo: string;                 // '2026-11'
  productoId: string;
  unidad: 'g' | 'ml' | 'unidad';
  nOllas: number;                  // ≥ 10 o suprimido
  mediana: number;                 // microcent por base
  p25: number; p75: number;
  variacionPct: number | null;
  miValor: number | null;          // solo para la olla que consulta
  miCuartil: 1 | 2 | 3 | 4 | null;
  cobertura: number;               // 0..1
  suprimido: boolean;
  motivo?: 'k_insuficiente' | 'dominancia' | 'sin_datos';
};
```

La RPC `fn_reporte_red(p_periodo, p_producto, p_categoria)` es `security definer`, exige membresía y `opt_in`, y **no** devuelve filas crudas. `grant select` sobre `precio_observado` queda solo para las filas de la propia olla.

---

## 10. Pantallas mínimas

Todas: letra base 18 px, objetivos ≥ 48×48, una acción primaria, estado nunca solo por color, `aria-live` al guardar (arquitectura §3.5).

### 10.1 Subir comprobante (4 elementos)

1. Botón grande **“Sacar foto”** + secundario **“Elegir PDF”**.
2. Selector **Olla / Período** (por defecto, el vigente).
3. Estado honesto: *“Guardado en este celular. Se leerá cuando haya internet.”* / *“Leyendo…”* con progreso y Cancelar.
4. Salida siempre visible: **“Escribir a mano”** (total + proveedor + fecha; 3 campos).

Vacío: “Todavía no subiste comprobantes este mes”. Error: “No pudimos leer el papel. Escribilo acá.” Nunca “Error de OCR”.

### 10.2 Revisar ítems (4 elementos)

1. Cabecera de conciliación: **Total del papel S/ 553,30** vs **Suma de ítems S/ 553,30** (verde/rojo con palabra).
2. Lista de ítems (6 filas): descripción cruda, cantidad/unidad, total, **chip de confianza** (“Seguro” / “Revisar”).
3. Por ítem: selector de producto (top-3 sugeridos), selector de unidad, campo de cantidad; **“Excluir ítem”** con motivo (sigue sumando al gasto, no alimenta la tendencia).
4. Botón único **“Confirmar y asentar S/ 553,30”** (sin red: “Confirmar y guardar”; el asiento se completa al enviar), deshabilitado con motivo legible (“Falta clasificar 1 ítem”, “La suma no coincide”).

No se permite confirmar desde otra pantalla ni por lote sin revisar.

### 10.3 Panel de presupuesto (4 elementos)

1. Cuatro cifras: **Asignado / Gastado / Comprometido / Disponible**, con “incluye S/ X sin enviar” cuando aplica.
2. Barra con marcas en 80 % y 100 %, y texto “89 % usado” (no solo color).
3. Proyección al cierre: “Al ritmo actual terminarás en S/ 2 422 (S/ 622 más de lo asignado)” + días restantes.
4. **Lo que más subió / bajó**: hasta 3 productos con variación y “n=7 observaciones”; si no hay datos, “Todavía no hay suficientes compras para comparar”.

Acciones: “Ajustar presupuesto” (motivo obligatorio), “Ver movimientos”. Alerta 80/100 como banner, no modal.

### 10.4 Comparación entre ollas (4 elementos)

1. Selector **Producto / Categoría** y período (mensual).
2. Mi precio vs **mediana de la red**, con la flecha de variación y la unidad visible (`S/ por kg`).
3. Banda p25–p75 y **“10 ollas comparadas”**; si falta: “Faltan 3 ollas para poder comparar” (sin valor).
4. Nota fija: **“No se comparan proveedores ni personas. Cada olla ve su detalle; las demás, solo el promedio.”**

Sin ranking nominal, sin nombres de ollas, sin “felicitaciones/vergüenza”.

---

## 11. Contratos de función (para implementar sin ambigüedad)

```ts
// packages/domain/src/comprobantes — puro, determinista, sin IO
normalizarItem(crudo: ItemCrudo, eq: Equivalencia[], cat: Producto[]):
  { ok: true; item: ItemNormalizado } | { ok: false; motivo: MotivoRevision };

conciliar(c: ComprobanteCrudo, items: ItemNormalizado[]):
  { ok: boolean; diferenciaCentavos: number; causa?: 'suma' | 'igv' | 'descuento' };

deduplicar(c: ComprobanteCrudo, existentes: Huella[]):
  { accion: 'nuevo' | 'duplicado' | 'candidato' | 'reutilizado'; contraId?: string; regla: string };

asentar(c: ComprobanteConfirmado, p: Presupuesto /* vigente o cerrado por gasto tardío */, idem: string):
  { movimientos: MovimientoPresupuesto[]; observaciones: PrecioObservado[] };

presupuestoEn(ollaId: string, t: string /* ISO-8601 timestamptz */, opts?: { incluirPendientes?: boolean }):
  EstadoPresupuesto;

tendencia(productoId: string, t: string, cfg: TrendConfig):
  Tendencia | { sinTendencia: true; motivo: 'n_min' | 'sin_datos' };

agregarRed(filtro: FiltroRed, k: number /* runtime: k >= 10; nunca desde el cliente */):
  AgregadoRed;

// clasificarItem — movimiento desde apps/web (PR #32). Decide la revisión humana de un ítem.
// Vive en packages/domain/src/clasificacion/clasificar.ts; la pantalla no compara umbrales propios.
clasificarItem(item: ItemClasificable, cfg: ConfiguracionClasificacion):
  { estado: 'confirmado' | 'por_revisar' | 'desconocido'; motivo?: MotivoRevision };

// totales del comprobante — packages/domain/src/comprobantes/totales.ts.
// La pantalla muestra; no suma. Entran los centimos tal cual, sin Number() en el JSX.
totalDeLineasConfirmadas(items: ItemLinea[]): Centimos;   // solo `confirmado` suma (DEC-2026-0008)
totalDelPapel(items: ItemLinea[]): Centimos;              // lo que dice la boleta, para conciliar

// formato de moneda — packages/domain/src/comprobantes/formato.ts.
// Una sola coma decimal: "S/ 1234,56". `toLocaleString('es-PE')` agrega separador de miles y
// producia "S/ 1,234,56" al concatenar la coma decimal encima.
formatearCentimos(centimos: Centimos | number): string;
```

Códigos de error estables (para tests y UI): `UNIDAD_AMBIGUA`, `SIN_EQUIVALENCIA`, `CONFIANZA_BAJA`, `EMPATE`, `SUMA_NO_CUADRA`, `IGV_INCONSISTENTE`, `DUPLICADO_FUERTE`, `DUPLICADO_DEBIL`, `REUTILIZADO`, `SIN_PERIODO`, `PERIODO_CERRADO`, `SIN_PRESUPUESTO`, `K_INSUFICIENTE`, `DOMINANCIA`.

**RPCs Supabase** (nombres y responsabilidad):

| RPC | Quién | Qué hace |
|---|---|---|
| `fn_confirmar_comprobante(p_id, p_idem)` | organizadora/admin | Revalida guardas, congela ítems, escribe `gasto`, crea observaciones, evalúa alertas. `security definer`. |
| `fn_anular_comprobante(p_id, p_motivo)` | organizadora/admin | Escribe `anulacion`, excluye observaciones, alerta. |
| `fn_ajustar_presupuesto(p_id, p_monto, p_motivo)` | organizadora/admin | `ajuste` + `version++`. |
| `fn_presupuesto_en(p_olla, p_t)` | miembro | Devuelve el objeto de §7.1. |
| `fn_reporte_red(p_periodo, p_producto, p_categoria)` | miembro opt-in | Agregado con k ≥ 10. |
| `fn_reparto_compra(p_id, p_partes[])` | organizadora | Valida suma exacta; crea gastos/compromisos por olla. |

---

## 12. Pruebas (12 casos con números)

Fixtures ficticios en `fixtures/comprobantes/`. Ningún proveedor, RUC, nombre ni precio es real.

### T1 · Boleta realista de 6 ítems, IGV incluido, todo clasificado

Boleta `B001-000123`, 18/11/2026, proveedor ficticio “Proveedor Demo 01”.

| # | Ítem | Cantidad | P. unitario | Total | q (milésimas) | p (microcent/base) |
|---|---|---|---|---|---|---|
| 1 | Papa blanca | 25 kg | S/ 2,20/kg | 55,00 | 25 000 000 | 220 000 |
| 2 | Pollo entero | 12,5 kg | S/ 9,80/kg | 122,50 | 12 500 000 | 980 000 |
| 3 | Arroz extra (saco 50 kg) | 50 kg | S/ 4,30/kg | 215,00 | 50 000 000 | 430 000 |
| 4 | Aceite vegetal (caja 12×1 L) | 12 L | S/ 8,90/L | 106,80 | 12 000 000 | 890 000 |
| 5 | Cebolla | 8 kg | S/ 3,50/kg | 28,00 | 8 000 000 | 350 000 |
| 6 | Tomate | 6,5 kg | S/ 4,00/kg | 26,00 | 6 500 000 | 400 000 |

**Esperado:** suma 553,30 = total; conciliación 0; IGV informativo `round(55 330×18/118) = 8 440` (S/ 84,40); base informativa 468,90 (coincide con la factura de T4); 6 observaciones válidas; asiento `gasto 55 330`; `D` de §7.5 = 196,70.

### T2 · Unidad ambigua (“1/2 saco”)

Línea “PAPA 1/2 SACO” total S/ 55,00.

- **Sin equivalencia aprobada para “saco” en papa:** `cantidad_milesimas = null`, estado `por_revisar`, motivo `UNIDAD_AMBIGUA`; confirmación bloqueada. Si la persona lo excluye (`estado='excluido'`), el gasto total sigue siendo 553,30 y el panel muestra “S/ 55,00 sin clasificar”; no hay observación de precio.
- **Con equivalencia aprobada “saco de papa = 50 kg”:** `1/2 × 50 000 000 = 25 000 000`; precio 220 000; idéntico a T1.
- **“CAJA DE ACEITE 12×1 L”** sin equivalencia: `por_revisar`; con equivalencia `12 000 ml`: 890 000.

### T3 · Duplicado

Se sube dos veces la misma boleta de T1.

- Igual `imagen_hash`: segunda queda `duplicado`, `duplicado_de_id` = primera. `G` sigue 553,30 (no 1 106,60).
- Foto recomprimida (pHash distancia 4), misma `huella_fuerte`: duplicado automático.
- Solo la mitad superior (sin folio ni total), pHash distancia 8: `candidato` + alerta; **no asienta** hasta que una persona una o descarte.
- Dos ollas distintas: no se auto-duplica; alerta “posible compra compartida”; si aceptan reparto 1/3–2/3: A 184,43 + B 368,87 = 553,30; una sola observación de precio (la de la olla pagadora).

### T4 · IGV discriminado

Factura `F001-000456`, subtotal 468,90, IGV 84,40, total 553,30.

**Esperado:** conciliación 0; `|84,40 − round(468,90×0,18)| = |84,40 − 84,40| = 0`; el IGV se reparte por línea (suma 8 440) y la suma de brutos = 55 330; las 6 observaciones se calculan sobre el **bruto con IGV**, así que quedan en la misma escala que T1 (pueden diferir ±1 céntimo por el prorrateo). Si el IGV declarado fuera 80,00, diferencia 4,40 > 0,20 ⇒ `IGV_INCONSISTENTE`, bloquea.

### T5 · Compra compartida (1/3 – 2/3)

Total 553,30 pagado por Olla A; reparto A 1/3, B 2/3.

```
55 330 / 3 = 18 443,33 → floor A 18 443; B 36 886; falta 1
fracciones: A ,333 · B ,666 → el céntimo va a B
A = 18 443 (S/ 184,43)   B = 36 887 (S/ 368,87)   suma = 55 330
```

**Esperado:** `gasto` A 18 443 + `gasto` B 36 887 = 55 330; una sola observación (olla A); el reporte de red cuenta **una** olla para ese precio; B no aparece como observadora.

### T6 · Donación en especie

30 kg de papa donados, valor referencial S/ 2,00/kg = S/ 60,00.

**Esperado:** `G` no cambia; `valorizado` = 6 000 céntimos; `precio_observado` con `origen='donacion_valorizada'`, `estado='sospechoso'`, fuera de la mediana; el panel muestra “Recibido en especie S/ 60,00 (no es dinero)”; **no** se suma a ningún “ahorro”.

### T7 · Outlier de precio

Papa (microcent/g): `210 000, 215 000, 220 000, 225 000, 230 000, 220 000, 2 200 000` (el último es un error de digitación: S/ 22,00/kg en vez de S/ 2,20/kg).

```
mediana = 220 000; MAD = 5 000
z = 0,6745 × 1 980 000 / 5 000 = 267,1 > 3,5 ⇒ excluido
mediana final = 220 000 (S/ 2,20/kg); min 210 000; max 230 000
M_previa = 200 000 ⇒ var = +10,0 %
promedio ingenuo = 5,0286 S/kg ⇒ +128,6 % (lo que NO se muestra)
```

Índice de categoría con canasta papa 25 kg y pollo 12,5 kg: `(25×2,20 + 12,5×9,80)/(25×2,00 + 12,5×9,50) = 177,50/168,75 = 1,0519` ⇒ **+5,2 %**.

### T8 · Libra contra kilo

“PAPA 10 LB” total S/ 10,00.

```
10 lb = 4 535,9237 g → 4 535 924 milésimas
p = 1 000 × 1 000 000 000 / 4 535 924 = 220 462 ⇒ S/ 2,2046/kg
```

**Esperado:** normaliza a 220 462 (no 1 000 000); el total de línea sigue siendo 1 000 céntimos (no se recalcula). Si el OCR leyó “10 KG” y el precio quedó 1,00/kg, con 7 observaciones previas (mediana 2,20; MAD 0,05) el z modificado es `0,6745 × 1,20 / 0,05 = 16,2 > 3,5` ⇒ `sospechoso` y fuera de la mediana. La guarda gruesa `P50/3` **no** lo detecta (1,00 > 0,733): por eso el filtro MAD es el que manda, no la guarda sola.

### T9 · Descuento global y nota de crédito

**Descuento:** boleta 553,30 con descuento global 3,30 ⇒ total 550,00. Reparto por mayor residuo: `33, 73, 128, 64, 17, 15` (suma 330). Netos: `5 467 + 12 177 + 21 372 + 10 616 + 2 783 + 2 585 = 55 000`.

**NC:** NC de S/ 50,00 sobre T1 ⇒ `gasto 55 330` + `credito −5 000` = **50 330** (S/ 503,30); sin nueva observación; período original. NC total 553,30 ⇒ neto 0 y comprobante `anulado`; observaciones a `excluido`.

### T10 · Presupuesto, alertas y ajuste

Estado inicial: `A=180 000`, `G=90 000`, `C=15 000`, t=18/11 (18 días, 12 restantes).

```
consumo_bp = round(10 000 × 105 000 / 180 000) = 5 833  (58,33 %) → sin alerta 80
tras T1: G=145 330; consumo_bp = 8 907 → alerta 80 (1 vez)
ajuste +20 000 ⇒ A=200 000; consumo_bp = round(10 000×160 330/200 000) = 8 017 (80,17 %) → no repite alerta 80 (misma clave, sigue abierta)
nuevo gasto 40 000 ⇒ G=185 330; consumo_bp = round(10 000×200 330/200 000) = 10 017 (100,17 %) → alerta 100, D = −330
proyección = 185 330 + (185 330/18)×12 = 185 330 + 123 553 = 308 883 → desvío +108 883
```

Verifica: `D = A − G − C`; la alerta 80 no se duplica mientras siga abierta; la 100 sí se dispara al cruzar el 100 %; el disponible negativo se muestra.

### T11 · k-anonimato

- 9 ollas con papa ⇒ `{suprimido:true, motivo:'k_insuficiente', faltan:1}`; **no** se devuelve mediana.
- 10 ollas con `2,00; 2,10; 2,15; 2,20; 2,20; 2,25; 2,30; 2,35; 2,40; 2,50` ⇒ mediana `(2,20+2,25)/2 = 2,225 → 2,23`; p25 = 2,15; p75 = 2,35; `nOllas=10`.
- 10 ollas pero una aporta 70 % del peso ⇒ `suprimido`, `motivo:'dominancia'`.
- 12 observaciones de 9 ollas ⇒ suprimido (se cuentan ollas, no boletas).

### T12 · Offline, reintento e idempotencia

Dos comprobantes capturados sin red; uno confirmado offline (provisional). Al sincronizar, el push se envía **dos veces** con la misma `idempotency_key`:

**Esperado:** una sola fila `gasto 55 330`; el segundo push responde `ya_asentado`; el disponible oficial baja 553,30 una vez; el panel pasa de “Disponible en este celular” a “Disponible oficial” sin saltos; si otro dispositivo ya asentó la misma boleta, el conflicto se muestra como tarjeta, no como error.

### Invariantes (property-based, además de los 12)

1. Si `lineas_incluyen_igv`: `Σ total_neto_lineas = total_centavos ± 1`. Si es discriminado: `Σ total_neto_lineas = subtotal − descuento ± 1` y `total = Σ netos + igv`. En ambos casos, `Σ total_neto_con_igv_centavos = total_centavos ± 1`.
2. `Σ reparto = total_pen_centavos` exacto.
3. `Σ (gasto + credito + anulacion)` por comprobante = su total neto.
4. Confirmar N veces ⇒ mismos movimientos (idempotencia).
5. `D(t) = A(t) − G(t) − C(t)` en toda consulta.
6. Ninguna observación válida proviene de ítem `por_revisar`, `excluido` o `duplicado`.
7. `k < 10` nunca devuelve valor.
8. Añadir un valor 10× a una serie no mueve la mediana (si N ≥ 3 y el filtro está activo).
9. Parser: `S/ 1.234,50`, `1,234.50`, `1234,50`, `1234.50` ⇒ 123450 céntimos; `S/ 12.50` ⇒ 1250.
10. Boleta de 23:30 del 30/11 (Lima) ⇒ `fecha_imputacion = 2026-11-30`.

---

## 13. Riesgos y controles

### 13.1 Los tres que más plata pueden distorsionar

| # | Riesgo | Cómo distorsiona | Control principal | Control secundario |
|---|---|---|---|---|
| **1** | **Doble conteo** | Suma dos veces la misma compra (duplicado, reintento, compra compartida, NC no aplicada, gasto repetido al cambiar de período) | Huella fuerte única + `idempotency_key` + ledger append-only con `Σ` por comprobante | Conciliación visible; alerta de reutilización; test T3/T5/T9/T12 |
| **2** | **Error de lectura no conciliado** | Un total mal leído (550,30 por 553,30, 8 por 3, coma perdida) entra como gasto y como precio; mueve el disponible y la tendencia | La suma de ítems **debe** cuadrar con el total del papel (±1 céntimo); si no, no se confirma | Total grande y tecleable; parser determinístico; guardas de cantidad/precio; T1/T4/T8 |
| **3** | **“Ahorro” inflado** | Donaciones valorizadas, comparación contra el precio más alto, canasta elegida después de ver el resultado, merma/transporte ignorados | El producto **no calcula “ahorro”**; muestra gasto, costo por ración y “diferencia vs mediana de la red” con método y n | Donación fuera de todo ahorro; canasta fija declarada; sin claims de un solo número |

### 13.2 Otros riesgos

| Riesgo | Ejemplo | Control |
|---|---|---|
| Fraude con comprobante real | Boleta real de otra compra, reutilizada en otro período | Huella global + alerta de reutilización + revisión + muestra aleatoria mensual |
| Fraude con comprobante alterado | Total editado en la foto | Conciliación + pHash/huella + precio fuera de guarda + revisión; no hay validación SUNAT en v1 `[a confirmar]` |
| Reconstrucción por consultas repetidas | Pedir muchos productos/períodos para triangular una olla | k ≥ 10 por celda + agregado mensual + rate limit por olla + no permitir cruces de filtros que aíslen una celda |
| Dos ollas suben la misma compra | Una compra pagada una vez, contada dos | Detección cross-olla + flujo de compra compartida con aceptación |
| Alias envenenado | “ACEITE” aprobado como “aceite de motor” | Aprobación humana con 5 usos y 3 precios; alias global solo admin; corregir = nueva observación |
| Catálogo duplicado | `papa-blanca` y `papa blanca` | `slug` único + búsqueda por alias + revisión de propuestas; no auto-crear desde el modelo |
| OCR de dígitos | 3↔8, 1↔7, 5↔6, coma↔punto | Parser + conciliación + total visible + nunca auto-confirmar |
| Unidad mal cargada | kg↔lb, saco↔kg, caja↔unidad | Equivalencias aprobadas, `por_revisar`, guarda P50/3–3×, serie por unidad base |
| Fuga por agregado pequeño | Una zona con 3 ollas | k ≥ 10 + dominancia + redondeo + opt-in |
| PII en la boleta | Nombre/DNI del comprador (boletas > S/ 700) | Redacción local antes de subir; no se guarda el dato |
| Presión por mostrar resultados | “Ahorramos S/ 12 000” sin contrafactual | Lenguaje prohibido (“ahorro”); método publicado; revisión de la nutricionista/organizadora |
| Período mal cerrado | Gasto tardío deja el mes en negativo | Alerta `periodo_cerrado_con_gasto`; traslado explícito; histórico visible |

### 13.3 Reglas de producto contra la distorsión

1. Ningún número de dinero sin su fuente: “S/ 553,30 · boleta B001-000123 del 18/11”.
2. Ningún porcentaje sin `n` y sin método.
3. Donación ≠ ingreso ≠ ahorro.
4. Compra compartida: una compra, una observación de precio, N gastos que suman el total.
5. El disponible puede ser negativo y se muestra; no se “maquilla” con un compromiso.
6. Un dato `por_revisar` **no** toca el presupuesto ni la serie.

---

## 14. Implementación por stream (sin código de producción acá)

| Pieza | Dónde | Dueño sugerido | Esfuerzo | Se puede mockear |
|---|---|---|---|---|
| Tipos, zod, estados, fórmulas puras | `packages/domain/src/comprobantes/**` | P1 | M | No |
| Tablas + RLS + RPC + vistas | `supabase/migrations/**` | P1 | L | No |
| Dexie + outbox + cursores | `packages/sync/src/**` | P3 | M | No |
| Edge Function de extracción (Workers AI) | `supabase/functions/extraer-comprobante/**` | P1 | M | Sí: `ExtractorPort` stub |
| Pantallas 10.1–10.4 | `apps/web/src/features/comprobantes/**` | P2 | L | No |
| Seed ficticio (3 ollas, 12 comprobantes, 60 observaciones) | `supabase/seed.sql` + `fixtures/` | P1 | S | — |
| Reporte agregado | RPC + pantalla 10.4 | P1/P2 | M | Sí: función con datos de fixture |

**Corte mínimo para el hackathon (si el reloj aprieta):**

1. Captura manual + foto adjunta (sin IA).
2. Clasificación por alias exacto + selector manual.
3. Dedupe por `huella_fuerte`.
4. Presupuesto con `A/G/C/D` y alertas 80/100.
5. Comparación con k ≥ 10 sobre datos del seed.

Eso ya cuenta la historia completa (“subo la boleta, el sistema ordena, me dice cuánto queda y cómo estoy frente a otras ollas”) sin depender de la latencia de un modelo. La IA es la mejora, no el requisito.

**Orden recomendado:** contratos y migración → captura/revisión → asiento y presupuesto → dedupe → tendencias → reporte k-anónimo → extracción con IA. Nunca al revés: si la IA entra antes que la conciliación, el equipo depura números inventados.

---

## 15. Fuentes y puntos a confirmar

### 15.1 Citadas (consultadas 2026-11-23)

- **SUNAT — Concepto, tasa y operaciones gravadas del IGV**: tasa aplicable 18 %; composición IGV + IPM y cambio gradual por Ley N.º 32387 sin alterar el 18 % total; base legal art. 17 TUO (D.S. 055-99-EF). `https://orientacion.sunat.gob.pe/3053-concepto-tasa-y-operaciones-gravadas-igv-empresas`
- **SUNAT — Boleta de venta**: consumidores finales; no da crédito fiscal; datos del adquiriente cuando el importe supera S/ 700. `https://orientacion.sunat.gob.pe/03-boleta-de-venta`
- **SUNAT — Comprobantes de pago / nota de crédito**: anulaciones, descuentos, bonificaciones y devoluciones; mismas características del comprobante que modifica. `https://orientacion.sunat.gob.pe/04-comprobantes-de-pago`
- **SUNAT — Reglamento de Comprobantes de Pago, art. 8 y 10**: requisitos mínimos (RUC, serie/número, fecha, descripción/cantidad, precio unitario, valor de venta, total) y notas de crédito. `https://www.sunat.gob.pe/legislacion/comprob/regla/capituloIII.pdf`
- **k ≥ 10**: documento del usuario, `docs-entrada/extraido-texto/nxtqbsr.txt` §7.6 y `10-texto.md` §7 — criterio de privacidad, no obligación legal.
- **Mediana y MAD / z modificado**: NIST/SEMATECH e-Handbook of Statistical Methods, §1.3.5.6 (MAD); Iglewicz & Hoaglin (1993) para el umbral 3,5.
- **Decisiones internas**: `06-decisiones.md` D8; `02-arquitectura.md` ADR-003/004/007 y §11; `04-plan.md` §2.2 (g/ml/unidad).

### 15.2 `[a confirmar]`

1. Si una olla común puede ser adquirente con RUC y usar crédito fiscal; hasta entonces, el presupuesto usa el total pagado con IGV.
2. Tratamiento tributario de donaciones en especie y de comprobantes informales (recibos internos): el módulo los registra como evidencia, no como gasto deducible.
3. Validación del dígito verificador del RUC y consulta del CPE ante SUNAT: no implementadas en v1.
4. Retención legal de la imagen del comprobante (se propone 24 meses, alineado con `movimientos`).
5. Umbrales de similitud y margen: los vigentes están en `packages/domain/src/clasificacion/config.ts`; recalibrar con ≥ 50 ítems reales anonimizados si cambia el modelo.
6. Si el comprobante puede no tener folio en la práctica de las ollas (recibos de mercado): la `huella_debil` cubre el caso, pero hay que validarlo con 20 boletas reales.
7. Pesos de “saco”, “caja” y “atado” por producto: solo entran si una persona los aprueba; no se asumen.

---

## 16. Resumen para el equipo (pegar en el chat)

- **8 tablas** (+5 auxiliares: `comprobante_adjunto`, `unidad_equivalencia`, `proveedor`, `comprobante_huella`, `comprobante_participante`): `comprobante`, `comprobante_item`, `producto_catalogo`, `producto_alias`, `precio_observado`, `presupuesto`, `movimiento_presupuesto`, `alerta`.
- **12 estados**; la revisión humana es obligatoria y solo `organizadora`/`admin` confirma.
- **Dinero en céntimos enteros**, cantidades en milésimas, precios en microcentésimos por unidad base; se suma desde el total de línea, nunca desde precio × cantidad.
- **Presupuesto** = ledger append-only; `D(t) = A(t) − G(t) − C(t)`; `consumo = (G+C)/A`; proyección lineal con `G/días`.
- **Dedupe** por hash de imagen + proveedor + folio + total + fecha; parciales y cross-olla son candidatos, no autos.
- **Tendencias** con mediana de N=7 (mín. 3) y filtro MAD; categoría con índice de canasta fija, no promedio de porcentajes.
- **Entre ollas**: k ≥ 10, sin proveedores, sin personas, sin montos individuales; cuartiles, no ranking.
- **Tres riesgos de dinero**: doble conteo, lectura no conciliada, “ahorro” inflado.
