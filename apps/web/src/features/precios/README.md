# Precios

**Qué hace:** la cocinera mira cuánto están los seis insumos de la olla (arroz, lentejas, papa,
huevo, quinua, pollo). La lista es el índice —se comparan los seis con su precio y su variación— y
debajo se abre el detalle del elegido. La variación compara la **mediana** de la ventana actual
contra la de la previa, nunca un promedio (DEC-2026-0008, D8). En pantalla se dice "precio típico";
la palabra "mediana" no aparece.

**Qué lee:** recibe por props `productos` (cada uno con `ventanaActual`, `ventanaPrevia` y
`unidad`), `fuente` y `productoInicial`; el router los toma de `PRODUCTOS_DEMO`,
`FUENTE_PRECIOS_DEMO` y `PRODUCTO_DESTACADO` de `src/fixtures/precios-productos.ts` (ficticios y
deterministas). La cuenta la hace `calcularTendencia()` de `tendencia.ts`, que llama a
`medianaMovil` de `@hackods/domain` (reexportado en `dominio.ts`); el filtro de atípicos (MAD) y la
guarda P50/3..3xP50 también vienen de ahí. `tendencia.ts` solo combina las dos medianas.

**Qué escribe:** nada; es pantalla de lectura y todo sale de fixtures.

**Qué NO hace:** no reimplementa la mediana ni el filtro, no hace OCR ni lee boletas (la propia
pantalla dice "sin escaneo de boletas") y no inventa cifras: si falta una ventana o hay menos de 3
válidas, muestra "sin dato". `unidad.ts` solo traduce la unidad base (`g`→kg, `ml`/`l`→L) a como se
compra en el mercado; no convierte valores.

**Estados:** `listo`, `cargando`, `error` (con reintento) y `sin-conexion` ("se muestra lo último
guardado"). Un precio muy distinto se excluye y se avisa con palabras, sin que mueva la tendencia.

**Texto visible:** los precios de ejemplo se anuncian como de ejemplo; sin jerga de escaneo.
