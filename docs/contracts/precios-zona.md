# Contrato — precios por zona (`precios_zona`)

Issue #92 · ADR-0013 · migración `20261123220000_zonas.sql`.

## Tablas

| Tabla | Columnas | Notas |
|---|---|---|
| `zonas` | `id text pk`, `nombre text`, `distritos text[] null` | 3 filas fijas: `lima-sur`, `lima-este`, `lima-norte`. Catálogo de lectura para `authenticated`. |
| `precios_zona` | `id uuid pk`, `zona_id`, `insumo_id`, `canal`, `unidad`, `precio bigint`, `fecha date`, `fuente text` | `unique (zona_id, insumo_id, canal, fecha)`. `precio` en **microcentésimos por unidad base** (1 = 10⁻⁶ céntimo), igual que `precios.precio`. |
| `ollas.zona_id` | `text references zonas` | Nullable al migrar; backfill por `distrito`; `not null` solo si toda olla tiene zona. |

## Funciones

- `app.es_admin_global() → boolean` (`security definer`, `search_path=public`):
  true si el `auth.uid()` actual tiene `admin` en alguna olla (device no revocado).
- `app.mis_ollas() → setof uuid`: si `es_admin_global()` → todas las `ollas`;
  si no, las ollas de sus devices (`revoked_at is null`). Mismo contrato que antes
  para el caso no-admin.
- `app.mi_rol(uuid)` sin cambios: el rol sigue siendo por olla.

## Acceso (RLS)

| Operación | Quién |
|---|---|
| `select zonas` | `authenticated` (todas). |
| `select precios_zona` | Miembro de una olla de la zona **o** admin global. |
| `insert/update/delete/truncate` | Nadie desde el cliente: la ingesta es server-side. |

`anon` no lee ninguna de las dos tablas.

## Seed

`supabase/seeds/demo-grande.sql`: 3 zonas × 6 insumos × 7 fechas (2026-11-01..07) ×
2 canales = **252** filas, precio base µ¢ por zona (sur ×1,00 / este ×1,05 /
norte ×1,03) y misma cifra dentro de la zona. Cada olla de demo tiene
organizadora, cocinera y nutricionista distintas; el member `999` es admin global
de las 8. `scripts/seed-usuarios-demo.mjs` deja a `admin@demo.hackods.test` admin
en las 8 ollas.
