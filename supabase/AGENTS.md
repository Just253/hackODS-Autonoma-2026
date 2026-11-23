# AGENTS.md — `supabase/`

Backend: Postgres, RLS, migraciones, seed y Edge Functions. **Acá vive la verdad de los datos.**
Vigente: `docs/DECISIONES.md` (D1, D2, D4, D5).

```text
supabase/
  migrations/    YYYYMMDDHHMMSS_slug.sql — solo forward, nunca se edita una aplicada
  functions/     edge functions (Deno): sync-push, sync-pull
  tests/         pruebas SQL de RLS y de constraints
  seed.sql       seed idempotente + fixtures sintéticos
  config.toml    Supabase local
```

## Qué es de este paquete

- Esquema: `ollas` (tipo `comun | comedor_pca`), `personas` (**solo `codigo_p` P-XXXX**),
  `insumos`, `precios` (serie con canal/fecha/fuente), familia de menú
  (`menu_template`, `menu_day`, `dish`, `ingredient`, `portion`, `menu_constraint`,
  `substitution`, `validation`), `movimientos` (append-only), `servicios`, `solicitudes`,
  `evento_sync`.
- Políticas RLS y funciones `security definer` mínimas (`app.mis_ollas`, `app.mi_rol`).
- Edge Functions de sync (`docs/contracts/sync.md`): lote ≤ 100, `idempotency_key = event_uuid`,
  orden `(lamport, device_id)`. **Sin `service_role`** en la función: RLS con el JWT del cliente.
- Seed local reproducible y enteramente ficticio.

## Qué NO es de este paquete

- Lógica de negocio reutilizable: si se puede calcular en TS puro, va a `packages/domain`.
- Componentes, pantallas, estilos.
- Editar una migración ya aplicada. Se corrige con una migración nueva.
- **Identidad de personas**: nada de identidad personal, documento, teléfono ni dirección.
  La etiqueta local vive en el dispositivo y no entra por acá (D2).
- Datos reales de ninguna olla. **Nunca.**

## Comandos

```bash
pnpm exec supabase start                 # local, Docker
pnpm exec supabase db reset              # migraciones + seed. Solo local
pnpm exec supabase db diff -f <slug>     # genera migración desde el remoto local
pnpm exec supabase test db               # pruebas SQL (pgTAP)
pnpm exec supabase functions serve       # sync-push / sync-pull en local
```

`supabase link`, `db push` y `functions deploy` **no los corre un agente**. Los corre una persona, con
el PR mergeado y el entorno declarado.

## Cómo se testea

1. **Constraint**: insertar lo inválido debe fallar (delta 0, código P fuera de formato, lote con
   `idempotency_key ≠ event_uuid`).
2. **RLS**: con `set local role authenticated` y `request.jwt.claims` de un usuario de la olla A,
   leer/escribir datos de la olla B debe devolver 0 filas o error.
3. **Seed**: `db reset` dos veces seguidas deja el mismo estado (idempotente).

Los tests SQL usan **pgTAP** (`plan`, `is`, `finish`). La extensión la crea la migración
`20261123155000_pgtap.sql`; no se instala a mano ni se asume. Cada archivo de `supabase/tests/` fija su
`search_path` (`extensions, pg_temp, public`) porque `db reset` corre en una sesión limpia. Sin eso,
`test db` falla con `function plan(integer) does not exist`, y ese error no dice nada útil.

Toda tabla nueva entra **con su política y su test en el mismo PR**. Tabla sin RLS = PR rechazado.

## Reglas locales

1. `service_role` no aparece en el cliente, ni en un test unitario, ni en un log.
2. Identificador de migración: `YYYYMMDDHHMMSS_slug_en_snake_case.sql`. Un tema por migración.
3. `search_path` explícito en toda función `security definer`.
4. Ningún `drop`/`truncate` sobre datos que no sean del seed local.
5. Los ids de cliente son UUIDv7 generados en el dispositivo: la base no los inventa para eventos.
6. Seed con `on conflict do nothing` y fechas fijas, no `now()`.
7. `evento_sync` no se edita ni se borra desde el cliente: solo `insert` y `select` bajo RLS.
8. **Escritura por flujo** (ADR-0007): cada flujo abre su INSERT con olla **y** rol
   (`app.mi_rol`). Un UPDATE se concede por columna (`grant update (col)`) y la policy
   repite el filtro; si la fila toca más de una olla (p. ej. `solicitudes`), se comprueba
   el rol en cada lado, no con un `in` mezclado. Desde el cliente no hay DELETE: se
   revoca explícitamente y el test lo afirma con `42501`.

## Dueño y revisión

Dueño: **B** (`area:api`). Revisa **A**. Cambios de contrato (columnas que consume el cliente) se
anuncian en el issue y en `packages/contracts` **antes** del código.
9. pgvector vive en el schema `extensions` (migración `20261123190000`): `dish.embedding
   extensions.vector(1024)` + `embedding_modelo`, nullable — la dimensión es la del modelo
   del contrato de clasificación (bge-m3, `docs/contracts/clasificacion.md`). Los embeddings
   reales los calcula el adaptador de D8; hasta entonces las columnas van `null`.
10. Máquina de estados de `solicitudes` (migración `20261123191010`): la validan
    servidor-side el trigger `app.validar_transicion_solicitud` (origen: `borrador→enviada`,
    `cancelada`; destino: `enviada→aceptada→entregada`; terminales intocables). El trigger es
    invoker: `authenticated` necesita `USAGE` en el esquema `app` (concedido en la misma migración).
