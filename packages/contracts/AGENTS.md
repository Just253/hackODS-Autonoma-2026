# AGENTS.md — `packages/contracts/`

Tipos Zod compartidos: la única fuente de verdad de los contratos que cruzan paquetes.
Cualquier cambio acá necesita **2 aprobaciones** y se mergea **antes** de su consumidor
(`AGENTS.md` raíz §5, `docs/DECISIONES.md` D-refs en `docs/FUENTES.md`).

## Reglas locales

1. Un schema dice lo que la red y la base aceptan: nada de campos "por si acaso". Si el
   servidor no lo concede, no es requerido (p. ej. datos de salud en `personaSchema`,
   opcionales desde #4).
2. Dinero en enteros, nunca floats: céntimos en `centimosSchema`, microcentésimos por
   unidad base para precios (`comprobantes.md` §1; ADR-0004 para la tabla `precios`).
3. `menuTemplate.hash` es el **SHA-256 hex (64, `^[0-9a-f]{64}$`)** de la serialización
   canónica del menú (`packages/domain/src/servicio.ts`): un hash que no es derivable del
   contenido no sirve de sello. El seed lo firma de verdad.
4. Identidad: `codigoP` (`P-XXXX`); DNI, nombres, teléfono y dirección no tienen schema (D2).
5. Cambio incompatible = `v2` en paralelo, nunca edición in-place de un schema consumido.
6. `ItemPresupuestable` es un tipo **branded** (`.brand<'ItemPresupuestable'>()`): un
   `ComprobanteItem` sin confirmar NO es asignable donde se exige (revisión del PR #29).
   Los refinements de Zod no cambian el tipo — la garantía la da la marca, no el `.refine`.

## Dueño y revisión

Dueño: **C** (`area:contracts`); revisan A y B (2 aprobaciones). El canónico de cada tema
está en `docs/FUENTES.md`; si un doc no figura ahí, no decide.
