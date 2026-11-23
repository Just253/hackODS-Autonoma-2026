# ADR 0008 — Enrolamiento: `app.enroll()` en SQL, sesión en la Edge Function

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** B (area:api), revisa A
- **Issues:** #62

## Contexto

El seed tenía `members`/`olla_members` y **0 `devices`**: `app.mis_ollas()` no
encontraba fila y un JWT válido veía 0 filas. Además `pin_hash`/`recovery_hash` eran
legibles por el propio miembro (`members_select` filtra por fila, no por columna).

## Decisión

- `app.enroll(p_user_id, codigo, pin, device_id)`: `security definer`, `search_path`
  fijo, valida con `crypt(pin, pin_hash)` y escribe `devices` + `olla_members`. Sin
  `EXECUTE` para `anon`/`authenticated`: la llama solo el servidor.
- La sesión (crear `auth.users`, firmar el JWT) la hace la Edge Function `enroll` con
  `auth.admin` y `service_role`, **solo server-side**. El cliente nunca ve esa clave.
- Por qué no una RPC invocable por el cliente: con `authenticated` solo no hay JWT que
  crear (`auth.users` no se escribe desde SQL sin service_role), y exponerla con el
  anon key sería un oráculo de PINs a 30 req/h/IP.

## Alternativas descartadas

- `auth.uid()` dentro de la RPC: con service_role el GUC es el del servidor, no el del
  cliente. El `user_id` viaja explícito desde la función.

## Cómo se verifica

`supabase/tests/006_enrolamiento.sql` (23 casos): JWT sin device ve 0 filas, tras
`app.enroll` ve 1, PIN mal → `28P01`, `pin_hash`/`recovery_hash` sin SELECT, device
revocado → 0 filas. El runtime de la función **no se corre acá** (sin Deno).
