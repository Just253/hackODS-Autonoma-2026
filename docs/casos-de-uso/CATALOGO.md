# Catálogo de casos de uso

## 1. Para qué existe este catálogo

Dice **qué tiene que poder hacer alguien**, no cómo. Es la vista de arriba: la lista completa y el orden
en que se puede construir, sin flujo, sin pantalla y sin backend.
Un CU detallado se escribe solo cuando alguien lo toma; hasta entonces su fila acá es todo lo que hay, y
alcanza para decidir si se toma. El catálogo se actualiza siempre: una fila nueva no espera archivo, y una
fila que cambia de estado se corrige en el mismo PR que la cambia. No es el guion de la demo ni un plan.

## 2. Criterio

Un caso de uso tiene **actor concreto + objetivo con valor + resultado observable**.

- **Actor concreto**: organizadora, cocinera, nutricionista, admin de la olla, la persona que recibe el
  plato, o el sistema cuando lo que produce lo observa un humano igual.
- **Objetivo con valor**: se dice en una frase con verbo. "Que la cocinera sepa cuánto le queda".
- **Resultado observable**: algo cambia en el mundo y se verifica sin leer el código.

**No es CU** una pantalla, un badge, un endpoint, una tabla ni una función interna sin objetivo. "Pantalla
de padrón" no es un CU; "ver el padrón del día sin datos de salud" sí.

## 3. Niveles

- **(a) `CU-01`…`CU-09`**: archivo propio en esta carpeta, porque son los pasos de la demo o están en curso.
- **(b) `CU-10`…`CU-36`**: viven solo en la tabla de §4. Sin archivo y, casi todos, sin issue propio.
- Un CU pasa de tabla a archivo cuando tiene un issue `status:ready` y alguien lo reclama. El archivo se
  escribe una vez; la fila de acá se mantiene siempre.

## 4. La tabla

Ordenada por dependencia, no por importancia. `¿en el repo?` describe `main` al 2026-11-23, no lo que hay
en un PR abierto.

| id | actor | objetivo | prerrequisitos | ¿demo? | ¿en el repo? | dónde vive |
|---|---|---|---|---|---|---|
| CU-10 | organizadora | Enrolar un celular nuevo con código de olla, código personal y PIN | olla creada y `member` con hashes | no | parcial: tablas `members`, `devices` y `olla_members`; el RPC `enroll` no existe (solo está dibujado en `docs/ARQUITECTURA.md` §417) | esta tabla |
| CU-11 | cualquier miembro | Entrar o recuperar acceso con PIN y `recovery_hash` | CU-10 | no | parcial: columnas `pin_hash` y `recovery_hash`, `pgcrypto` cargado; ninguna función llama a `crypt()` | esta tabla |
| CU-12 | organizadora, nutricionista de red | Elegir olla activa, cambiar rol, revocar celular y cerrar sesión al terminar turno | CU-11 | no | parcial: `olla_members.rol` y `devices.revoked_at` existen; no hay policy de insert ni de update en esas tablas | esta tabla |
| CU-13 | organizadora | Encontrar a una persona por `P-XXXX` o por su alias local | CU-02 | no | no: `personas` solo tiene `codigo_p`; el alias vive en `identidadLocalSchema` (`localOnly`) y no tiene tabla | esta tabla |
| CU-14 | organizadora | Corregir datos o dar de baja sin borrar el historial | CU-13 | no | parcial: `deleted_at` y trigger `personas_touch`; `personas` no tiene policy de update | esta tabla |
| CU-15 | organizadora, nutricionista | Consentir con dos casillas y registrar salud opt-in decidiendo quién la ve | CU-14 | no | parcial: un solo `consentimiento_seguimiento` boolean; sin columna de visibilidad; RLS de salud en #4 (PR #23, draft) | esta tabla |
| CU-16 | cocinera | Ver el padrón del día sin datos de salud | CU-02 | no | sí: #23 revoca las columnas de salud y deja `v_salud_agregado` solo para nutricionista/admin | esta tabla |
| CU-17 | nutricionista | Firmar, publicar o retirar el menú con sello y hash | CU-12, CU-28 | no | parcial: `menu_template.estado`, `sello_*`, `hash` y `validation`; solo policy de select, sin escritura | esta tabla |
| CU-18 | cualquiera | Ver el menú publicado del día | CU-17 | no | no: `menu_day_select` exige ser miembro (`app.mis_ollas()`); no hay vista ni ruta pública | esta tabla |
| CU-19 | cocinera | Registrar el servicio del día y el checklist de 75 °C | CU-17 | no | parcial: `servicios.cocido_a_75c` e `inocuidad_verificada_en`; sin policy de insert | esta tabla |
| CU-20 | cocinera | Sustituir un insumo aprobado y ver por qué cambió la ración | CU-19 | no | parcial: `substitution` (factor, `aprobada_por`) y `sustituirInsumo` en `packages/nutrition`; sin UI ni explicación | esta tabla |
| CU-21 | nutricionista | Ajustar la porción de un grupo y ver el total recalculado | CU-17 | no | parcial: `portion.cantidad` y `porcionParaGrupo`; sin recálculo de total ni UI | esta tabla |
| CU-22 | cocinera | Servir invitado o conteo anónimo y anular una ración mal entregada | CU-19 | no | no: `racionSchema` existe en contracts; no hay tabla `raciones` | esta tabla |
| CU-23 | organizadora | Registrar entrada, salida, merma o ajuste y ver el saldo | CU-12 | no | parcial: `movimientos` (append-only, con insert) y `saldoDespensa` en `packages/domain/src/racion.ts`; sin UI | esta tabla |
| CU-24 | organizadora, cocinera | Anotar un gasto sin boleta, escrito o dictado, y confirmar los números | CU-03, CU-11 | no | parcial: `parsearCaptura` (810 líneas) y `captura` en contracts; issue #8 ready, sin UI | esta tabla |
| CU-25 | organizadora | Corregir una boleta confirmada con nota de crédito o anulación | CU-04 | no | parcial: `nota_credito`, `comprobanteAfectadoId` y estado `anulado` en `packages/contracts/src/finanzas.ts`; sin tabla | esta tabla |
| CU-26 | organizadora | Resolver un duplicado o aceptar/rechazar una compra compartida | CU-04 | no | parcial: `duplicadoDeId`, `huellaFuerte`/`huellaDebil` y `comprobante_participante` (§2.5); sin tabla | esta tabla |
| CU-27 | organizadora | Crear el presupuesto del período o ajustarlo con motivo | CU-05, CU-12 | no | parcial: `calcularPresupuesto` en `packages/domain/src/presupuesto` y `presupuestoSchema`; sin migración | esta tabla |
| CU-28 | organizadora, admin | Curar el catálogo: crear un insumo y aprobar un alias | CU-04 | no | parcial: `productoCatalogoSchema` y `productoAliasSchema`; `insumos` no tiene alias ni estado de aprobación | esta tabla |
| CU-29 | organizadora | Revisar un precio sospechoso y excluirlo de la serie | CU-06 | no | parcial: `estadoPrecioObservado` (`sospechoso`, `excluido`), `excluidoDeSerie` y `medianaMovil` con `mad`/`fuera_de_rango`; sin tabla | esta tabla |
| CU-30 | organizadora, nutricionista | Comparar mi precio con la mediana de la red (opt-in, k ≥ 10) | CU-06, CU-27 | no | no: §9 y P7 lo exigen con `fn_reporte_red`; no hay tabla, ni columna de opt-in, ni función | esta tabla |
| CU-31 | persona que recibe el plato | Recibir un comprobante impreso con folio y QR de su ración | CU-19 | no | parcial: `packages/printing` completo (folio, QR, plantilla `comprobante`); falta la ración y la UI | esta tabla |
| CU-32 | sistema | Exponer un conflicto de edición y desempatar por `(lamport, device_id)` | CU-08 | no | parcial: `compararEventos` ordena y `evento_sync.estado` tiene `conflicto`; nada lo detecta ni lo muestra | esta tabla |
| CU-33 | sistema | Recibir por pull cambios de otro celular sin pisar pendientes | CU-08 | no | parcial: `supabase/functions/sync-pull` con cursor `(lamport, device_id)`; ningún cliente lo llama | esta tabla |
| CU-34 | sistema | Actualizar el service worker sin dejar una versión vieja | CU-01 | no | parcial: `apps/web/public/sw.js` con cache fijo `hackods-shell-v1`; sin versionado ni `skipWaiting` | esta tabla |
| CU-35 | sistema | Expirar fotos y audios locales por confirmación, cuota o retención | CU-04, CU-24 | no | no: `captura` en contracts no tiene retención ni cuota; nada borra archivos | esta tabla |
| CU-36 | sistema | Rechazar un lote de más de 100 o marcar duplicados por `idempotency_key` | CU-08 | no | sí: `validarLote` corta en 100 y `sync-push` separa `aceptados`/`duplicados` con `ignoreDuplicates` | esta tabla |

## 5. Grafo de dependencias

```text
CU-11 → CU-10
CU-12 → CU-11
CU-13 → CU-02
CU-14 → CU-13
CU-15 → CU-14
CU-16 → CU-02
CU-17 → CU-12
CU-17 → CU-28
CU-18 → CU-17
CU-19 → CU-17
CU-20 → CU-19
CU-21 → CU-17
CU-22 → CU-19
CU-23 → CU-12
CU-24 → CU-03
CU-24 → CU-11
CU-25 → CU-04
CU-26 → CU-04
CU-27 → CU-05
CU-27 → CU-12
CU-28 → CU-04
CU-29 → CU-06
CU-30 → CU-06
CU-30 → CU-27
CU-31 → CU-19
CU-32 → CU-08
CU-33 → CU-08
CU-34 → CU-01
CU-35 → CU-04
CU-35 → CU-24
CU-36 → CU-08
CU-03 → CU-17
CU-04 → CU-27
CU-05 → CU-04
```

**El ciclo `CU-04 → CU-27 → CU-05 → CU-04`** no es un error de dibujo: el contrato lo exige. Confirmar un
comprobante necesita un presupuesto vigente para esa fecha (transición 11, `docs/contracts/comprobantes.md`
§3.3), y el presupuesto solo se alimenta con comprobantes asentados. Consecuencia: **no se puede empezar
por cualquiera**. El corte es arrancar CU-27 en mínimo (un período sembrado o en `borrador` que acepte
imputación), o CU-04 queda bloqueado en el paso de confirmar. Lo mismo con `CU-03 → CU-17`: el demo lo
resuelve sembrando el menú publicado en `seed.sql`, no construyendo CU-17 antes.

## 6. Estados

| estado | qué significa | quién lo cambia |
|---|---|---|
| `no_iniciado` | La fila existe y nadie la tomó; sin issue. | Quien inventaría, al escribir la fila. |
| `listo` | Issue acotado con criterio de aceptación y prueba esperada (`status:ready`), sin dueño. | Quien escribe el issue, o el orquestador al acotarlo. |
| `en_curso` | Alguien lo tomó: issue con `status:claimed` o PR draft con el número del CU. | Quien lo reclama, con el label o abriendo el draft. |
| `en_revision` | El PR pasó a *ready for review* y el label es `status:in-review`. | El autor, con `gh pr ready` y el label. |
| `bloqueado_por` | No avanza por otro CU: comentario en el issue con el id que bloquea. | Quien descubre el bloqueo, al anotarlo. |
| `en_pausa_por` | Se cortó por tiempo: comentario con la hora del corte y qué falta. | Quien corta, en el issue, no en el chat. |
| `hecho` | PR mergeado y issue cerrado. | El merge (keyword de cierre) o el orquestador. |
| `descartado` | Se decidió no hacerlo: issue cerrado como *not planned* con motivo. | El orquestador o quien tenga el alcance. |

Estado actual de `CU-01`…`CU-09`, verificado contra `main` en `16f9419`:

| CU | estado | ¿sirve hoy? | evidencia |
|---|---|---|---|
| CU-01 | `hecho` | ⚠️ | PWA y SW en `main` (#16). Probado en código, **no** en modo avión real. |
| CU-02 | `en_curso` | ❌ | PR #30 mergeado, pero el alta **no guarda al hacer click** (#41). |
| CU-03 | `en_revision` | ⚠️ | `servirDelDia` en `main` (#26); la pantalla va en el PR #44. |
| CU-04 | `en_curso` | ⚠️ | Pantalla en `main` (#32), pero pinta **6 de 6 en rojo** y dice «6 por revisar» (#9); sin enchufe al presupuesto. |
| CU-05 | `en_curso` | ⚠️ | Pantalla en `main` (#31) sobre fixture; confirmar no mueve el presupuesto (#9). |
| CU-06 | `en_curso` | ✅ | Mediana real, +12,00 %, descarta el outlier; la serie es fixture, no cargada. |
| CU-07 | `hecho` | ✅ | PR #37 mergeado (`377bff1`): solicitud, agregado sin identidades y reporte. |
| CU-08 | `en_revision` | ⚠️ | PR #45: outbox Dexie real y badge; el badge se lee una sola vez y no se refresca. |
| CU-09 | `en_curso` | ⚠️ | El pie dice «datos simulados / no es un diagnóstico»; faltan «no prescribe dietas» y «no guarda nombres en la nube». |

«Sirve hoy» significa que se puede mostrar sin explicar por qué no anda. Hoy: **2 sí, 6 a medias, 1 no**.

`CU-15` y `CU-16` ya tienen su parte de lectura en `main`: #23 mergeó la RLS de salud y las vistas
agregadas. Siguen sin archivo propio, así que se quedan en la tabla del catálogo.

## 7. Los cinco que más duelen si no están

1. **CU-10** (enrolar): sin esto no hay segundo celular, ni turno, ni PIN; todo lo de acceso queda en tablas muertas.
2. **CU-12** (rol y revocación): cada celular enrolado queda con el rol que tenía para siempre, y no se puede sacar a nadie.
3. **CU-18** (menú publicado): la cocinera no puede saber qué cocinar sin pedirle la tablet a la organizadora.
4. **CU-22** (raciones servidas): sin registro de lo entregado no hay padrón del día, ni comprobante, ni conteo que cuadre con el menú.
5. **CU-27** (presupuesto): confirmar un comprobante depende de un período vigente; sin él, CU-04 se traba en el último paso.

## 8. Huecos del producto detectados al inventariar

- **Acceso con PIN**: D5 cifra el outbox local con una clave derivada del PIN, pero `pin_hash`, `recovery_hash` y `devices` existen y ningún CU los usa. El PIN no se pide en ninguna pantalla.
- **Menú publicado**: nadie lo crea. CU-17 lo posee y no tiene archivo ni issue; el demo lo siembra en `seed.sql`, y CU-03 y CU-18 lo consumen como si estuviera.
- **Raciones**: `racionSchema` exige `razones` (mínimo 2) y no hay tabla `raciones`; el evento `entidad = 'raciones'` se acepta sin destino donde aplicarlo.
- **Presupuesto**: `docs/contracts/comprobantes.md` §2.6/§2.7 define `presupuesto` y `movimiento_presupuesto`; no hay migración. Y el ciclo con comprobantes impide construirlos por separado.
- **`evento_sync.entidad`**: cerrado a 6 valores (`personas`, `raciones`, `movimientos`, `solicitudes`, `precios`, `menus`). Ningún evento de comprobante, servicio o presupuesto cabe por el outbox.
- **Reporte entre ollas**: §9 exige k ≥ 10 y P7 exige opt-in por olla; no hay tabla, ni columna de opt-in, ni `fn_reporte_red`.
- **Impresión**: `packages/printing` está implementado (folio, QR, plantilla) y ningún CU lo posee; CU-31 lo usaría, pero necesita raciones.
- **Roles y salud sin RLS**: no hay policies de insert/update en `olla_members` ni en `devices` (no se puede cambiar rol ni revocar), y `personas_select` deja leer salud a toda la olla.
- **`personas.notas`**: texto libre que se sincroniza tal cual (`personaSchema.notas`); una nota como "embarazada, anemia" manda salud sensible a la nube por un campo que no es de salud.
- **Policies de insert**: `servicios`, `precios` y `solicitudes` solo tienen `select`; lo que registra la cocinera hoy no se puede escribir por PostgREST.

## 9. Cómo se agrega un CU

1. El issue existe con `status:ready` y criterio de aceptación.
2. Se escribe su archivo con el formato de `README.md` (el modelo completo es `CU-03`).
3. En el mismo PR se cambia su fila acá y en el índice del `README.md`. Dos lugares, no tres.
