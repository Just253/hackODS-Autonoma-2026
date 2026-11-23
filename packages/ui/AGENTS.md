# AGENTS.md — `packages/ui`

Componentes y tokens. **Presentacional**: recibe props, dibuja, no sabe de ollas.

## Qué es de este paquete

- Tokens (`colors.css`, `spacing.css`, `typography.css`) y el tema claro/oscuro.
- Primitivos: `Button`, `Field`, `Select`, `Dialog`, `Table`, `Stat`, `EmptyState`, `SyncBadge`.
- `EstadoSync` (`EstadoSync.tsx`): chip de estado de sincronización. Props `texto: string`
  (copy ya redactado por la app) y `tono: 'pendiente' | 'local'`; se dibuja como `<p role="status"
  aria-live="polite">` con las clases `oc-estado oc-estado--<tono>` (tokens en `tokens.css`). El
  estado se distingue por el **texto**, no solo por el color: `pendiente` agrega borde primario,
  pero nunca cambia el mensaje. Regla de la ventana offline: el badge dice siempre **"(local)"**
  ("N cambios pendientes de sincronizar (local)" / "Sincronizado (local)"), nunca "Sincronizado" a
  secas, porque no hay red que lo respalde.
- Patrones de impresión (`print.css`) que comparten reportes y tickets.
- Accesibilidad: foco visible, contraste AA, tamaños táctiles ≥ 44 px.

## Qué NO es de este paquete

- `fetch`, Supabase, IndexedDB, hooks de datos.
- Cálculos (costos, raciones, nutrientes).
- Textos de negocio. El copy llega por props; los ejemplos viven en Storybook si existe.
- Layout de una pantalla concreta: eso es de `apps/web`.

## Comandos

```bash
pnpm --filter @hackods/ui test
pnpm --filter @hackods/ui typecheck
```

## Cómo se testea

- Un test de render por componente con sus estados: normal, disabled, error, cargando.
- Test de accesibilidad (roles y nombres) con `getByRole`, nunca `getByTestId` como primera opción.
- Snapshot solo para estructuras estables; **nunca** para datos calculados.

## Reglas locales

1. Cero dependencias nuevas de UI (nada de otra librería de componentes encima). Si hace falta, ADR.
2. Ningún componente importa de `@hackods/domain` para "saber" reglas: recibe strings y números ya
   formateados o un `status` cerrado.
3. Todo color sale de un token. Un hexadecimal suelto en un componente es un PR rechazado.
4. Los textos por defecto van en español, sin jerga técnica ("Guardar", no "Persistir").
5. Un componente que se usa una sola vez se queda en `apps/web` hasta que haya dos usos reales.

## Dueño y revisión

Dueño: **A** (`area:web`). Revisa **C** (accesibilidad y consistencia). `print.css` lo revisa **B**
porque lo consumen los reportes del backend.
