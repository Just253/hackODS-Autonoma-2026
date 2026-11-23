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

Se reparte **por paso de la demo**, no por carpeta del monorepo: la demo son pantallas, y las pantallas
no existen todavía. Cada dueño tiene su carpeta de feature y nadie más la toca.

| Track | Dueño | Carpetas propias | Entrega visible en la demo |
|---|---|---|---|
| **A · esqueleto y offline** | A | `apps/web/src/app`, `features/padron`, `features/servicio`, `packages/ui`, PWA y service worker | pasos 1–3 del guion: abre en modo avión, alta `P-0471`, servicio sirviendo raciones |
| **B · comprobante y dinero** | B | `apps/web/src/features/{comprobante,presupuesto,precios}`, `apps/web/src/fixtures` | pasos 4–6: boleta con 2 ítems por revisar, presupuesto con alerta, serie de precios |
| **C · entre ollas y folio** | C | `apps/web/src/features/{solicitud,reporte}`, `packages/{domain,nutrition,printing,sync}`, `docs/`, `.github/` | pasos 7–8: solicitud entre ollas, agregado de 3 ollas, folio imprimible |

Tres reglas para que esto no se pise:

1. **`apps/web/src/app/router.tsx` es de A.** Los demás agregan su ruta con un PR de una línea o le
   piden a A que la agregue; no lo editan en paralelo.
2. **Los fixtures son de B**, en `apps/web/src/fixtures/`. Nadie más inventa datos: si te falta un
   número, lo pedís o lo marcás `sin dato`.
3. **Un archivo, un dueño.** Si necesitás otro, se pide en el issue `coordination` con una línea y se
   sigue con un stub.

**No hay base de datos en esta ventana.** Docker/podman no está corriendo y el CLI de Supabase no está
instalado: `pnpm db:start` no funciona hoy y arreglarlo cuesta más que la demo entera. Todo el demo
corre en el navegador (IndexedDB) y el badge de sync se muestra local. Supabase se conecta después, con
la ventana cerrada.

## 3. El reloj

| Hora | Qué tiene que existir | Si no está |
|---|---|---|
| **H0–H0:30** | Cada uno con `pnpm i` + `pnpm dev` corriendo y su primer commit. A: router con 4 rutas vacías y `features/` creadas. B: `fixtures/` con 3 ollas ficticias y 1 boleta de 6 ítems. C: CI con ESLint verde. | Se pide ayuda en el chat, no se investiga solo. |
| **H0:30–H1:30** | A: padrón P-XXXX (alta + lista, IndexedDB). C: `servirDelDia()` devolviendo raciones por grupo desde el menú firmado. | Se baja el alcance: padrón sin búsqueda; menú con 1 perfil. |
| **H1:30–H2:30** | A: pantalla de servicio (raciones + sustituciones). B: pantalla de comprobante con los 6 ítems y `por_revisar` en 2. | B muestra la tabla calculada, sin pantalla. |
| **H2:30–H3:30** | B: presupuesto con gastado/disponible y alerta al 80 %, más la serie de precios contra la mediana de 7. C: folio imprimible con `@media print`. | Se cae la serie de precios; queda el presupuesto. |
| **H3:30–H4:30** | **Integración:** A enchufa dominio real y el service worker (modo avión + recarga). C: solicitud entre ollas y reporte agregado. B: badge "N pendientes". | Se cae el reporte entre ollas; quedan 5 pasos. |
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
