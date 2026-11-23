---
description: Cierra una versión: tag, changelog, deploy y smoke. Requiere humano.
agent: orquestador
---

Prepará el release **$ARGUMENTS** (versión `vX.Y.Z`). Sin aprobación humana explícita **no se deploya**.

Checklist, en orden; si algo falla, se corta:
1. `main` verde y sin PRs abiertos que entren en la versión: `gh pr list --state open`.
2. `git fetch && git log --oneline origin/main -20` — la lista de cambios es la del changelog, no la
   memoria de nadie.
3. `CHANGELOG.md`: agregado / cambiado / arreglado / riesgos conocidos. Sin adjetivos.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` y `pnpm test:e2e` en el commit del tag.
5. Migraciones: ¿hay alguna nueva? ¿Su marcha atrás está escrita? Si no, **no se deploya**.
6. Tag anotado y push: `git tag -a vX.Y.Z -m "..."` + `git push origin vX.Y.Z`.
7. Deploy **solo** a staging/preview. Smoke: login, registrar una captura, sincronizar, abrir un reporte.
8. Producción: la corre una persona, con el smoke de staging pegado y el plan de rollback a mano.

**Prohibido:** releasear desde una rama que no es `main`; deployar con CI rojo; deployar sin
aprobación humana; `--force`; `--admin` para saltar protección; incluir un cambio que no está en el
changelog; dejar el `service_role` o un keystore en el repo.

**Salida:** versión, commit, link del run de CI, resultado del smoke, y el rollback exacto
(`git revert <sha>` / migración inversa / restaurar backup). Si el rollback no existe, el release no
está listo.
