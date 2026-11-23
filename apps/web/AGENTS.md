# AGENTS.md — `apps/web`

PWA de la olla común: lo único que ve la cocinera. React + Vite + TypeScript. **Offline primero**:
la app arranca sin red y escribe sin red.

## Qué es de este paquete

- Rutas, pantallas y formularios (`jornada`, `raciones`, `despensa`, `aportes`, `reportes`).
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

## Cómo se testea

| Capa | Herramienta | Qué se prueba |
|---|---|---|
| Unidad | Vitest | hooks, mapeos, formateo |
| Componente | Testing Library | formulario válido/inválido, estados vacíos |
| Offline | `fake-indexeddb` | encolar, reintentar, no duplicar |
| E2E | Playwright | `context.setOffline(true)` → registrar jornada → volver online → sincroniza |

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

## Dueño y revisión

Dueño: **A** (`area:web`). Revisa **B**. Toca `packages/ui` solo si A lo declaró en el claim.
