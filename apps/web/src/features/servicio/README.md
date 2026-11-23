# Servicio del día

**Qué hace:** la cocinera registra una ración por persona del padrón. Cada ración se explica con
**al menos dos razones** que ella escribe; la pantalla no las inventa. Las razones van antes de la
lista de personas porque son el requisito de la acción. Debajo va el resumen del menú firmado del
día como referencia, no como acción.

**Qué lee:** `listarPersonas(OLLA_DEMO)` y `racionDe(codigoP, OLLA_DEMO)` de
`src/data/repositorio.ts`, para saber quién está en el padrón y si ya tiene ración del servicio de
hoy (`servicio-AAAA-MM-DD`). El menú firmado sale de `menusDelDiaDemo()` de
`src/fixtures/servicio-demo.ts`; `ServicioResumen` lo procesa con `servirDelDia(menus, personas)` de
`@hackods/domain`.

**Qué escribe:** `guardarRacion()`, un `add` append-only en la tabla `raciones` de
`hackods-<ollaId>` validado con `racionSchema`, más su evento en el outbox de `@hackods/sync` en la
misma transacción. La clave es compuesta `[personaCodigoP + servicioId]`: si ya existe, falla con
`RacionDuplicada` y la pantalla lo dice —no se reemplaza nada en silencio—. Todo se resuelve sin
red: la pantalla avisa "guardado en esta tablet; la red no hizo falta".

**Qué NO hace:** no calcula peso ni nutrientes por persona. `componentes` queda vacío y
`cobertura` en `COBERTURA_SIN_CALCULO` ("sin cálculo", no "cero nutrientes"): la pantalla dice "sin
dato" y nunca dibuja el 0. La porción por grupo es del menú firmado (`packages/nutrition`,
DEC-2026-0003). Si `servirDelDia` lanza `MenuNoServible`, `fraseDeCocina()` traduce el campo técnico
a lenguaje de cocina y el detalle queda en un "Ver detalle". No sincroniza: el envío es de
`packages/sync` (DEC-2026-0005).

**Estados:** leyendo el servicio · sin padrón · ración registrada · faltan razones (error) ·
duplicado (error) · fallo al leer o guardar.

**Texto visible:** las porciones se leen en gramos, no en `g`.
