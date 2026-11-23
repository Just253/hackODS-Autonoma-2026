# AGENTS.md — `packages/ui`

Componentes y tokens. **Presentacional**: recibe props, dibuja, no sabe de ollas.

## Qué es de este paquete

- Tokens (`colors.css`, `spacing.css`, `typography.css`) y el tema claro/oscuro.
- Primitivos: `Button`, `Field`, `Select`, `Dialog`, `Table`, `Stat`, `EmptyState`, `SyncBadge`.
- Primitivos del cascarón (PR de interfaz):
  - `Icono`: SVG inline, sin dependencia. Glifos `padron`, `servicio`, `comprobante`,
    `presupuesto`, `precios`, `entreOllas`, `reporte`, `mas`. `aria-hidden` por defecto: el texto del
    enlace ya nombra el destino.
  - `EncabezadoPantalla`: `h2` + una línea de contexto + un dato opcional a la derecha. Las siete
    pantallas lo usan para que la jerarquía no dependa de que cada una elija su tamaño de letra; en
    escritorio el texto se corta en `--ancho-lectura`.
  - `CifraDestacada`: etiqueta, nota opcional y la cifra ya formateada (no calcula ni formatea). Es la
    "cifra que manda" en padrón, servicio, comprobante, presupuesto y precios.
  - `EstadoPantalla`: los tres estados que se dibujan (`cargando` / `error` / `sin-conexion`;
    `listo` no dibuja nada). Props: `estado`, `children` (qué pasa, se lee primero que el color) y
    `accion` opcional (qué puede hacer la persona ahora). **Siempre imprime una etiqueta de
    palabra**, no solo color, porque en una tablet al sol el color no se distingue. El `role` cambia
    con el estado: `status` para cargando, `alert` para el error.
- Clases de `tokens.css` compartidas por las pantallas: `.oc-boton`, `.oc-campo` (control de 56 px),
  `.oc-tarjeta`, `.oc-cifra`, `.oc-pendiente`, `.oc-estado`, `.oc-tabla` (densidad de escritorio y
  números a la derecha) y `.oc-num`.
- Medidas del cascarón: `--ancho-lectura` (medida de lectura), `--ancho-contenido` (área de contenido
  en escritorio), `--ancho-rail` (rail lateral) y `--alto-nav` / `--alto-header`. El foco visible y el
  hover solo con puntero fino viven acá, no en cada pantalla.
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

## Anchos y escala

`--ancho-rail` está en `rem`, no en px: tiene que crecer con `data-texto` como el resto de la
interfaz. En px fijos, a letra `enorme` (26 px) el rail no daba abasto y el selector de letra quedaba
fuera de pantalla (bug corregido en #96/#98). Cualquier ancho nuevo de layout se declara en `rem`;
los `px` quedan para bordes y sombras.
