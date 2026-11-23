# Servicio del día

**Qué es:** registro de una ración por persona del padrón, explicada con al menos dos razones, mas el
resumen del menú firmado del día. La cocinera escribe las razones; la pantalla no las inventa
(DEC-2026-0003, menú firmado).

**Resumen del menú (conectado):** `ServicioResumen` llama a `servirDelDia(menus, personas)` de
`@hackods/domain` y **solo muestra** el resultado: sello del nutricionista, hash del contenido, las dos
opciones (general/A y especial/A), la porción por grupo etario y el **total de raciones**. El total
sale del padrón vigente (`deletedAt === null`), no de una constante: si cambia el padrón, cambia el
número. La pantalla no calcula porciones ni gramos; eso es del dominio.

**Sin dato honesto:** si el menú no trae sello, no está aprobado/publicado, el hash no corresponde al
contenido o una opción no trae platos firmados, la pantalla dice **"sin dato"** (o el campo que falla)
y nunca dibuja un número a mano (DEC-2026-0003). Los grupos con personas pero sin porción firmada se
declaran como **"grupos sin porción firmada"**, no se les inventa una porción.

**Qué lee:** `listarPersonas(OLLA_DEMO)` y `racionDe(codigoP, OLLA_DEMO)` de
`src/data/repositorio.ts`; el menú firmado de DEMO sale de `src/fixtures/servicio-demo.ts` (ficticio y
con el hash real del seed, calculado con `serializarContenido`).

**Qué escribe:** `guardarRacion()`, un `add` append-only en la tabla `raciones` de
`hackods-<ollaId>`, validado con `racionSchema`. La clave es `[personaCodigoP+servicioId]`: una fila
por persona y servicio. Si ya existe, `add` falla con `RacionDuplicada` y la pantalla lo dice; una
ración se anula con otro registro, no se pisa en silencio (contrato append-only).

**Estados:** leyendo el servicio · sin padrón (pedir el alta en Padrón) · contador de raciones del
dispositivo · ración guardada ("pendiente de sincronizar; la red no hizo falta") · faltan razones
(error) · menú no servible (se dice el campo).

**Qué NO hace:** no calcula peso ni nutrientes (eso es de `packages/nutrition`, hoy dice "sin dato") y
no sincroniza: el envío y el Lamport de la ración son de `packages/sync` (DEC-2026-0005).