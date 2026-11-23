# Día 1: qué se crea antes de la primera feature

Objetivo del día: **una rebanada vertical que funcione sin red**, y la infraestructura de coordinación
que impide que tres personas se pisen. No es un día de features.

Tiempo total: ~4 h 15 min de trabajo efectivo, en tres carriles paralelos.

---

## 0. La regla del día

No se escribe una línea de feature hasta que existan estas ocho cosas:

1. `main` protegida (sin push directo, 1 aprobación, checks requeridos, `dismiss_stale_reviews`).
2. Labels `status:*`, `area:*`, `type:*` creados.
3. Plantillas de issue y PR, `CODEOWNERS`, `docs/PROTOCOL.md`.
4. Monorepo que instala y testea desde un clon limpio.
5. `AGENTS.md` + agentes + comandos + skills cargando.
6. Los ADR vigentes (`docs/adr/0001`…`0003`) leídos y citados; no se inventan ADR nuevos.
7. Contrato de dominio mergeado (`packages/domain` + `packages/sync` con firmas).
8. Un issue `coordination` fijado, con el sync del día.

Si falta una, se arregla antes de codear. Cada una cuesta minutos; sin ellas se pierden días.

---

## 1. Secuencia

### Bloque 0 — Repo y permisos (15 min · una persona, delante de la pantalla)

- Tres cuentas de GitHub con `write` en el repo (una por persona). Sin esto no hay revisión cruzada.
- `main` protegida: sin force, 1 aprobación, checks requeridos, conversaciones resueltas.
- Estado real con una sola cuenta: `enforce_admins: false` y `require_code_owner_reviews: false`
  (ver `docs/ORQUESTACION.md` §8). No se activan hasta tener 3 cuentas + `CODEOWNERS` por equipo.
- "Allow auto-merge" **no** se activa en bootstrap: sin segunda cuenta no hay quién apruebe.
- Actions: permiso de escritura **solo** en el workflow que lo necesite.

> La protección se configura por UI o ruleset. Es la única regla que no depende de la buena voluntad de
> un agente: se hace primero.

### Bloque 1 — Coordinación (20 min · C)

```bash
bash scripts/labels.sh        # idempotente; crea status:*, area:*, type:*, p0..p2, needs:*
```

- `.github/ISSUE_TEMPLATE/tarea.yml` (Anexo A del protocolo).
- `.github/PULL_REQUEST_TEMPLATE.md` con `## Prueba` (Anexo B).
- `.github/CODEOWNERS` (Anexo E) con las rutas de este repo.
- `docs/PROTOCOL.md` = `02-protocolo-coordinacion.md` §0–11.
- Issue `coordination` creado, fijado, con el primer `sync/`.

**Hecho cuando:** un issue de prueba muestra los labels y la plantilla; el PR de prueba trae `## Prueba`.

### Bloque 2 — Esqueleto del monorepo (30 min · A)

- `pnpm-workspace.yaml`, `package.json` raíz, `tsconfig.base.json`, `eslint`, `prettier`.
- Carpetas vacías con su `package.json`: `apps/web`, `packages/{domain,nutrition,ui,sync}`.
- `apps/web` con Vite + React + `vite-plugin-pwa` (sin pantallas todavía).
- `vitest` configurado en cada paquete.
- CI: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test`.

**Hecho cuando:** en un clon limpio, `pnpm install && pnpm test` termina en verde (aunque no haya tests).

### Bloque 3 — Agentes (20 min · A, con B y C mirando)

- Copiar `agent-base/` a la raíz (ver `README.md`).
- Abrir el repo en OpenChamber Desktop: deben aparecer 8 agentes y 6 comandos.
- Ajustar `model:` al proveedor de cada persona.
- Smoke: `/preflight "prueba de humo"` → devuelve veredicto y **no crea nada**.
- `/verify` sobre un PR de prueba vacío → debe decir "prueba no ejecutable", no aprobar.

**Hecho cuando:** los tres ven los mismos agentes y el smoke no rompe nada.

### Bloque 4 — Decisiones (30 min · C escribe, A y B aprueban)

Los ADR vigentes ya existen y **no se renombran**: `docs/adr/0001-base-monorepo.md`,
`docs/adr/0002-decisiones-usuario.md`, `docs/adr/0003-comprobantes-y-captura.md`. Si el día 1 surge
una decisión nueva, se agrega `0004-*` con la plantilla `docs/adr/0000-plantilla.md`.

Se mergean **antes** del código que los usa. 2 aprobaciones. 10 líneas cada uno.

### Bloque 5 — Contrato (45 min · C · PR de `contracts`, 2 aprobaciones)

- `packages/contracts`: `Olla`, `Persona` (`codigoP` P-XXXX), `Insumo`, `Precio`, familia de menú,
  `Movimiento`, `EventoSync` + Zod + invariantes + tests.
- `packages/sync`: `OutboxMemoria`/`Outbox`, `SyncPort` (push ≤ 100, orden `(lamport, deviceId)`).
- `packages/nutrition`: menú firmado + porción por grupo (`validarMenu`, `porcionParaGrupo`,
  `sustituirInsumo`, `explicar`), `ReglasMotor` con `[valor a confirmar]`. **Sin cifras.**
- Seed ficticio en `supabase/seed.sql` con ids fijos y personas `P-XXXX`.

**Hecho cuando:** `pnpm test` verde y A/B pueden importar los tipos sin tocar nada más.

### Bloque 6 — Datos (45 min · B, en paralelo con el bloque 7)

```bash
pnpm exec supabase start
pnpm exec supabase db diff -f 0001_inicial
pnpm exec supabase db reset
pnpm exec supabase test db
```

- Tablas `ollas`, `personas` (solo `codigo_p` P-XXXX), `insumos`, `precios`, `movimientos`,
  `servicios`, `evento_sync`, familia de menú y comprobantes/presupuesto (D4/D8).
- RLS en las cuatro operaciones de cada tabla + `app.mis_ollas()` / `app.mi_rol()`.
- Test de aislamiento: usuario de la olla A no ve la B. **Falla si se quita la política.**
- `/seed demo` idempotente.

### Bloque 7 — Rebanada vertical (45 min · A, en paralelo con el bloque 6)

- Service worker + manifest (instalable).
- IndexedDB + outbox conectados a `@hackods/sync`.
- Una sola pantalla: **alta de persona (P-XXXX) → ración con explicación**, con badge de
  sincronización.
- Test e2e: red apagada → alta → recarga → los datos siguen; al volver la red sincroniza una vez.

**Hecho cuando:** en modo avión la app abre, registra y muestra "pendiente"; al volver la red
sincroniza.

### Bloque 8 — Trabajo del día 2 (20 min · los tres)

- Crear 8–12 issues con la plantilla, cada uno con huella `fp_*`, criterio de aceptación y prueba
  esperada.
- Cada persona reclama **uno** con `/claim` y abre su draft PR.
- `sync/` en `coordination` con `doing / next / blocked / risk`.

---

## 2. Carriles paralelos (quién hace qué, sin pisarse)

| Momento | A (web) | B (api) | C (contracts/infra) |
|---|---|---|---|
| 0–60 min | Bloque 2 (esqueleto) | Prepara Supabase local + Docker | Bloques 1 y 3 (coordinación + agentes) |
| 60–90 min | Bloque 4: revisa ADRs | Bloque 4: revisa ADRs | Bloque 4: escribe ADRs |
| 90–135 min | Lee contrato, prepara pantalla | Lee contrato, prepara migración | **Bloque 5** (contrato) |
| 135–180 min | **Bloque 7** (pantalla + offline) | **Bloque 6** (esquema + RLS + seed) | `docs/contracts/` + `docs/FUENTES.md` |
| 180–200 min | Bloque 8 | Bloque 8 | Bloque 8 |

Regla: durante el bloque 5 nadie más escribe en `packages/`. Los otros dos leen y preparan; si
necesitan un cambio de contrato, lo piden en el issue, no lo hacen.

---

## 3. Issues semilla (crear el día 1)

**El backlog vive en GitHub.** No se crean issues "semilla" con números propios: se usan los reales
(`gh issue list --state open`). Los que ya existen:

| Título real | Área |
|---|---|
| `[web] Walking skeleton: alta de persona → ración con recarga en modo avión` | web |
| `[api] Seed de demo: prueba de idempotencia y paridad con contratos` | api |
| `[web] PWA instalable + service worker real + arranque offline` | web |
| `[api] RLS probado: nutricionista ve agregado, cocinera no lee flags de salud` | api |
| `[contracts] Comprobantes D8: tablas, estados y revisión de ítems` | contracts |
| `[infra] ComputePort: fachada y modo degradado` | infra |
| `[infra] CI: ESLint y typecheck obligatorios en PR` | infra |
| `[web] Captura por voz: grabar offline, transcribir, parsear y confirmar` | web |

Cada uno: criterio de aceptación en una línea + comando de prueba + globs de archivos. Si no cabe en un
PR de ≤ 400 líneas, se parte.

---

## 4. Definición de "día 1 terminado"

- [ ] `main` protegida; `enforce_admins` y `require_code_owner_reviews` documentados como `false`.
- [ ] Labels y plantillas funcionando.
- [ ] `pnpm install && pnpm test` verde desde un clon limpio.
- [ ] 8 agentes + 6 comandos + 7 skills visibles; `/preflight` responde sin escribir.
- [ ] Los 3 ADR vigentes (`docs/adr/0001`…`0003`) leídos; ninguno nuevo sin decisión.
- [ ] Contrato mergeado con 2 aprobaciones.
- [ ] `pnpm db:reset` + test de aislamiento verde.
- [ ] App abre sin red y registra una persona con su ración (video de 30 s en el issue).
- [ ] 3 issues reclamados, 3 draft PRs abiertos.
- [ ] `coordination` con el sync del día y los riesgos.

---

## 5. Lo que NO se hace el día 1

- Capacitor, impresora térmica, OCR, notificaciones push.
- Login social, multi-idioma, tema oscuro, design system completo.
- Deploy a producción (staging como mucho, y no hace falta).
- Optimizar rendimiento o escribir documentación extensa.
- Abrir un segundo repo, un tablero nuevo o un `claims.json`.

El día 1 se trata de que el día 2 tres personas puedan trabajar en paralelo sin preguntarse quién tiene
qué.
