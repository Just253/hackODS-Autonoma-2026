# Comprobante

**Qué es:** paso 4 del guion (`docs/MODO-6H.md` §4). La cocinera fotografía una boleta y revisa antes
de que el dinero entre al presupuesto (DEC-2026-0008). Sin OCR ni cámara: los ítems llegan ya
extraídos en `apps/web/src/fixtures/comprobante-demo.ts`.

**Qué lee:** `ITEMS_BOLETA` y `CANDIDATOS_POR_ITEM` de `src/fixtures/`, más `CONFIG_CLASIFICACION` de
`@hackods/domain`. Los umbrales `TAU`/`MARGEN`/`PISO` nunca se escriben en la pantalla:
`clasificarItem()` es el único lugar que los aplica.

**Qué escribe:** nada. El demo es local: al confirmar se actualiza el estado en memoria
(`confirmado` / `por_revisar`) y el total suma sólo los `confirmado`. La exportación al outbox de
`@hackods/sync` queda fuera de este write-set (issue de seguimiento).

**Estados:** leyendo la boleta · 2 líneas `por_revisar` que no suman · confirmar una línea · todas
confirmadas · `desconocido` por debajo de `PISO` (ver test).

**Qué NO hace:** no hace OCR ni abre la cámara, no clasifica de verdad (usa el doble de embeddings de
los fixtures), no deduplica comprobantes y no empuja nada a Supabase.
