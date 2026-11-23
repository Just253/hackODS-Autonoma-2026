---
name: Ollas comunes — dominio
description: Glosario, actores y reglas de negocio de una olla común peruana. Cargar antes de modelar entidades, escribir una pantalla de negocio o decidir qué dato se guarda.
---

# Ollas comunes: dominio

## Cuándo se carga

- Vas a crear o cambiar una entidad (`Persona`, `Olla`, `Insumo`, `Receta`, `Servicio`,
  `Movimiento`, `Comprobante`, `Presupuesto`, `Captura`).
- Una pantalla necesita saber **quién** puede hacer algo.
- Alguien propone guardar un dato nuevo de una persona.
- Hay que decidir qué cuenta como "ración", "menú" o "gasto".

## Glosario

| Término | Definición operativa | Fuente |
|---|---|---|
| **Olla común** | Organización vecinal autogestionada que cocina y reparte comida a bajo costo o gratis. No es un restaurante ni una ONG. | D4 |
| **Comedor PCA** | Comedor del programa de complementación alimentaria. **No es lo mismo** que olla común: cambia subsidio, cuota y defaults. | D4 (`Olla.tipo`) |
| **Persona** | Unidad del padrón. En la nube solo existe como `codigoP` `P-XXXX`; el nombre vive en el celular. | D2 |
| **Ración** | Porción servida en un servicio. **Es la unidad de conteo**; se anula, no se edita. | D3/D4 |
| **Menú firmado** | Menú semanal (2 perfiles × 2 opciones, 7 días, almuerzo y cena) aprobado por nutricionista con CNP y hash. | D3 |
| **Servicio** | Una comida servida: fecha, tipo, receta, comensales (`P-XXXX`), inocuidad. | D4 |
| **Movimiento** | Entrada, salida, merma, ajuste o transferencia de un insumo. Append-only; el saldo se deriva. | D4 |
| **Insumo** | Alimento o producto de despensa, con unidad base (`g`, `ml`, `unidad`) y equivalencia declarada. | D4 |
| **Receta** | Preparación con ingredientes, porciones base, técnicas y versión/hash. | D4 |
| **Comprobante** | Boleta, factura, declaración o captura manual/voz; ítems con revisión humana obligatoria. | D8/D9 |
| **Presupuesto** | Asignado, gastado, comprometido, disponible y proyección de una olla por período. | D8 |
| **Captura** | Ítems propuestos desde texto o voz, con montos ambiguos marcados para confirmar. | D9 |
| **Padrón** | Lista de personas de esa olla, identificadas por `P-XXXX`. | D2 |

Nunca uses "cliente", "usuario final" ni "beneficiario" como término de pantalla: se dice
**persona**, **cocinera**, **organizadora**, **nutricionista**.

## Actores y permisos

| Rol | Puede | No puede |
|---|---|---|
| Organizadora / admin | padrón, presupuesto, confirmar ítems de dinero | diagnosticar, cambiar un menú firmado |
| Cocinera | capturar ítems, movimientos, servir raciones | confirmar dinero ni leer flags de salud |
| Nutricionista | firmar el menú, definir porciones y sustituciones | editar el padrón ni el presupuesto |
| Voluntaria | cargar movimientos y raciones del servicio | editar el padrón |
| Donante | (fuera de la app) | ver padrón ni montos individuales |
| Soporte | leer metadatos, nunca datos personales | editar datos de una olla |

## Reglas de negocio

- **R1 — Una olla, un espacio.** Todo dato cuelga de `olla_id`. No hay consultas "globales" en la app.
- **R2 — La ración manda.** El conteo y el costo se expresan en raciones servidas, no en "platos".
- **R3 — El historial no se edita.** Movimientos, raciones y precios observados son **eventos**. Un
  error se corrige con un evento contrario (`ajuste`), no borrando.
- **R4 — Los totales se derivan.** El saldo de despensa, el gastado y el costo se calculan de los
  eventos. Un total guardado que se puede desincronizar es un bug.
- **R5 — Identidad mínima.** `codigoP` (`P-XXXX`) en el servidor; `nombreLocal`/`alias` solo en el
  dispositivo con `localOnly: true`. Sin documento, dirección, teléfono ni foto de personas.
- **R6 — Sin dato no es cero.** Si falta precio, cantidad o composición, el resultado es `sin_dato` y
  se muestra como tal.
- **R7 — El libro manda.** Si la app discrepa del cuaderno de la olla, gana el cuaderno hasta conciliar.
- **R8 — Funciona sin internet.** Toda escritura va al outbox; la UI nunca bloquea por red.
- **R9 — Conflicto de sync (D5).** Gana el cierre válido más antiguo por `(lamport, device_id)`; el
  otro queda visible. Nunca `Date.now()` para ordenar ni "el último gana".

## Lo que la app NO decide

- Quién recibe ración (lo decide la asamblea de la olla).
- El precio de la cuota.
- Un diagnóstico nutricional, una dieta o un requerimiento individual.
- Si una persona "merece" el apoyo.

## Errores de modelado frecuentes

1. Guardar `total_raciones` en el servicio **y** las raciones individuales → se desincroniza.
2. Usar la identidad como clave de una persona → PII y duplicados. La clave es `P-XXXX`.
3. Modelar una donación como ingreso de caja sin distinguir especie de dinero.
4. Un `olla_id` que llega por query string y se usa sin comprobar membresía → fuga entre ollas.
5. Tratar `comedor_pca` como una olla común: los defaults y el régimen son distintos.

## Fuente

- `docs/DECISIONES.md` D2/D3/D4/D5/D8/D9 — manda sobre este glosario.
- `docs/contracts/comprobantes.md` y `docs/contracts/sync.md` — tablas y fórmulas.
- Este skill fija vocabulario y forma del modelo, **no cifras**. Cuotas, precios y raciones típicas
  necesitan fuente o quedan `A CONFIRMAR`.
