# Presupuesto

**Qué hace:** muestra a la olla cuánto tiene asignado, cuánto gastó, cuánto le queda, cuánto está
comprometido y la proyección al cierre, con avisos al 80 % y al 100 %. La organizadora ve
"Disponible" como cifra principal y el consumo dicho en palabras ("se gastó tanto de cada 100
soles"), con una barra además del color. Los avisos no bloquean la pantalla.

**Qué lee:** recibe por props `movimientos` (`MovimientoPresupuesto[]`, append-only) y `corte`
(`CortePresupuesto`); el router los toma de `MOVIMIENTOS_DEMO` y `CORTE_DEMO` de
`src/fixtures/demo.ts`. Todo el dinero lo calcula `calcularPresupuesto()` de `@hackods/domain`
(reexportado en `dominio.ts`).

**Qué escribe:** nada; es pantalla de lectura. Si en el futuro hay una mutación, va al outbox de
`@hackods/sync`, nunca directo a Supabase.

**Qué NO hace:** no hace cuentas de dinero. Los umbrales 80 %/100 % se derivan de
`resultado.alertas` (`presupuesto_80` / `presupuesto_100`), no se repiten en la pantalla.
`consumo.ts` no recalcula el consumo: toma `resultado.consumoBp` y solo lo redacta en soles de cada
100, avisando si el redondeo queda "casi" o "un poco más". Sin base suficiente, la proyección dice
"sin dato" en vez de mostrar un número.

**Estados:** `listo`, `cargando`, `error` (con reintento) y `sin-conexion` ("se muestra lo último
guardado"). `disponible < 0` se dice "excedido"; sin asignado, el consumo es "sin dato".
