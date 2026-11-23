# Despensa (inventario)

**Qué es:** la pantalla del issue #69. Muestra el stock de cada insumo **derivado de los movimientos**
(nunca un saldo guardado), avisa el mínimo y el vencimiento próximo de cada lote, y permite cargar una
entrada, salida, merma o ajuste a mano o pegando el texto de la compra.

**Qué lee:** `INSUMOS_DEMO` y `TEXTO_ENTRADA_DEMO` de `src/fixtures/inventario-demo.ts` (catálogo
ficticio y marcado); de Dexie, `insumos`, `movimientos` y `lotes` (`src/data/inventario.ts`); y de
`@hackods/domain`: `stockPorInsumo` / `saldoDespensa`, `urgenciaVencimiento` (3 / 7 / 15 días),
`parsearCaptura` y `formatearCentimos`. La pantalla no suma ni compara umbrales: eso vive en
`packages/domain/src/racion.ts`.

**Qué escribe:** movimientos append-only (`registrarMovimiento`) + su evento en el outbox de
`@hackods/sync`, y —si la entrada trae fecha— un lote en la tabla `lotes`. Nada va a la red: con la
red apagada se guarda igual y el aviso dice "en este dispositivo".

**El texto pegado se revisa antes de confirmar.** `prepararEntrada()` empareja cada ítem del parser
con el catálogo; lo que no se entiende (producto fuera del catálogo, sin cantidad, presentación sin
equivalencia, monto sin repartir) queda `sin dato` y **no** se registra. El precio se muestra para
revisar pero no se guarda acá: los precios son de la pantalla de comprobantes.

**Dictado y foto.** Los dos botones usan la Edge `ingest` con el JWT de la sesión: `Dictar` manda el
audio (`tipo: audio`) y `Subir foto` manda una imagen PNG/JPEG de la boleta (`tipo: boleta`). La
función guarda el binario en Storage, llama al compute con su `COMPUTE_TOKEN` y devuelve los ítems;
la pantalla los pega como texto para revisarlos antes de confirmar. Sin sesión, los botones quedan
deshabilitados y se escribe a mano. El navegador nunca conoce `COMPUTE_URL` ni el token.

**Limitación declarada:** `Movimiento` no modela el lote y `@hackods/sync` no tiene entidad `lotes`,
así que el vínculo movimiento↔lote y el vencimiento viven **solo en el dispositivo** (`loteId` no
viaja en el payload del outbox). El stock tampoco se lleva por lote: se deriva del insumo, y el lote
aporta la fecha de vencimiento y la cantidad con la que entró. Cuando el contrato lo modele, la tabla
`lotes` pasa a sincronizarse.

**Qué NO hace:** no edita ni borra movimientos (se corrige con un `ajuste`); no importa facturas; no
calcula precios ni presupuesto; no inventa equivalencias para `saco`, `docena` o `atado`.

**Texto visible:** las unidades se escriben completas (gramos, mililitros) y la app tutea en peruano.

**Estados:** cargando / vacío / error viven en el mismo bloque; antes el vacío nunca se veía porque la siembra demo lo tapaba.
