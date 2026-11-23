# CU-02 · Dar de alta una persona sin nombre

**Actor:** la organizadora, con el padrón de la olla en la mano.
**Objetivo:** que una persona quede registrada como `P-XXXX`, con lo mínimo para servirle un plato, y
que el nombre —si se escribe— **no salga nunca del dispositivo**.

**Guion:** 0:15 (`P-0471`, mujer 68, sin comorbilidad) · **Área:** `web` · **Estado:** PR #14, verde; espera review y merge

## Precondiciones

- Nada. Es el primer dato que se crea en una olla nueva.
- El código `P-XXXX` se genera en el dispositivo; el servidor no lo inventa.

## Flujo

1. Se abre `/padron` y se toca "Agregar persona".
2. La app asigna el siguiente `P-XXXX` local y muestra el campo alias (opcional).
3. Se registran año de nacimiento, sexo y categoría: adulto, adulto mayor, niño, gestante o lactante.
4. Se guarda: queda en IndexedDB. El evento de sync **todavía no se encola** (`altaPersona` no llama al
   outbox; es un hueco del Backend).
5. La persona aparece en la lista del día, con su código y sin datos de salud visibles.

## Reglas que mandan

- `DEC-2026-0002` — en la nube solo `P-XXXX`. `nombreLocal` y `alias` son `localOnly: true` y **no** se
  serializan ni se envían.
- `DEC-2026-0002` — el vínculo `P-XXXX` ↔ persona vive en el papel del comedor (`docs/DECISIONES.md:17`);
  en la demo el código lo genera el dispositivo (`codigos.ts`, rama del PR #14), no el servidor.
- `DEC-2026-0007` — cero datos reales: el `P-XXXX` de la demo es ficticio.
- `apps/web/AGENTS.md` — la pantalla muestra `P-XXXX`; el alias vive solo en Dexie.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla | `apps/web/src/features/padron/PadronPage.tsx` | alta + lista del día; móvil primero |
| Datos locales | `apps/web/src/data/base.ts` (Dexie, rama del PR #14) | tablas `personas` (`base.ts:50`) e `identidadLocal` (`base.ts:52`) |
| Escritura | `apps/web/src/data/repositorio.ts` (rama del PR #14) | alta atómica en una transacción: `personas` + `identidadLocal` + `meta` (`repositorio.ts:95-127`) |
| Outbox | `packages/sync/src/outbox.ts` | existen `Outbox.encolar` y `EventoSaliente` (`outbox.ts:23-31`), pero `altaPersona` no encola nada: el evento es **hueco**, no una pieza existente |
| Estado vacío | la pantalla | "todavía no hay personas" con el botón de alta, no una tabla vacía |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tabla | `personas` | `codigo_p` (PK, `^P-[A-Z0-9]{4}$`), `olla_id`, `anio_nacimiento`, `sexo`, `categoria` |
| Salud (opt-in) | `personas.anemia`, `peso_kg`, `talla_cm` | sensibles: RLS restrictiva (ver `CU-04`/#4) |
| Nombre | **no existe la columna** | a propósito: `DEC-2026-0002` |
| Evento | `evento_sync` | **hueco**: la columna es `entidad`, no `evento` (`modelo_base.sql:279-280`), y su CHECK solo admite `personas`, `raciones`, `movimientos`, `solicitudes`, `precios`, `menus`. `persona.creada` no está permitido y la tabla no guarda el tipo de evento; qué valor lo representa (¿`entidad = 'personas'` más un `op` que `outbox.ts:1` define pero `evento_sync` no tiene?) es decisión pendiente |
| RLS | `personas_select` | solo personas de las ollas del miembro (hoy deja leer salud: #4 lo corrige) |

## Criterio de aceptación

- [ ] Alta en modo avión: la persona queda en IndexedDB y se ve en la lista.
- [ ] Recargar la app con la red apagada: la persona sigue ahí.
- [ ] El alias **no** aparece en ningún payload serializado (test en la rama del PR #14:
      `skeleton.spec.tsx:131-132`); cuando exista el evento de sync, tampoco.
- [ ] El `P-XXXX` no se repite dentro de la misma olla (hoy se verifica solo en local: no hay sync).
- [ ] Un dato inválido (año fuera de rango, categoría desconocida) se rechaza con mensaje, no se guarda.

## Prueba

```sh
pnpm --filter @hackods/web test     # en `main` corre solo el test del service worker (PR #16); el de este CU vive en el PR #14
pnpm verificar
```

El test de este CU existe en la rama del PR #14, no en `main`: `apps/web/src/skeleton.spec.tsx:60` hace
alta → desmontar → remontar y `:131-132` verifica que `nombreLocal`/`alias` no salgan al serializar
`persona` ni `racion`. Hasta el merge, en `main` el comando corre solo el test del service worker
(PR #16) y queda verde sin probar este CU.

Rojo→verde: copiar `nombreLocal`/`alias` dentro de `persona` en `altaPersona` tiene que romper
`skeleton.spec.tsx:131`.

## Qué NO hace

- No pide DNI, dirección, teléfono ni foto: no hay columna ni la va a haber.
- No calcula la ración de esa persona: eso es `CU-03`.
- No busca ni filtra por nombre en esta ventana.

## Preguntas abiertas

- ¿Qué pasa si dos dispositivos generan el mismo `P-XXXX` a la vez? El desempate por `device_id` está
  definido para eventos, no para códigos.
- ¿En producción el `P-XXXX` lo genera el dispositivo, como en la demo, o está atado al papel del comedor?
  `DECISIONES.md:17` dice dónde vive el vínculo, no quién genera el código.
- ¿El código se reutiliza cuando alguien deja la olla? Hoy no hay baja del padrón en la demo.
- ¿La baja lógica de una persona (`deleted_at`) se muestra o se oculta?
- ¿Cómo se representa el alta en `evento_sync`? Hoy `entidad` no admite `persona.creada` y la tabla no
  tiene columna de tipo de evento: falta decidir si se agrega un valor al CHECK, una columna `op` o una
  clave dentro de `payload`.
