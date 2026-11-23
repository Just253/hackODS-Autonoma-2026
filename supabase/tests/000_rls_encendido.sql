-- 000_rls_encendido.sql — toda tabla de `public` nace con RLS.
-- Se corre con `pnpm exec supabase test db`.
-- Regla del proyecto: una tabla sin RLS es un PR rechazado (docs/ARQUITECTURA.md 9.3).
--
-- Hoy pasa de forma vacia porque la migracion inicial esta comentada; el test
-- empieza a proteger en cuanto exista la primera tabla.

begin;

select plan(1);

select is_empty(
  $$
    select tablename
    from pg_tables
    where schemaname = 'public' and not rowsecurity
  $$,
  'toda tabla de public tiene RLS'
);

select * from finish();

rollback;
