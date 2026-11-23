# Delegación: subagente, sesión hija o lo hacés vos

Basado en la auditoría de 40 sesiones y 446 hijos (`_orquestacion-research/01-historial-delegacion.md`):
**16 %** de los hijos necesitó un segundo mensaje del padre, **1 %** murió sin devolver nada, y las
colisiones aparecieron solo cuando se paralelizó la **escritura**. El problema no es el fan-out: es el
contrato de entrega.

---

## 1. La decisión, en una tabla

| Situación | Herramienta | Por qué |
|---|---|---|
| Un entregable acotado, ≤ 15 min, lectura o escritura en un write-set chico | **`subagent`** | Contexto fresco, barato, el resultado vuelve solo |
| Varias horas, rama propia, PR, worktree, o tiene que sobrevivir a la compactación del padre | **`ownWork`** (sesión hija) | Tiene su propio contexto y su propio checkout; no compite por el índice de git |
| Lo resolvés en 1–2 pasos | **Nadie** | El costo de delegar supera el trabajo |
| Decisión irreversible, merge, review, secretos | **Vos o un humano** | No se delega lo que no se puede deshacer |

### `subagent` (herramienta `subagent`)

- Corre en una sesión hija con contexto fresco, **en el mismo directorio** que el padre.
- Devuelve un informe al padre; el usuario no habla con él.
- Sirve para: auditar, verificar, leer un paquete, escribir un archivo nuevo, correr una suite y
  reportar.
- **No sirve** si el hijo necesita su propio worktree: dos agentes en el mismo checkout es el bug más
  caro (`git status` miente, aparecen archivos borrados que nadie borró).

### `ownWork` (sesión hija de OpenChamber, `tools.openchamber` con `ownWork: true`)

- Sesión propia, con su título y, si se le asigna, su worktree y su rama; sobrevive a que el padre se
  compacte.
- No puede preguntarle al usuario: si se bloquea, lo devuelve y el padre decide.
- Sirve para: una feature completa de 1–3 h, un spike con presupuesto, una rama que va a esperar review.
- Cuesta más y deja más rastro: se usa cuando el trabajo **tiene que durar**.

> Regla de paridad: `ownWork` y `lead.*` existen en OpenChamber **Desktop**, no en la copia web. Las 3
> personas usan la misma versión.

---

## 2. Tamaño del encargo

| Tipo | Forma | Paralelismo |
|---|---|---|
| Auditoría / lectura | 1 pregunta, 1 formato de retorno, ≤ 800 palabras | 3–5 en paralelo |
| Escritura de un archivo o un componente | write-set de 1–2 rutas, test exigido | 1, o en paralelo **solo** con write-sets disjuntos |
| Feature con migración + UI + contrato | `ownWork`, rama propia | 1 por rama |
| Spike | `ownWork`, timebox 1 día, no se mergea | 1 |
| Verificación | `subagent` read-only, salida tabular | 2–3 (uno por PR) |

Números del historial: mediana **5 min** por hijo (p75 10, p90 24), mediana 45 mensajes. A los 10 min
el padre mira; a los 60 min corta y reasigna. Un hijo de 6 600 minutos no es trabajo, es una sesión
huérfana.

---

## 3. Write-set: quién escribe qué

Antes de lanzar la oleada, el padre escribe esta tabla en `docs/planes/oleada-<n>.md`:

| Hijo | Puede escribir | Solo lectura | Prohibido |
|---|---|---|---|
| `w2-a1-comprobantes` | `apps/web/src/pantallas/comprobantes/**` | todo el repo | `packages/**`, `supabase/**` |
| `w2-a2-rls` | `supabase/migrations/**`, `supabase/tests/**` | `apps/web/**` | `packages/**` |
| `w2-a3-menu` | `packages/nutrition/**` | `packages/domain/**` | `apps/**`, `supabase/**` |

Reglas:

1. **Un dueño por archivo.** Si dos hijos necesitan el mismo archivo, es un solo hijo o van en serie.
2. **Archivos compartidos = solo el padre**: `docs/planes/**`, `SINTESIS.md`, `CHANGELOG.md`,
   `pnpm-lock.yaml`, `AGENTS.md`, `docs/PROTOCOL.md`.
3. El write-set del hijo es un subconjunto del `files:` del claim. Si no entra, el issue está mal
   partido.
4. El hijo declara al final qué escribió, aunque sea "ninguno". Un archivo tocado fuera del write-set
   invalida la entrega, aunque el código esté bien.

---

## 4. Barrera de síntesis (la parte que más se olvida)

```text
lanzar oleada (3–5 hijos)
   → esperar a que TODOS cierren (ni uno menos)
   → escribir wave-log.md (qué produjo cada uno, veredicto, usado/descartado)
   → escribir SINTESIS.md
   → recién entonces: siguiente oleada
```

- **Salida vacía = fallo.** 5 hijos del historial murieron sin devolver nada y el padre los trató como
  terminados. Si el informe tiene 0 caracteres o corta a media frase, se relanza **con otro encargo**.
- **Nunca el mismo prompt dos veces.** Los 3 relanzamientos idénticos del historial reprodujeron el
  mismo bloqueo (6 sesiones, 0 respuestas). Si falló por falta de una tool, se cambia la tool o lo hace
  el padre.
- **3 de 40 sesiones no tuvieron mensaje después del último hijo**: se pagó todo el trabajo y no hubo
  veredicto. Sin `SINTESIS.md` no hay cierre.
- **Contradicciones**: gana el que trae comando reproducible; el otro se marca `descartado`. No se
  promedian cifras ni se elige el informe más largo.

`SINTESIS.md` mínimo:

```markdown
## Veredicto
## Qué se hizo (con evidencia)
## Contradicciones resueltas
## Deuda y dudas
## Qué NO se verificó
```

---

## 5. Nombres, bitácora y watchdog

- Título del hijo: `w<oleada>-a<n>-<tema>` (`w2-a3-rls-comprobantes`). Títulos repetidos = trabajo duplicado.
- `docs/planes/wave-log.md`: `id | encargo (1 línea) | write-set | archivos producidos | veredicto | usado/descartado`.
- Watchdog: 10 min → mirar; 30 min sin señal → probablemente muerto; 60 min → cortar, guardar lo que
  haya, reasignar.

---

## 6. Reparto típico de una feature (ejemplo)

Feature: "registrar un comprobante y ver el presupuesto de la olla".

| Oleada | Hijos | Paralelo | Entregable |
|---|---|---|---|
| 1 (contrato) | `w1-a1-dominio` (serie) | no | tipos + invariantes en `packages/domain` |
| 2 (datos) | `w2-a1-migracion`, `w2-a2-motor` | sí, disjuntos | migración+RLS / contrato del motor (fixtures con `null`) |
| 3 (UI) | `w3-a1-pantalla` | no | pantalla con outbox y test offline |
| 4 (verificación) | `w4-a1-qa` + `w4-a2-seguridad` | sí, read-only | veredicto y hallazgos |
| Cierre | el padre | — | `SINTESIS.md`, PR, review de otra cuenta |

El contrato va primero porque dos áreas lo consumen (`docs/PROTOCOL.md` §5.2). La UI no arranca hasta
que el contrato está mergeado.
