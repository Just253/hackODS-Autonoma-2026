# Padrón

**Qué hace:** muestra la lista real de personas de la olla, una por fila, con su código `P-XXXX` y
su grupo. La cifra de arriba sale de esa MISMA lista (no de una consulta aparte que pueda decir otro
número). No pide ni imprime nombres, documentos, teléfonos ni columnas de salud (DEC-2026-0002).

**Qué lee:** `listarPersonas(ollaId)` de `src/data/remoto.ts`, que consulta `personas` en Supabase
con `select('codigo_p, categoria, olla_id')` filtrado por la olla de la sesión. La olla sale de
`olla_members` (`app/sesion.ts`, modo `cloud`), nunca de un input. Cada payload/fila se valida con lo
que el contrato exija, y un grupo desconocido se muestra como `sin dato`.

**Estados:** sin sesión o sin `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` → "Conectá Supabase para
ver el padrón" (sin fixtures); cargando; olla sin personas → "Padrón vacío"; error de red/RLS →
`EstadoPantalla error` con **Reintentar**, sin caer a datos de ejemplo.

**Qué NO hace:** no escribe. El alta local con outbox sigue viviendo en `data/repositorio.ts`
(`altaPersona`) y su envío es de `@hackods/sync`; esta pantalla es de lectura remota. No calcula el
grupo nutricional ni la ración (`packages/nutrition`, DEC-2026-0003) y no muestra salud: esa frontera
está en la RLS y en el `select`, no en un `if` de la vista.
