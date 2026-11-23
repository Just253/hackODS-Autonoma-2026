---
name: Ollas comunes — dominio
description: Glosario, actores y reglas de negocio de una olla común peruana. Cargar antes de modelar entidades, escribir una pantalla de negocio o decidir qué dato se guarda.
---

# Ollas comunes: dominio

## Cuándo se carga

- Vas a crear o cambiar una entidad (`Jornada`, `Ración`, `Aporte`, `Socia`, `Insumo`).
- Una pantalla necesita saber **quién** puede hacer algo.
- Alguien propone guardar un dato nuevo de una persona.
- Hay que decidir qué cuenta como "ración" o "costo".

## Glosario

| Término | Definición operativa | Estado |
|---|---|---|
| **Olla común** | Organización vecinal autogestionada que cocina y reparte comida a bajo costo o gratis en su zona. No es un restaurante ni una ONG. | base |
| **Socia / socio** | Persona que aporta una cuota y recibe ración. Es la unidad del padrón. | base |
| **Ración** | Porción de comida servida en una jornada. **Es la unidad de conteo y de costo.** | base |
| **Cuota** | Aporte monetario periódico de una socia (diario o semanal, según la olla). | base |
| **Jornada** | Un día de cocina: menú, raciones preparadas, raciones servidas, quiénes cocinaron. | base |
| **Padrón** | Lista de socias/familias beneficiarias de esa olla. | base |
| **Despensa** | Insumos disponibles, valorizados o no según la olla. | base |
| **Donación** | Aporte en especie o dinero de un tercero, con o sin contraparte. | base |
| **Comité directivo** | Cargos de conducción (presidencia, secretaría, tesorería). Los nombres exactos varían por olla. | **A CONFIRMAR** |
| **PCA / MIDIS** | Programa estatal de complementación alimentaria que provee alimentos a comedores y ollas. El detalle de elegibilidad y entrega se documenta aparte. | **A CONFIRMAR** |
| **Municipalidad** | Puede proveer alimentos, agua, infraestructura o apoyo puntual. No es un rol único. | **A CONFIRMAR** |

Nunca uses "cliente", "usuario final", "beneficiario" como término de pantalla: se dice **socia**,
**cocinera**, **tesorera**.

## Actores y permisos (propuesta de la app)

| Actor | Puede | No puede |
|---|---|---|
| Cocinera / presidenta | abrir jornada, registrar menú y raciones, ver reportes de su olla | ver otra olla, cambiar precios del sistema |
| Tesorera | registrar aportes, compras y donaciones, cerrar caja | borrar movimientos (se compensan) |
| Socia | ver su estado de aportes y el menú del día | ver aportes de otras socias |
| Voluntaria | cargar raciones servidas de la jornada | editar el padrón |
| Donante | (fuera de la app, o portal aparte) | ver padrón ni montos individuales |
| Soporte | leer metadatos, nunca datos personales | editar datos de una olla |

## Reglas de negocio v0

Son **decisiones de diseño del equipo**, no hechos sobre todas las ollas. Si una entrevista las
contradice, se cambia la regla y se anota en `docs/dominio/`.

- **R1 — Una olla, un espacio.** Todo dato cuelga de `olla_id`. No hay consultas "globales" en la app.
- **R2 — La ración manda.** Todo se mide en raciones servidas y costo por ración; no en "platos" ni
  "porciones" sueltas.
- **R3 — El historial no se edita.** Aportes, compras y donaciones son **eventos**. Un error se corrige
  con un evento contrario (`ajuste`), no borrando.
- **R4 — Los totales se derivan.** El total del mes, el saldo de despensa y el costo por ración se
  calculan de los eventos. Si un total está guardado y se puede desincronizar, es un bug.
- **R5 — Sin datos personales innecesarios.** Alias + id local. Sin DNI, sin dirección, sin teléfono,
  sin diagnóstico, sin foto de personas.
- **R6 — Sin dato no es cero.** Si falta el precio o la cantidad, el resultado es `sin_dato` y se
  muestra como tal.
- **R7 — El libro manda.** La app digitaliza el control; si discrepa del cuaderno de la tesorera, gana
  el cuaderno hasta conciliar. La app no acusa a nadie.
- **R8 — Funciona sin internet.** Toda escritura va al outbox; la UI nunca bloquea por red.

## Lo que la app NO decide

- Quién recibe ración (lo decide la asamblea de la olla).
- El precio de la cuota.
- Un diagnóstico nutricional o una dieta.
- Si una persona "merece" el apoyo.

## Errores de modelado frecuentes

1. Guardar `total_raciones` en la jornada **y** las raciones individuales → se desincroniza.
2. Poner el nombre completo como clave de socia → PII y duplicados.
3. Modelar la donación como ingreso de caja sin distinguir especie de dinero.
4. Un `olla_id` que llega por query string y se usa sin comprobar membresía → fuga entre ollas.

## Fuente

- `docs/dominio/` (entrevistas y observación del equipo) — **es la fuente de verdad**.
- Este skill fija vocabulario y forma del modelo, **no cifras**. Cuotas, raciones típicas y precios
  viven en `docs/dominio/cifras.md` con fuente y fecha.
- Lo marcado `A CONFIRMAR` no se usa para tomar decisiones: se pregunta primero.
