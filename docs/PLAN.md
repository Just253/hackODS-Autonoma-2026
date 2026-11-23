# 04 — Plan ejecutable: 3 orquestadores, un repo, una PWA para ollas comunes

**Producto:** PWA offline-first para ollas comunes del Perú (padrón de personas, despensa, recetas, motor nutricional explicable, solicitudes entre ollas, impresión/escaneo).
**Equipo:** 3 orquestadores (OpenChamber Desktop) + hasta 3 subagentes simultáneos cada uno, en 3 PCs distintas, un repo público `Just253/hackODS-Autonoma-2026` (hoy vacío).
**Protocolo base:** `_orquestacion-research/02-protocolo-coordinacion.md` (claims, labels `status:*`, draft PR temprano, gate con `## Prueba`, revisión cruzada). Este plan **no lo reemplaza**: lo instancia.
**Fecha:** 2026-11-23 · versión 1.0 · cambios por PR a este archivo.

> **Regla de lectura:** todo lo que sigue asume *cero código existente*. El repo está vacío, así que el día 1 incluye crear el repo, no solo poblarlo.

---

## 0. Dos escenarios, el mismo esqueleto

No hay duración confirmada del hackathon. El plan se escribe una vez y se **calibra** con dos presupuestos. Los milestones, el backlog, los contratos y el guion de demo son idénticos; cambia el reloj y el nivel de ambición por milestone.

| | **S72 — 72 h intensivo** | **S14 — 2 semanas** |
|---|---|---|
| Calendario | 3 días (D0, D1, D2) + demo | 10 días hábiles + 2 de colchón |
| Horas por persona | 10 h/día → ~90 h-persona | 4 h/día → ~120 h-persona |
| Horas **planeadas** (el resto es buffer) | 70 h-persona (≈78 %) | 96 h-persona (≈80 %) |
| Sincronía | 3 syncs/día (09:00, 13:00, 20:30) | 2 syncs/día (09:00, 18:00) |
| WIP por stream | 1 claim + 1 en review | 1 claim + 2 en review |
| Tamaño máximo de PR | 250 líneas | 400 líneas |
| Alcance realista | M0–M4 completos + M5 degradado + M6 | M0–M6 completos + M5 con sync real |
| Congelamiento antes de demo | últimas 6 h | último día completo |

**Presupuesto honesto:** 72 h de reloj **no** son 72 h de trabajo. Con 3 personas y sueño, el techo real es ~90 h-persona, y un hackathon consume ~20 % en coordinación, ferretería y demo. Por eso el plan planifica 70 h y trata el resto como colchón. Si el equipo decide dormir 6 h/noche en S72, se pierden ~18 h-persona: eso se paga con el plan de corte (§8.3), no estirando milestones.

**Mapa de milestones a los dos relojes**

| Milestone | S72 (reloj) | S14 (reloj) | Stream líder |
|---|---|---|---|
| M0 Cimientos + walking skeleton | D0 09:00 → 17:00 | Día 1 completo | A (integra) |
| M1 Padrón | D0 17:00 → D1 12:00 | Días 2–3 | A |
| M2 Despensa | D1 12:00 → 20:00 | Día 4 | B |
| M3 Motor nutricional | D1 12:00 → D2 10:00 | Días 4–6 | C |
| M4 Recetas, menú e impresión | D2 10:00 → 13:00 | Días 7–8 | C + A |
| M5 Solicitudes + sync | D1 12:00 → D2 13:00 (en paralelo) | Días 8–9 | B |
| M6 Demo-ready | D2 13:00 → 17:00 | Día 10 + colchón | A |

---

## 1. Milestones M0–M6

**DoD global (aplica a todos):** PR mergeado · CI verde · `## Prueba` con rojo→verde · criterio de aceptación checkeado uno por uno · sin secretos · rama rebasada · docs/ADR si cambió comportamiento · el camino del walking skeleton sigue verde (test de regresión `e2e/skeleton.spec.ts`).

### M0 — Cimientos y walking skeleton (día 1, no negociable)

| | |
|---|---|
| **Objetivo** | Repo operativo con protocolo aplicado, 3 streams con contratos congelados, datos sembrados, y **una persona registrada que ve su ración sin internet** |
| **Entregable demostrable** | En las 3 PCs: `pnpm i && pnpm seed && pnpm dev` → alta de persona → pantalla de ración con explicación → recarga con red apagada → sigue ahí. Tag `v0.1-skeleton` |
| **Criterio de hecho** | (1) `main` protegida, labels creados, plantillas de issue/PR y `CODEOWNERS` mergeados; (2) contratos v1 + esquema local v1 mergeados con 2 aprobaciones; (3) `pnpm -r typecheck && pnpm -r test` verde en CI y en las 3 máquinas; (4) e2e offline verde; (5) deploy preview accesible por URL; (6) 6 issues en `status:ready`; (7) `coordination` issue abierto con el primer `sync/` |
| **Dueño** | A (lead de integración). B entrega workspace/CI/seed; C entrega contratos y `calcularRacion()` v0 |
| **Riesgo de no hacerlo** | Sin M0 no hay paralelismo posible: cualquier stream que arranque antes escribe contra un contrato que todavía se mueve |

**M0 hora por hora (S72; en S14 se estira a un día con los mismos cortes)**

| Hora | Todos | A (web) | B (api/infra) | C (domain) |
|---|---|---|---|---|
| 09:00–10:00 | Repo, protección, labels, plantillas, 6 issues, `coordination` | — | workspace + CI + `pnpm` fijado | borrador de contratos |
| 10:00–12:00 | **Ventana de contratos** (nadie escribe código de feature) | shell PWA + Dexie spike | esquema SQL espejo + seed JSON | tipos + zod + `calcularRacion()` firma |
| 12:00–13:00 | PR de contratos #2 y #3 → 2 aprobaciones → merge (**freeze v1**) | consumo del contrato | `pnpm seed` idempotente | tabla de requerimientos mínima (6 filas) |
| 13:00–15:00 | Integración | formulario + persistencia | seed con 30 personas | `calcularRacion()` con 6 casos |
| 15:00–16:00 | — | pantalla de ración + "por qué" | deploy preview | pruebas de dominio |
| 16:00–17:00 | **Gate M0**: demo en las 3 PCs en modo avión; tag; sync de cierre | e2e offline | CI verde | revisión cruzada de A |

**Qué incluye "agentes" en M0** (si no está escrito, no existe):
- `AGENTS.md` en la raíz: stack, comandos, reglas de escritura por carpeta, qué nunca tocar.
- Roster de subagentes por stream con write-set explícito (§3.4).
- Plantilla de delegación de 6 campos (Anexo A) copiada en `docs/DELEGACION.md`.
- Límite: **3 hijos simultáneos por orquestador**, 1 solo con permiso de escritura por carpeta.

### M1 — Padrón de personas (adultos, niños, gestantes, anemia reportada)

| | |
|---|---|
| **Objetivo** | Registro real y editable de las personas de la olla, con categorías que el motor necesita, sin PII sensible |
| **Entregable demostrable** | Alta de 8 personas de un hogar, búsqueda por nombre, edición, baja lógica, contador por categoría; sobrevive recarga y reinicio |
| **Criterio de hecho** | Los 8 perfiles del fixture se cargan por UI (no por seed) en < 3 min; validaciones de edad/categoría bloquean datos imposibles; 0 campos de DNI/dirección/foto; e2e de alta+edición+recarga verde |
| **Dueño** | A. C define reglas de categoría; B garantiza el storage |
| **Corte si falta tiempo** | Se permite importar el padrón desde JSON de seed, pero el alta manual de **una** persona debe funcionar |

### M2 — Despensa e inventario

| | |
|---|---|
| **Objetivo** | Saber qué hay, cuánto y hasta cuándo, con movimientos auditables y sin conexión |
| **Entregable demostrable** | Entrada de 20 kg de arroz, salida de 3 kg, ajuste por conteo; semáforo de stock mínimo; alerta de vencimiento próximo |
| **Criterio de hecho** | Todo movimiento es un registro inmutable con autor y fecha; el saldo se **deriva** (nunca se escribe a mano); 3 movimientos en modo avión y recarga conservan saldo; alertas correctas contra fixtures |
| **Dueño** | B. A hace la pantalla; C valida unidades y equivalencias |
| **Corte** | Sin vencimientos, solo stock mínimo |

### M3 — Motor nutricional explicable

| | |
|---|---|
| **Objetivo** | Dada una persona (y opcionalmente el stock), devolver una ración sugerida **con razones legibles**, en modo automático o con ajuste de nutricionista |
| **Entregable demostrable** | Niño de 4 años con anemia reportada → ración A con 3 razones; gestante → ración B distinta; nutricionista ajusta +20 g de hierro y queda registrado quién, cuándo y por qué |
| **Criterio de hecho** | `calcularRacion()` es puro (sin IO, determinista, < 5 ms); toda ración trae ≥ 2 `reasons` en español legible; cobertura por nutriente calculada contra tabla versionada; override exige justificación y autor; 12 casos de prueba (4 categorías × 3 escenarios de stock) |
| **Dueño** | C. A consume; B no toca |
| **Corte** | Se cae el modo nutricionista (override), **nunca** la explicación |

### M4 — Recetas, menú del día e impresión

| | |
|---|---|
| **Objetivo** | Convertir stock + raciones en un menú cocinable y en una hoja de reparto imprimible |
| **Entregable demostrable** | Menú del día para 78 raciones calculado desde 5 recetas y el stock actual; hoja A5 imprimible con lista de personas y cantidades |
| **Criterio de hecho** | Escalado por raciones exacto (±1 g); el menú no propone un insumo con stock 0 (o lo marca faltante); impresión A5 en 1 página, legible en blanco y negro, sin depender de internet |
| **Dueño** | C (recetas + hoja), A (pantalla y CSS de impresión) |
| **Corte** | 3 recetas fijas, hoja A5 sin logo |

### M5 — Solicitudes entre ollas + sincronización

| | |
|---|---|
| **Objetivo** | Pedir insumos a otra olla y sincronizar cuando vuelva el internet, sin perder ni duplicar registros |
| **Entregable demostrable** | Dispositivo 1 (offline) crea solicitud; al reconectar se sincroniza; dispositivo 2 la ve y la acepta; ambos convergen al mismo estado |
| **Criterio de hecho** | Outbox persistente que sobrevive recarga; pull incremental por cursor; conflicto resuelto por LWW con `updated_at` + tombstone, **sin duplicados** (clave idempotente por `id`); estado de sync visible con pendientes y último error; prueba de convergencia de 2 dispositivos en CI |
| **Dueño** | B. A hace el indicador de sync y la bandeja; C no interviene |
| **Corte** | Es el primer candidato a caer (§8.3). Degradación: un solo dispositivo + badge "3 pendientes de subir" honesto |

### M6 — Demo-ready, accesibilidad y robustez

| | |
|---|---|
| **Objetivo** | Que la demo funcione 3 veces seguidas en el dispositivo objetivo, sin internet, en 6 minutos, y que lo que se promete sea defendible |
| **Entregable demostrable** | Build de producción instalado como PWA en un Android de gama baja; `demo-v1.json` congelado; guion impreso; panel de métricas; plan B en 3 niveles |
| **Criterio de hecho** | 3 corridas cronometradas ≤ 7 min, todas verdes; modo avión desde el segundo 0; JS inicial ≤ 250 KB gzip; TTI < 3 s con CPU 4× ralentizada; disclaimer visible en la pantalla de ración; `pnpm demo:reset` deja el estado inicial en < 2 s |
| **Dueño** | A, con B en deploy/backup y C en validación de textos nutricionales |

---

## 2. Walking skeleton

### 2.1 El camino mínimo (una sola frase)

> Una organizadora abre la PWA instalada, **sin internet**, registra a una persona (nombre, edad, categoría, anemia reportada), y ve **una ración sugerida con una explicación de por qué**, que sigue ahí después de recargar.

Ese camino es el **producto mínimo demostrable del ODS**. Todo lo demás (despensa, recetas, sync) lo hace útil, pero no lo hace *existir*.

### 2.2 Contrato del skeleton: 7 decisiones que no se mockean

Mockear es aceptable cuando el mock se tira sin tocar a nadie. Estas siete, si se mockean, obligan a reescribir el 30 % del código en el día 2:

1. **Persistencia real en IndexedDB** (Dexie), no `useState` ni `localStorage`. Es la promesa central y es lo que se demuestra.
2. **IDs y columnas de sync desde el registro #1**: `id` (UUID v4), `created_at`, `updated_at`, `deleted_at`, `device_id`. Agregarlas después toca todas las tablas y todos los formularios.
3. **`calcularRacion()` puro y separado de React**: `(persona, contexto) → Ration`. Si vive dentro del componente, no se puede probar ni reutilizar para el menú.
4. **Forma del payload de explicabilidad**: `reasons: string[]` + `coverage`. Se pueden inventar los números; no la estructura.
5. **Unidades canónicas** (g / ml / unidad) y conversión declarada por insumo. Cambiar de "kilos" a "gramos" a mitad de camino rompe stock, recetas y raciones a la vez.
6. **Frontera de storage** (`PersonRepo`, `StockRepo`, `RequestRepo`): la UI no conoce Dexie. Es lo que permite que M5 entre sin tocar pantallas.
7. **`NutritionPort` como interfaz**, aunque su única implementación sea una tabla de 6 filas en memoria.

### 2.3 Qué se puede mockear (y con qué se reemplaza)

| Se mockea | Cómo | Cuándo se reemplaza | Costo de tirarlo |
|---|---|---|---|
| Tabla de requerimientos nutricionales | 6 filas en `fixtures/requerimientos-v0.json`, con `version: "v0-borrador"` | M3 (#9) | 0: es un JSON |
| Autenticación / usuarios | Un solo usuario local "organizadora", `device_id` en localStorage | Post-MVP (fuera del hackathon) | 0 |
| Backend y sync | `NoopSyncAdapter` que registra en consola | M5 (#19) | 1 archivo, si el contrato existe |
| Recetas y menú | 3 recetas estáticas en fixture | M4 (#15) | 0 |
| Catálogo de insumos | 20 insumos con unidad y densidad | M2 (#12) | 0 |
| Impresión | `@media print` básico, sin plantilla | M4 (#17) | bajo |
| Escaneo de códigos/tickets | No se hace en el skeleton | Opcional post-M4 | — |

### 2.4 Qué NO se puede mockear aunque el reloj apriete

- La persistencia offline y su prueba (recarga + red apagada).
- La explicación de la ración: si la demo muestra un número sin razones, el producto pierde su diferencial y el jurado lo va a preguntar.
- Los datos sembrados con **nombres ficticios y sin PII real** (es requisito ético, no de tiempo).
- El disclaimer ("sugerencia, no diagnóstico") en la misma pantalla donde aparece la ración.

### 2.5 Presupuesto del skeleton

| Métrica | Meta | Cómo se verifica |
|---|---|---|
| Alta completa (usuario nuevo, celular) | ≤ 60 s | cronómetro en M0 y M6 |
| Toques hasta ver la ración | ≤ 6 | conteo manual en el e2e |
| Requests de red en el camino | 0 | DevTools offline + log del Service Worker |
| Persistencia tras recarga | 100 % | `e2e/skeleton.spec.ts` |
| Tiempo de `calcularRacion()` | < 5 ms | benchmark en el test de dominio |
| Líneas totales del skeleton | ≤ 900 (sin lockfile) | `git diff --stat` del PR #6 |

---

## 3. Tres streams, contratos primero

### 3.1 Reparto

| Stream | Persona | Área(s) (`area:*`) | Carpetas (dueño único) | Revisa |
|---|---|---|---|---|
| **A — Web, offline, UX** | Ana | `web` | `apps/web/**` | `api`, `domain` |
| **B — Datos, backend, sync** | Beto | `api`, `infra` | `packages/db/**`, `packages/sync/**`, `supabase/**`, `.github/**`, `scripts/**`, `infra/**` | `web`, `domain` |
| **C — Dominio, nutrición, impresión** | Caro | `domain` | `packages/domain/**`, `fixtures/**`, `docs/nutricion/**`, `apps/web/src/print/**` (por convenio, avisando a A) | `web`, `api` |
| **Compartido** | las tres | `contracts` | `packages/contracts/**` | 2 aprobaciones (una de cada consumidor) |

`packages/contracts/**` es caro a propósito: **un PR chico, solo contratos, mergeado antes** del código que lo usa. Nunca "aprovecho y agrego el tipo en el PR de la pantalla".

**Nota de adaptación al protocolo:** se agrega `area:domain` (C) y `infra` queda en B para que toda carpeta tenga un dueño. El resto de labels, claims y gate no cambia.

### 3.2 Contratos que se congelan antes de paralelizar (hito: D0 12:00)

Sin estos cinco archivos mergeados, **no se abre ningún claim de feature**. Los primeros 3 h del día 1 son la ventana más rentable del hackathon: dos días de paralelismo dependen de ellas.

**a) `packages/contracts/src/domain.ts`** — entidades y enums

```ts
export type Categoria = 'adulto' | 'adulto_mayor' | 'nino' | 'gestante' | 'lactante';
export type AnemiaReportada = 'si' | 'no' | 'sin_dato';
export type UnidadBase = 'g' | 'ml' | 'unidad';

export interface Persona {
  id: string;                 // UUID v4, generado en el cliente
  ollaId: string;
  alias: string;              // nombre o apodo; NUNCA apellidos completos en v1
  anioNacimiento: number;     // solo año: menos dato, misma utilidad
  categoria: Categoria;
  anemia: AnemiaReportada;    // "reportada por la organización", no diagnóstico
  pesoKg?: number;
  notas?: string;
  createdAt: string; updatedAt: string; deletedAt?: string | null;
  deviceId: string;
}

export interface Insumo {
  id: string; nombre: string; unidadBase: UnidadBase;
  gramosPorUnidad?: number;   // equivalencia declarada, no inferida
  stockMinimo: number; perecedero: boolean;
}

export interface MovimientoStock {
  id: string; insumoId: string; delta: number;  // en unidadBase, +/- 
  motivo: 'entrada' | 'salida' | 'ajuste' | 'merma';
  autor: string; at: string; createdAt: string; updatedAt: string; deletedAt?: string | null;
}

export interface Ration {
  personaId: string;
  components: Array<{ insumoId: string; gramos: number; grupo: string }>;
  totalKcal: number;
  coverage: { energia: number; proteina: number; hierro: number; vitC: number }; // 0..1+
  reasons: string[];          // ≥ 2, en español legible por la organizadora
  mode: 'automatico' | 'nutricionista';
  override?: { por: string; justificacion: string; at: string };
  tablaVersion: string;       // "v0-borrador" | "v1-revisada"
}
```

**b) `packages/contracts/src/ports.ts`** — las tres fronteras

```ts
export interface NutritionPort {
  calcularRacion(p: Persona, ctx: { stock: Record<string, number>; tabla: TablaRequerimientos }): Ration;
}
export interface PersonRepo {
  list(): Promise<Persona[]>;
  upsert(p: Persona): Promise<void>;
  softDelete(id: string): Promise<void>;
}
export interface SyncPort {
  push(): Promise<{ enviados: number; pendientes: number; error?: string }>;
  pull(cursor?: string): Promise<{ aplicados: number; cursor: string }>;
  status(): { pendientes: number; ultimaSync?: string };
}
```

**c) `packages/contracts/src/schemas.ts`** — zod espejo, más `TABLA_VERSION` y `SCHEMA_VERSION`.

**d) `packages/db/src/schema.ts` + `supabase/migrations/0001_init.sql`** — espejo exacto. Prueba obligatoria: `schema-parity.spec.ts` compara la lista de tablas y columnas de Dexie contra el SQL y falla si divergen. Es el antídoto contra "en local anda".

**e) `packages/contracts/src/seed.ts`** — tipos del seed, no los datos. Los datos viven en `fixtures/demo-v1.json`.

### 3.3 Decisiones que se toman el día 1 y no se reabren (ADR-001..005)

| ADR | Decisión | Por qué (y qué se evita) |
|---|---|---|
| 001 | **Offline-first real**: IndexedDB es la fuente de verdad; el backend es solo transporte | La olla no tiene internet. Si el backend es la verdad, el producto no existe en el 80 % de los casos |
| 002 | **Backend = Supabase (Postgres + RLS)**, sin servidor propio | CRUD + RLS en horas, no en días. Cloudflare Workers habría exigido escribir API y auth |
| 003 | **Sync = LWW por registro + tombstones**, no CRDT | Con 30 registros y 1 escritor por olla, un CRDT es sobre-ingeniería; LWW es explicable en la demo |
| 004 | **Unidades canónicas g/ml/unidad** con equivalencia declarada | Evita el bug clásico de kilos vs gramos en stock, recetas y raciones a la vez |
| 005 | **Privacidad mínima**: alias, año de nacimiento, sin DNI/dirección/foto; anemia = "reportada" | Dato de salud de menores en un celular compartido. Menos dato, menos riesgo y menos liability |

Cada ADR: 10 líneas, mergeado **antes** del código que lo usa.

### 3.4 Roster de subagentes y write-set

Máximo 3 hijos simultáneos por orquestador; **un solo escritor por carpeta**. Si un hijo necesita salir de su write-set, comenta y espera (no negocia con otro hijo).

| Orquestador | Subagente | Write-set | Nunca toca |
|---|---|---|---|
| A | `a-sub-ui` | `apps/web/src/**` | `packages/**` |
| A | `a-sub-e2e` | `apps/web/e2e/**` | `apps/web/src/**` |
| A | `a-sub-pwa` | `apps/web/vite.config.ts`, `apps/web/public/**` | resto |
| B | `b-sub-storage` | `packages/db/**` | `supabase/**` |
| B | `b-sub-sync` | `packages/sync/**` | `packages/db/**` |
| B | `b-sub-sql` | `supabase/**`, `scripts/**` | `packages/**` |
| C | `c-sub-nutrition` | `packages/domain/**` | `fixtures/**` |
| C | `c-sub-fixtures` | `fixtures/**` | `packages/domain/**` |
| C | `c-sub-print` | `apps/web/src/print/**` (por convenio, con aviso a A) | resto de `apps/web` |

---

## 4. Matriz de dependencias y camino crítico

### 4.1 Grafo de milestones

```
M0 ──┬──► M1 (padrón) ──┬──► M3 (motor) ──► M4 (recetas/menú/impresión) ──► M6 (demo)
     │                  │        ▲                                          ▲
     ├──► M2 (despensa) ┴────────┘                                          │
     │        │                                                             │
     └──► M5 (sync/solicitudes) ─────────────────────────────────────────────┘
```

M3 necesita M1 (personas con categoría) y M2 (stock, si la ración considera disponibilidad). M5 necesita **solo** los contratos y el esquema: por eso puede arrancar el D1 a mediodía, en paralelo con M3. Esa es la única ventana real de paralelismo de 3 vías.

### 4.2 Matriz de dependencias entre streams

| Necesita → | A (web) | B (api/db/sync) | C (domain) | contracts |
|---|---|---|---|---|
| **A (web)** | — | `PersonRepo`, `StockRepo`, `SyncPort` (firmas) | `calcularRacion()`, `Ration` | tipos, zod, versión de esquema |
| **B (api/db/sync)** | nada (solo consume el esquema) | — | nada | tipos + `SCHEMA_VERSION` |
| **C (domain)** | nada (función pura) | nada | — | `Persona`, `Insumo`, unidades |
| **contracts** | 1 aprobación | 1 aprobación | 1 aprobación | — |

**Lectura:** B es el stream menos acoplado (solo depende de contratos) y por eso es el que puede absorber el trabajo largo (sync). C tampoco depende de nadie si la función es pura. **A es el integrador**: siempre está esperando algo, y por eso su presupuesto incluye 30 % de slack.

### 4.3 Camino crítico

```
#2 contratos ─► #3 esquema ─► #4 calcularRacion ─► #6 walking skeleton ─► #8 padrón ─► #32 métricas ─► DEMO
                                    │                                    ▲
#5 seed ────────────────────────────┴────────────────────────────────────┘

Rama de riesgo (no crítica, pero la que rompe el reloj):
#3 ─► #19 sync ─► #20 pull ─► #22 solicitudes ─► #23 bandeja
```

**El camino crítico no incluye sync.** Ese es el hallazgo que ordena todo el plan: si sync falla, la demo sigue en pie; si `#4` o `#6` fallan, no hay demo.

### 4.4 Orden de merge por día (evita el "main rojo")

| Momento | Qué se mergea | Regla |
|---|---|---|
| D0 09:00–12:00 | Contratos `#2`, `#3` | 2 aprobaciones, nadie más pushea a `packages/contracts` |
| D0 12:00–17:00 | `#4`, `#5`, `#7`, `#6` (en ese orden) | `#6` es el último: es el que integra todo |
| D1 mañana | `#8`, `#9`, `#1` (si quedó) | 1 PR por stream por franja |
| D1 tarde | `#12`, `#13`, `#15` | B y C nunca mergean en la misma franja si tocan fixtures |
| D2 mañana | `#19`, `#20`, `#17`, `#18` | congelamiento de contratos ya vigente |
| D2 tarde | solo `fix/*` y `#34` | **nada de migraciones ni esquema** |

---

## 5. Backlog inicial (34 issues)

**Leyenda.** Tamaño: **S** ≤ 3 h · **M** ≤ 1 día · **L** ≤ 2 días (en S72, un L es una bandera roja: tiene que arrancar el D1 antes de las 12:00 o se corta). `blocked_by` usa los IDs de esta tabla. Los 6 primeros se abren el día 1 en `status:ready`; el resto se abre en `status:triage` **pero ya con criterio y prueba escritos**, así promoverlos es un cambio de label, no una reescritura.

| # | Título | Área | Tam | blocked_by | status | Criterio de aceptación (1 línea) | Prueba exigida |
|---|---|---|---|---|---|---|---|
| 1 | `[infra] Monorepo, CI, labels, plantillas y protección de main` | infra | S | — | **ready** | `main` protegida + labels + plantillas + CI que corre `typecheck` y `test` en cada PR | `gh pr checks` verde en un PR de prueba; `gh label list` con los 22 labels |
| 2 | `[contracts] Contratos v1 del dominio (tipos + zod)` | contracts | M | — | **ready** | `packages/contracts` exporta `Persona`, `Insumo`, `Ration`, `SyncPort` y zod valida los fixtures del seed | `pnpm -F contracts test` → `contracts.spec.ts` |
| 3 | `[contracts] Esquema de almacenamiento v1 (Dexie + SQL espejo + columnas de sync)` | contracts | M | 2 | **ready** | `schema.ts` y `0001_init.sql` declaran las mismas tablas/campos, con `id/created_at/updated_at/deleted_at/device_id` | `schema-parity.spec.ts` falla si divergen |
| 4 | `[domain] calcularRacion() puro + tabla de requerimientos v0` | domain | M | 2 | **ready** | 4 categorías devuelven `Ration` con ≥ 2 `reasons` y `coverage`, determinista y sin IO | `racion.spec.ts` (12 casos) |
| 5 | `[api] Seed de demo idempotente (1 olla, 8 personas, 20 insumos, 5 recetas)` | api | S | 2, 3 | **ready** | `pnpm seed` dos veces deja el mismo estado y `demo-v1.json` valida contra zod | `seed.spec.ts` |
| 6 | `[web] Walking skeleton: alta de persona → ración, offline` | web | M | 2, 3, 4, 5 | **ready** | Alta real, ración con explicación, y tras recargar con red apagada los datos siguen | `e2e/skeleton.spec.ts` con `context.setOffline(true)` |
| 7 | `[web] PWA instalable + cache del shell` | web | S | 1 | triage | Lighthouse "installable" y recarga offline sirve el shell | `lighthouse --only-categories=pwa` + captura |
| 8 | `[web] Padrón: listado, búsqueda, edición y baja lógica` | web | M | 6 | triage | 8 personas dadas de alta por UI en < 3 min, búsqueda por alias y baja que no borra historial | `e2e/padron.spec.ts` |
| 9 | `[domain] Requisitos por categoría y anemia reportada (tabla v1)` | domain | M | 4 | triage | Cada (categoría, anemia) tiene requerimiento declarado y trazable a fuente citada | `requisitos.spec.ts` + tabla con columna `fuente` |
| 10 | `[contracts] NutritionPort v1 + forma de Explanation` | contracts | S | 2 | triage | `Ration.reasons` y `coverage` congelados; cambio incompatible obliga a v2 | `contracts.spec.ts` con snapshot del tipo |
| 11 | `[domain] Modo nutricionista: override con justificación y autor` | domain | M | 10 | triage | Override exige justificación ≥ 20 caracteres y registra autor/fecha; sin override no hay campo | `override.spec.ts` |
| 12 | `[api] Inventario: movimientos de stock offline-first` | api | M | 3 | triage | Saldo derivado de movimientos inmutables; nunca se escribe un saldo a mano | `stock.spec.ts` (entrada/salida/ajuste/merma) |
| 13 | `[web] Despensa: semáforo, mínimos y último movimiento` | web | M | 12 | triage | Semáforo correcto contra 6 casos de fixture y movimiento nuevo visible sin recargar | `e2e/despensa.spec.ts` |
| 14 | `[api] Alertas de stock mínimo y vencimiento próximo` | api | S | 12 | triage | Alerta por insumo bajo mínimo y por lote que vence en ≤ 7 días, sin duplicados | `alertas.spec.ts` |
| 15 | `[domain] Recetas: escalado por raciones y aporte nutricional` | domain | M | 4, 9 | triage | Escalar de 10 a 78 raciones mantiene proporciones (±1 g) y recalcula cobertura | `recetas.spec.ts` |
| 16 | `[web] Menú del día desde stock + raciones` | web | M | 13, 15 | triage | El menú marca faltantes cuando el stock no alcanza y no propone insumos con stock 0 como disponibles | `e2e/menu.spec.ts` |
| 17 | `[domain] Hoja de reparto A5: modelo de datos + componente de impresión` | domain | M | 8 | triage | El modelo de hoja es puro y testeable; el componente imprime 1 página A5 legible en B/N, sin internet, con aviso a A por `files:` | `print.spec.ts` (modelo) + snapshot de página A5 |
| 18 | `[web] Modo baja alfabetización: iconos, texto grande y flujo de 3 toques` | web | M | 8 | triage | Alta completa en ≤ 6 toques con iconos y targets ≥ 44 px; texto base ≥ 18 px | `e2e/accesibilidad.spec.ts` + revisión visual |
| 19 | `[api] SyncPort + adapter Supabase (outbox, LWW, tombstones)` | api | L | 3 | triage | Outbox sobrevive recarga; push idempotente por `id`; sin duplicados tras 3 reintentos | `sync.spec.ts` con adapter en memoria |
| 20 | `[api] Pull incremental por cursor + resolución de conflictos` | api | M | 19 | triage | Dos dispositivos convergen al mismo estado; gana `updated_at` mayor; tombstone borra en ambos | `convergencia.spec.ts` (2 clientes simulados) |
| 21 | `[web] Estado de sync visible (pendientes, última sync, reintentar)` | web | S | 19, 20 | triage | Badge con pendientes reales; error de red no bloquea la app ni pierde datos | `e2e/sync-badge.spec.ts` |
| 22 | `[api] Solicitudes de insumos entre ollas` | api | M | 19 | triage | Crear/aceptar/rechazar con estados y autor; aceptar descuenta stock del que entrega | `solicitudes.spec.ts` |
| 23 | `[web] Bandeja de solicitudes entre ollas` | web | S | 22 | triage | Bandeja con 3 estados y acción de aceptar en ≤ 2 toques | `e2e/bandeja.spec.ts` |
| 24 | `[infra] Migraciones Supabase + RLS por olla` | infra | M | 3 | triage | Un usuario de la olla A no puede leer datos de la olla B (probado, no asumido) | `rls.spec.ts` contra instancia local |
| 25 | `[infra] Deploy preview por PR + URL de demo estable` | infra | S | 1 | triage | Cada PR tiene URL; `main` tiene URL fija usada en la demo | comentario automático del bot + `curl -I` 200 |
| 26 | `[web] Exportar/importar backup JSON` | web | S | 3 | triage | Export produce JSON válido contra zod; importar restaura sin duplicar IDs | `backup.spec.ts` |
| 27 | `[web] Accesibilidad: contraste, foco y lector de pantalla básico` | web | S | 8 | triage | 0 violaciones críticas de axe y navegación completa por teclado | `axe` en CI sobre 3 pantallas |
| 28 | `[infra] Presupuesto de rendimiento en gama baja` | infra | S | 7 | triage | JS inicial ≤ 250 KB gzip y TTI < 3 s con CPU 4× | `lighthouse-ci` con umbrales que fallan el PR |
| 29 | `[contracts] Versionado y migración de esquema local (v1→v2)` | contracts | S | 3 | triage | Una DB v1 migra a v2 sin perder filas; `SCHEMA_VERSION` se lee en runtime | `migracion.spec.ts` con DB sembrada v1 |
| 30 | `[docs] ADR-001..005 (offline-first, Supabase, LWW, unidades, privacidad)` | infra | S | — | triage | 5 ADRs de ≤ 10 líneas, mergeados antes del código que los usa | link en cada PR consumidor |
| 31 | `[docs] Guion de demo y demo-v1.json congelado` | infra | S | 5 | triage | Guion cronometrado ≤ 7 min y seed que reproduce exactamente lo que muestra el guion | 3 corridas cronometradas |
| 32 | `[web] Panel de métricas del demo` | web | S | 6, 17 | triage | Muestra personas, raciones del día, cobertura media y pendientes de sync, calculado del dato real | `e2e/metricas.spec.ts` |
| 33 | `[domain] Validación de la tabla nutricional con nutricionista` | domain | M | 9 | triage | Tabla revisada, con nombre y fecha de quien revisó; `tablaVersion = "v1-revisada"` | acta firmada en `docs/nutricion/` + test de versión |
| 34 | `[infra] Hardening de demo: reset, modo avión y plan B` | infra | S | 6, 21, 31 | triage | `pnpm demo:reset` deja estado inicial en < 2 s y la demo corre 3 veces seguidas sin internet | 3 corridas + checklist firmado |

**Dependencias que más importan** (si se rompen, se rompe el día): `2 → 3 → 4 → 6` es la cadena del día 1; `3 → 19 → 20 → 22` es la rama que se corta primero; `9 → 33` es la única que necesita un humano externo (nutricionista) y hay que agendarla **el día 1**, no el día 3.

---

## 6. Reglas de paralelismo para este proyecto

### 6.1 Nunca en paralelo (serializado, con dueño único)

| Recurso | Dueño | Regla |
|---|---|---|
| `supabase/migrations/**` | B | Una migración a la vez; se mergea sola; la siguiente espera. Nunca dos PRs con migración abiertos |
| `pnpm-lock.yaml` + `package.json` raíz + `pnpm-workspace.yaml` | B | Solo B los toca, en PR propio con título `chore(infra): deps`. Un conflicto de lockfile cuesta 40 min y no produce valor |
| `packages/contracts/**` | las tres | PR chico + 2 aprobaciones + merge antes del consumidor. Después de D0 12:00, **solo cambios aditivos** (agregar campo opcional); cambio incompatible = v2 |
| `packages/db/src/schema.ts` | B | Cambio de esquema = PR de contratos, no de feature |
| `apps/web/src/app/router.tsx` y el layout raíz | A | Archivo caliente: cambios por A, o por shim (el otro agrega su ruta en su propio módulo) |
| `fixtures/demo-v1.json` | C | Congelado al cierre del D1. Después, solo `#31` puede tocarlo, y avisa en `coordination` |
| `scripts/claim.sh`, `preflight`, `.github/**` | B | Cambiarlos a mitad de hackathon rompe a los otros dos |

### 6.2 Sí en paralelo, sin fricción

Pantallas de A (una por archivo de ruta) · reglas y casos de C en `packages/domain` (funciones puras, tests propios) · fixtures y docs de cada stream · tests e2e (archivo por flujo) · ADRs · el adapter de sync de B (no toca pantallas si `SyncPort` está congelado).

**Regla de oro del paralelismo:** dos agentes pueden escribir a la vez si y solo si (a) no comparten archivo, (b) no comparten esquema, y (c) el consumidor ya tiene el contrato mergeado. Si falta (c), el segundo escribe contra un stub en **su** carpeta y lo cambia después; nunca espera idle.

### 6.3 Cómo se parte un archivo caliente

Cinco estrategias, de la más barata a la más cara. Se elige la primera que funcione:

1. **Extender, no editar**: la ruta nueva va en su propio módulo y se registra con una línea. Un archivo de 20 líneas cambiado por PR es aceptable; uno de 300, no.
2. **Shim de interfaz**: el segundo agrega un adaptador en su carpeta y no toca el archivo ajeno (resuelve ~80 % de los casos).
3. **Partir por responsabilidad, en un PR de refactor sin cambio de comportamiento** (con test verde antes y después). Se hace **una sola vez**, el día 1, no el día 2.
4. **Dueño único temporal**: el dueño del área hace el cambio por los dos, en un PR que nombra a ambos issues. Cuesta ~1 h de espera, no un día.
5. **Congelar y degradar**: si el archivo es `schema.ts` o una migración y faltan < 6 h, el cambio no entra. Se anota como deuda con issue y se dice en la demo.

**Prohibido:** editar el archivo caliente "un poquito" mientras otro tiene claim vigente. Es el conflicto más caro y el más frecuente; el protocolo lo llama "el que más se repite porque el agente no siente el costo".

### 6.4 Ventanas de congelamiento

| Ventana | Qué se congela | Excepción |
|---|---|---|
| D0 12:00 | contratos v1 (solo aditivo después) | — |
| Cierre del D1 | `fixtures/demo-v1.json` | #31 |
| Últimas 6 h (S72) / último día (S14) | esquema, migraciones, dependencias, CI | `fix/*` con revisión de otro |
| Durante la demo | todo | nada |

---

## 7. Guion de demo (5–7 min)

**Setup previo (no se muestra):** PWA instalada en el Android de gama baja, `pnpm demo:reset` ejecutado, **modo avión activado desde antes de entrar**. El escenario es una olla común de Villa El Salvador con 78 personas. Todos los nombres son ficticios y el cartel "datos simulados" está visible en el pie.

| Tiempo | Qué se ve | Qué se dice | Por qué está acá |
|---|---|---|---|
| 0:00–0:35 | Portada con los ODS y el número sembrado "78 personas, 1 celular, 0 datos" | "Una olla común alimenta a 78 personas con un celular compartido y sin internet. ODS 2, 3, 10 y 12 se juegan acá." | Encuadre del ODS en 35 s; el dato está rotulado como simulado |
| 0:35–1:05 | Pantalla de padrón | "Hoy el registro es un cuaderno. Esto es lo mismo, pero que después sirve para decidir." | Muestra el problema sin dramatizar |
| 1:05–2:05 | Alta de Rosa, 34, gestante, anemia reportada | "Tres campos, seis toques, sin internet." | **El corazón del producto**: registro real en < 60 s |
| 2:05–2:50 | Pantalla de ración con `reasons` desplegadas | "Le sugiere esta ración y le dice por qué. La organizadora puede discutirlo: no es una caja negra." | Explicabilidad = diferencial defendible |
| 2:50–3:20 | Alta de un niño de 4 años, misma olla | "Cambia la persona, cambia la ración. Misma despensa." | Prueba de que hay motor, no una tabla fija |
| 3:20–3:55 | Despensa con semáforo + alerta de mínimo | "Sabe qué falta antes de cocinar, no después." | Conecta nutrición con logística |
| 3:55–4:30 | Menú del día desde stock | "El menú sale de lo que hay, para las raciones que hay." | Cierra el ciclo stock → ración → menú |
| 4:30–5:10 | Solicitud a otra olla, badge "1 pendiente", se apaga modo avión, sync, la otra olla acepta | "Sin internet también se pide. Cuando vuelve, se sincroniza; si no vuelve, nada se pierde." | Muestra la red de ollas y la honestidad del estado offline |
| 5:10–5:40 | Hoja A5 impresa (física, en la mano) | "Esto se imprime y se pega en la pared. No todos van a usar el celular." | Inclusión real: el papel sigue siendo interfaz |
| 5:40–6:30 | Panel de métricas + cierre | "Registramos 78 personas en X minutos, 100 % de las raciones explicadas, 0 datos que salieron del teléfono." | Cierra con lo medido, no con adjetivos |

### 7.1 Si falla el internet

El guion **asume** modo avión: internet no es parte del camino feliz. Entonces:
- Si no hay red y el sync no estaba probado: se muestra el badge "3 pendientes" y se dice exactamente eso. Un pendiente visible es más creíble que una demo que finge estar online.
- Si la otra olla no aparece: se muestra el registro de la solicitud en el dispositivo 1 y el `outbox` en la consola. Se dice: "la entrega la muestra el segundo dispositivo; hoy el segundo no está en esta sala".
- Nunca se dice "debería sincronizar".

### 7.2 Plan B en 3 niveles

1. **Falla la PWA**: segundo perfil de navegador en la misma laptop con el mismo seed (30 s de cambio).
2. **Falla el dispositivo**: video de 90 s grabado la noche anterior, mismos datos, mismas pantallas.
3. **Falla todo**: hoja A5 impresa + capturas + el panel de métricas en papel. La demo se cuenta igual, y se dice que el entorno falló (no el producto).

### 7.3 Qué se dice y qué no

**Se dice:**
- "Sugerencia basada en tablas de referencia, revisable por una nutricionista."
- "Registra anemia **reportada por la organización**, no diagnosticada."
- "Funciona sin internet porque la olla no tiene internet."
- "Los datos quedan en el teléfono; no pedimos DNI ni dirección."
- "Datos simulados para la demo."

**No se dice (y si lo pregunta el jurado, se responde con la verdad):**
- "Previene o trata la anemia." → Es un claim clínico y no está probado.
- "Diagnostica desnutrición." → No es un dispositivo médico.
- "Reemplaza a la nutricionista." → La reemplaza en la tarea repetitiva de calcular, no en el criterio.
- "Ya lo usan N ollas." → No hay usuarios reales; se dice "está diseñado con/para".
- "Cumple la norma X" / "avalado por el MINSA". → Sin convenio, no se afirma.
- Cifras de anemia o desnutrición sin fuente y fecha. → Si se usa una, va con fuente en pantalla.

---

## 8. Riesgos y plan de corte

### 8.1 Riesgos

| # | Tipo | Riesgo | Prob. | Impacto | Mitigación | Dueño |
|---|---|---|---|---|---|---|
| R1 | Técnico | Sync multi-dispositivo consume el doble de lo estimado (el clásico) | Alta | Alto | `SyncPort` mockeado desde D0; sync arranca recién con contratos congelados; se corta el D2 10:00 sin culpa | B |
| R2 | Técnico | Conflicto de lockfile / versiones distintas de Node en 3 PCs | Alta | Medio | `.nvmrc` + `packageManager` fijado + CI que falla si difieren; solo B toca deps | B |
| R3 | Técnico | Migración de esquema a mitad de camino obliga a reescribir storage | Media | Alto | Esquema v1 con columnas de sync desde el registro #1; `schema-parity.spec.ts`; `#29` para v1→v2 | B |
| R4 | Técnico | Service Worker sirve build viejo y la demo muestra una pantalla que ya no existe | Media | Alto | `skipWaiting` desactivado + `pnpm demo:reset` + verificación de versión visible en el pie | A |
| R5 | Técnico | Rendimiento en gama baja (JS pesado, mapa/gráficos) | Media | Medio | Presupuesto en CI (`#28`); cero librerías de gráficos; iconos SVG inline | A |
| R6 | Técnico | Impresión A5 sale distinta en cada navegador | Media | Bajo | Se imprime desde un solo dispositivo y se lleva impreso el resultado | C |
| R7 | Tiempo | M5 se come el D2 y arrastra M6 | Alta | Alto | Corte duro D2 10:00 con criterio escrito; M6 no se negocia | A |
| R8 | Tiempo | La validación con nutricionista no llega (persona externa) | Alta | Medio | Se agenda el D0; si no llega, `tablaVersion: "v0-borrador"` **visible en la demo** y se dice | C |
| R9 | Tiempo | El día 1 se va en ferretería (repo, CI, permisos) | Media | Alto | M0 con reloj y checklist; si a las 12:00 no hay contratos, se recorta el alcance de M0 a "skeleton sin PWA instalable" | A |
| R10 | Equipo | Tormenta de merges: 3 streams mergeando a la vez rompen `main` | Media | Alto | Una franja de merge por stream; `main` roto > 30 min se revierte sin discutir | las tres |
| R11 | Equipo | Nadie revisa (el revisor también está construyendo) | Alta | Medio | SLA de review 45 min; round-robin A→B→C; el review es la primera tarea del día, no la última | las tres |
| R12 | Equipo | Un integrante se cae (salud, trabajo, examen) | Media | Alto | Cada stream documenta su `handoff` en `coordination`; ningún conocimiento vive solo en una cabeza; el plan de corte asume 2 personas | A |
| R13 | Ético | Datos de salud de menores en un celular compartido | Media | Alto | Sin DNI/dirección/foto; alias y año; export con advertencia; borrado local; ADR-005 | C |
| R14 | Ético | La app se lee como diagnóstico o aval médico | Alta | Alto | Disclaimer en la pantalla de ración; "reportada" en la UI; guion §7.3; nutricionista en el equipo o en el acta | C |
| R15 | Ético | Sesgo: la categoría decide la ración y estigmatiza (p. ej. marcar "anemia" visible) | Media | Medio | La condición no se muestra en listados públicos ni en la hoja impresa; solo agrega componentes | C |
| R16 | Ético | Prometer impacto social sin evidencia | Alta | Medio | Métricas del demo son de producto, no de impacto; el impacto se plantea como hipótesis a medir | A |

### 8.2 Los tres riesgos que el plan realmente teme

1. **R1 (sync)** — no porque sea difícil, sino porque es *interesante*. Es el trabajo que un agente disfruta y que no agrega nada a la demo si el resto no está.
2. **R7 (M5 arrastra M6)** — la demo se pierde por no haber ensayado, no por no haber codeado.
3. **R14 (claim médico)** — un jurado con criterio castiga más una promesa falsa que una función faltante. Este riesgo no se mitiga con código.

### 8.3 Plan de corte (orden exacto de sacrificio)

Se corta **de arriba hacia abajo**, y cada corte se anuncia en `coordination` y se refleja en el guion. La regla es: **se corta alcance, no calidad de lo que queda**.

| Orden | Qué se sacrifica | Disparador | Qué se muestra en su lugar | Costo en la demo |
|---|---|---|---|---|
| 1 | #20, #22, #23 (pull incremental, solicitudes, bandeja) | D2 10:00 y sync no converge | Solicitud creada offline + badge "1 pendiente de subir" | Bajo: el offline se sigue demostrando |
| 2 | #19 completo (sync real) | D1 22:00 sin `sync.spec.ts` verde | Badge honesto + "el diseño está, la sincronización es lo próximo" | Bajo si se dice claro |
| 3 | #11 (modo nutricionista) | D1 20:00 | Solo modo automático; se nombra como próximo paso | Medio: se pierde el "humano en el loop" |
| 4 | #16, #15 recortado a 3 recetas fijas | D2 10:00 | Menú de 3 recetas, sin escalado libre | Bajo |
| 5 | #18 (baja alfabetización) recortado a texto grande + iconos | D2 11:00 | Se mantiene el flujo de 6 toques | Medio: es un diferenciador del ODS 10 |
| 6 | #17 (impresión) a hoja simple sin diseño | D2 12:00 | Hoja A5 en B/N, funcional | Bajo |
| 7 | #27, #28 (a11y avanzada y presupuesto de perf) | D2 12:00 | Se mide una vez y se reporta el número real | Bajo |
| **Nunca** | Offline real, `calcularRacion()` con `reasons`, seed, guion, panel de métricas, disclaimers, datos ficticios | — | — | Si falta esto, no hay demo: se cancela la demo y se presenta el diseño |

**Corte de emergencia (2 personas, < 12 h):** M0 + M1 + M3 recortado + guion. Seis pantallas, cero sync, cero recetas. Es una demo de 4 minutos y sigue siendo un producto coherente.

---

## 9. Métricas del hackathon

### 9.1 Producto (se miden y se muestran)

| Métrica | Meta | Cómo se mide | Dónde se prueba en el demo |
|---|---|---|---|
| Tiempo de alta de persona | ≤ 60 s (≤ 90 s en gama baja) | cronómetro, 3 corridas | en vivo, reloj en pantalla |
| Toques hasta la ración | ≤ 6 | conteo manual + e2e | contador visible en el guion |
| Raciones con explicación | 100 % | `coverage.reasons.length ≥ 2` en test | pantalla "por qué" |
| Funciona sin red | 0 requests en el camino | Playwright `setOffline` + DevTools | modo avión desde el inicio |
| Persistencia tras recarga | 100 % | e2e | recarga en vivo |
| Convergencia de sync | 0 duplicados, 0 pérdidas en 30 registros | `convergencia.spec.ts` | solo si M5 está vivo |
| JS inicial | ≤ 250 KB gzip | `lighthouse-ci` | panel de métricas |
| TTI en CPU 4× | < 3 s | Lighthouse con throttling | número en pantalla |
| Impresión A5 | 1 página, legible B/N | inspección + PDF | hoja física |
| Datos que salen del teléfono | 0 (sin cuenta, sin analytics) | revisión de red | se afirma y se muestra DevTools |

### 9.2 Proceso (se miden para el equipo, no para el jurado)

| Métrica | Meta | Cómo |
|---|---|---|
| Ciclo issue → merge | ≤ 8 h (S72) / ≤ 2 días (S14) | `gh issue list --json closedAt` vs `createdAt` |
| PRs con gate completo | 100 % | chequeo en el cierre del día |
| PRs ≤ 250/400 líneas | ≥ 90 % | `gh pr diff --name-only` + `--stat` |
| Tiempo de review | ≤ 45 min | timestamps del `review/v1` |
| Claims huérfanos | 0 al cierre del día | `preflight` sobre `status:claimed` |
| CI verde a la primera | ≥ 80 % | historial de runs |
| Bloqueos > 2 h | 0 sin escalar | `status:blocked` + `needs:human` |

**Regla:** las métricas de proceso se revisan en el cierre del día (§10) y sirven para **un** ajuste por día. No se convierten en un tablero que nadie mira.

---

## 10. Rutina diaria de los 3 orquestadores

### 10.1 Sync de 15 minutos (09:00)

Formato fijo, escrito en el issue `coordination` **antes** de hablar. Cinco líneas, sin prosa:

```
sync/2026-11-23T09:00Z @ana agent:ana-lead-3f2a
doing: #8 (claimed), #6 (in-review)
next: #18 después de #8; revisar #19 de @beto
blocked: #16 espera #15 (blocked-by), sin acción
risk: main se movió 9 commits, 2 ramas necesitan rebase
cut: ninguna hoy
```

Agenda de la llamada (solo si hay humano disponible; si no, es async):
1. **1 min** — ¿`main` está verde? Si no, es lo primero y no se discute nada más.
2. **4 min** — cada uno lee su `doing/next/blocked`. Nadie explica el "cómo".
3. **4 min** — conflictos de archivo: se comparan los `files:` de los claims vigentes. Si hay solape, se resuelve ahora (§6.3), no cuando aparece el conflicto.
4. **3 min** — revisión cruzada: quién revisa qué PR, con hora comprometida.
5. **3 min** — ¿se corta algo? Se decide con el plan de §8.3 y se anota la línea `cut:`.

**Salida obligatoria:** 0 o 1 decisión, y si es decisión, un ADR de 10 líneas mergeado antes de la hora siguiente. Un sync que termina sin decisión y sin ADR está bien; uno que termina con "después vemos" no.

### 10.2 Durante el día

- **Claim antes de escribir**, siempre, con `files:`. Sin claim no se toca el archivo, ni "un ratito".
- **Draft PR en el primer push**, aunque sea un commit vacío.
- **WIP limit:** 1 claim activo + 1 en review (S14: +1). Un tercer PR abierto es un PR que no se va a revisar.
- **Review round-robin:** A revisa B, B revisa C, C revisa A. SLA 45 min. El review se hace **corriendo el comando**, no leyendo el diff.
- **Bloqueado 30 min** → comentario con `blocked-by` + mención. **2 h** → humano y se cambia de tarea (no se espera idle).
- **Archivo caliente:** si hay que tocarlo y otro tiene claim, se pide al dueño. No se edita "en paralelo".

### 10.3 Cierre del día (30 min, 20:30 en S72 / 18:00 en S14)

1. **Drenar la cola de merge** (10 min): todo PR aprobado se mergea hoy. Un PR aprobado que duerme es trabajo terminado que no cuenta.
2. **Consolidado del día** (10 min): una entrada por stream en `docs/bitacora/d<NN>.md` con cuatro líneas — qué quedó funcionando, qué se rompió, qué se cortó, qué se decide mañana.
3. **Revisión de métricas de proceso** (5 min): ciclo, gate, huérfanos. **Un** ajuste, no cinco.
4. **Preparar mañana** (5 min): los issues del día siguiente quedan en `status:ready` con criterio y prueba; los claims se liberan o se renuevan con heartbeat; se actualiza `cut:`.

**Regla del cierre:** si el consolidado no está escrito, el día no cerró. Es el error que el historial marca como más caro ("3 de 40 sesiones sin veredicto final"): la oleada no termina cuando el último hijo devuelve, sino cuando el padre escribe la síntesis.

---

## Anexo A — Plantilla de delegación (6 campos, obligatoria)

```
ROL:          qué es este hijo (no "ayudante")
RESULTADO:    el artefacto exacto (archivo, test, sección) y dónde queda
PRUEBA:       el comando que el padre va a correr para validar; sin esto no se lanza
WRITE-SET:    rutas exactas donde puede escribir; todo lo demás es lectura
LÍMITES:      qué NO hacer (no tocar X, no instalar, no cambiar el esquema, máx N líneas)
RETORNO:      formato de salida (diff + rutas + salida del comando + qué no pudo hacer)
```

Sin `PRUEBA` no se lanza. Sin `WRITE-SET` no se lanza. Hijo que vuelve vacío = fallo explícito, **nunca** "terminado". Un reintento idéntico está prohibido: si falló, cambia el encargo o escala.

## Anexo B — Checklist del día 1 (S72, 09:00–17:00)

```
[ ] repo creado, main protegida (1 aprobación, checks, sin force)
[ ] 22 labels + plantilla de issue + plantilla de PR + CODEOWNERS
[ ] .nvmrc, packageManager, pnpm-workspace.yaml, CI mínimo
[ ] 6 issues en status:ready (backlog #1..#6)
[ ] issue coordination creado y fijado
[ ] contracts v1 + schema v1 mergeados (2 aprobaciones)  ← hito 12:00
[ ] pnpm seed corre 2 veces y es idempotente
[ ] pnpm -r typecheck && pnpm -r test verde en las 3 PCs
[ ] e2e offline verde (red apagada, recarga, datos siguen)
[ ] deploy preview con URL compartida
[ ] demo de 2 min en las 3 PCs; tag v0.1-skeleton
[ ] sync de cierre con la línea cut: y el consolidado del día
```

## Anexo C — Nombres de rama y PR en este proyecto

```
feat/web-6-walking-skeleton
feat/domain-4-calcular-racion
feat/api-19-sync-outbox
chore/infra-1-monorepo-ci
docs-30-adr-offline-first
fix/web-13-semaforo-stock
```

`<area>` ∈ `web | api | domain | infra | contracts`. El número de issue en la rama es lo que permite encontrar el trabajo desde `git branch -r` en dos segundos.
