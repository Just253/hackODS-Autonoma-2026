# REGISTRO de identificadores

> **Un ID que no está acá no existe.** Nadie escribe un identificador a mano: lo emite
> `pnpm ids:nuevo`. Si un documento cita `PRB-…`, `DEC-…` o `SPK-…` y no hay fila en esta tabla,
> `pnpm ids:chequear` falla y el PR se rechaza.

## 1. Por qué no hay números correlativos

Tres personas y varios agentes crean cosas **en el mismo minuto**, en máquinas distintas y muchas
veces sin red. Un contador (`0001`, `0002`) obliga a `git fetch` para saber "cuál sigue", y dos PRs
que arrancan a la vez se pelean el mismo número. La hora y la entropía no se pelean con nadie.

## 2. Formato vigente

```text
<TIPO>-<AAAAMMDD>-<HHMM>-<6 hex>
```

| Tipo | Qué identifica | Dónde vive el cuerpo |
|---|---|---|
| `DEC` | decisión que obliga a otros | `docs/decisiones/DEC-….md` |
| `PRB` | problema, bug o duda con análisis | `docs/problemas/<categoria>/PRB-….md` |
| `SPK` | investigación con fecha límite | `docs/spikes/SPK-….md` |
| `ADR` | por qué de una implementación | `docs/adr/0004-<slug>.md` (conserva su número corto) |
| `#N` | issue de trabajo | lo asigna GitHub; **nunca se escribe a mano** |

Ejemplo de ID vigente: `PRB-20261123-1432-9f3a2c`.

- **`HHMM`** es la hora del descubrimiento en `America/Lima`. La hora exacta con segundos y offset va
  dentro del archivo: `abierto: 2026-11-23T14:32:07-05:00`.
- **6 hex** = 16,7 millones de combinaciones por minuto. Si por casualidad el ID ya existe, el script
  genera otro: no se renombra, no se pisa evidencia.

## 3. Formato legado (congelado, no se usa para nada nuevo)

Los `D1..D9` de `docs/DECISIONES.md` ya estaban escritos y citados en decenas de lugares. Se les
asignó una vez un ID fijo y **nunca se vuelve a usar ese formato**, porque la lista estaba cerrada y
no había dos agentes compitiendo por el mismo número.

| ID | Tipo | Título | Estado | Abierto | Autor | Archivo | Reemplaza a |
|---|---|---|---|---|---|---|---|
| DEC-2026-0001 | DEC | Backend Supabase | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d1` | D1 |
| DEC-2026-0002 | DEC | Identidad: el servidor nunca sabe quién es la persona | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d2` | D2 |
| DEC-2026-0003 | DEC | Nutrición: menú firmado y porción por grupo | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d3` | D3 |
| DEC-2026-0004 | DEC | Modelo de datos | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d4` | D4 |
| DEC-2026-0005 | DEC | Sincronización: Lamport, outbox y conflicto | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d5` | D5 |
| DEC-2026-0006 | DEC | Alcance y demo | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d6` | D6 |
| DEC-2026-0007 | DEC | Privacidad | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d7` | D7 |
| DEC-2026-0008 | DEC | Comprobantes, clasificación y presupuesto | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d8` | D8 |
| DEC-2026-0009 | DEC | Captura sin boleta y dos backends | vigente | 2026-11-23 | @Just253 | `DECISIONES.md#d9` | D9 |

Si en un documento viejo dice `D5` y no dice `DEC-2026-0005`, no está roto: la primera mención de
cada documento debe llevar el ID canónico; después alcanza con el alias.

## 4. Identificadores vigentes (nuevos)

Se agregan al final, una fila por ID, con la salida de `pnpm ids:nuevo`.

| ID | Tipo | Título | Estado | Abierto | Autor | Archivo | Relacionado |
|---|---|---|---|---|---|---|---|
| PRB-20261123-0947-db51d4 | PRB | Labels fuera del set canónico en GitHub | resuelto | 2026-11-23T09:47:54-05:00 | GAMA | `problemas/infra/PRB-20261123-0947-db51d4.md` | — |

## 5. Estados

`abierto · en_analisis · bloqueado · resuelto · descartado · duplicado_de:<ID>`

Un ID no se reutiliza ni se borra. Si algo se descarta, queda la fila con `descartado` y el motivo
dentro del archivo.

## 6. Un dueño por cosa

| Si es… | Va a | Por qué |
|---|---|---|
| trabajo concreto (arreglar, construir) | **issue `#N`** | tiene assignee, estado, PR y cierre |
| análisis o duda que todavía no es trabajo | **PRB** | no ensucia el backlog |
| decisión que obliga a otros | **DEC** | se cita, no se re-discute |
| investigación con fecha límite | **SPK** | muere por tiempo |

Si un PRB termina en trabajo, se abre el issue y el PRB pasa a `resuelto` con `relacionado: #N`.
Nunca al revés.

## 7. Cómo se citan

Mal: `como dice D5`, `ver problema 42`, `según el ID 7`.

Bien: `DEC-2026-0005 (sync: Lamport)` con link al archivo, o `PRB-20261123-1432-9f3a2c`.

Rama y título de PR llevan el ID cuando el trabajo nace de un PRB o DEC:

```text
feat/dinero-PRB-20261123-1432-9f3a2c-revision-items
fix/offline-DEC-2026-0005-lamport
```

## 8. Comandos

```bash
pnpm ids:nuevo --tipo PRB --categoria dinero --titulo "Boleta duplicada suma dos veces"
pnpm ids:chequear          # lo mismo que corre CI
```

`ids:nuevo` crea el archivo desde la plantilla, agrega la fila a este registro y devuelve el ID. No
commitea ni hace `git fetch`: no hace falta, porque el ID no depende del estado del repo.
