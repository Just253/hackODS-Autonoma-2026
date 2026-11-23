# CU-03 · Servir el menú firmado y contar raciones

**Actor:** la cocinera que empieza el turno y necesita saber cuántos platos preparar.
**Objetivo:** que el menú firmado por la nutricionista se convierta en porciones por grupo y en un total
de raciones del día, **con números que salgan de los datos**, no de una constante.

**Guion:** 0:40 (sello + hash, 2 opciones, porción por grupo, total de raciones)
**Área:** `contracts` (regla) + `web` (pantalla) · **Estado:** regla `servirDelDia` en `main` (PR #26); pantalla en el PR #44 · Issue: #17

## Precondiciones

- Existe un menú `publicado` con sello: nombre de la nutricionista, colegiatura CNP, fecha, versión y
  hash del contenido.
- Hay personas en el padrón del día con su grupo (ver `CU-02`).

## Flujo

1. Se abre `/servicio`. Arriba, el menú del día con su sello y su hash.
2. Se elige la opción A o B. Las dos están aprobadas; ninguna es "la sugerida".
3. La app muestra la porción por grupo: niño, adulto, adulto mayor, gestante, lactante.
4. Abajo, el total de raciones a preparar, y de dónde sale ese número.
5. Si una persona no encaja en ningún grupo, aparece aparte y **no** suma al total: no se adivina.

## Reglas que mandan

- `DEC-2026-0003` — la unidad de verdad es el **menú semanal firmado**. El sistema no prescribe dietas ni
  calcula requerimientos individuales: ajusta la porción por grupo y explica.
- `DEC-2026-0003` — sustituciones solo las aprobadas en la plantilla, con factor. Si no hay sustituto
  aprobado, queda `sin sustituto`.
- `DEC-2026-0006` — los 75 °C son checklist de cocción en la ficha del servicio, **no** un cálculo.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla | `apps/web/src/features/servicio/ServicioPage.tsx` | menú, sello, opciones, por grupo, total |
| Qué muestra del sello | la pantalla | nombre + CNP + fecha + versión + hash corto |
| Qué NO calcula | la pantalla | nada: recibe porciones y total ya resueltos |
| Datos locales | `apps/web/src/data/base.ts` (Dexie, rama del PR #14) | solo `personas`, `raciones` e `identidadLocal` (`base.ts:50-52`); las tablas de menú **no están en Dexie**: hueco |
| Outbox | `packages/sync/src/outbox.ts` | **hueco**: `servicio.registrado` no es una `entidad` válida (`entidad ∈ personas, raciones, movimientos, solicitudes, precios, menus`, `modelo_base.sql:279-280`) y hoy nada encola el servicio |
| Dato faltante | la pantalla | `sin dato` cuando no hay menú publicado, nunca un cero |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Menú | `menu_template`, `menu_day`, `dish`, `ingredient`, `portion`, `menu_constraint`, `substitution`, `validation` | 8 tablas con versión y hash |
| Servicio | `servicios` | columnas reales (`modelo_base.sql:231-245`): `id`, `olla_id`, `fecha`, `tipo` (desayuno/almuerzo/cena/refacción/único), `menu_day_id`, `cocido_a_75c`, `inocuidad_verificada_en`, `created_at`, `updated_at`, `deleted_at`, `device_id`, `lamport`. **No tiene `opcion` ni `raciones`**: el esquema actual no guarda la opción servida ni el conteo de raciones |
| Opción A/B | `menu_template.opcion` | la opción vive en la plantilla (`modelo_base.sql:118`, `check (opcion in ('A', 'B'))`), no en el servicio: elegir A o B al servir no deja registro. Hueco: decidir si se agrega `servicios.opcion` o se referencia la plantilla |
| Raciones | `raciones` (contrato y Dexie) | el total es el conteo de `raciones` por `servicioId` (`racionSchema`, `packages/contracts/src/domain.ts:467-481`), pero **no hay tabla `raciones` en la migración**: solo existe en Dexie (`base.ts:51`, rama del PR #14) y como `entidad` de sync (`modelo_base.sql:280`). Falta migración |
| Regla pura | `packages/nutrition` | `validarMenu`, `porcionParaGrupo`, `sustituirInsumo` y `explicar` existen como stubs: hoy lanzan `NoImplementado` (`menu.ts:31,48,67,83`) |
| Función del CU | `packages/domain` (nueva) | `servirDelDia(menu, personas)` → porciones y total; no existe todavía |
| RLS | `menu_*` lectura por olla; `servicios` | `servicios` solo tiene `servicios_select` (`modelo_base.sql:416-417`): no hay policy de inserción, así que escribir un servicio desde el cliente no está permitido hoy |

**Mapeo pendiente `personas.categoria` → `portion.grupo`**: hoy no existe en el código.

| `personas.categoria` (5 valores, `modelo_base.sql:63-64`) | `portion.grupo` (9 valores, `modelo_base.sql:165-167`) | Estado |
|---|---|---|
| `adulto` | `adulto` | directo |
| `adulto_mayor` | `adulto_mayor` | directo |
| `gestante` | `gestante` | directo |
| `lactante` | `lactante_6_23m` o `lactante_materna` | **ambiguo**: `lactante` no dice si es la madre o la criatura |
| `nino` | `menor_6m`, `lactante_6_23m`, `menor_5`, `escolar`, `adolescente` | **falta el corte de edad**: una categoría tapa cinco grupos |

`personas.anio_nacimiento` (`modelo_base.sql:61`) es solo el año: no alcanza para separar `menor_6m` de
`menor_5` ni `lactante_6_23m` de `escolar`. La tabla de mapeo y sus cortes son decisión pendiente.

## Criterio de aceptación

- [ ] `servirDelDia` es puro: sin React, sin Supabase, sin `fetch`.
- [ ] **Porciones del menú (verificable hoy)**: cada grupo recibe la porción de `portion` del menú
      publicado, y la pantalla muestra sello, hash, las 2 opciones y la porción por grupo, sin recalcular.
- [ ] Menú sin sello o con hash que no corresponde: se rechaza y se dice qué campo falla.
- [ ] Sustitución no aprobada: la ración queda `sin sustituto`, no se inventa equivalencia.
- [ ] **Total de raciones (bloqueado por el mapeo `personas.categoria` → `portion.grupo`)**: cuando exista
      la tabla de mapeo y los cortes de edad (ver Backend), el total sale de los datos del padrón ficticio;
      si el padrón cambia, cambia el total. Hoy no se puede verificar.

## Prueba

```sh
pnpm --filter @hackods/domain test    # a escribir: total, por grupo, menú sin sello, sustitución
pnpm --filter @hackods/web test       # a escribir: hoy no hay test de esta pantalla
pnpm verificar
```

El paquete `domain` hoy solo prueba presupuesto, precios, conciliación y captura; `servirDelDia` no
existe. En `main` el comando de `web` corre solo el test del service worker (PR #16); los tests de esta
pantalla hay que escribirlos.

Rojo→verde: cuando exista el test, cambiar a mano una porción de grupo tiene que romperlo. Si no rompe, la
regla no está probando nada.

## Qué NO hace

- No diagnostica anemia ni calcula requerimientos por persona.
- No arma el menú: lo aprueba una nutricionista fuera de la app y entra firmado.
- No imprime el folio: la demo no imprime; `CU-09` lo dice en el cierre.

## Preguntas abiertas

- ¿El total de raciones incluye segundas porciones? Hoy el modelo es una ración por persona y servicio.
- ¿Qué se hace con una persona gestante que además es adulta? El grupo se elige uno solo: falta decidir
  cuál gana.
- ¿Cómo se pasa de `personas.categoria` a `portion.grupo`? Son 5 contra 9 valores y `anio_nacimiento` no
  distingue meses: falta la tabla de mapeo y los cortes (ver Backend).
- ¿La opción A/B servida se guarda en `servicios` o el servicio referencia `menu_template`? Hoy no hay
  columna y la elección no deja registro.
- ¿Con qué `entidad` viaja el servicio al outbox? `servicio.registrado` no es un valor de
  `evento_sync.entidad` (`modelo_base.sql:279-280`); falta decidir el valor y cómo se marca la operación.
- ~~¿Se cambia la clave de `raciones`?~~ Resuelto en #30: PK `[personaCodigoP+servicioId]` en `base.ts`.
  Un segundo servicio ya no pisa la ración anterior y el total por servicio se reconstruye.
- **Decidido:** la demo dice el número que salga de los datos, no una constante. Con el seed actual son
  **5 raciones** (6 personas − 1 baja); el guion ya dice 5 y sube solo si se agregan personas al seed.
