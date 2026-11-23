---
name: Testing y fixtures
description: Cómo se arman datos de prueba deterministas, qué se finge y qué no, y qué prueba exige un bug. Cargar al escribir tests, fixtures, seeds de prueba o al reportar un bug.
---

# Testing y fixtures

## Cuándo se carga

- Vas a escribir un test (unidad, componente, integración, e2e).
- Necesitás datos de prueba y no querés copiar producción.
- Alguien dice "en mi máquina anda".
- Hay que reportar un bug con reproducción.

## Capas

| Capa | Herramienta | Qué cubre | Velocidad |
|---|---|---|---|
| Unidad | Vitest | dominio, nutrición, sync (puro) | ms |
| Componente | Testing Library | formularios, estados, accesibilidad | < 1 s |
| Integración | Vitest + MSW | cliente HTTP, outbox, adaptadores | < 2 s |
| Offline | `fake-indexeddb` | persistencia, reintentos, conflictos | < 1 s |
| E2E | Playwright | flujo real, offline, impresión | 10–60 s |
| RLS | `supabase test db` | aislamiento entre ollas | segundos |

La pirámide se respeta: si un caso se puede probar en unidad, no se prueba en e2e.

## Reglas de un fixture

1. **Determinista**: reloj inyectado, ids fijos, cero `Math.random()` y cero `Date.now()` dentro del
   código bajo test.
2. **Sintético**: alias (`socia-01`), montos redondos, fechas del dataset canónico. Nunca datos reales.
3. **Explícito**: un builder con overrides, no un JSON gigante que nadie entiende.
4. **Compartido cuando es canónico**: hay **un** dataset de demo (`fixtures/canonico.json`) que usan los
   tests y `/seed demo`. Si se duplica, se desincroniza.
5. **Sin red**: MSW o un doble en memoria. Un test que llama a Supabase no es un test, es una demo.
6. **Legible al fallar**: el nombre del test dice el caso (`rechaza ración negativa`), no `test 1`.

## Dataset canónico

```text
fixtures/canonico.json
  ollas:      2  (una con datos completos, una casi vacía para estados vacíos)
  socias:     8  (alias, sin PII)
  jornadas:   30 (fechas fijas desde 2026-11-01)
  recetas:    5  (una con ingrediente faltante a propósito → sin_dato)
  conflicto:  1  (mismo insumo editado en dos "dispositivos")
```

Los ids son UUIDv7 fijos (no generados al vuelo) para que los snapshots y los tests de sync sean
estables. El seed SQL usa los mismos ids; un test verifica que los conteos coinciden.

## Qué se finge y qué no

| Se finge | No se finge |
|---|---|
| Reloj (`now`) | El cálculo de una ración |
| Generador de ids | La suma de aportes |
| Red (MSW) | El esquema Zod |
| IndexedDB (`fake-indexeddb`) | Las reglas de dominio |
| Cámara / archivos | El redondeo |
| Geolocalización, notificaciones | La política RLS (se prueba de verdad) |

Fingir el cálculo es cómo se publica un número falso con un test verde.

## Protocolo de un bug

1. **Reproducir** con un comando y pegar la salida (incluido el commit).
2. **Escribir el test que falla** en el estado actual. Pegar la salida roja.
3. Arreglar. El mismo test pasa. Pegar la salida verde.
4. Nada se declara resuelto sin los dos colores. "Debería andar" no es evidencia.

## Reglas anti-flaky

- Sin `waitFor` con tiempo arbitrario: esperar por condición observable.
- Sin orden de tests dependiente: cada archivo arranca de cero.
- Sin fechas "de hoy" en asserts: usar el reloj fijo.
- Un test que falla 1 de 20 veces se arregla o se borra; no se reintenta en CI.
- Los e2e corren contra un build, no contra el dev server (el dev server esconde errores de producción).

## Comandos

```bash
pnpm test                 # todo
pnpm test --filter @hackods/nutrition
pnpm test -- -t "ración negativa"
pnpm test:e2e
pnpm exec supabase test db
```

## Fuente

- `packages/*/AGENTS.md` (qué se testea en cada paquete).
- `docs/PROTOCOL.md` Anexo B (qué va en `## Prueba`).
- Vitest, Testing Library, MSW, Playwright, `fake-indexeddb`: documentación oficial.
