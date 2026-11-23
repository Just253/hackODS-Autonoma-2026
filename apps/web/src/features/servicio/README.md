# Servicio del día

**Qué es:** registro de una ración por persona del padrón, explicada con al menos dos razones. La
pantalla no justifica la ración: la cocinera escribe las razones (DEC-2026-0003, menú firmado).

**Qué lee:** `listarPersonas(OLLA_DEMO)` y `racionDe(codigoP, OLLA_DEMO)` de
`src/data/repositorio.ts`, para saber quién está en el padrón y si ya tiene ración.

**Qué escribe:** `guardarRacion()`, un `put` append-only en la tabla `raciones` de `hackods-<ollaId>`,
validado con `racionSchema`. Si ya existe ración de esa persona se reemplaza; nunca se acumulan dos
filas para la misma persona y servicio.

**Hallazgo `COBERTURA_SIN_CALCULO`:** `racionSchema.cobertura` es un record que exige los 8 nutrientes
del contrato (`energia`, `proteina`, `hierro`, `zinc`, `vitaminaA`, `folato`, `vitaminaB12`, `calcio`).
Omitirlos no es opción, porque Zod falla. El repositorio escribe `0` en cada clave con
`COBERTURA_SIN_CALCULO`, y esos `0` significan **"sin cálculo"**, no "cero nutrientes": la pantalla
dice `sin dato` y nunca dibuja el `0`. Igual `componentes: []` y `servicioId: null`, porque el cálculo
por grupo es de `packages/nutrition` (DEC-2026-0003).

**Estados:** leyendo el servicio · sin padrón (pedir el alta en Padrón) · contador de raciones del
dispositivo · ración guardada ("pendiente de sincronizar; la red no hizo falta") · faltan razones
(error).

**Qué NO hace:** no calcula peso, nutrientes ni grupo por edad —eso es de `packages/nutrition` y hoy
dice `sin dato`—, no asigna `servicioId` (no hay menú cargado) y no sincroniza: el envío y el Lamport
de la ración corresponden a `packages/sync` (DEC-2026-0005).
