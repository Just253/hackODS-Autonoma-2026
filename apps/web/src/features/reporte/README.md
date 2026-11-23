# Reporte (entre ollas)

Pantalla del paso 2:50 del guion. **Qué hace:** agrega el **volumen movido** (no saldo) por categoría
de 3 ollas ficticias en el período demo, calculado con `agregadoEntreOllas` de `packages/domain`
(useMemo). **Qué lee:** `MOVIMIENTOS_ENTRE_OLLAS` y `PERIODO_DEMO` (props del router); los fixtures
incluyen a propósito un `P-XXXX` y un alias que **no deben salir** (filtro `categoriaSegura`).
**Qué escribe:** nada.
