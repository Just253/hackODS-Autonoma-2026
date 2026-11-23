# Feature: precios

Muestra cómo se movió el precio de un producto (el pollo en el demo) contra la
**mediana** de sus observaciones, no contra un promedio (`DEC-2026-0008`, D8).

- **Lee**: dos ventanas de `ObservacionPrecio` (actual y previa), la fuente y
  la unidad base (kg, L, un).
- **Calcula**: la mediana móvil (n = 7, filtro MAD z > 3,5 y guarda P50/3..3xP50)
  y la variación. Viven en `packages/domain/src/precios/serie.ts` y
  `.../aritmetica.ts` (reexportados por `dominio.ts`); `tendencia.ts` solo combina
  las dos medianas: `(M_actual − M_previa) / M_previa × 100`. No reimplementa mediana.
- **Escribe**: nada; es pantalla de lectura.
- **Estados**: `listo`, `cargando`, `error` y `sin-conexion` ("pendiente de
  sincronizar"). Si falta una ventana o hay < 3 válidas: "sin dato", sin interpolar.

Por qué mediana: un error de unidad mueve el promedio (T7 da +128 % falso). El
outlier se excluye por MAD y no mueve la tendencia. Precio con `formato-precio.ts`.
Tests: `formato-precio.test.ts` (tabla micro→soles), `tendencia.test.ts` (+12,00 %
con outlier y rojo→verde contra promedio) y `PreciosPantalla.test.tsx`.
