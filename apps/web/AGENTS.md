# AGENTS.md — `apps/web`

PWA de la olla común: lo único que ve la cocinera. React + Vite + TypeScript. **Offline primero**:
la app arranca sin red y escribe sin red.

## Qué es de este paquete

- Rutas, pantallas y formularios (padrón, menú firmado, despensa, comprobantes, captura, reportes).
- Service worker (precache del shell, estrategias de red).
- Acceso a IndexedDB y encolado en el outbox de `@hackods/sync`.
- Cámara, impresión y demás APIs del navegador.
- Accesibilidad y textos visibles en español peruano.

## Qué NO es de este paquete

- Reglas de negocio o cálculos: viven en `packages/domain` y `packages/nutrition`. Si la pantalla
  "sabe" cuánto cuesta una ración, está mal.
- SQL, migraciones o políticas RLS: `supabase/`.
- Componentes genéricos: si se usa en dos lugares, va a `packages/ui`.
- El esquema del outbox: `packages/sync`.

## Comandos

```bash
pnpm --filter @hackods/web dev
pnpm --filter @hackods/web test
pnpm --filter @hackods/web test:e2e     # requiere `pnpm build` antes
pnpm --filter @hackods/web typecheck
```

### Antes de testear código que usa `@hackods/domain`

El paquete se resuelve por `dist/`, no por `src/`: si cambiás algo en `packages/domain`, construilo
primero o los tests verán la versión vieja.

```bash
pnpm --filter @hackods/domain build
```

### Correr un test concreto del paquete

Desde la raíz, `pnpm exec vitest run <ruta>` **no** carga `apps/web/vite.config.ts` y falla con
`document is not defined`. Usá el filtro del paquete, que sí lo carga:

```bash
pnpm --filter @hackods/web exec vitest run src/features/comprobante
```

## Cómo se testea

| Capa | Herramienta | Qué se prueba |
|---|---|---|
| Unidad | Vitest | hooks, mapeos, formateo |
| Componente | Testing Library | formulario válido/inválido, estados vacíos |
| Offline | `fake-indexeddb` | encolar, reintentar, no duplicar |
| E2E | Playwright (pendiente de instalar) | `context.setOffline(true)` → alta/captura → volver online → sincroniza |

Regla: toda pantalla que escribe debe tener **un test con la red apagada**. Si el test necesita red,
no está probando lo que importa.

## Reglas locales

1. **Ninguna escritura va directo a Supabase.** Toda mutación entra al outbox y se reintenta.
2. **Nada de `fetch` suelto.** El cliente HTTP y el outbox se usan desde un solo módulo.
3. **No se muestran datos de otra olla.** `olla_id` sale de la sesión, nunca de un input.
4. **La UI nunca bloquea por red**: si no hay conexión, guarda y avisa "pendiente de sincronizar".
5. **Nada de PII**: la pantalla muestra `P-XXXX`; `nombreLocal`/`alias` viven en Dexie marcados
   `localOnly: true` y nunca se serializan ni se envían al servidor.
6. **Bundle**: una dependencia nueva en `apps/web` se justifica en el issue (peso y por qué).
7. **Sin `dangerouslySetInnerHTML`** con texto que venga de OCR, importación o usuario.

## Supabase: lectura y sincronización

- **Config**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (o
  `VITE_SUPABASE_PUBLISHABLE_KEY`) viven en el `.env` de la **raíz** del monorepo; `envDir` del
  `vite.config` apunta ahí. Nunca se commitean. Sin las dos variables no hay cliente y las pantallas
  dicen "no configurado" en vez de inventar datos.
- **Local y remoto, el mismo código**: el destino sale del host de la URL (`127.0.0.1`/`localhost`
  = local). El panel de cuenta muestra cuál está en uso. En local no existen las cuentas demo: se
  entra con `app.enroll` (Edge `enroll`, código de olla + PIN).
- **Lecturas**: `src/data/remoto.ts` (un solo lugar). La pantalla no conoce tablas ni columnas. Si
  no hay sesión, `AvisoSinSesion`; si hay error, estado de error con reintento. Nunca fixtures.
- **Escrituras**: siguen yendo al outbox (`data/repositorio.ts`); jamás directo a Supabase. El envío
  es `data/sync-remoto.ts` (`SyncRemoto`) sobre `sync-push`/`sync-pull`; `sync-local.ts` queda solo
  como doble de tests.
- **Honestidad del badge**: `marcarEnviado` solo cuando el servidor confirma; un fallo deja el
  evento pendiente con `intentos + 1`. `Sincronizado` no se pinta por haber tocado un botón.
- **Clave**: solo la publicable/anon. `service_role` no entra al bundle (`docs/adr/0008-enrolamiento.md`).

## Dueño y revisión

Dueño: **A** (`area:web`). Revisa **B**. Toca `packages/ui` solo si A lo declaró en el claim.
