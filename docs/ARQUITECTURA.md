# 02 · Arquitectura — PWA para ollas comunes

**Proyecto:** hackODS-Autónoma 2026 · repo público y vacío `Just253/hackODS-Autonoma-2026`
**Alcance:** arquitectura ejecutable por 3 personas en paralelo, con ADRs.
**Fecha de investigación:** 2026-11-23. Los precios y límites de free tier cambian sin aviso: cada número lleva su fuente y fecha de consulta.
**Regla de este doc:** cada decisión con evidencia (doc oficial, límite real, medición). Lo que no se pudo verificar está marcado 🔶 y listado en §17.

---

## 0. Resumen ejecutivo

| # | Decisión | Elegido | Descartado | Por qué en una línea |
|---|---|---|---|---|
| 1 | Monorepo | pnpm workspaces + Turborepo | Nx, workspaces pelados | 1 archivo de config, `--filter` alcanza para 3 personas, cache local gratis |
| 2 | Frontend | Vite + React 19 + TS (SPA) | Next, SvelteKit | SSR no aporta en local-first y encarece el arranque en gama baja |
| 3 | Offline | Dexie/IndexedDB + outbox propio + reloj de Lamport | PowerSync, ElectricSQL, Realtime | 500 líneas propias contra 2 servicios nuevos que configurar |
| 4 | Backend | **Supabase** (Postgres+RLS+Auth+Storage) | CF Workers+D1, híbrido de dos backends | RLS es la forma más barata de no filtrar datos de salud entre ollas |
| 5 | Auth | Código de olla + PIN, sobre `signInAnonymously()` | email/OTP, SMS | Cero costo por SMS, cero email, y sigue habiendo `auth.uid()` real para RLS |
| 6 | Impresión | HTML + `@media print` | PDF en servidor, `@react-pdf` como primario | 0 dependencias, 0 red, y el equipo edita CSS en vez de un motor de layout |
| 7 | Escaneo | QR propio primero; OCR solo texto impreso | OCR de cuaderno manuscrito | Tesseract no está hecho para manuscrito (lo dice su propio FAQ) |
| 8 | Capacitor | Diferido, solo si la térmica BT entra al guion | APK desde el día 1 | Se pierde actualización instantánea y el link compartible |
| 9 | CI/CD | GitHub Actions + Cloudflare Pages + Supabase CLI | Vercel, Netlify | Repo público = minutos ilimitados; Pages = 500 builds/mes y preview por PR |
| 10 | Datos | Ficticios, en `seed.sql`, jamás reales | datos de una olla real | El historial de git de un repo público es irreversible |

**Tesis del documento:** el producto es *local-first*, no *online-con-caché*. Eso invierte tres prioridades habituales: (a) la latencia del backend deja de estar en el camino crítico de la usuaria; (b) el motor de sincronización, no el backend, es el componente que hay que diseñar con cuidado; (c) el demo tiene que poder correr sin red, porque el comedor tampoco tiene red.

---

## 1. Diagrama de arquitectura

```
┌──────────────────────── CELULAR ANDROID (gama baja, 2 GB RAM) ────────────────────────┐
│  PWA instalada (Vite + React 19 + TS)   ·   Service Worker (Workbox) precachea shell   │
│                                                                                        │
│   packages/ui  ──  features: personas · raciones · despensa · recetas · solicitudes    │
│         │                       │                                                      │
│         │             @olla/domain (zod + reglas puras)                                │
│         │             @olla/nutrition (motor explicable: entrada → reglas → razones)   │
│         ▼                       ▼                                                      │
│   @olla/sync  ──►  IndexedDB (Dexie)  =  FUENTE DE VERDAD LOCAL                        │
│                     ├── personas · raciones · movimientos · solicitudes (espejo)       │
│                     ├── outbox   (seq, lamport, device_id, intentos, error)            │
│                     ├── sync_state (cursor por tabla, device_id, lamport)              │
│                     └── blobs    (fotos comprimidas 1280 px / JPEG 0.7)                │
│                                                                                        │
│   @olla/printing: HTML + @media print  (A4 · 58 mm · 80 mm)  →  window.print()         │
└────────────────┬───────────────────────────────────────────────────────────────────────┘
                 │  HTTPS · por lotes · idempotente · reintentos con backoff
                 │  ⚠ NO se necesita para operar: solo para sincronizar
                 ▼
┌─────────────────────── SUPABASE  (región sa-east-1, São Paulo) ────────────────────────┐
│  Auth: signInAnonymously + RPC enroll(olla_code, pin)   │  PostgREST  /rest/v1          │
│  Postgres 15+:  RLS default-deny por olla   ·   RPC apply_batch(jsonb) / pull(since)   │
│  Storage: bucket privado `escaneos` (1 GB free)         │  Realtime: opcional, "poke"   │
│  Edge Functions: opcional (PDF compartible, OCR en la nube opt-in)                     │
└────────────────────────────────────────────────────────────────────────────────────────┘

  Build estático ──► Cloudflare Pages (preview por PR · 500 builds/mes · egress ilimitado)
  CI             ──► GitHub Actions (repo público: minutos ilimitados)
  Opcional       ──► Capacitor → APK Android (impresora térmica Bluetooth, cámara nativa)
```

**Flujo de una ración entregada (camino real, sin red):**

```
cocinera toca "Entregar" → 1 registro en `raciones` (id UUIDv7 del cliente)
   → 1 fila en `movimientos` si descuenta despensa (delta negativo, append-only)
   → 1 fila en `outbox`
   → UI dice "Guardado en este celular · 3 pendientes de enviar"
   → (cuando hay red) push del outbox → RPC apply_batch → servidor acepta por id
   → pull incremental → Dexie converge
```

---

## 2. Monorepo

### 2.1 Herramienta

**Decisión: pnpm workspaces + Turborepo.** (ADR-001)

| Opción | A favor | En contra para 3 personas / 48-72 h |
|---|---|---|
| **pnpm + Turborepo** ✅ | `pnpm-workspace.yaml` + `turbo.json` = 2 archivos. `turbo run build --filter=@olla/web...` resuelve el grafo. Cache local en `.turbo`. Cero daemon, cero plugin. | Hay que escribir los `package.json` de cada paquete a mano (10 min). |
| Nx | Generadores, `nx graph`, límites de módulos con lint, Nx Cloud. | Curva de aprendizaje y conceptos propios (executors, inferred tasks) que nadie del equipo va a usar en 3 días. Suma otra cuenta si se quiere cache remoto. |
| Workspaces pelados | Cero config. | Sin cache ni orquestación: `pnpm -r build` reconstruye todo siempre y no hay orden de dependencias garantizado para `typecheck`. Con 3 personas corriendo builds todo el día se nota. |

Evidencia de la máquina: Node **22.21.1**, pnpm **10.18.2** (verificado con `node -v` / `pnpm -v`).

> ⚠ **Trampa de pnpm 10 (verificada en esta versión):** por defecto **no ejecuta lifecycle scripts** de dependencias. Si `pnpm install` avisa *"Ignored build scripts"*, hay que declararlos en `pnpm-workspace.yaml`:
> ```yaml
> onlyBuiltDependencies:
>   - esbuild
>   - '@tailwindcss/oxide'
> ```
> Sin esto, Vite falla con un error de binario de `esbuild` y se pierden 40 minutos.

### 2.2 Layout

```
hackODS-Autonoma-2026/
├─ apps/
│  └─ web/                        # Vite + React + TS · PWA · ÚNICA app del demo
│     ├─ src/
│     │  ├─ app/                  # router, providers, shell, layout
│     │  ├─ features/             # personas · raciones · despensa · recetas · solicitudes · escaneo
│     │  ├─ lib/                  # auth, platform (PrinterPort), i18n, diagnostics
│     │  └─ styles/               # tailwind.css, tokens.css, print.css
│     ├─ public/                  # _redirects, iconos, tessdata/
│     └─ vite.config.ts
├─ packages/
│  ├─ domain/                     # zod + tipos + reglas puras.  🔒 CONTRATO CONGELADO
│  ├─ nutrition/                  # motor explicable (puro, determinista, con `fuente` en cada número)
│  ├─ ui/                         # primitivas shadcn + tokens + <BigText> + <SyncBadge>
│  ├─ sync/                       # Dexie schema, outbox, cliente, merge.  🔒 CONTRATO CONGELADO
│  └─ printing/                   # modelo de documento + plantillas React imprimibles
├─ supabase/
│  ├─ migrations/                 # SQL versionado = fuente de verdad del esquema
│  ├─ functions/                  # edge functions (opcional)
│  ├─ tests/                      # pgTAP: aislamiento por olla
│  ├─ seed.sql                    # datos FICTICIOS
│  └─ config.toml
├─ tools/                         # generar QR de prueba, generar padrón ficticio
├─ .github/workflows/
├─ pnpm-workspace.yaml
├─ turbo.json
└─ package.json
```

**No crear `apps/api`.** Con Supabase, el "backend" son migraciones + RLS + RPC. Una carpeta `apps/api` vacía invita a que alguien meta ahí un servidor Express a mitad del hackathon y aparezcan dos fuentes de verdad. Si hace falta lógica puntual (PDF compartible, OCR opt-in), va a `supabase/functions/`.

### 2.3 Scripts raíz

```json
{
  "name": "hackods",
  "private": true,
  "packageManager": "pnpm@10.18.2",
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:db": "supabase test db",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write .",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:seed": "psql \"$SUPABASE_DB_URL\" -f supabase/seed.sql",
    "db:push": "supabase db push",
    "db:types": "supabase gen types typescript --local > packages/domain/src/db.types.ts",
    "db:sizes": "psql \"$SUPABASE_DB_URL\" -c \"select relname, pg_size_pretty(pg_total_relation_size(relid)) from pg_catalog.pg_statio_user_tables order by 3 desc limit 15\"",
    "demo": "pnpm --filter @olla/web build && pnpm --filter @olla/web preview"
  }
}
```

Notas:
- `supabase db reset` **ya corre `seed.sql`** si `config.toml` tiene `[db.seed] enabled = true`. `db:seed` es para la base remota.
- `db:reset` requiere Docker. Si alguien no lo tiene el día 1, el plan B es apuntar a la base de `staging` (ver §9) y no bloquearse.
- `db:types` genera tipos desde el esquema real: los tipos de la DB nunca se escriben a mano. Solo lo corre P1 y el archivo generado se commitea.

`turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test":      { "dependsOn": ["^build"] },
    "lint":      {},
    "dev":       { "cache": false, "persistent": true }
  }
}
```

---

## 3. Frontend

### 3.1 Framework: Vite + React 19 + TypeScript (SPA)

**Decisión: Vite + React + TS.** (ADR-002)

| Criterio | Vite + React | Next.js | SvelteKit |
|---|---|---|---|
| SSR | No lo necesitamos: la primera pantalla ya está en disco por el SW | Trae runtime de servidor que no vamos a usar | Idem |
| Arranque en gama baja | Bundle mínimo real, un solo runtime | Suma runtime de framework + App Router; hidratación que compite con IndexedDB | **El más liviano** (~la mitad de JS) |
| PWA | `vite-plugin-pwa`, precache explícito | Pelea con `output: 'export'` y con el SW | Excelente (`@sveltejs/adapter-static`) |
| Capacitor | `webDir: dist`, cero fricción | Necesita export estático y aún así arrastra complejidad | Igual de fácil |
| Ecosistema para este caso | shadcn/ui **es React**; ejemplos de Dexie + supabase-js abundan | Igual | shadcn-svelte existe, con menos ejemplos |
| Riesgo de equipo | Bajo | Medio (decisiones de App Router) | Medio (menos gente lo escribe) |

**Por qué no SvelteKit, siendo técnicamente mejor:** la decisión no es de bytes, es de horas de equipo. Con 3 personas y un fin de semana, el criterio que manda es "cuántos ejemplos encontrar en 5 minutos" y que `shadcn/ui` sea React. 🔶 Si el equipo ya escribe Svelte, **cambiar solo esta decisión**: el resto del documento (sync, RLS, impresión, backend) no cambia una línea.

Presupuesto de peso (aproximado, 🔶 medir en el primer `build`): React+ReactDOM+Router+Dexie+zod+supabase-js ≈ **130–160 KB gzip**. Presupuesto de arranque que importa: **< 1 s a primer render con cache caliente en un Android de 2 GB**. Si se pasa, lo primero que se corta es `supabase-js` en el bundle inicial (import dinámico en el módulo de sync).

### 3.2 Router, estado, formularios

- **Router:** React Router 7 en modo datos (`createBrowserRouter`), una ruta por feature con `lazy()`. Por qué no TanStack Router: los search params tipados son lindos, pero es una API nueva para 3 personas.
- **Estado de datos:** **no hay store global**. La fuente de verdad es Dexie; se lee con `useLiveQuery` (`dexie-react-hooks`). Toda la UI se re-renderiza sola cuando cambia IndexedDB.
- **Estado de UI:** `useState` local + **un** store Zustand de ~40 líneas para: sesión/dispositivo, olla activa, preferencias (tamaño de letra, contraste), estado de sync.
- **Formularios:** `react-hook-form` + `@hookform/resolvers/zod`, con los schemas de `@olla/domain`. Un schema, tres usos: validación en el form, validación antes de encolar en el outbox, validación en el servidor (RPC).
- **Sin React Query / SWR.** Es deliberado: cachear dos veces (Dexie + React Query) genera la clase de bug más cara del proyecto ("la lista muestra algo distinto de lo que se guardó"). Se pide a Dexie, siempre.

### 3.3 i18n

- `es-PE` por defecto. Un solo archivo `apps/web/src/lib/i18n/es.json` con claves planas (`personas.titulo`, `raciones.entregar`). Función `t()` propia de ~30 líneas con interpolación y fallback. No meter `i18next` el día 1; si aparecen plurales reales, se migra en 1 hora.
- **Quechua opcional:** mismo archivo `qu.json` (variedad sureña, la de Ayacucho/Cusco, es la que se entiende en la sierra). Interfaz: selector en ajustes, fallback por clave a `es`. **No traducir tecnicismos** ("ración", "inventario"): dejar el español y traducir solo verbos y navegación. Traducir mal es peor que no traducir. 🔶 Requiere hablante nativo; no se puede resolver con un modelo.
- Formatos con `Intl` (`es-PE`): fechas `dd/mm`, números con coma decimal, unidades `kg`, `g`, `L`. Nunca concatenar unidades a mano.
- **Regla de redacción:** cero jerga. "Persona", "ración", "despensa", "pedido a otra olla". Nada de "entidad", "registro", "sincronizar" en la cara de la usuaria (se dice "guardar en el celular" / "enviar").

### 3.4 Estilo: Tailwind + shadcn/ui

- **Tailwind v4** con `@tailwindcss/vite` (plugin, no PostCSS) y tokens en CSS (`--color-...`) dentro de `packages/ui/src/tokens.css`. Los tokens son el contrato con `printing/`: la impresión térmica usa los mismos nombres en escala de grises.
- **shadcn/ui** copiado a `packages/ui/src/components/` (no es una dependencia, es código). Se ajustan una vez y quedan consistentes. Los formularios de shadcn ya vienen con `label` visible y `aria-invalid`, que es exactamente lo que necesitamos para accesibilidad.
- **Prohibido:** componentes que dependan de un CDN de iconos. Iconos como SVG inline (lucide-react en bundle, ~2 KB por icono tree-shakeado).

### 3.5 Accesibilidad y modo "letra grande"

Requisito de producto, no adorno: la organizadora tiene baja alfabetización digital y probablemente presbicia.

- **Escala tipográfica por `rem`** y un atributo en `<html>`: `data-texto="normal" | "grande" | "enorme"` → `font-size: 18px | 22px | 26px`. Todo lo demás escala. El default es **18 px**, no 16.
- **Objetivos táctiles ≥ 48×48 px**, separación ≥ 8 px. Una acción primaria por pantalla.
- **Contraste AA mínimo (4.5:1)**, AAA (7:1) en texto de cuerpo. Nunca texto gris claro sobre blanco "porque se ve moderno".
- **Nunca solo color:** el estado de anemia, el stock bajo y el estado de sync llevan **icono + palabra**. Aproximadamente 1 de cada 12 hombres tiene daltonismo.
- **Botón de acción fija abajo** (zona del pulgar), navegación inferior con 4 ítems máximo: Personas · Raciones · Despensa · Más.
- **Confirmaciones explícitas** con `aria-live="polite"`: "Guardado en este celular. Funciona sin internet." después de cada escritura. Es también el mensaje que sostiene la confianza en modo offline.
- **Borrar** = dos pasos (botón + confirmación con la palabra "Borrar"), nunca gesto de swipe.
- `<form>` con `label` visible siempre. Placeholder no es label.
- Respetar `prefers-reduced-motion`; sin animaciones de más de 200 ms.
- 🔶 Verificación pendiente: probar con TalkBack en un Android real y con `Letra grande` del sistema activado. Es una prueba de 20 minutos que vale más que cualquier checklist.

---

## 4. Offline-first

### 4.1 Estrategia

**Dexie 4 (IndexedDB) como fuente de verdad + outbox de mutaciones + pull incremental.** (ADR-003)

```
 escritura ──► Dexie (transacción local)  ──► outbox (append)
                   │                              │
                   │                              ├─ online: push por lotes → RPC apply_batch()
                   │                              └─ offline: queda en cola, UI muestra "N pendientes"
                   ▼
              useLiveQuery()  ──►  la UI ya muestra el dato, aunque el servidor no lo sepa
```

Esquema (`packages/sync/src/db.ts`), simplificado:

```ts
db.version(1).stores({
  personas:    'id, olla_id, nombre, updated_at, deleted_at',
  raciones:    'id, olla_id, servicio_id, persona_id, [olla_id+servicio_id], updated_at',
  movimientos: 'id, olla_id, insumo_id, ocurrido_at, [olla_id+insumo_id]',
  solicitudes: 'id, olla_origen_id, olla_destino_id, estado, updated_at',
  outbox:      '++seq, entidad, estado, created_at',
  sync_state:  'clave',        // { clave: 'cursor:personas', valor: '...' }
  blobs:       'id, olla_id, subido',
});
```

### 4.2 Las cinco reglas que evitan el 80% de los bugs

1. **IDs generados en el cliente**: UUIDv7 (`uuid` v11, `v7()`). Ordenable por tiempo, así sirve de desempate y de cursor. Nunca `bigserial` para datos creados offline: el cliente no puede pedirle un número al servidor.
2. **Idempotencia por id de cliente**: el servidor hace `insert ... on conflict (id) do nothing`. Reenviar el outbox 10 veces es seguro. Esto elimina la clase de bug "se duplicó la ración porque se cortó la red a mitad del POST".
3. **Nunca ordenar por `Date.now()`**. Los Android baratos se desfasan días (fecha puesta a mano). Se usa un **reloj de Lamport** por dispositivo: `lamport = max(local, remoto) + 1` al escribir y al recibir. Desempate final: `device_id`. `created_at` existe **solo para mostrar**, jamás para resolver conflictos.
4. **`updated_at` lo pone el servidor** (trigger). El cursor de pull es `(updated_at, id)` compuesto, para no perder filas con el mismo timestamp. Pull: `?olla_id=eq.X&or=(updated_at.gt.C,updated_at.eq.C,id.gt.I)&order=updated_at,id&limit=500`.
5. **Nada se borra físicamente desde el cliente**: `deleted_at` (tombstone), para que el borrado se propague.

### 4.3 Resolución de conflictos, por tipo de dato

| Dato | Modelo | Regla de merge | Por qué |
|---|---|---|---|
| `personas` | documento mutable | **LWW** por `(lamport, device_id)`; la versión perdedora se guarda en `personas_historial` | Un nombre corregido es descriptivo; perder una edición es recuperable y visible |
| `movimientos` (despensa) | **append-only, deltas con signo** | Converge sola: el saldo es `sum(delta)` | Dos celulares que descuentan 2 kg y 3 kg dan −5 kg. **Un contador mutable con LWW mentiría** ("quedan 10 kg" cuando quedan 5) |
| `raciones` | append-only | Una ración entregada no se edita: se **anula** con otro registro | Trazabilidad para el reporte y para la auditoría de la nutricionista |
| `solicitudes` | máquina de estados | `borrador < enviada < aceptada < entregada`; `cancelada` es terminal. Gana el estado de mayor rango; empate → `(lamport, device_id)` y se marca "revisar" | Un pedido entre ollas no puede "volver" a borrador porque un celular estaba viejo |
| `insumos` (catálogo) | documento | LWW, solo `admin` puede editar | Datos de referencia, no operativos |

> **La decisión más importante de todo el documento:** la despensa **no guarda saldos, guarda movimientos**. El saldo es una vista. Es lo que hace que el inventario siga siendo verdad después de un día sin red, y es lo que se puede explicar en el pitch en una frase: *"nunca perdemos un movimiento, aunque el celular esté desconectado"*.

**Conflictos que se muestran:** si el merge descarta una edición de persona, la UI muestra una tarjeta discreta en "Más → Pendientes de revisar": "Se corrigió el nombre de Rosa Q. desde otro celular". Nunca un modal. Nunca un error.

### 4.4 Qué se rompe sin internet (lista explícita, para el guion)

| Funciona sin red | Necesita red |
|---|---|
| Registrar personas, editar, dar de baja | **Alta de un dispositivo nuevo** (`enroll`) |
| Entregar raciones y anularlas | Ver datos de una olla que nunca se sincronizó |
| Descontar despensa (movimientos) | Que una solicitud **llegue** a la otra olla |
| Evaluación nutricional | Subir fotos de escaneos |
| Imprimir (A4 y térmica) | Login en un celular nuevo / recuperar sesión perdida |
| Ver padrón, reportes del día, historial local | Realtime (si se usa) |

Esto no es una limitación a esconder: es el argumento de venta. "El sistema funciona en el comedor sin señal; cuando vuelve, se pone al día solo."

### 4.5 Almacenamiento en el dispositivo

- `navigator.storage.persist()` en el primer guardado (evita que el navegador desaloje los datos).
- Panel "Espacio usado" con `navigator.storage.estimate()`: "Usás 42 MB de 800 MB disponibles". Le da a la organizadora una respuesta cuando el celular dice "sin espacio".
- Fotos: recomprimir en el cliente a **1280 px lado mayor, JPEG 0.7** (~150–250 KB). Un celular de 32 GB con 2 GB libres no aguanta fotos de 4 MB.
- Blobs en Dexie, **nunca** en `localStorage` (límite ~5 MB, y bloquea el hilo).
- Panel de diagnóstico (oculto tras 7 taps en "Acerca de"): cola pendiente, último sync, últimos 5 errores, `device_id`, `lamport`. Es la herramienta que salva el demo.

### 4.6 Comparación de motores de sincronización

| | **Propio (Dexie + outbox)** ✅ | PowerSync | ElectricSQL | Supabase Realtime |
|---|---|---|---|---|
| Qué resuelve | Todo lo que necesitamos, a medida | Sync bidireccional completo con Postgres como origen | **Solo lectura**: Postgres → cliente por HTTP (Shapes) | Notificaciones, no sync |
| Qué te obliga a hacer | Escribir ~500 líneas (merge + outbox + cursores) | Configurar un servicio aparte, su schema de sync, y una fuente Postgres | Escribir igual tu propia API de escritura + correr un servicio Elixir (o Electric Cloud) | Implementar igual el outbox y el pull: Realtime **no hace backfill** |
| Free tier real | $0 (es código) | 2 GB sincronizados/mes, 500 MB alojados, 50 clientes concurrentes, 2 instancias; **se desactiva por inactividad** (la tabla dice 1 semana, la nota 2: 🔶 verificar) | Cloud con free tier; self-host gratis pero es un servicio Elixir + Postgres | 200 conexiones concurrentes, 2 M mensajes/mes, 256 KB por mensaje |
| Riesgo en hackathon | Bugs propios, pero **totalmente diagnosticables** | Otro dashboard, otra CLI, otra cuota que se puede agotar en vivo | La mitad del problema (escrituras) sigue siendo tuyo | Creer que resuelve el offline y descubrirlo en el escenario |

**Decisión:** propio. Con dos matices honestos:
- Si el proyecto **sobrevive** al hackathon y hay que sincronizar 50+ ollas reales, PowerSync es la compra correcta: es exactamente este problema, resuelto, con SDK para Capacitor y soporte de Supabase como origen.
- **Realtime se usa solo como "poke"**: un canal `olla:<id>` que emite `{tabla}` cuando alguien más escribió, y el cliente hace un pull incremental. Nunca como transporte de datos. Y va **detrás de un flag, apagado en el demo**: es lo más frágil de mostrar en vivo y aporta poco a la historia.

---

## 5. Backend

### 5.1 Tabla decisiva

| | **Supabase** ✅ | Cloudflare Workers + D1 + R2 + DO | Híbrido (Supabase + Workers) |
|---|---|---|---|
| **Auth** | Producto completo: `signInAnonymously()`, OTP email/teléfono, JWT, refresh, rate limits, hooks | Nada. Se escribe a mano (JWT + cookies + recuperación) | Dos sistemas de identidad = dos formas de equivocarse |
| **SQL** | **Postgres 15+**: joins, vistas, `jsonb`, triggers, `pg_cron`, extensiones, `gen types` | D1 = SQLite: sin `jsonb` real, sin extensiones, sin triggers complejos | El frontend tendría que hablar dos dialectos |
| **RLS** | **Sí, nativo, por fila.** Con `auth.uid()` | No existe. Autorización a mano en cada query del Worker | Solo en la mitad Postgres |
| **Storage de fotos** | 1 GB free, 50 MB por archivo, bucket privado + policies | **R2: 10 GB free y egress $0** (mejor) | Dos lugares donde buscar una foto |
| **Tiempo real** | Realtime: 200 conexiones, 2 M msgs/mes | Durable Objects (100 k req/día, solo SQLite en free) | Complejidad doble |
| **Funciones** | Edge Functions (500 k invocaciones/mes) o RPC en Postgres | Workers: 100 k req/día, 10 ms CPU por invocación | Dos runtimes |
| **Free tier** | 500 MB DB, 1 GB storage, 5 GB egress, 50 k MAU, **2 proyectos, se pausa tras 1 semana sin uso** | 5 M filas leídas/día, **100 k filas escritas/día**, 5 GB D1, 10 GB R2, 100 k req/día | Suma de los dos, con dos facturas mentales |
| **Latencia Perú (medida)** | sa-east-1 é única región en Sudamérica | Edge en el PoP más cercano… que en esta conexión fue **Miami** | La peor de las dos |
| **Lock-in** | Medio: Postgres es Postgres; las policies se portan. Auth y Storage son de Supabase | Alto en D1 (SQLite propietario en la práctica), medio en R2 (S3) | Alto |
| **Esfuerzo 3 personas** | **Bajo**: el esquema es SQL y las policies son el contrato de seguridad | **Alto**: hay que construir auth + authz + storage + realtime | **Muy alto** |

**Medición de latencia** (esta PC, Lima, 6 muestras por destino, TCP connect = 1 RTT; 2026-11-23):

| Destino | RTT promedio | mínimo | máximo |
|---|---|---|---|
| AWS São Paulo (`sa-east-1`) | **185 ms** | 152 ms | 251 ms |
| AWS N. Virginia (`us-east-1`) | **185 ms** | 135 ms | 255 ms |
| Cloudflare edge | 143 ms | **49 ms** | 215 ms |

Tres conclusiones que cambian decisiones:

1. **São Paulo no es "más cerca" en la práctica**: 185 ms promedio, igual que Virginia. La ruta internacional manda más que la geografía. → elegir región no arregla la latencia; **el diseño local-first sí**.
2. **Cloudflare no siempre atiende desde Lima.** `https://cloudflare.com/cdn-cgi/trace` devolvió `colo=MIA` con `loc=PE`: esta conexión peruana salió por Miami. El "edge en Lima" no es un supuesto sobre el que se pueda construir un argumento de producto.
3. **La varianza es el dato**: 49 → 215 ms en la misma conexión, en la misma sesión. En un comedor de Villa El Salvador con 3G compartido, asumir 300–1500 ms y cortes es lo realista. Ninguna UI puede depender de un round trip.

### 5.2 Recomendación

**Supabase como único backend.** Razones, en orden de peso:

1. **RLS es el mecanismo de seguridad, no una feature.** La regla "ninguna olla ve datos de otra" se escribe **una vez por tabla**, en SQL, versionada en git, testeable. En Workers+D1 esa misma regla se escribe en **cada** endpoint, y un `where olla_id = ?` olvidado es una fuga de datos de salud. Con 3 personas y 48 horas, ese es el riesgo que hay que comprar eliminado.
2. **Un solo contrato**: el esquema vive en `supabase/migrations/*.sql`, los tipos se generan con `supabase gen types`, y el frontend no puede desincronizarse.
3. **Auth y Storage vienen incluidos** y su free tier (50 k MAU, 1 GB) sobra para el demo y para el piloto.
4. **Postgres permite el modelo correcto**: la despensa como vista sobre movimientos, la evaluación nutricional como función SQL testeable, los reportes como queries.
5. **R2 es mejor para fotos, y no alcanza para justificar un segundo backend.** 1 GB de Supabase Storage = ~4.000 fotos comprimidas de 250 KB. Si eso se agota, se agota el demo, no el producto.

### 5.3 El híbrido que sí tiene sentido

**Supabase (datos/auth) + Cloudflare Pages (hosting estático).** Son capas distintas, no dos fuentes de verdad: Pages sirve archivos, Supabase guarda datos. Y es donde cada uno es claramente mejor: Pages da preview por PR, 500 builds/mes y egress ilimitado gratis; Supabase da Postgres con RLS.

**El híbrido que NO:** Workers + D1 **además de** Supabase. Dos backends, dos auth, dos migraciones, dos free tiers que vigilar. Es la forma más rápida de perder un hackathon.

### 5.4 Plan B si Supabase falla durante el evento

No es "reescribir en Workers". Es **degradar**, porque la app ya es local-first:

1. **Interfaz única de transporte.** `packages/sync/src/remote.ts` exporta una sola interfaz:
   ```ts
   export interface RemotePort {
     push(lote: Mutacion[]): Promise<ResultadoPush[]>;
     pull(tabla: Tabla, cursor: Cursor): Promise<{ filas: unknown[]; cursor: Cursor }>;
     subirBlob(id: string, blob: Blob): Promise<string>;
   }
   ```
   Hoy: `SupabaseRemote`. Mañana: `D1Remote` (≈200 líneas) o `NoRemote` (todo local).
2. **Modo `NoRemote`** (feature flag `VITE_BACKEND=local`): la app funciona 100% contra Dexie, con export/import JSON para "sincronizar" entre dispositivos a mano (archivo por WhatsApp). **El demo completo se puede dar así.** Esto es el verdadero seguro.
3. **Si el proyecto está pausado** (1 semana sin uso): un workflow `warm.yml` cada 6 h hace un `GET /rest/v1/ollas?select=id&limit=1` con la `anon` key. Gratis en repo público. Además, un `curl` manual 5 minutos antes de subir al escenario.
4. **Si se agota el storage/egress**: apagar subida de fotos (flag) y seguir; las fotos son lo único realmente prescindible del demo.
5. **Si hay que migrar de verdad** (post-hackathon): `pg_dump` → `wrangler d1 execute --file`. El esquema es SQL estándar salvo policies y RPC. Un día de trabajo, no una semana.

---

## 6. Auth: la organizadora entra sin email

### 6.1 Por qué no email ni SMS

| Opción | Problema real |
|---|---|
| Email + contraseña | La organizadora no tiene email, o no lo usa, o no lo recuerda. Fricción = abandono. |
| Magic link | Requiere email + abrir el correo en el mismo celular. Dos dispositivos para entrar una vez. |
| **OTP por SMS** | Supabase lo soporta (Twilio/MessageBird/Vonage), pero **el SMS se paga por mensaje**, hay que abrir cuenta, verificar el número de origen, y la entregabilidad a números peruanos es una lotería. Además, cada login cuesta plata. |
| Código de olla + PIN ✅ | Sin costo por usuario, sin email, sin SMS, y **funciona igual el día 400 que el día 1**. |

### 6.2 Diseño

**Identidad en dos capas:** la *membresía* (quién es, en qué olla, con qué rol) y el *dispositivo* (qué celular está autorizado). Supabase solo necesita saber "qué dispositivo"; nosotros sabemos "qué persona".

```
1. Primer arranque → supabase.auth.signInAnonymously()
      ↳ usuario anónimo real, con auth.uid() y JWT con claim is_anonymous=true
      ↳ (device-bound: si borra datos del navegador, pierde la cuenta — ver 6.5)

2. La organizadora ingresa:  código de olla (6 caracteres)  +  su código personal / teléfono + PIN
      ↳ RPC enroll(p_olla_code text, p_personal text, p_pin text)  SECURITY DEFINER
      ↳ verifica crypt(p_pin, m.pin_hash)  y  crypt(p_personal, m.recovery_hash)
      ↳ inserta devices(user_id = auth.uid(), member_id, enrolled_at)
      ↳ devuelve { olla_id, rol, nombre }

3. A partir de acá: RLS resuelve todo. La app cachea el PIN (hash) para desbloqueo offline.
```

Tablas:

```sql
create table ollas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,          -- 6 chars, sin ambigüedad (sin 0/O/1/I)
  distrito text, creada_en timestamptz not null default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,                        -- opcional, nunca obligatorio
  pin_hash text not null,               -- crypt(pin, gen_salt('bf', 10))
  recovery_hash text not null,          -- código personal de respaldo
  creado_en timestamptz not null default now()
);

create table olla_members (             -- una persona puede estar en 2 ollas
  member_id uuid references members on delete cascade,
  olla_id   uuid references ollas   on delete cascade,
  rol text not null check (rol in ('organizadora','cocinera','nutricionista','admin')),
  primary key (member_id, olla_id)
);

create table devices (                  -- el celular autorizado
  user_id uuid primary key,             -- = auth.uid()
  member_id uuid not null references members on delete cascade,
  enrolled_at timestamptz not null default now(),
  last_seen timestamptz,
  revoked_at timestamptz                -- bajar un celular perdido
);
```

**RLS por olla** (helper `stable` para que el planner lo cachee por fila):

```sql
create schema if not exists app;

create or replace function app.mis_ollas()
returns setof uuid language sql stable security definer set search_path = public as $$
  select om.olla_id
  from devices d join olla_members om on om.member_id = d.member_id
  where d.user_id = auth.uid() and d.revoked_at is null;
$$;

alter table personas enable row level security;
-- default-deny: sin policy, no hay acceso. Esta es la única policy de SELECT.
create policy personas_select on personas for select to authenticated
  using (olla_id in (select app.mis_ollas()));

create policy personas_insert on personas for insert to authenticated
  with check (
    olla_id in (select app.mis_ollas())
    and app.mi_rol(olla_id) in ('organizadora','admin')
  );
```

> **Default-deny es el default de Postgres con RLS activo** (sin policy no hay acceso), así que el esquema arranca cerrado y cada policy es una apertura explícita y revisable. Es lo contrario de un middleware de authz escrito a mano.

### 6.3 Roles y mínimo privilegio

| Rol | Puede | **No** puede |
|---|---|---|
| `admin` (equipo) | Todo, todas las ollas | (es el equipo) |
| `organizadora` | CRUD de personas de su olla, membresías, ver reportes, exportar | Ver otras ollas |
| `cocinera` | Ver padrón del día, entregar/anular raciones, movimientos de despensa | **Ver los flags de salud crudos** (`gestante`, `anemia`), editar personas, ver membresías |
| `nutricionista` | Leer agregados (conteos, cobertura) de las ollas asignadas; aprobar evaluaciones | Editar padrón, ver nombres individuales si no es necesario |

**Cómo la cocinera sirve la ración correcta sin ver el diagnóstico:** una **vista** que expone solo lo derivado.

```sql
create view v_raciones_del_dia with (security_invoker = true) as
select r.olla_id, p.id as persona_id, p.nombre,
       case
         when p.gestante then 'especial_gestante'
         when p.anemia   then 'especial_anemia'
         when p.edad_anios < 5 then 'nino'
         when p.edad_anios >= 60 then 'adulto_mayor'
         else 'estandar'
       end as tipo_racion
from personas p join raciones r on r.persona_id = p.id
where p.deleted_at is null;

revoke all on personas from authenticated;          -- ojo: se re-otorga por columna
grant select (id, olla_id, nombre, edad_anios, sexo, deleted_at) on personas to authenticated;
-- `gestante` y `anemia` NO se otorgan: solo los lee la vista y los roles con privilegio
```

Resultado: la cocinera ve "Rosa Q. — ración especial (gestante)" y no ve ni puede consultar el campo, aunque llame a la API directamente con su JWT. Es *data minimization* implementada en la base, no en la UI.

### 6.4 Sesión offline

- JWT de 1 h + refresh token. `supabase-js` refresca solo cuando hay red.
- **Sin red, con JWT vencido: la app sigue funcionando.** Las escrituras son locales; RLS solo se aplica al sincronizar. Cuando vuelve la red, se refresca el token y se empuja el outbox.
- **Riesgo aceptado y documentado:** si el refresh token se invalida (rotación con detección de reuso, o restauración de un backup), el dispositivo queda en modo local hasta que la persona reingrese su PIN. Es un caso raro y la recuperación es de 30 segundos con red.
- **Desbloqueo local:** PIN cacheado como hash en Dexie al enrolar. Protege el celular de una mirada ajena; **no es la frontera de autorización** (esa es `devices` + RLS). Decirlo así en el código y en el pitch, no fingir que un PIN de 4 dígitos es seguridad.
- PIN: **6 dígitos**, bloqueo 5 intentos / 60 s, y el servidor aplica rate limit en `enroll`. La IP de anónimos ya viene limitada a 30 req/hora por IP (documentado por Supabase). 🔶 Ese límite es un riesgo real en desarrollo: 3 personas creando usuarios de prueba desde la misma IP lo alcanzan. Mitigación: un usuario de prueba fijo para desarrollo y `VITE_BACKEND=local` la mayor parte del tiempo.

### 6.5 Riesgos de este diseño (explícitos)

1. **El usuario anónimo está atado al dispositivo.** La propia doc lo dice: *"the user can't access their account if they sign out, clear browsing data, or use another device"*. → Mitigación: (a) el **código personal de respaldo** re-enrola un celular nuevo en 30 segundos; (b) la organizadora puede revocar un dispositivo desde otro; (c) el export JSON permite recuperar el trabajo local.
2. **`enroll` requiere red.** Es la única operación que sí. Se hace una vez, con wifi, al inicio. El guion del demo lo asume.
3. **Un anónimo sin membresía no ve nada** (default-deny), así que un atacante que llame a `signInAnonymously()` obtiene una sesión inútil. Eso es exactamente lo que se quiere.

---

## 7. Impresión

### 7.1 Decisión: HTML + `@media print` en el cliente

**No** PDF en servidor (Puppeteer/Chromium): necesita red, necesita un runtime, cold start de segundos, y rompe el offline. Se descarta sin discusión.

**No** `@react-pdf/renderer` como camino primario: trae su propio motor de layout (Yoga), sus estilos no son CSS, y el equipo tendría que aprender dos sistemas de maquetado para imprimir lo mismo.

**Sí** HTML + CSS de impresión + `window.print()`. Cero dependencias, cero red, y el PDF sale del diálogo del sistema ("Guardar como PDF") en Android y en escritorio. Lo que se ve en pantalla y lo que se imprime comparten componentes: menos drift.

**Modelo de documento** (`packages/printing`) para no acoplar contenido a presentación:

```ts
export type Documento =
  | { tipo: 'padron';    olla: Olla; servicio: Servicio; filas: FilaPadron[] }
  | { tipo: 'receta';    receta: Receta; insumos: InsumoReceta[]; comensales: number }
  | { tipo: 'solicitud'; solicitud: Solicitud; origen: Olla; destino: Olla }
  | { tipo: 'comprobante'; racion: Racion; folio: string; qr: string }
  | { tipo: 'etiqueta';  olla: Olla; fecha: string; qr: string };

export function renderA4(doc: Documento): ReactElement;      // 210 × 297 mm
export function renderTermica(doc: Documento): ReactElement; // 58 mm / 80 mm
```

### 7.2 Lo que se imprime

| Documento | Formato | Cuándo | Contenido mínimo |
|---|---|---|---|
| **Padrón del día** | A4, 2 columnas | Antes de servir | Nombre, edad, tipo de ración, casilla para marcar, folio, fecha, QR de la olla |
| **Receta + insumos** | A4 | Para la cocina | Ingredientes con cantidad para N comensales, pasos numerados, alérgenos, ODS que cubre |
| **Solicitud de insumos** | A4 (una para cada olla) | Pedido entre ollas | Qué, cuánto, para cuándo, quién firma, **QR con el folio** para escanear la recepción |
| **Comprobante de ración** | Térmica 58 mm | Al entregar | Folio corto, nombre, tipo de ración, fecha/hora, QR |
| **Etiqueta de contenedor** | Térmica 58/80 mm | Al guardar comida | Olla, contenido, fecha de elaboración, "consumir antes de", QR |

### 7.3 CSS de impresión, concreto

```css
/* A4 */
@page { size: A4; margin: 12mm 12mm 14mm; }
@media print {
  html { font-size: 11pt; }                 /* no 16px: en papel, 11pt es lo legible */
  .no-print { display: none !important; }
  .pagina  { break-after: page; }
  .fila    { break-inside: avoid; }
  thead    { display: table-header-group; } /* repite el encabezado en cada hoja */
  .franja-ods { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

/* Térmica 58 mm: ancho útil ≈ 48 mm @ 203 dpi = 384 dots */
@media print {
  .termica-58 {
    width: 48mm; font-family: ui-monospace, 'Roboto Mono', monospace;
    font-size: 9pt; line-height: 1.25; color: #000;
  }
  .termica-58 .corte { border-top: 1px dashed #000; margin: 2mm 0; }
}
```

- **Tamaño de página térmica:** usar `@page { size: 58mm 120mm; margin: 1mm }`, **no** `58mm auto`. El segundo valor `auto` no está garantizado en todos los motores; un alto fijo y `overflow: hidden` es predecible. 🔶 Verificar en el navegador que se vaya a usar: es una prueba de 2 minutos y evita imprimir media etiqueta.
- **Blanco y negro duro:** la térmica no hace grises. Nada de `opacity`, nada de grises claros para separar: **líneas de 1 px y negrita**.
- **Fuente monoespaciada** para la térmica: alinea las columnas de cantidad sin tablas.
- **Ancho de 80 mm:** 72 mm útiles, 576 dots. Misma plantilla, cambia el contenedor.
- Un solo `<button>Imprimir</button>` que llama `window.print()`; en el celular abre el diálogo del sistema (Imprimir / Guardar como PDF).

### 7.4 PDF compartible (opcional, no camino crítico)

Si el jurado pide "un PDF", `pdf-lib` (~250 KB, JS puro, funciona en el navegador y en Capacitor) genera un A4 real desde el mismo `Documento`. Va detrás de un botón "Compartir PDF" y **consume el mismo modelo**, no una segunda maqueta. Si no se llega, no se pierde nada: "Guardar como PDF" del sistema existe en todos los Android.

### 7.5 Prohibiciones

- ❌ `puppeteer` / `playwright` en producción.
- ❌ Cualquier fuente web remota en la hoja de impresión (Google Fonts): si no hay red, la tipografía cae y el layout se rompe. Fuentes del sistema o `woff2` local con `font-display: block`.
- ❌ Imágenes remotas en documentos imprimibles. El QR se genera como SVG inline.

---

## 8. Escaneo

### 8.1 Qué se escanea realmente (y qué no)

| Caso | Veredicto | Por qué |
|---|---|---|
| **QR de nuestros propios comprobantes** (folio de ración, código de olla, folio de solicitud) | ✅ **Sí, es la función principal** | Precisión ~100%, instantáneo, funciona sin red, sin cámara de alta gama |
| **Lista de asistencia manuscrita del cuaderno** | ⚠️ **No OCR.** Se **fotografía** y se adjunta al día | El cuaderno es manuscrito: Tesseract no está hecho para eso (8.3). La foto es evidencia, no dato |
| **DNI** | ❌ **No** | No se necesita el número para calcular una ración. Escanear el DNI es maximizar PII sin beneficio (ver §11) |
| **Boleta / factura de compra** | 🔶 Opcional, bajo valor | Texto impreso → OCR plausible; pero el total se tipea en 3 segundos |

### 8.2 Lector de QR

- **`BarcodeDetector` nativo** cuando existe (Chrome en Android lo soporta desde hace varias versiones). Es el camino rápido y no suma peso.
- **Fallback `zxing-wasm`** (~300 KB wasm, se precachea en el SW) para navegadores sin `BarcodeDetector` — Safari/iOS no lo tiene. Detección con `'BarcodeDetector' in window`.
- **Generación:** `qrcode` (JS puro, ~20 KB) → SVG inline. Los códigos llevan **checksum**: un folio es `uuid corto + 2 caracteres de verificación`, para rechazar un QR de otra olla con un mensaje útil en vez de un error.
- Escaneo **siempre** desde la cámara dentro de la app (`getUserMedia`), nunca desde la galería: menos pasos, menos confusión.

### 8.3 OCR: la verdad incómoda

El FAQ oficial de Tesseract dice, textual: *"Can I use Tesseract for handwriting recognition? You can, but **it won't work very well**, as Tesseract is designed for printed text."*

Por lo tanto:

| Enfoque | Costo | Precisión esperada | Offline | Veredicto |
|---|---|---|---|---|
| **Tesseract.js on-device** | $0. `spa.traineddata` fast 🔶 (~2–5 MB; el `best` pesa >10 MB) + wasm, precacheados | Texto **impreso** en buena luz: alta. **Manuscrito: inutilizable** | ✅ | Solo para listas impresas |
| **OCR en la nube** (Workers AI / Vision) | Workers AI: 10.000 neurons/día gratis, después $0.011/1.000 | Mejor en manuscrito *impreso prolijo*, no en cuaderno | ❌ | ❌ fuera del camino crítico; además subir un documento con datos de salud a un tercero es un problema de privacidad |
| **QR / código de barras** | $0 | ~100% | ✅ | ✅ **El camino** |

**Expectativa de rendimiento en gama baja (🔶 medir antes de prometer):** una página A4 a 300 dpi puede tardar **10–40 s** y consumir cientos de MB de RAM en un equipo de 2 GB. En un celular de 8 núcleos es aceptable; en uno de 4, con 1,5 GB libres, puede matar la pestaña. Consecuencia de diseño: **nunca bloquear la UI**; el OCR corre en un worker, con barra de progreso y botón "Cancelar", y el resultado **siempre** cae en un formulario editable.

### 8.4 Si falla (diseño del fallback)

El escaneo es **acelerador, nunca requisito**. Toda pantalla que escanea tiene, al lado, la entrada manual:

1. Autocompletar el nombre desde el padrón local (con normalización de tildes y mayúsculas: "ROSA QUISPE" encuentra "Rosa Quispe").
2. Cantidades con `−` / `+` y chips con los valores usados ayer ("2 kg", "1 atado").
3. Mensaje en lenguaje humano, no técnico: **"No pudimos leer el papel. Escribilo acá."** Nunca "Error de OCR".

**Regla de oro del demo:** ningún paso del guion depende de que el escaneo funcione.

---

## 9. CI/CD y entornos

### 9.1 Costo cero, con números

| Pieza | Free tier real | Fuente |
|---|---|---|
| GitHub Actions | **Minutos ilimitados en repositorios públicos** | política de GitHub |
| Cloudflare Pages | 500 builds/mes, 1 build a la vez, 100 proyectos, 20.000 archivos, 25 MiB por archivo, deployments 30 días | docs CF Pages (2026-11-19) |
| Supabase | 2 proyectos activos, 500 MB DB, 1 GB storage, 5 GB egress, 50 k MAU, 500 k invocaciones de Edge Functions | pricing (consultado 2026-11-23) |

> **El límite que condiciona el diseño:** 2 proyectos = `prod` + `staging`. **No hay base por PR.** Los previews de frontend apuntan a `staging` (o a `local` con `VITE_BACKEND=local`), y las migraciones se validan contra `staging` antes de `main`.

### 9.2 Workflows

**`ci.yml`** — en cada PR y en `main`:
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

**`db.yml`** — solo si el PR toca `supabase/**`:
```yaml
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase db start
      - run: supabase db lint --level warning
      - run: supabase test db        # pgTAP: aislamiento por olla
```

**`deploy.yml`** — en `main`, con environment `production` (required reviewers):
```yaml
      - run: pnpm build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy apps/web/dist --project-name=hackods
      - run: supabase link --project-ref $SUPABASE_PROJECT_ID
      - run: supabase db push --include-all
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
```

**`warm.yml`** — el seguro contra la pausa por inactividad:
```yaml
on:
  schedule: [{ cron: '0 */6 * * *' }]
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS "${{ secrets.SUPABASE_URL }}/rest/v1/ollas?select=id&limit=1" -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

### 9.3 Reglas de migraciones

- **Nunca editar una migración ya aplicada.** Una nueva: `supabase migration new descripcion_corta` → nombre con timestamp, así el orden es el del sistema de archivos y no hay discusiones de merge.
- **Los cambios de esquema son de P1** (§12). Si P2 o P3 necesitan una columna, la piden; no la agregan.
- Toda tabla nueva **nace con `enable row level security`** y sin policies (default-deny), en el mismo archivo. Un test de CI verifica que **no exista** ninguna tabla en `public` con RLS deshabilitado:
  ```sql
  -- supabase/tests/000_rls_encendido.sql
  select plan(1);
  select is_empty(
    $$ select tablename from pg_tables
       where schemaname = 'public' and not rowsecurity $$,
    'toda tabla de public tiene RLS'
  );
  select * from finish();
  ```

### 9.4 Protección de `main`

Ruleset:
- Require PR, **require status check `ci`**, require linear history, block force-push.
- Require **review de code owners** solo en: `supabase/migrations/**`, `supabase/tests/**`, `packages/nutrition/**`, `packages/sync/**` (vía `CODEOWNERS` + "Require review from Code Owners"). **No** review obligatorio en `apps/web/**`: a las 3 a. m. bloquea más de lo que protege.

`CODEOWNERS`:
```
/supabase/            @P1
/packages/nutrition/  @P1 @P3
/packages/sync/       @P3
/.github/             @P3
```

### 9.5 Seed y datos ficticios

- `supabase/seed.sql` **idempotente** (`on conflict do nothing`): 3 ollas, 40 personas, 20 insumos, 5 recetas, 14 días de raciones y movimientos, 4 membresías (una por rol), 2 solicitudes en estados distintos.
- Nombres explícitamente falsos: `Persona Demo 01`, `Rosa Quispe (ficticia)`. Nada de nombres reales de beneficiarias, ni siquiera "de ejemplo".
- El seed incluye **el caso borde**: una persona gestante con anemia, un niño de 2 años, un adulto mayor de 75, y una persona dada de baja (`deleted_at`), para que el merge y las vistas se prueben con datos que importan.
- `tools/gen-qr.ts` genera los SVG de los folios del seed, para que los QR del demo apunten a datos que existen.

---

## 10. Capacitor: cuándo sí y cuándo no

**Decisión: PWA primero. Capacitor diferido, y solo si una necesidad concreta entra al guion del demo.**

| Señal | PWA | Capacitor |
|---|---|---|
| Compartir con el jurado | Un link. Se instala en 5 s | Instalar un APK (o Play Store, que no existe el día 1) |
| Actualizar | Deploy → todos actualizados | Recompilar + reinstalar |
| Impresora térmica **Bluetooth** | ❌ El navegador no habla ESC/POS por BLE | ✅ `@capacitor-community/bluetooth-le` + bytes ESC/POS |
| Cámara con control fino (enfoque, linterna, recorte) | Parcial (`getUserMedia`) | ✅ Plugin de cámara |
| Que el sistema no descarte la app | El SO puede matar la pestaña; IndexedDB sobrevive, el estado en memoria no | Proceso propio, más estable |
| Android viejo con Storage/SW raros | Riesgo real | Más predecible |
| Peso del toolchain | 0 | JDK 21 + Android SDK/Gradle en 3 máquinas |

**Qué se pierde exactamente al pasar a Capacitor:** instalación desde el navegador (`beforeinstallprompt`/A2HS), actualización instantánea (cada cambio = rebuild + reinstalar, o pagar un servicio de live update), el flujo de `vite-plugin-pwa` con "hay una versión nueva", y la posibilidad de que un juez abra la app sin instalar nada. **En un hackathon, eso es caro.**

**Regla de diseño que deja la puerta abierta a costo cero:** ninguna feature importa `@capacitor/*` directamente. Hay un puerto:

```ts
// apps/web/src/lib/platform/printer.ts
export interface PrinterPort {
  imprimirA4(doc: Documento): Promise<void>;
  imprimirTermica(doc: Documento, ancho: 58 | 80): Promise<void>;
  disponible(): boolean;
}
// pwa.ts   → window.print()
// nativo.ts → ESC/POS por BLE (solo si VITE_PLATFORM=native)
```
El día que se agregue Capacitor: `pnpm add @capacitor/core @capacitor/cli @capacitor/android`, `npx cap add android`, `webDir: 'apps/web/dist'`, y una implementación de `PrinterPort`. **Un día de trabajo, no una reescritura.** 🔶 ESC/POS crudo por BLE en la impresora concreta del equipo: no verificado.

---

## 11. Seguridad y privacidad

### 11.1 Clasificación del dato

Lo que se guarda es **PII de salud**: nombre + edad + sexo + embarazo + anemia, asociados a una olla y a una fecha. Bajo la **Ley 29733 (Perú)** los datos de salud son **datos sensibles**, y hay menores de edad en el padrón. No es un detalle legal: es la razón por la que el diseño tiene que ser cerrado por defecto.

### 11.2 Minimización (la medida de seguridad más barata y más efectiva)

| Se guarda | No se guarda | Por qué |
|---|---|---|
| Nombre (o alias) | DNI | No cambia la ración. Un DNI es identificador único irreversible |
| Edad en años | Fecha de nacimiento completa | La edad alcanza para el cálculo; la fecha exacta es más PII |
| `gestante` (bool), `anemia` (bool) | Diagnóstico, texto libre, medicación | La ración depende del flag, no del cuadro clínico |
| Olla, rol, fecha de ración | Dirección, foto de la persona, teléfono obligatorio | Nada de eso se usa |
| Foto del cuaderno (opcional) | Foto del DNI, del carné, de la persona | Evidencia de asistencia, sin identificar |

### 11.3 Controles

- **En tránsito:** TLS obligatorio (Supabase y Pages lo fuerzan). Nada de `http://`.
- **En reposo:** cifrado del proveedor (AWS subyacente). No se hace cifrado por campo: 🔶 **trade-off explícito** — cifrar `nombre` en el cliente con una clave derivada del PIN rompe la búsqueda, el autocompletado y cualquier `where nombre ilike`, que son el corazón de la UX. Si se requiere, se cifra **solo `telefono`** (no se busca) después del hackathon.
- **Autorización:** RLS default-deny + privilegios por columna (§6.3). El `service_role` **nunca** sale del CI (y ni eso: solo en `supabase db push` vía CLI).
- **Claves en el cliente:** solo la `anon` key (es pública por diseño: va en el bundle). Jamás `service_role`, jamás el secreto JWT del proyecto.
- **Auditoría:** tabla `auditoria(id, member_id, olla_id, entidad, entidad_id, accion, ts)` escrita por trigger en `personas` y `raciones`. La nutricionista necesita saber quién aprobó qué.

### 11.4 Retención, exportación, borrado

| Dato | Retención | Mecanismo |
|---|---|---|
| `personas` | Mientras exista el vínculo con la olla; baja lógica inmediata | `deleted_at`; purga física a los 12 meses |
| `raciones` / `movimientos` | 24 meses (reporte anual ODS) | Agregación a `resumen_mensual` y purga |
| Fotos de cuaderno | **30 días** | Job (`pg_cron` o Edge Function programada) que borra objeto de Storage y fila |
| `outbox` local | 7 días | Limpieza en el cliente |
| Usuarios anónimos huérfanos | 30 días | `delete from auth.users where is_anonymous and created_at < now() - interval '30 days'` (receta de la doc) |

- **Exportación (feature, no checkbox):** `export_olla(olla_id)` → ZIP con `personas.csv`, `raciones.csv`, `movimientos.csv`, `solicitudes.csv` + `LEEME.txt` con el diccionario de campos. **El dato es de la olla.** Es un buen argumento de pitch: "si mañana no quieren usar el sistema, se llevan todo".
- **Borrado total:** `delete_olla(olla_id)` (RPC `security definer`, solo `admin`): borra filas, objetos de Storage y dispositivos. Probado en `staging` antes del demo.
- **Consentimiento:** pantalla de primer uso, en español simple y con letra grande: qué se guarda, para qué, quién lo ve, cómo se borra. Sin casilla premarcada.

### 11.5 Por qué el repo público no puede tener datos reales

1. **El historial de git es público y permanente.** Borrar un archivo en un commit posterior no lo elimina: queda en el objeto del commit anterior. GitHub además cachea blobs accesibles por SHA. Una fila con el nombre y el embarazo de una persona real en un repo público es **irreversible**.
2. **Las migraciones son públicas:** cualquiera lee el esquema, las policies y los nombres de las RPC. Eso está bien (es la prueba de que el diseño es serio) pero significa que **la seguridad no puede depender del secreto del esquema**.
3. **Cualquiera puede clonar el repo y correr el seed** contra un proyecto propio. Si el seed tiene datos reales, se replican.
4. **Riesgo de secreto:** un `service_role` commiteado por error da control total; aunque se borre, queda en el historial. Mitigación: `gitleaks` en CI, `.gitignore` con `.env*`, y `supabase/config.toml` sin claves.

**Reglas duras:** datos reales solo en `staging`/`prod` privados, nunca en el repo. Toda captura de pantalla del pitch usa datos ficticios. El video de respaldo también.

---

## 12. Reparto para 3 personas en paralelo

### 12.1 Owners

| Persona | Dueña de | Nunca toca |
|---|---|---|
| **P1 · Datos y dominio** | `supabase/**`, `packages/domain/**`, `packages/nutrition/**`, `tools/` | `apps/web/src/features/**` |
| **P2 · App y captura** | `apps/web/**`, `packages/ui/**` | `supabase/migrations/**`, `packages/sync/**` |
| **P3 · Sync y campo** | `packages/sync/**`, `packages/printing/**`, `.github/**`, Capacitor | `apps/web/src/features/**` (excepto `lib/`) |

### 12.2 Los 4 contratos que se congelan la primera hora

Sin esto, las tres personas se bloquean entre sí en la hora 2.

1. `packages/domain/src/schema.ts` — schemas zod de Persona, Olla, Racion, Movimiento, Solicitud, Insumo + `TipoRacion`.
2. `packages/sync/src/types.ts` — `Mutacion`, `ResultadoPush`, `Cursor`, `EstadoSync`, `RemotePort`.
3. `packages/ui` — `<SyncBadge>`, `<EmptyState>`, `<BigText>`, `<ConfirmarBorrado>`.
4. `apps/web/src/lib/platform/printer.ts` — `PrinterPort`.

Se escriben **juntos** (P1+P3 los de sync/domain, P2 los de UI) en los primeros 45 minutos, se commitean, y a partir de ahí **solo por PR**.

### 12.3 Reglas anti-colisión

- **Un archivo tiene un dueño.** Si necesitás tocarlo: PR de 5 líneas o pedilo en el chat. Nunca dos personas en el mismo archivo el mismo día.
- **P2 no importa nada de `supabase/`.** Consume `@olla/sync` (hooks: `usePersonas()`, `useRaciones()`, `useOutbox()`) y `@olla/domain` (tipos). Si necesita un dato que no existe, lo pide a P3.
- **P3 no toca `features/`.** Expone hooks; la UI la hace P2.
- **`pnpm-lock.yaml`:** conflictos se resuelven borrándolo, `pnpm install`, y commit. Nunca merge a mano.
- **Migraciones:** solo P1, con `supabase migration new`. Si dos ramas agregan tablas distintas, el orden por timestamp resuelve.
- **Commits chicos y frecuentes.** Con 3 personas, un PR de 800 líneas es un conflicto garantizado.
- **`main` siempre desplegable.** El deploy a Pages corre desde `main`; si `main` rompe, el link del jurado rompe.

### 12.4 Orden de trabajo sugerido (por si el tiempo es corto)

| Bloque | P1 | P2 | P3 |
|---|---|---|---|
| H0–H1 | esquema + migración inicial + seed | shell de la app + router + tokens | Dexie + outbox + `RemotePort` stub |
| H1–H4 | RLS + `enroll` + vistas + tests pgTAP | features personas + raciones | push/pull + `useLiveQuery` + `SyncBadge` |
| H4–H8 | motor nutricional + `export_olla` | despensa + solicitudes + accesibilidad | impresión A4 + térmica + diagnóstico |
| H8–H12 | reportes + datos del guion | pulido de flujo + letra grande + i18n | CI/CD + Pages + ensayo de sync + warm cron |

---

## 13. Walking skeleton (≤ 1 hora, día 1)

Objetivo: `git clone` → `pnpm dev` → app que **guarda una persona sin red, recarga y sigue ahí**, con CI verde y URL pública. Ese es el esqueleto; todo lo demás son features.

**Requisitos ya presentes en la máquina:** Node 22.21.1, pnpm 10.18.2, git 2.54. Docker solo para `db:reset` (opcional hoy).

```bash
# (0) repo — ya existe vacío
git clone https://github.com/Just253/hackODS-Autonoma-2026.git && cd hackODS-Autonoma-2026

# (1) base del workspace                                      ~3 min
pnpm init
pnpm add -Dw turbo typescript prettier
# crear: pnpm-workspace.yaml, turbo.json (ver §2.3)

# (2) la app                                                  ~4 min
pnpm create vite apps/web --template react-ts
pnpm --filter @olla/web add react-router dexie dexie-react-hooks zod @supabase/supabase-js uuid
pnpm --filter @olla/web add -D tailwindcss @tailwindcss/vite vite-plugin-pwa

# (3) los 5 paquetes vacíos con package.json                   ~3 min
# packages/{domain,nutrition,ui,sync,printing}  → name @olla/<x>, main src/index.ts

# (4) supabase                                                 ~6 min
pnpm dlx supabase init
pnpm dlx supabase migration new init
# pegar el SQL de §6.2 + personas/raciones/movimientos
pnpm dlx supabase start            # requiere Docker
pnpm dlx supabase db reset         # aplica migración + seed

# (5) verificar                                                ~2 min
pnpm typecheck && pnpm test && pnpm dev
```

Archivos mínimos (copiar tal cual):

`pnpm-workspace.yaml`
```yaml
packages:
  - apps/*
  - packages/*
onlyBuiltDependencies:
  - esbuild
  - '@tailwindcss/oxide'
```

`apps/web/vite.config.ts`
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',            // nunca recargar a mitad de turno
      includeAssets: ['iconos/*.png'],
      manifest: {
        name: 'Ollas — ración y despensa',
        short_name: 'Ollas',
        lang: 'es-PE',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0f5132',
        icons: [
          { src: 'iconos/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'iconos/512.png', sizes: '512x512', type: 'image/png' },
          { src: 'iconos/512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true
      }
    })
  ]
});
```

`apps/web/public/_redirects` (para el SPA en Pages)
```
/*  /index.html  200
```

`packages/domain/src/schema.ts` (el contrato, mínimo viable)
```ts
import { z } from 'zod';

export const Rol = z.enum(['organizadora', 'cocinera', 'nutricionista', 'admin']);
export const TipoRacion = z.enum(['estandar', 'especial_gestante', 'especial_anemia', 'nino', 'adulto_mayor']);

export const Persona = z.object({
  id: z.string().uuid(),
  olla_id: z.string().uuid(),
  nombre: z.string().min(1).max(80),
  edad_anios: z.number().int().min(0).max(120),
  sexo: z.enum(['f', 'm', 'x']),
  gestante: z.boolean().default(false),
  anemia: z.boolean().default(false),
  lamport: z.number().int().nonnegative(),
  device_id: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable().default(null),
});
export type Persona = z.infer<typeof Persona>;
```

`supabase/migrations/<ts>_init.sql` (mínimo: dos tablas, RLS encendido, una policy)
```sql
create table ollas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  codigo text not null unique,
  creada_en timestamptz not null default now()
);

create table personas (
  id uuid primary key,                         -- UUIDv7 generado en el cliente
  olla_id uuid not null references ollas on delete cascade,
  nombre text not null,
  edad_anios int not null,
  sexo text not null,
  gestante boolean not null default false,
  anemia boolean not null default false,
  lamport bigint not null default 0,
  device_id text not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on personas (olla_id, updated_at, id);

alter table personas enable row level security;   -- default-deny: sin policy, nadie pasa
```

`.github/workflows/ci.yml` → el de §9.2.

**Criterio de aceptación del esqueleto (el que importa):**

1. `pnpm dev` levanta en < 30 s.
2. Se crea una persona en el formulario → aparece en la lista.
3. Se apaga el wifi (modo avión) → se recarga la página → **la persona sigue ahí y se puede crear otra**.
4. `navigator.storage.persist()` devuelve `true`.
5. `pnpm test` pasa con 1 test de `@olla/domain` y 1 de merge en `@olla/sync`.
6. Un PR de prueba con un error de tipos → CI falla y bloquea el merge.
7. El build está en una URL `*.pages.dev` que abre en un Android real.

Si el punto 3 funciona el día 1, el producto ya es demostrable. Todo lo demás es valor agregado.

---

## 14. Riesgos técnicos y mitigación

### R1 · La sincronización multi-dispositivo en vivo *(prob. alta · impacto alto)*

Es el componente más nuevo, el más concurrente, y el que más se muestra en un demo ("mirá, lo que cargó acá aparece allá"). Un conflicto visible en el escenario destruye la percepción de solidez.

- **Mitigación de diseño:** append-only para lo que importa (movimientos, raciones); LWW solo en lo descriptivo; ids de cliente idempotentes; reloj de Lamport (no `Date.now()`).
- **Mitigación de guion:** el segmento de sync se ensaya **10 veces** con los mismos dos celulares y los mismos datos. `DEMO_MODE=1` congela la UI de conflictos (no muestra "pendiente de revisar" en vivo).
- **Mitigación de contenido:** nunca mostrar la cola de errores ni un toast de fallo en pantalla. El estado de sync es un semáforo mudo: verde "al día", ámbar "3 por enviar".
- **Plan de escape:** hay un video de 90 s grabado con todo funcionando.

### R2 · El backend o la red no están disponibles en el escenario *(prob. media · impacto alto)*

Causas reales: proyecto de Supabase pausado por inactividad (free tier: 1 semana), wifi del venue saturado, datos móviles del jurado, DNS. Medición: 49–215 ms de RTT y con cortes, en la misma sesión.

- **Mitigación:** la app **arranca y se demuestra sin red** (local-first, §4.4). El guion abre con el celular en modo avión y enciende la red **al final**, como cierre.
- `warm.yml` cada 6 h + `curl` manual 5 min antes de subir.
- `VITE_BACKEND=local` como interruptor de pánico (funciona 100% contra Dexie).
- Datos del demo **precargados** en el dispositivo que se va a usar (nunca "cargamos en vivo 40 personas").

### R3 · El OCR de cuaderno manuscrito *(prob. alta de fallar visiblemente · impacto medio)*

Tesseract declara que no sirve para manuscrito. Prometerlo y fallar en vivo es lo más caro que puede pasar con un jurado técnico.

- **Mitigación:** fuera del guion. El escaneo del demo es **QR de nuestro propio comprobante** (funciona siempre y se ve mágico: 0,3 s y aparece la ración).
- Si se quiere mostrar OCR: sobre una **lista impresa** y con fallback manual visible al lado.
- Lenguaje de producto: "escaneá el comprobante", nunca "escaneá el cuaderno".

### R4 · RLS mal escrito → fuga de datos de salud entre ollas *(prob. media · impacto muy alto)*

Un `where olla_id = ...` olvidado no es un bug cosmético: es el nombre y el embarazo de una persona expuesto a otra olla. Y con un repo público, el esquema es auditable por cualquiera.

- **Mitigación estructural:** default-deny (RLS activo sin policies), **una** policy de `select` por tabla, helper `app.mis_ollas()` en un solo lugar.
- **Test que bloquea el merge:** dos usuarios anónimos enrolados en ollas distintas; con el JWT de A se intenta leer, insertar y actualizar filas de B; **el test falla el build si alguna operación devuelve > 0 filas**.
- **Test de columnas:** con el rol `cocinera`, `select gestante, anemia from personas` debe fallar por privilegios. Si no falla, el grant está mal.
- **Revisión obligatoria** de `supabase/migrations/**` y `supabase/tests/**` (CODEOWNERS).

### R5 · La impresión falla en el hardware real *(prob. media · impacto medio)*

Medidas equivocadas (media etiqueta), térmica que solo acepta ESC/POS crudo y no PDF, fuente que no está, `@page size` ignorado por el navegador del jurado, o directamente no hay impresora.

- **Mitigación:** el A4 se valida **imprimiendo en papel** el día 1, no el día 3. La térmica se prueba con el modelo exacto, y si es Bluetooth puro, se decide ahí mismo si entra Capacitor (§10).
- **Diseño tolerante:** la plantilla térmica usa alto fijo y `overflow: hidden`; nada depende de grises; fuentes del sistema.
- **Plan B:** "Guardar como PDF" + compartir por WhatsApp. El comprobante impreso es valioso pero no es el core: el core es que la ración quedó registrada.
- **Riesgo operativo aparte (no técnico):** que las 3 personas se pisen en `main`. Mitigación en §12.3 (owners + contratos congelados + PRs chicos).

---

## 15. ADRs

### ADR-001 · Monorepo con pnpm workspaces + Turborepo
**Contexto:** 3 personas, un repo, 5 dominios que se mueven a distinta velocidad (dominio, nutrición, sync, UI, impresión). Nadie quiere ser el cuello de botella. **Decisión:** pnpm workspaces + Turborepo; `apps/web` y 5 paquetes con scope `@olla/*`; contratos congelados el día 1. **Consecuencias:** (+) `--filter` permite que cada quien corra solo su parte, cache local acelera CI y máquina, y un paquete roto no bloquea a los demás; (−) hay que mantener `package.json` por paquete y la trampa de `onlyBuiltDependencies` de pnpm 10 cuesta 40 minutos si se descubre tarde; se descarta Nx por peso conceptual y workspaces pelados por falta de orquestación.

### ADR-002 · Vite + React + TS como SPA (sin SSR)
**Contexto:** PWA offline-first para Android de gama baja, sin necesidad de SEO ni de first-paint desde servidor (la primera pantalla ya está en disco). **Decisión:** Vite + React 19 + TS, router en modo datos, estado de datos vía Dexie/`useLiveQuery`, sin React Query. **Consecuencias:** (+) bundle y arranque mínimos, cero runtime de servidor, Capacitor trivial, ecosistema React para todo lo que necesitamos; (−) se renuncia a las ventajas de Svelte en peso y a las de Next en SEO/imagen — ninguna de las dos importa acá; el presupuesto de 130–160 KB gzip hay que vigilarlo a mano.

### ADR-003 · Offline-first propio: Dexie + outbox + Lamport
**Contexto:** conectividad intermitente real; el sistema tiene que operar un turno completo sin red y converger después sin mentir sobre el inventario. **Decisión:** IndexedDB con Dexie como fuente de verdad; outbox append-only con ids UUIDv7 del cliente e idempotencia por id; reloj de Lamport; despensa y raciones como hechos append-only, no como contadores mutables; borrados lógicos. Se descartan PowerSync (otro servicio y otra cuota), ElectricSQL (solo lectura) y Realtime (no hace backfill). **Consecuencias:** (+) 500 líneas propias, diagnosticables, sin dependencias nuevas, y el modelo de datos es *explicable* en el pitch; (−) hay que escribir y testear el merge, y los bugs de sync son los más caros de encontrar; si el producto escala a 50+ ollas reales, migrar a PowerSync es la salida natural.

### ADR-004 · Supabase como único backend
**Contexto:** datos de salud con aislamiento por olla, 3 personas, 48–72 horas, free tier obligatorio. **Decisión:** Supabase (Postgres + RLS + Auth + Storage + Realtime opcional). Hosting estático en Cloudflare Pages. No se usa Cloudflare Workers/D1 como backend. **Consecuencias:** (+) RLS pone la autorización en la base y no en cada endpoint, un solo contrato (migraciones SQL + tipos generados), Auth y Storage incluidos, todo el stack es estándar y portable; (−) free tier con 2 proyectos y pausa por inactividad (mitigado con cron), 1 GB de storage, y latencia de 185 ms desde Lima que **no importa porque el camino crítico es local**; lock-in medio en Auth/Storage, bajo en los datos.

### ADR-005 · Auth por código de olla + PIN sobre usuarios anónimos
**Contexto:** la organizadora no tiene email y no se va a pagar SMS; pero RLS necesita un `auth.uid()` real. **Decisión:** `signInAnonymously()` para el dispositivo + RPC `enroll(olla_code, personal, pin)` que valida hashes y ata `auth.uid()` a una membresía; roles en `olla_members`; RLS por membresía; flags de salud fuera del alcance de `cocinera` vía vista + privilegios por columna. **Consecuencias:** (+) cero costo por usuaria, cero PII de contacto obligatoria, autorización real en la base, mínimo privilegio verificable; (−) la identidad está atada al dispositivo (se mitiga con código de respaldo y revocación), el alta requiere red una vez, y hay un rate limit de 30 anónimos/hora por IP que complica el desarrollo en equipo (se mitiga con `VITE_BACKEND=local`).

### ADR-006 · Impresión en cliente con HTML + `@media print`
**Contexto:** hay que imprimir en A4 (padrón, receta, solicitud) y en térmica 58/80 mm, sin red, desde un Android. **Decisión:** un modelo de `Documento` independiente de la presentación y dos renderers React (A4 / térmica) con CSS de impresión; `window.print()` como salida; `pdf-lib` opcional solo para un archivo compartible. Nada de PDF en servidor. **Consecuencias:** (+) cero dependencias, cero red, un solo sistema de maquetado para pantalla y papel, el equipo itera en CSS; (−) la salida depende del navegador (hay que verificar `@page size` y las fuentes), y la térmica por Bluetooth puro queda fuera del alcance de la PWA.

### ADR-007 · Escaneo por QR propio; OCR solo sobre texto impreso
**Contexto:** se pidió "escanear desde el celular" sobre cuadernos manuscritos y documentos. **Decisión:** el escaneo del producto es el **QR de nuestros propios documentos** (`BarcodeDetector` nativo + `zxing-wasm` de fallback); OCR con Tesseract.js **solo** como asistencia sobre listas impresas, en worker, con resultado siempre editable. Se descarta OCR en la nube por costo, offline y privacidad; se descarta escanear DNI por minimización de datos. **Consecuencias:** (+) una función que funciona el 100% de las veces y sin red, y no se promete lo que la tecnología no da; (−) el "escaneo de cuaderno" se convierte en "foto adjunta al día", que es menos vistoso pero es lo que la olla realmente necesita.

### ADR-008 · PWA primero; Capacitor diferido
**Contexto:** hace falta cámara, impresión y estabilidad en Android viejo, pero también un link que el jurado abra al instante. **Decisión:** PWA como entregable; ninguna feature importa `@capacitor/*`; todo pasa por `PrinterPort` y `platform/`. Capacitor se agrega solo si la impresora térmica Bluetooth entra al guion. **Consecuencias:** (+) instalación y actualización instantáneas, cero toolchain Android en 3 máquinas, y el APK sigue siendo posible sin reescribir; (−) sin ESC/POS nativo hasta que se agregue, y la app queda expuesta a que el sistema descarte la pestaña (IndexedDB sobrevive, el estado en memoria no).

---

## 16. Tabla de decisión consolidada (para pegar en el chat del equipo)

| Tema | Decisión | No hacer |
|---|---|---|
| Repo | Monorepo pnpm + Turborepo, `@olla/*` | Nx, carpetas sueltas |
| App | `apps/web` Vite+React+TS | `apps/api`, SSR |
| Estado | Dexie + `useLiveQuery` + un Zustand chico | React Query, Redux |
| Contratos | `domain/schema.ts`, `sync/types.ts` congelados H0 | Cambiarlos sin PR |
| IDs | UUIDv7 en el cliente | `bigserial`, `crypto.randomUUID()` sin orden |
| Tiempo | Reloj de Lamport + `device_id` | `Date.now()` para ordenar |
| Despensa | Movimientos append-only, saldo = suma | Contador mutable |
| Backend | Supabase (sa-east-1) | Workers+D1 como backend, dos backends |
| Auth | Anónimo + `enroll(código de olla, PIN)` | Email, SMS, `service_role` en el cliente |
| Salud | Flags fuera del alcance de `cocinera` | Diagnóstico en texto libre, DNI |
| Impresión | HTML + `@media print` | PDF en servidor, `@react-pdf` |
| Escaneo | QR propio + fallback manual | OCR de manuscrito |
| Hosting | Cloudflare Pages | Vercel (límites y términos hobby) |
| Sync extra | Realtime solo como "poke", apagado en demo | Realtime como transporte |
| Datos | Ficticios en `seed.sql` | Cualquier dato real, en cualquier rama |

---

## 17. Lo que no se pudo verificar

Marcado a propósito: son las cosas que hay que probar el día 1, no creer.

1. 🔶 **Precisión de Tesseract.js sobre las listas reales del equipo.** No hay muestras. La afirmación "el manuscrito no sirve" sí está respaldada por el FAQ oficial de Tesseract.
2. 🔶 **Tamaño exacto de `spa.traineddata` (fast vs best) y tiempo de OCR** en el Android objetivo (10–40 s es una estimación, no una medición).
3. 🔶 **Soporte de `@page { size: 58mm auto }`** en el navegador del jurado. Mitigación aplicada: alto fijo.
4. 🔶 **ESC/POS crudo por Bluetooth LE** desde Capacitor en la impresora concreta del equipo.
5. 🔶 **Latencias:** 6 muestras desde una sola conexión doméstica en Lima, con varianza alta (49–215 ms). No es un benchmark de red móvil en un comedor popular. `colo=MIA` fue lo que devolvió esta conexión; no se sabe si otro ISP peruano llega a un PoP en Lima.
6. 🔶 **Free tiers:** consultados el 2026-11-23 en las páginas oficiales (Supabase pricing, Cloudflare Workers/D1/R2/Pages/Workers AI pricing, PowerSync pricing). Cambian sin aviso.
7. 🔶 **PowerSync "desactivación por inactividad":** la tabla del plan dice 1 semana, una nota al pie dice 2. Verificar si se llega a usar.
8. 🔶 **Valores nutricionales:** este documento **no fija ni una kcal**. El motor debe tomar los requerimientos de una tabla citada (p. ej. Tablas Peruanas de Composición de Alimentos / requerimientos de energía del CENAN-INS) y cada número debe llevar `fuente` y firma de la nutricionista. Inventar cifras en un producto de salud es el peor atajo posible.
9. 🔶 **Prueba con TalkBack y con "Letra grande" del sistema** en un Android real: pendiente, 20 minutos, alto valor.

---

## 18. Fuentes

Todas consultadas el **2026-11-23**.

- Supabase — Pricing (free: 500 MB DB, 1 GB storage, 5 GB egress, 50 k MAU, 2 proyectos, pausa tras 1 semana; Realtime 200 conexiones / 2 M mensajes; Edge Functions 500 k): `https://supabase.com/pricing`
- Supabase — Regiones (única en Sudamérica: `sa-east-1` São Paulo; no se puede cambiar): `https://supabase.com/docs/guides/platform/regions`
- Supabase — Phone sign-in (requiere proveedor SMS: Twilio, MessageBird, Vonage, TextLocal): `https://supabase.com/docs/guides/auth/phone-login`
- Supabase — Anonymous sign-ins (`is_anonymous`, atado al dispositivo, límite 30 req/hora por IP, limpieza manual): `https://supabase.com/docs/guides/auth/auth-anonymous`
- Cloudflare — Workers pricing (free: 100 k req/día, 10 ms CPU/invocación; Durable Objects en free solo SQLite): `https://developers.cloudflare.com/workers/platform/pricing/`
- Cloudflare — D1 pricing (free: 5 M filas leídas/día, 100 k escritas/día, 5 GB, 10 DBs): `https://developers.cloudflare.com/d1/platform/pricing/`
- Cloudflare — R2 pricing (free: 10 GB-mes, 1 M Class A, 10 M Class B, egress $0): `https://developers.cloudflare.com/r2/pricing/`
- Cloudflare — Workers AI pricing (free: 10.000 neurons/día): `https://developers.cloudflare.com/workers-ai/platform/pricing/`
- Cloudflare — Pages limits (free: 500 builds/mes, 20.000 archivos, 25 MiB por archivo): `https://developers.cloudflare.com/pages/platform/limits/`
- PowerSync — Pricing (free: 2 GB sincronizados/mes, 500 MB alojados, 50 clientes concurrentes, 2 instancias, desactivación por inactividad): `https://www.powersync.com/pricing`
- Electric — Electric Sync (motor de **solo lectura** para Postgres, requiere servicio Elixir o Electric Cloud): `https://electric-sql.com/docs/intro`
- Tesseract — FAQ (*"Can I use Tesseract for handwriting recognition? You can, but it won't work very well, as Tesseract is designed for printed text."*): `https://tesseract-ocr.github.io/tessdoc/FAQ.html`
- Medición propia de latencia: `curl.exe -w "%{time_connect}"` contra `dynamodb.sa-east-1.amazonaws.com`, `dynamodb.us-east-1.amazonaws.com` y `cloudflare.com/cdn-cgi/trace` (que devolvió `colo=MIA`, `loc=PE`), 6 muestras por destino, desde una conexión doméstica en Lima.
- Entorno local verificado: Node 22.21.1, pnpm 10.18.2, npm 10.9.4, git 2.54.0.
