# Padrón

**Qué es:** alta de una persona sin identidad. Se muestra y viaja un código `P-XXXX`; la pantalla
nunca pide ni imprime nombres, documentos ni teléfonos (DEC-2026-0002).

**Qué lee:** `contarPersonas(OLLA_DEMO)` de `src/data/repositorio.ts`, para mostrar cuántas personas
hay en el dispositivo.

**Qué escribe:** `altaPersona()`, en una transacción Dexie sobre tres tablas de
`hackods-<ollaId>`:
- `personas`: la entidad sincronizable, validada con `personaSchema` y con `lamport` del dispositivo
  (DEC-2026-0005). Nace con `anemia: 'sin_dato'`, `pesoKg`/`tallaCm` en `null`.
- `identidadLocal`: `nombreLocal` y `alias` opcionales, marcados `localOnly: true`, así que el outbox
  no los lee y no salen al servidor.
- `meta`: el contador de Lamport que consume `siguienteLamport()`.

**Estados:** leyendo el padrón · padrón vacío · alta guardada (`P-XXXX`, "guardado en esta tablet")
· año de nacimiento fuera de rango (error) · fallo al leer o guardar en el dispositivo (error).
Ninguno bloquea por red: el alta se resuelve en el dispositivo.

**Qué NO hace:** no valida duplicados de persona real (no hay identidad que comparar), no calcula
grupo nutricional ni ración —eso es de `packages/nutrition` (DEC-2026-0003)— y no empuja nada a
Supabase desde acá.

**Distribución:** en el teléfono es el primer destino de la barra inferior. La cifra de personas
registradas va arriba (número grande) y el formulario debajo, con campos de 56 px y el botón de alta a
todo el ancho al final, sin `sticky` para no chocar con la barra. En escritorio (≥ 1024 px) el rail
lateral reemplaza la barra y la pantalla se parte en dos columnas: resumen a la izquierda, formulario a
la derecha con los campos cortos (año, sexo; alias, nombre local) en dos filas.
