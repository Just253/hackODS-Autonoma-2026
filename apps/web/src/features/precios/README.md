# Precios

**Qué hace:** la organizadora mira el precio típico de cada insumo de la olla y su variación. La
lista es el índice (se comparan los insumos con su precio y su flecha) y el detalle abre el elegido.
La variación compara la **mediana** de la ventana actual contra la previa, nunca un promedio
(DEC-2026-0008, D8). En pantalla se dice "precio típico"; la palabra "mediana" no aparece.

**Qué lee:** `PreciosDeLaOlla` pide `seriePrecios(ollaId)` a `src/data/remoto.ts` (`precios` +
`insumos` de Supabase, filtrado por la olla de la sesión) y `serie-remota.ts` arma una serie por
`(insumo, canal, unidad)`: mayorista y minorista no se mezclan. `partirVentanas` aplica el contrato
§8.2 (`[t-30, t]` y `[t-60, t-31]`, con `t` = última compra de esa serie). La cuenta la hace
`calcularTendencia()` → `medianaMovil` de `@hackods/domain` (N = 7, N_min = 3, filtro MAD). La
unidad de compra (`g`→kg, `ml`→L) y la conversión de microcéntimos son de `unidad.ts` y
`serie-remota.ts`; no se recalcula ningún precio acá.

**Estados:** sin sesión/backend → "Conectá Supabase para ver los precios" (sin fixtures); cargando;
olla sin precios → "Sin precios"; error de red/RLS → estado `error` con **Reintentar**. Si falta una
ventana, la variación dice `sin dato`: no se inventa una flecha.

**Qué escribe:** nada; es pantalla de lectura. No hace OCR ni lee boletas, y no promete dictado.
`PreciosPantalla` sigue siendo presentacional: recibe `productos`, `fuente` y el estado; el acceso a
datos vive en `PreciosDeLaOlla`.

**Texto visible:** la fuente dice de dónde salen los precios de la olla, sin jerga de escaneo.

**Texto visible:** sin sesión remota pide "Conecta Supabase" (tuteo peruano), no "Conectá".
