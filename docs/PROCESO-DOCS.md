# Cambios y documentación: en qué orden y cómo se obliga

> Regla de oro: **una doc que no cambia con el código es una mentira con fecha.** El problema no es
> "documentar al final": es que al final nadie se acuerda de qué cambió ni por qué.

## 1. El orden no es uno solo

Hay dos cosas distintas y se hacen en momentos distintos:

| Qué | Cuándo | Por qué |
|---|---|---|
| **Contrato**: tipo compartido, tabla, endpoint, regla de negocio, decisión que obliga a otros | **Antes del código** | Tres agentes en paralelo lo necesitan para no escribir tres veces lo mismo. Cambiarlo después cuesta reescribir consumidores. |
| **Implementación**: cómo funciona por dentro una pantalla, una función, un hook | **En el mismo commit que el código** | Si se deja para después, no se hace. Y el que revisa necesita saber qué mirar. |

Traducido: **contrato primero, interior junto**. Nunca "después abro el PR de docs".

## 2. Qué doc se toca, según lo que cambia

Si tocás la columna izquierda, en el **mismo PR** tiene que estar la derecha. Esto lo verifica
`pnpm docs:chequear`.

| Cambio | Doc obligatorio | Momento |
|---|---|---|
| Una decisión que obliga a otros | `DEC` nuevo (`pnpm ids:nuevo --tipo DEC`) + fila en `docs/ids/REGISTRO.md` | antes |
| Tipo o esquema compartido (`packages/contracts`) | `docs/contracts/<tema>.md` (§ del tipo) + `docs/FUENTES.md` si cambia el canónico | antes |
| Regla de negocio (`packages/domain`, `nutrition`, `sync`) | test con nombre de la regla + `docs/contracts/` o el `DEC` que la fija | antes o en el mismo commit |
| Migración, RLS, función SQL, Edge Function | `docs/contracts/<tema>.md` §endpoint/tabla con request, response y errores; `supabase/AGENTS.md` sólo si cambia una convención | mismo commit |
| Pantalla o flujo nuevo (`apps/web/src/features/<x>`) | `apps/web/src/features/<x>/README.md`, 3 líneas: qué hace, qué lee, qué escribe | mismo commit |
| Componente reutilizable nuevo (`packages/ui`) | `packages/ui/AGENTS.md` §lista de primitivos | mismo commit |
| Variable de entorno, comando nuevo, versión de Node | `AGENTS.md` §4 (comandos) o §2 (stack) | mismo commit |
| Dependencia nueva | issue justificándola + `AGENTS.md` §2 | antes |
| Bugfix | nada, salvo causa no obvia: `PRB` con `## Cómo se cierra` y prueba rojo→verde | mismo commit |

Un `DEC` que cambia una decisión anterior no la edita: la supersede (`Superseded by`), como dice
`docs/AGENTS.md`.

## 3. Qué cuenta como doc

Tres líneas que el próximo pueda **ejecutar o citar**, no un ensayo:

- Un README de feature: qué pantalla es, qué tabla local lee, qué evento encola.
- Un endpoint: método, ruta, body, respuesta, códigos de error, idempotencia.
- Una migración: qué tabla/columna y por qué (una línea), y qué política RLS la acompaña.
- Un `DEC`: contexto, decisión, alternativas, consecuencias, cómo se verifica.

Si la doc tiene que ser más larga que el código para explicarlo, el código está mal.

## 4. Cómo se obliga (sin que sea un trámite)

Tres capas, de la más barata a la más cara:

### 4.1 Hook local, rápido

```bash
pnpm hooks:install     # una vez por máquina después de clonar
```

Deja `core.hooksPath = .githooks`:

- **pre-commit** (< 2 s): identificadores, términos muertos y secretos **sólo de lo que se commitea**.
  Bloquea el commit si algo no cierra. No corre tests: un hook lento se saltea con `--no-verify` y
  deja de existir.
- **pre-push** (≈ 5 s): `pnpm verificar` completo. Es la última chance de no romper `main`.

### 4.2 CI, sobre el diff del PR

```bash
pnpm docs:chequear        # usa origin/main como base, o $BASE_REF
```

Recorre `git diff --name-only` y aplica la tabla de §2. Si tocaste `packages/domain/src/**` y no hay
ningún `docs/contracts/*.md` ni `.md` del paquete en el diff, falla con la ruta que falta. No adivina
contenido: verifica que el tema tenga su archivo actualizado en **ese** PR.

Escotilla honesta: si de verdad no aplica (un refactor de test, un cambio de formato), el último
commit lleva el trailer:

```text
Doc-No-Aplica: sólo reordena imports, sin cambio de comportamiento
```

`docs:chequear` lo acepta y lo imprime en CI para que quede en el registro. Lo que no se acepta es no
decir nada.

### 4.3 Revisión

El revisor no lee el resumen: checkoutea y corre. Si el diff toca un contrato y no hay doc, el
veredicto es `changes` aunque el código sea perfecto (`docs/delegacion.md` §7).

## 5. Frontend y backend: el mismo criterio, distinto archivo

| | Frontend (A) | Backend (B) |
|---|---|---|
| Contrato primero | `packages/contracts` + `docs/contracts/<tema>.md` | `docs/contracts/<tema>.md` (tabla, endpoint, RLS) |
| Doc en el commit | `apps/web/src/features/<x>/README.md` (3 líneas) | una línea de comentario en la migración + §endpoint en el contrato |
| Se verifica con | `pnpm verificar` + captura del flujo | `pnpm verificar` + `supabase test db` cuando haya Docker |
| Nunca | describir la pantalla en el chat | pegar el SQL sin decir qué política lo acompaña |

## 6. Lo que no se hace

- **No** se escribe un ADR por cada archivo: un ADR cuesta 20 minutos y sólo se justifica cuando la
  decisión es cara de revertir.
- **No** se documenta lo que el tipo ya dice (`* @param nombre el nombre`). Se documenta el **por qué**
  y el **borde**: qué pasa si falta, qué error devuelve, qué no se sincroniza.
- **No** se crea un segundo archivo que explique lo mismo: se actualiza el que manda (`docs/FUENTES.md`).
