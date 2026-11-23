# Reporte (entre ollas)

Pantalla del paso 2:50 del guion. **Qué hace:** agrega el **volumen movido** (no saldo) por categoría
de 3 ollas ficticias en el período demo, calculado con `agregadoEntreOllas` de `packages/domain`
(useMemo). **Qué lee:** `MOVIMIENTOS_ENTRE_OLLAS` y `PERIODO_DEMO` (props del router); los fixtures
incluyen a propósito un `P-XXXX` y un alias que **no deben salir** (filtro `categoriaSegura`).
**Qué escribe:** nada.

**Distribución:** la tabla usa `.oc-tabla` (tokens, números a la derecha con `oc-num`, filas alternas y
más densidad en escritorio) y scrollea en horizontal en el teléfono con `min-w` para no aplastar las
columnas: se prefiere comparar con scroll a leer seis columnas ilegibles. Las claves del dominio
(`granos`, `otros`) se muestran capitalizadas y el volumen, que el agregado devuelve en gramos, se
publica en kg ("20 kg"); una celda sin movimientos es "—", no un cero que parece un dato.
