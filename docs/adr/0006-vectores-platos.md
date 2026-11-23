# ADR 0006 — Vectores de platos en `dish.embedding vector(1024)`

- **Estado:** aceptado
- **Fecha:** 2026-11-23
- **Decisores:** issue #55
- **Issues:** #55

## Decisión

`dish.embedding extensions.vector(1024)` nullable + `dish.embedding_modelo text`, con pgvector
0.8.2 (verificado en `pg_available_extensions`). La dimensión **1024** viene del modelo del
contrato D8, `@cf/baai/bge-m3`: `docs/contracts/clasificacion.md:20` ("bge-m3 (1024 dim)"),
`:70` (`EMBEDDING bge-m3 → vector(1024)`), `:300`/`:799`; y `docs/ARQUITECTURA-COMPUTE.md:163`
y `:245` (`"dim": 1024`). Se eligió columna `vector` real, no `float8[]`/`jsonb`. Queda en
**NULL** hasta que exista el adaptador de embeddings (fuera de alcance): el seed no se toca.
`embedding_modelo` viaja con el vector (invariante 3: un vector sin modelo es basura).
