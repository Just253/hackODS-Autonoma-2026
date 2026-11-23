# Recetario y producción

**Qué es:** el flujo receta → producir → descuento → costo → faltante/solución, **local y sin red**
(issue #72). Se elige un plato, se cuentan los comensales por grupo y «Registrar servicio» descuenta
los ingredientes, calcula el costo y cierra el servicio con quien cocinó y el checklist de 75 °C.

**Qué lee:** `RECETAS_DEMO`, `INSUMOS_DEMO`, `PORCIONES_FIRMADAS_DEMO` y `SUSTITUCIONES_DEMO` de
`src/fixtures/recetas-demo.ts`; la serie de precios de `src/fixtures/precios-productos.ts` a través de
`medianaMovil` (la misma que usa Precios); y el stock **derivado** de `stockDeDespensa()`
(`src/data/recetas-repo.ts`). La porción firmada del guiso (adulto 280 g, menor_5 180 g, gestante
320 g) y sus ingredientes son los del seed; el resto es andamiaje ficticio y la pantalla lo dice.

**Qué escribe:** `producirServicio()`, en una sola transacción Dexie (`hackods-<ollaId>`):

- una fila `movimientos` por ingrediente, `motivo: 'salida'`, `delta` negativo (append-only, sin saldo
  mutable; `saldoDespensa` suma). `autor` es el `memberId` ficticio de la sesión y `at` el instante
  del registro;
- una fila `serviciosCocidos` con receta, comensales por grupo, cocinero, 75 °C, costo y las
  sustituciones aplicadas (con `aprobadaPor`);
- un evento de outbox por movimiento (`entidad: 'movimientos'`), todo en la misma transacción.

`asegurarEntradasDemo()` siembra el stock inicial como movimientos de `entrada` con ids estables
(`entrada-demo-<insumo>`) y `autor: demo-ficticio`: no pasa por el outbox porque es andamiaje de la
demo, no un dato de la olla que deba viajar.

**Cálculo:** todo vive en `packages/domain/src/recetas.ts` (`explotarIngredientes`, `costoDeReceta`,
`faltantesDeDespensa`, `sustitucionesParaFaltantes`, `aplicarSustituciones`, `movimientosDeSalida`) y
en `saldoDespensa` (`racion.ts`). La pantalla no hace cuentas: solo llama funciones puras y formatea.

**Faltante y sustitución:** se compara lo necesario con el stock derivado. Si falta un insumo se
muestran **solo** las sustituciones aprobadas con su factor (hoy, leche evaporada → quinua ×1,20 del
seed). Sin fila aprobada se dice `sin sustituto`. Nada se reemplaza solo: la persona elige la
sustitución o «se compra antes de cocinar», y la elección queda en el servicio. El sustituto se
compara también contra el stock: si no alcanza, se avisa y no se puede registrar hasta resolverlo.

**Costo:** `Σ gramos × precio por unidad base`, con el precio típico (mediana móvil) de la serie demo
convertido kg→g. Si falta un precio, la línea dice `sin dato` y el **total y el costo por ración son
`sin dato`**: no se completan con un promedio. Los precios no se inventan.

**Estados:** leyendo la despensa · sin comensales · faltante con sustituto · faltante sin sustituto ·
falta el checklist de 75 °C · servicio registrado (guardado en esta tablet, la red no hizo falta) ·
error de lectura/escritura.

**Qué NO hace (fuera de alcance de este PR):** no toca `supabase/**` ni migra SQL (otro agente tiene
la base): el servicio con `receta_id`/comensales por grupo vive en Dexie hasta #62/#65. Lotes y
vencimiento dependen de #69. No reemplaza ingredientes por su cuenta ni inventa precios,
equivalencias o porciones. No sincroniza: el envío y el Lamport son de `packages/sync`.

**Pruebas:** `RecetasPage.test.tsx` (componente con Dexie y `fetch` apagado: faltante, sustitución,
75 °C, producción, stock derivado, costo y offline) y `packages/domain/src/recetas.test.ts` (explosión,
factor firmado vs base, costo con y sin precio, faltante, sustitución y saldo derivado).
