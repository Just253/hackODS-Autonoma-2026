# MODO 6 HORAS

> **Esta página manda sobre `docs/PROTOCOL.md` §3–§7 y `AGENTS.md` §6 y §8.2 mientras dure la ventana
> del hackathon.** Nace de un hecho, no de una opinión: quedan **6 horas** y hay **3 personas**. El
> protocolo completo de claims, worktrees y doble aprobación cuesta más tiempo del que produce en una
> ventana de 6 horas.
>
> Lo que **no** se relaja: datos ficticios, cero secretos, `pnpm test` verde antes de pushear, y que el
> que escribe no se aprueba a sí mismo en el único PR que sí se pide (contratos).

## 1. Las cinco reglas de velocidad

1. **Cada uno pushea directo a `main`, sólo en su carpeta.** Sin claim, sin rama, sin worktree, sin PR.
   A: `apps/web`, `packages/ui`. B: `supabase/`, `scripts/seed*`. C: `packages/*`, `docs/`.
   Push a la carpeta de otro = PR (uno solo, con revisión de ese dueño).
2. **Antes de cada push:** `pnpm test && pnpm typecheck`. Si algo se pone rojo, se arregla o se revierte
   en el mismo push. CI (`ci`) sigue corriendo y sigue siendo obligatorio para mergear; no se mira.
3. **Nada de ceremonia:** sin `/preflight`, sin `claim/v1`, sin `/release`. Se avisa en el issue
   `coordination` en **una línea** qué se está haciendo, y se sigue.
4. **Cero documentos nuevos**, salvo este y el guion de la demo. Una decisión se resuelve con una línea
   en `docs/ids/REGISTRO.md` o en el issue; no con un ADR. Un ADR cuesta 20 minutos y no se ve en la
   demo.
5. **Si una tarea no se termina en 45 minutos, se corta y se anota.** Un requisito de la demo a medias
   es peor que uno que no está: el jurado ve lo que se muestra, no lo que hay en `main`.

## 2. Reparto de las 6 horas

Cada persona corre su orquestador y trabaja en paralelo. **No hay dependencias entre tracks**: si
necesitás algo del otro, lo simulás con un stub y seguís.

| Track | Dueño | Entrega visible en la demo | Empieza por |
|---|---|---|---|
| **A · PWA y pantallas** | A | Las 4 pantallas navegables, en modo avión | issue #1 |
| **B · datos y sync** | B | Boleta → ítems → presupuesto con series; badge de sync | issue #2 |
| **C · dominio, folio e impresión** | C | Menú firmado sirviendo raciones, folio impreso, CI verde | issue #7 |

## 3. El reloj

| Hora | Qué tiene que existir | Si no está |
|---|---|---|
| **H0–H0:30** | Cada uno con `pnpm i` + `pnpm dev` corriendo y su primer commit. A: router con 4 rutas vacías. C: CI con ESLint verde. | Se pide ayuda en el chat, no se investiga solo. |
| **H0:30–H1:30** | A: padrón P-XXXX (alta + lista, IndexedDB). C: `servirDelDia()` devolviendo raciones por grupo desde el menú firmado. | Se baja el alcance: padrón sin búsqueda; menú con 1 perfil. |
| **H1:30–H2:30** | A: pantalla de servicio (raciones + sustituciones). B: seed ficticio de 3 ollas + 1 comprobante con 6 ítems. | B entrega sólo la tabla de presupuesto calculada, sin UI. |
| **H2:30–H3:30** | **Integración 1:** A enchufa dominio real; C entrega folio imprimible; B el badge "N pendientes". | Se muestra la impresión con datos fijos. |
| **H3:30–H4:30** | **Integración 2:** modo avión de punta a punta (recarga incluida), presupuesto con alerta al 80 %, serie de precios con MAD. | Se cae la serie de precios; queda el presupuesto. |
| **H4:30–H5:15** | **Congelar.** Sólo bugs que rompen la demo. Guion ensayado 3 veces con cronómetro. Video de respaldo grabado. | Si el ensayo pasa de 3:30, se recorta un paso, no se acelera. |
| **H5:15–H6:00** | Demo. Nada de código. | — |

## 4. La demo, paso a paso (3 minutos)

| T | Qué se hace | Qué prueba | Pantalla |
|---|---|---|---|
| 0:00 | Tablet **en modo avión**, se abre la PWA instalada | offline-first real, no un slide | inicio |
| 0:15 | Alta `P-0471`, mujer 68, sin comorbilidad | identidad sin nombre ni DNI | padrón |
| 0:40 | Servicio: menú firmado (sello + hash), 2 opciones, porción por grupo → **148 raciones** | `DEC-2026-0003` | servicio |
| 1:10 | Foto de boleta → 6 ítems, 2 en **por revisar** por umbral | clasificación con τ=0,69 | comprobante |
| 1:40 | Confirmar → presupuesto: gastado, disponible, **alerta 80 %** | dinero entero, sin decimales flotantes | presupuesto |
| 2:10 | Pollo **+12 %** contra la mediana de 7 | serie de precios, no promedio | precios |
| 2:30 | Otra olla pide 20 kg de arroz; se aprueba; **agregado de 3 ollas sin identidades** | `DEC-2026-0008` reporte | entre ollas |
| 2:50 | Se enciende la red: "4 cambios pendientes → sincronizados" | Lamport, sin perder nada | sync |
| 3:00 | Cierre: qué **no** hace (no diagnostica, no prescribe dietas, no guarda nombres en la nube) | honestidad | — |

Si un paso falla en el ensayo: ese paso se corta del guion, no se arregla el código.

## 5. Lo que no se hace en esta ventana

- RLS productiva, `enroll`, auth real: la demo no tiene usuarios.
- Sync productivo contra Supabase remoto. El badge puede ser local; si B termina antes, se conecta.
- OCR de manuscrito, Android/Capacitor, i18n, accesibilidad completa, modo oscuro.
- PRBs y ADRs nuevos. IDs sólo si alguien realmente los necesita para no confundirse.
- Refactors de documentación. Ya están hechos; no se tocan hasta después.

## 6. Definición de "listo" para la demo

1. `pnpm install && pnpm dev` funciona en una máquina recién clonada, sin pasos extra.
2. La PWA abre con el servidor apagado o en modo avión y recargar no rompe nada.
3. Los datos son ficticios y se ven ficticios (alias, `P-XXXX`).
4. Ningún número inventado: cada cifra de la demo sale de un archivo o se dice "sin dato".
5. Los 8 pasos del guion corren seguidos, sin tocar la consola, en menos de 3:30.
6. `pnpm test` verde en `main` y CI pasando en el último commit.
7. Video de respaldo grabado y descargado en el equipo que presenta.
8. Una persona que no programó puede explicar los 3 primeros pasos del guion.

## 7. Después de la ventana

Se vuelve a `docs/PROTOCOL.md`. Lo que se pusheó directo a `main` queda como está: no se reescribe
historia ni se abren PRs retroactivos. `enforce_admins` se activa cuando estén las 3 cuentas con
`write` y `CODEOWNERS` apunte a áreas, no a personas (`AGENTS.md` §8.1).
