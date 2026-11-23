# 06 — Decisiones que mandan (reconciliación con la documentación del usuario)

> Esta nota **corrige** `01-prd.md`, `02-arquitectura.md`, `03-motor-nutricional.md` y `04-plan.md`.
> Fuente: los 3 PDF de `datos_ollas_comunes.zip` (65 páginas) y las respuestas del usuario del 2026-11-23.
> Si hay conflicto, manda este archivo. Los otros quedan como insumo e historia.

## D1 · Backend: Supabase, con el contrato `/sync/push` de tu documento

- Postgres + Auth + RLS + Storage en Supabase. **Sin VPS y sin `apps/api`.**
- El endpoint que pide tu documento existe igual: `POST /sync/push`, implementado como **Edge Function** (o RPC) que valida lote ≤100 eventos, `idempotency_key = event_uuid`, orden `(lamport, device_id)` y devuelve aceptados/rechazados.
- Hosting del front: Cloudflare Pages. Ese es el híbrido: capas distintas, una sola fuente de verdad.
- `GET /sync/pull?since=<lamport|timestamp>` como función simétrica.

## D2 · Identidad: el servidor nunca sabe quién es la persona

- En la nube: solo `person(P-XXXX)`, sin nombre, sin DNI, sin teléfono, sin dirección.
- `nombreLocal` y `alias` existen **solo en el dispositivo** (Dexie) y **nunca** se sincronizan. El vínculo P-XXXX ↔ persona vive en el papel del comedor.
- Los impresos usan `nombreLocal` si existe; si no, `P-XXXX`.
- Seguimiento **opt-in** con consentimiento de dos casillas; negarse no le quita el plato.
- Consecuencia para el código: el esquema SQL no tiene columna de nombre. El esquema local sí, marcado `localOnly: true`.

## D3 · Nutrición: menú semanal firmado + porción por grupo

- La unidad de verdad es el **menú semanal firmado por nutricionista**: 2 perfiles × 2 opciones, 7 días, almuerzo y cena.
- Estados: `borrador → en_revision → aprobado → publicado → retirado`. Sello obligatorio: nombre, colegiatura CNP, fecha, versión y **hash SHA-256** del contenido.
- El sistema **no prescribe dietas ni calcula requerimientos individuales**. Valida que el menú cumpla sus restricciones, ajusta **porción por grupo** (edad/condición) y explica.
- Sustituciones: solo las aprobadas en la plantilla, con factor. Nada de inventar equivalencias.
- `packages/nutrition` expone: `validarMenu`, `porcionParaGrupo`, `sustituirInsumo`, `explicar`. Se retira el cálculo de una ración por persona.
- El badge de origen sigue: `sugerencia_sistema | validado_nutricionista | ajustado_organizadora | sin_revisar`.

## D4 · Modelo de datos (correcciones)

- `Olla.tipo ∈ {comun, comedor_pca}`. No son lo mismo: cambia subsidio, cuota y defaults (olla 99 pers./317 kg-mes; comedor 78/320).
- **Precio como serie**: `insumo, canal (mayorista|minorista), unidad, precio, fecha, fuente, url`. Sin serie no hay "menú al costo" ni brecha que mostrar.
- `menu_template`, `menu_day`, `dish`, `ingredient`, `portion`, `constraint`, `substitution`, `validation` (8 tablas) con versión y hash.
- `movimiento` append-only (entrada, salida, merma, ajuste, transferencia). La despensa nunca guarda saldo mutable.
- `person` con los 9 campos del diccionario del usuario; los de salud quedan opt-in y sensibles.
- `evento_sync` con `event_uuid`, `idempotency_key`, `lamport`, `device_id`, `entidad`, `payload`, `estado`.
- Nomenclatura: `olla_id` en todo el código; `comedor` es un `tipo`, no otra entidad.

## D5 · Sincronización

- UUIDv7 generado en el cliente; **reloj de Lamport** (nunca `Date.now()` para ordenar); desempate por `device_id`.
- Outbox persistente; lotes ≤100; reintento con backoff; `idempotency_key` evita duplicados.
- Cifrado local AES-GCM derivado del PIN de la olla; sin PIN no se descifra en el dispositivo.
- Conflicto: gana el cierre válido más antiguo y el otro queda como conflicto visible; movimientos y raciones nunca se sobrescriben.

## D6 · Alcance y demo

- Demo: **3 minutos** (guion del documento) con un anexo de 2 minutos por si hay preguntas.
- **75 °C** es requisito de inocuidad del usuario: entra como checklist de cocción en la ficha del servicio, no como cálculo.
- Fuera de alcance de esta base: OCR de manuscrito, app para la familia, facturación, municipalidad (rol con k ≥ 10 queda como lectura agregada, no como módulo).

## D7 · Privacidad

- Repo público: cero datos reales. Ni los XLSX de Cañete, ni el padrón MIDIS nominal, ni el padrón de VES.
- Los seeds clínicos (`peso`, `talla`, `hemoglobina`) son ficticios y marcados; Ley 29733.
- `2p9r37h.pdf` ("Puente", salud mental) es otro proyecto: **no entra** en este alcance.

## D8 · Comprobantes, clasificación de productos y presupuesto

Requisito nuevo del usuario: cada olla **sube sus facturas/boletas**, el sistema **clasifica cada producto**, sigue **cuánto sube y baja** y calcula **el presupuesto de esa olla en ese momento**. Además, un reporte comparable entre ollas.

- **Ingesta**: foto o PDF del comprobante → extracción de ítems (descripción, cantidad, unidad, precio unitario, total) → **revisión humana obligatoria** antes de confirmar. Nada entra al presupuesto sin confirmar.
- **Clasificación**: texto libre del proveedor → producto del catálogo. En el prototipo, **Cloudflare Workers AI** (vision para leer, embeddings para emparejar contra el catálogo y sus alias). En producción, VPS o servicio de embeddings; el contrato no cambia.
- **Regla de confianza**: si la similitud es baja o hay empate, el ítem queda `por_revisar` y no afecta el presupuesto. El catálogo aprende con alias aprobados, no con autoaprendizaje silencioso.
- **Precio observado** = `(producto, cantidad_normalizada, precio_unitario, fecha, proveedor, canal)`. La serie es inmutable; la tendencia se calcula contra la mediana de las últimas N observaciones, no contra un promedio que un outlier mueve.
- **Unidades**: normalizar a kg / L / unidad con tabla de equivalencias aprobada. Si no se puede, el ítem queda con su unidad original y se excluye de la comparación.
- **Presupuesto**: por olla y período (`monto_asignado`, `gastado`, `comprometido`, `disponible`, `proyección al cierre`, `alertas al 80 % y 100 %`). Compras compartidas y donaciones en especie se registran aparte, con origen explícito.
- **Reporte entre ollas**: agregados por período y categoría, sin identidad de personas ni de proveedores; cada olla ve su detalle, las demás solo el agregado.
- **Deduplicación**: mismo comprobante subido dos veces → se detecta por hash de imagen + proveedor + folio + total; no se suma dos veces.
- **Umbral calibrado (medido, no estimado)**: `τ=0,69`, `margen=0,04`, `piso=0,45`, normalización **nivel 3**. Con `bge-m3` en Ollama: acc@1 100 % en 45 ítems (9 con ruido OCR). Con el umbral de arranque (más bajo) el sistema auto-confirmaba `POLLO VIVO KG` → `pollo_beneficiado`; por eso el vigente es el calibrado. La normalización bajó la revisión de 31,2 % a 6,2 % sin perder accuracy. Fuente: `docs/research/11-ollama-embeddings.md`.

**Referencia implementable (D8):**

- `docs/contracts/comprobantes.md` — comprobantes, unidades, IGV, presupuesto y series de precio.
- `docs/contracts/clasificacion.md` — catálogo, embeddings, umbrales y revisión humana.

## D9 · Captura sin boleta (texto o voz) y dos backends

Requisito nuevo: la persona puede **escribir o dictar** cuánto gastó en cada cosa, porque muchas compras son en efectivo y sin boleta. Esa captura alimenta la misma clasificación y el mismo presupuesto.

- **Tres orígenes, un mismo destino**: `comprobante`, `manual` (texto) y `voz`. Todos terminan en `comprobante_item` y, tras revisión, en `precio_observado`, con `origen` y evidencia (`imagen`, `texto`, `audio`).
- **Voz**: se graba **offline**, se transcribe cuando hay red o en el dispositivo, se extraen ítems y **una persona confirma los números**. Un número mal oído no entra al presupuesto.
- **Cola única**: si no hay red o el servicio de cálculo no responde, la captura queda `pendiente_compute` y se procesa al volver. Nada se pierde y no se duplica (`idempotency_key`).
- **Dos backends, un contrato**: **Supabase** es el registro (auth, RLS, storage, cola); **Compute** (`ComputePort`) ejecuta transcripción, extracción, vectorización y cálculo pesado sin guardar estado. En el prototipo corre en una **PC remota con `cloudflared` quick tunnel**; en producción, VPS con dominio y TLS.
- **Regla de honestidad**: la UI dice "esperando para procesar", no finge que ya calculó. El presupuesto solo cambia con ítems confirmados.
- **Quick tunnel es de prototipo**: URL efímera, sin autenticación propia y sin SLA. Exige token de servicio, límites de tamaño y tasa, y **nunca** expone Postgres. El audio crudo no se sube por defecto; si se sube, retención corta y borrado.

**Referencia implementable (D9; el diseño llama D10 a la separación de backends, acá queda dentro de D9):**

- `docs/contracts/captura-voz.md` — flujo, estados, `AsrPort` y parser determinista.
- `docs/ARQUITECTURA-COMPUTE.md` — topología del segundo backend, `ComputePort`, auth y degradación.

## Lo que cambia respecto de lo ya escrito

| Antes | Ahora |
|---|---|
| Supabase sin endpoint de sync | Supabase + `POST /sync/push` y `/sync/pull` como funciones |
| nombre de la persona sincronizado e impreso | nombre solo local; nube con `P-XXXX` |
| cálculo de ración por persona con tabla v0 | menú semanal firmado + porción por grupo |
| `olla` única | `olla.tipo` con defaults y régimen distintos |
| precios sueltos | serie de precios con canal, fecha y fuente |
| demo de más de 5 min | demo 3 min + anexo de 2 |
| 75 °C fuera de alcance | checklist de inocuidad en el servicio |
| facturas fuera de alcance | módulo de comprobantes con clasificación y revisión |
| sin reporte entre ollas | agregado comparable por período y categoría |
