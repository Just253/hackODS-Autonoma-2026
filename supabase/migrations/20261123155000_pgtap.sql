-- pgTAP para la suite SQL de supabase/tests (000, 001, 002...).
--
-- El CLI de supabase crea esta extension de forma transitoria (schema `extensions`)
-- cada vez que corre `test db` y la descarta al terminar. Esta migracion la deja
-- instalada de verdad, para que `db reset` + psql tambien puedan correr los tests
-- sin depender del runner. Infraestructura de pruebas: no cambia datos ni contratos.
create extension if not exists pgtap with schema extensions;
