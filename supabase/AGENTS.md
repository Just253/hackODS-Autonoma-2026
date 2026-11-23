# AGENTS.md — `supabase/`

Backend: Postgres, RLS, migraciones, seed y edge functions. **Acá vive la verdad de los datos.**

```text
supabase/
  migrations/    YYYYMMDDHHMMSS_slug.sql — solo forward, nunca se edita una aplicada
  functions/     edge functions (Deno)
  seed.sql       seed idempotente + fixtures sintéticos
  tests/         pruebas SQL de RLS y de constraints
```

## Qué es de este paquete

- Esquema (`ollas`, `members`, `jornadas`, `raciones`, `insumos`, `movimientos`, `recetas`).
- Políticas RLS y funciones `security definer` mínimas.
- Migraciones versionadas y su prueba.
- Seed local reproducible (2 ollas, 30 días, datos falsos).
- Edge functions: solo lo que no puede vivir en el cliente (firma, envío, tareas programadas).

## Qué NO es de este paquete

- Lógica de negocio reutilizable: si se puede calcular en TS puro, va a `packages/domain`.
- Componentes, pantallas, estilos.
- Editar una migración ya aplicada. Se corrige con una migración nueva.
- Datos reales de ninguna olla. **Nunca.**

## Comandos

```bash
pnpm exec supabase start                 # local, Docker
pnpm exec supabase db reset              # migraciones + seed. Solo local
pnpm exec supabase db diff -f <slug>     # genera migración desde el remoto local
pnpm exec supabase test db               # pruebas SQL (pgTAP o SQL plano)
pnpm exec supabase functions serve
```

`supabase link`, `db push` y `functions deploy` **no los corre un agente**. Los corre una persona, con
el PR mergeado y el entorno declarado.

## Cómo se testea

1. **Constraint**: insertar lo inválido debe fallar (`raciones < 0`, jornada sin olla, doble aporte).
2. **RLS**: con `set local role authenticated` y `request.jwt.claims` de un usuario de la olla A,
   leer/escribir datos de la olla B debe devolver 0 filas o error.
3. **Seed**: `db reset` dos veces seguidas deja el mismo estado (idempotente).

Toda tabla nueva entra **con su política y su test en el mismo PR**. Tabla sin RLS = PR rechazado.

## Reglas locales

1. `service_role` no aparece en el cliente, ni en un test unitario, ni en un log.
2. Nombre de migración: `YYYYMMDDHHMMSS_slug_en_snake_case.sql`. Un tema por migración.
3. `search_path` explícito en toda función `security definer`.
4. Ningún `drop`/`truncate` sobre datos que no sean del seed local.
5. Los ids de cliente son UUIDv7 generados en el dispositivo: la base no los inventa para eventos.
6. Seed con `on conflict do nothing` y fechas relativas a un reloj fijo, no a `now()`.

## Dueño y revisión

Dueño: **B** (`area:api`). Revisa **A**. Cambios de contrato (columnas que consume el cliente) se
anuncian en el issue y en `packages/domain` **antes** del código.
