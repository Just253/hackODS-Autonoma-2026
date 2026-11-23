# Feature: precios

Lista los seis insumos de la olla (arroz, lentejas, papa, huevo, quinua, pollo) con
su **precio típico** y su variación, y muestra el detalle del que se elige. El
cálculo compara la MEDIANA de la ventana actual contra la de la previa, nunca un
promedio (`DEC-2026-0008`, D8). En pantalla la palabra "mediana" no aparece: se
dice "precio típico", que es lo que se entiende en la olla.

- **Lee**: `PRODUCTOS_DEMO` de `src/fixtures/precios-productos.ts` (ficticio y
  determinista: dos ventanas de 7 observaciones por producto) y la fuente.
- **Calcula**: la mediana móvil (n = 7, filtro MAD z > 3,5 y guarda P50/3..3xP50)
  y la variación. Viven en `packages/domain/src/precios/serie.ts` y
  `.../aritmetica.ts` (reexportados por `dominio.ts`); `tendencia.ts` solo combina
  las dos medianas: `(M_actual − M_previa) / M_previa × 100`. No reimplementa mediana.
- **Escribe**: nada; es pantalla de lectura.
- **Estados**: `listo`, `cargando`, `error` y `sin-conexion` ("guardado en esta
  tablet"). Si falta una ventana o hay < 3 válidas: "sin dato", sin inventar un número.

Por qué mediana: un error de unidad mueve el promedio (T7 da +128 % falso). El
valor atípico se excluye por MAD y no mueve la tendencia; la pantalla lo dice con
palabras ("Un precio muy distinto quedó fuera del cálculo"). Precio con
`formato-precio.ts`.
Tests: `formato-precio.test.ts` (tabla micro→soles), `tendencia.test.ts` (+12,00 %
con atípico y rojo→verde contra promedio), `PreciosPantalla.test.tsx` (lista de los
seis + detalle por producto) y `ventana-previa.test.tsx`.

**Distribución:** destino secundario, dentro de "Más" en el teléfono y siempre
visible en el rail de escritorio. El índice es la lista (los seis se comparan de un
vistazo, con su precio y su variación); el detalle va debajo en el teléfono y a la
derecha, fijo, en escritorio. La cifra grande lleva signo y palabra además del
color: al sol y para quien no distingue verde de rojo, la flecha dice lo mismo.
