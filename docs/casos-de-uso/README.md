# Casos de uso — la base para pensar antes de escribir código

Cada archivo de esta carpeta es **un caso de uso completo**: quién lo hace, qué toca en el frontend, qué
toca en el backend, cómo se prueba y qué queda afuera. La regla es simple: si una pantalla o una tabla no
aparece en un caso de uso de acá, todavía no sabemos para qué existe.

**Fuente del orden:** `../MODO-6H.md` §4, el guion de la demo. Los CU son los pasos del guion, en el
mismo orden. Un CU no es un CRUD ni una pantalla suelta: es algo que una persona logra hacer de punta a
punta, sin red y sin datos reales.

## Índice

| CU | Caso de uso | Guion | Área | Estado |
|---|---|---|---|---|
| [CU-01](./CU-01-arranque-offline.md) | Abrir la PWA en modo avión | 0:00 | web | PR #16 mergeado |
| [CU-02](./CU-02-alta-persona.md) | Dar de alta una persona sin nombre | 0:15 | web | PR #14, verde; espera review y merge |
| [CU-03](./CU-03-menu-firmado-raciones.md) | Servir el menú firmado y contar raciones | 0:40 | contracts + web | sin empezar |
| [CU-04](./CU-04-comprobante-revision.md) | Leer una boleta y revisar lo que no cuadra | 1:10 | web + contracts | sin empezar |
| [CU-05](./CU-05-presupuesto-alerta.md) | Ver cuánto queda y cuándo avisar | 1:40 | web + contracts | sin empezar |
| [CU-06](./CU-06-precios-mediana.md) | Ver si un insumo subió de verdad | 2:10 | web + contracts | sin empezar |
| [CU-07](./CU-07-entre-ollas.md) | Pedir a otra olla y comparar sin nombres | 2:30 | contracts + web | sin empezar |
| [CU-08](./CU-08-sync-visible.md) | De "N pendientes" a sincronizado | 2:50 | web + sync | sin empezar |
| [CU-09](./CU-09-cierre-honesto.md) | Decir lo que la app no hace | 3:00 | — | copy, sin código |

## Cómo se lee un caso de uso

- **Actor y objetivo**: quién lo usa y qué logra. Si no se puede decir en una frase, el CU está mal.
- **Flujo**: los pasos que se ven. El camino feliz, corto. Los bordes van en "Qué puede salir mal".
- **Reglas que mandan**: los `DEC` y el contrato que deciden. Sin ID, no es regla: es opinión.
- **Frontend**: ruta, qué lee de IndexedDB, qué escribe en el outbox, qué muestra cuando falta el dato.
- **Backend**: tabla, política RLS, evento de sync o función. `no aplica` es una respuesta válida en esta
  ventana, y se escribe igual.
- **Criterio de aceptación**: casillas verificables. **Prueba**: el comando y su salida esperada, con el
  rojo→verde que lo hace real.
- **Qué NO hace**: tan importante como el resto. Es lo que la demo dice en voz alta.
- **Preguntas abiertas**: lo que todavía no decidimos. Un CU sin preguntas abiertas suele estar mal
  mirado.

## Cómo se escribe uno nuevo

Copiá el formato de `CU-03` (el más completo). Tres reglas:

1. **Un CU, una frase de objetivo.** "Que la cocinera sepa cuánto le queda" es un CU; "pantalla de
   presupuesto" es una pantalla.
2. **Nada de números inventados.** Si no hay fuente, se escribe `sin dato` y se anota en preguntas
   abiertas.
3. **El backend se escribe aunque no exista todavía.** "Tabla `solicitudes`, RLS por olla, evento
   `solicitud.creada`" alcanza; dejarlo vacío es lo que después se convierte en sorpresa.

## Estado de la carpeta

Escrita el 2026-11-23 durante la ventana de 6 horas. La base es lo que ya está en `main` (contratos,
dominio, SQL, `packages/sync`, un `apps/web` mínimo y `src/pwa/`, que llega con el PR #16; esta rama es
anterior a ese merge y el PR #20 se rebasa sobre `main` al mergear), pero **no todos los
archivos citados viven ahí**: `Shell.tsx`, `data/base.ts`, `data/repositorio.ts`, `features/padron/` y
`features/servicio/` existen solo en el PR #14; `features/precios/` y `features/presupuesto/`, solo en el
PR #21; `features/comprobante/`, `features/solicitud/` y `features/reporte/` no existen en ninguna rama
todavía. Cuando un CU cita uno de esos archivos, lo dice en su tabla de Frontend. Esta misma carpeta
viaja en el PR #20. Cuando un CU cambia de estado, se cambia acá y en su archivo: dos lugares, no tres.
