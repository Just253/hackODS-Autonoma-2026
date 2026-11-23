# Comprobante

**Qué es:** paso 4 del guion (`docs/MODO-6H.md` §4). La cocinera fotografía una boleta y revisa antes
de que el dinero entre al presupuesto (DEC-2026-0008). Sin OCR ni cámara: los ítems llegan ya
extraídos en `apps/web/src/fixtures/comprobante-demo.ts`.

**Qué lee:** `ITEMS_BOLETA` y `CANDIDATOS_POR_ITEM` de `src/fixtures/`, y de `@hackods/domain`:
`CONFIG_CLASIFICACION`, `clasificarItem()`, `sumaAlPresupuesto()`, `totalDeLineasConfirmadas()`,
`totalDelPapel()` y `formatearCentimos()`. Los umbrales `TAU`/`MARGEN`/`PISO` nunca se escriben en la
pantalla y la pantalla no suma: la regla de dos puertas + piso vive en
`packages/domain/src/clasificacion/clasificar.ts` y los totales en
`packages/domain/src/comprobantes/totales.ts`.

**Qué escribe:** nada. El demo es local: al confirmar se actualiza el estado en memoria
(`confirmado` / `por_revisar`) y el total suma sólo los `confirmado`. La exportación al outbox de
`@hackods/sync` queda fuera de este write-set (issue de seguimiento).

**Estados:** leyendo la boleta · 2 líneas `por_revisar` que no suman · confirmar una línea · todas
confirmadas · `desconocido` por debajo de `PISO` (ver test).

**Distribución:** el total confirmado es la cifra de la pantalla. En el teléfono va arriba y pegado
(sticky) mientras se revisan las líneas; en escritorio pasa a la columna derecha, al lado de la lista,
y deja de empujar la boleta hacia abajo. Una barra de avance (`role="progressbar"`, además del texto)
dice cuántas líneas están listas. Cada línea `confirmado` / `por_revisar` lleva su marca escrita además
del color.

**De dónde salen los colores:** `packages/ui/src/tokens.css` define los colores como triplete RGB
(`--color-superficie`, `--color-texto`…); `apps/web/src/styles/tailwind.css` los puentea al tema de
Tailwind, así que las utilidades (`bg-superficie`, `text-texto-suave`, `border-borde`) apuntan al
token y no copian el valor. `oc-tarjeta` sí es una clase de `tokens.css`. Un hexadecimal suelto en la
pantalla sería un PR rechazado (`packages/ui/AGENTS.md` §3).

**Qué NO hace:** no hace OCR ni abre la cámara, no clasifica de verdad (usa el doble de embeddings de
los fixtures), no deduplica comprobantes y no empuja nada a Supabase.

**Texto visible:** la boleta de ejemplo se anuncia como de ejemplo; no se habla de OCR ni de escaneo, que la demo no hace.

**Texto visible y layout:** el resumen `sticky` no pelea con el header (`z-20`), y la fila de precio unitario es `grid-cols-1 sm:grid-cols-3` para no partirse en 360 px.
