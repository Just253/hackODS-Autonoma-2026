# FUENTES — un tema, un archivo canónico

> Se actualiza **a mano**. No se inventan hashes ni líneas: si cambia el archivo, se actualiza la
> referencia. Si un documento no figura acá, no decide.

| Tema | Archivo canónico | Referencia |
|---|---|---|
| Qué se decidió y por qué (producto y alcance) | `docs/DECISIONES.md` | D1–D9 |
| Identidad y privacidad de personas | `docs/DECISIONES.md` D2 + `supabase/AGENTS.md` | `DECISIONES.md:14-20` |
| Nutrición: menú firmado y porción por grupo | `docs/DECISIONES.md` D3 + `packages/nutrition/AGENTS.md` | `DECISIONES.md:22-29` |
| Modelo de datos (ollas, personas, movimientos) | `docs/DECISIONES.md` D4 + `supabase/AGENTS.md` | `DECISIONES.md:31-39` |
| Sincronización (Lamport, outbox, conflicto) | `docs/contracts/sync.md` | §0–§3 |
| Comprobantes, ítems y revisión humana | `docs/contracts/comprobantes.md` | §2–§5 |
| Dinero: enteros, IGV, presupuesto, serie de precios | `docs/contracts/comprobantes.md` + `packages/domain/src/presupuesto/presupuesto.ts` | §1 y §7 |
| Captura por texto o voz | `docs/contracts/captura-voz.md` | §0–§4 |
| Clasificación de productos y umbrales | `docs/contracts/clasificacion.md` + `packages/domain/src/clasificacion/config.ts` | `config.ts:13` (`TAU = 0.69`, commit `f627b45`) |
| Medición de embeddings | `docs/research/11-ollama-embeddings.md` | tabla de modelos y conclusiones |
| Dos backends (registro + ejecución) | `docs/ARQUITECTURA-COMPUTE.md` + `docs/DECISIONES.md` D9 | `DECISIONES.md:79-93` |
| Labels, claims, ramas y gate | `docs/PROTOCOL.md` + `.github/labels.yml` + `scripts/labels.sh` | §2.3, §3.2, §3.7 |
| Estado real de la protección de `main` | `docs/ORQUESTACION.md` §8 + `AGENTS.md` §8.1 | `ORQUESTACION.md:217-233` |
| Backlog y números de issue | GitHub Issues | `gh issue list` |
| Identificadores (DEC/PRB/SPK) y problemas abiertos | `docs/ids/REGISTRO.md` + `docs/problemas/` | `pnpm ids:chequear` |
| Demo (duración y guion) | `docs/DECISIONES.md` D6 | `DECISIONES.md:48-52` |
| Reglas operativas por carpeta | `AGENTS.md` raíz + `AGENTS.md` de cada paquete | §2–§9 |
| Jerarquía documental | `docs/AGENTS.md` | encabezado |
| Material retirado | `docs/historical/` | **no se cita como vigente** |

## Pendientes anotados

- Labels duplicados o fuera del set canónico en GitHub (p. ej. `needs-verification`): **no se borran en
  este PR**; se limpian en un issue aparte, después de confirmar que ningún issue abierto los usa.
  Registrado como `PRB-20261123-0947-db51d4` (`docs/problemas/infra/`), con la evidencia y el
  criterio de cierre.

## Regla de conflicto

`DECISIONES.md` > `contracts/` > `PROTOCOL.md` > `AGENTS.md` > `historical/`. Si dos archivos dicen
cosas distintas, se corrige el de abajo en el mismo PR; `historical/` nunca gana.
