# ADR 0011 — Ingesta: un endpoint, dos ramas, compute externo con token server-side

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** issue #83
- **Issues:** #83

## Decisión

Un único endpoint `POST /functions/v1/ingest` con dos ramas (`tipo=audio` → `/transcribe`;
`tipo=boleta` → `/extract`) y después `/embed` para categoría. El compute de #64
(`tools/compute`), sin estado y detrás de `COMPUTE_URL`/`COMPUTE_TOKEN`, se llama server-side
con Bearer: el token nunca llega al cliente y no se inventa resultado si el compute falla
(`502`). La categoría usa la similitud coseno contra un catálogo y el umbral `TAU=0,69` de
`packages/domain/src/clasificacion/config.ts`; bajo el umbral el resultado es
`sin_clasificar`, nunca una etiqueta dudosa. Persistencia con el JWT del usuario (sin
`service_role`): `captura` + `captura_item` bajo RLS por olla y bucket privado `capturas`.
