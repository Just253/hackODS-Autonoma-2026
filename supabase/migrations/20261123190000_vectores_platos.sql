-- Vectores de platos (issue #55, D8): embedding del plato con pgvector.
--
-- Dimension: 1024. Fuente del contrato (docs/contracts/clasificacion.md):
--   :20   "Embeddings | `@cf/baai/bge-m3` (1024 dim, ...)"
--   :70   "(6) EMBEDDING  bge-m3  ->  vector(1024)"
--   :300  "| BGE-M3 | `@cf/baai/bge-m3` | ... | **1024** | ..."
--   :799  "BGE-M3: 1024 dimensiones, ..."; docs/ARQUITECTURA-COMPUTE.md:163 y :245
--        (`"dim": 1024`). El modelo del contrato es bge-m3, 1024 dim.
--
-- pgvector 0.8.2 verificado como disponible en el Postgres local
-- (`pg_available_extensions`). Esta migracion la instala en `extensions`, como el
-- resto (pgtap). Se eligio columna `vector(1024)` real, no float8[]/jsonb.
--
-- Columnas NULLABLE: hoy no se calculan embeddings reales (el adaptador de
-- Workers AI esta fuera de alcance). El seed NO se toca; queda en NULL hasta que
-- exista el adaptador. `embedding_modelo` viaja con el vector (invariante 3 de
-- clasificacion.md): un vector sin modelo es basura.
--
-- Forward-only. Timestamp posterior a 20261123180000 (ultima aplicada en main).
create extension if not exists vector with schema extensions;

alter table public.dish
  add column if not exists embedding extensions.vector(1024);

alter table public.dish
  add column if not exists embedding_modelo text;

comment on column public.dish.embedding is
  'Embedding del plato (bge-m3, 1024 dim, docs/contracts/clasificacion.md). NULL hasta que exista el adaptador de embeddings.';
comment on column public.dish.embedding_modelo is
  'Modelo que produjo el embedding (p. ej. baai/bge-m3@cf). Viaja con el vector: nunca se comparan vectores de modelos distintos.';
