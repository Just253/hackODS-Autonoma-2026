# Padrón

**Qué hace:** la organizadora de la olla da de alta a una persona sin identidad. Lo único que se
muestra y viaja es un código `P-XXXX`; la pantalla nunca pide ni imprime nombres, documentos ni
teléfonos (DEC-2026-0002). Arriba va la cifra de personas registradas en este dispositivo y debajo
el formulario de alta, con el botón a todo el ancho. En escritorio se parte en dos columnas.

**Qué lee:** `contarPersonas()` de `src/data/repositorio.ts`, que cuenta las filas de la tabla
`personas` de `hackods-<ollaId>`. El rango válido del año de nacimiento sale de
`personaSchema.shape.anioNacimiento` (`@hackods/contracts`), no de una copia en la pantalla.

**Qué escribe:** `altaPersona(datos, reloj, ollaId)`, una transacción Dexie sobre `personas`,
`identidadLocal`, `meta` y `outbox`. La persona va validada con `personaSchema` y nace con
`anemia: 'sin_dato'` y `pesoKg`/`tallaCm` en `null`. `nombreLocal` y `alias` (opcionales) van solo
a `identidadLocal` con `localOnly: true`: no entran al evento y no salen al servidor. El alta deja
un evento `upsert` en el outbox de `@hackods/sync`, en la misma transacción, y después llama a
`avisarCambioLocal()`. Todo se resuelve sin red: la pantalla avisa "guardado en esta tablet".

**Qué NO hace:** no calcula el grupo nutricional ni la ración —eso es de `packages/nutrition`
(DEC-2026-0003)—, no compara duplicados de persona real (no hay identidad que comparar) y no
empuja nada a Supabase desde acá: el envío del pendiente es de `@hackods/sync`.

**Estados:** leyendo el padrón · padrón vacío · alta guardada (`P-XXXX`) · año fuera de rango
(error) · fallo al leer o guardar en el dispositivo (error). Ninguno bloquea por red.
