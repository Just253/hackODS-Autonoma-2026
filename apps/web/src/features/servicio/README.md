# Servicio del día

**Qué es:** registro de una ración por persona del padrón, explicada con al menos dos razones. La
pantalla no justifica la ración: la cocinera escribe las razones (DEC-2026-0003, menú firmado).

**Qué lee:** `listarPersonas(OLLA_DEMO)` y `racionDe(codigoP, OLLA_DEMO)` de
`src/data/repositorio.ts`, para saber quién está en el padrón y si ya tiene ración **del servicio de
hoy** (`servicio-AAAA-MM-DD`).

**Qué escribe:** `guardarRacion()`, un `add` append-only en la tabla `raciones` de
`hackods-<ollaId>`, validado con `racionSchema`. La clave primaria es compuesta,
`[personaCodigoP+servicioId]`: una fila por persona y servicio. Si ya existe, `add` falla con
`RacionDuplicada` y la pantalla lo dice — no se reemplaza nada en silencio, porque una ración se anula
con otro registro (contrato append-only).

**Sin menú firmado:** `NuevaRacion.servicioId` es opcional y, si no se pasa, `guardarRacion()` usa
`servicioDelDia()` (`servicio-AAAA-MM-DD`, del reloj inyectable). Nunca se guarda `null`: `null` no
puede formar parte de una clave compuesta en IndexedDB. Cuando exista el menú (H3:30), el id del
servicio lo trae la integración.

**Hallazgo `COBERTURA_SIN_CALCULO`:** `racionSchema.cobertura` es un record que exige una clave por
nutriente del contrato (`nutrienteIdSchema.options`: hoy `energia`, `proteina`, `hierro`, `zinc`,
`vitaminaA`, `folato`, `vitaminaB12`, `calcio`). Omitirlos no es opción, porque Zod falla. El
repositorio se arma las claves desde el propio schema y escribe `0` en cada una con
`COBERTURA_SIN_CALCULO`; esos `0` significan **"sin cálculo"**, no "cero nutrientes": la pantalla
dice `sin dato` y nunca dibuja el `0`. Igual `componentes: []`, porque el cálculo por grupo es de
`packages/nutrition` (DEC-2026-0003).

**Estados:** leyendo el servicio · sin padrón (pedir el alta en Padrón) · contador de raciones del
dispositivo · ración guardada ("guardado en esta tablet; la red no hizo falta") · faltan razones
(error).

**Qué NO hace:** no calcula peso ni nutrientes por persona; la porción por grupo es la del menú
firmado (`ServicioResumen` con `servirDelDia`) y el resto dice `sin dato`. No sincroniza: el envío y el
Lamport de la ración corresponden a `packages/sync` (DEC-2026-0005).

**Distribución:** segundo destino de la barra. Las razones van **antes** de la lista de personas porque
son el requisito de la acción (antes estaban después y el primer toque terminaba en "faltan razones").
En escritorio la tarjeta de razones queda fija a la derecha mientras se recorre el padrón, y el resumen
del menú firmado (sello, hash, A/B, porción por grupo y total, con `ServicioResumen`) pasa debajo de la
lista: es referencia, no la acción.
