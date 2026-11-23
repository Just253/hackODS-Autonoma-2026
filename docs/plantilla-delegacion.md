# Contrato de delegación: 6 campos

Ningún encargo sale sin los seis. Un encargo de 800–1 500 caracteres alcanza; los prompts de 30 k
caracteres producen informes que el padre no puede integrar. La diferencia entre un hijo útil y uno
inútil no es el largo: es si la prueba es ejecutable y si el formato de retorno está acotado.

| # | Campo | Qué exige |
|---|---|---|
| 1 | **Rol** | Qué decide y qué **no** decide, en una frase |
| 2 | **Resultado** | Un entregable contable (tabla de N filas, parche que hace pasar un test), no un tema |
| 3 | **Prueba exigida** | Comando + salida esperada + evidencia citable (`archivo:línea`, cifra recalculable) |
| 4 | **Write-set** | Rutas exactas que puede escribir; todo lo demás es lectura |
| 5 | **Límites** | Prohibiciones nombradas (push, deploy, migraciones, secretos, datos reales) + presupuesto |
| 6 | **Formato de retorno** | Secciones fijas, tope de líneas, y qué hacer si no puede |

---

## Plantilla (copiar y pegar)

```text
Eres <ROL>: <qué decide y qué NO decide>.

CONTEXTO MÍNIMO (verificado; si algo es falso, PARÁ y decilo en la primera línea)
- Repo: <ruta>. Rama: <rama>. HEAD: <sha corto>.
- Issue: #<n>. Claim: <línea claim/v1>.
- Insumos a leer primero, en orden: <ruta1>, <ruta2>.
- Hechos que no hace falta re-verificar: <...>. Cada uno con su fuente.

RESULTADO ESPERADO
<Entregable concreto y contable. Ej.: "componente + test que falla sin el cambio";
"tabla de 5 filas: caso, entrada, veredicto, faltantes, por qué"; "veredicto con evidencia por criterio">.
Nada de "investigá sobre X".

PRUEBA EXIGIDA
1. `<comando exacto>` → esperado: <exit 0 / N tests / salida>.
2. <segunda comprobación independiente> → esperado: <...>.
3. Cada afirmación con evidencia citable: `ruta:línea`, `sha`, o cifra que yo pueda recalcular con el
   comando que indiques. Si no es verificable: "NO VERIFICABLE" y por qué.

WRITE-SET
- Podés escribir SOLO en: <rutas exactas>.
- Solo lectura: <rutas>.
- Prohibido escribir: <rutas compartidas: docs/planes, CHANGELOG, pnpm-lock.yaml, AGENTS.md>.

LÍMITES
- No commitees / no pushees / no mergees / no deployes: <lo que aplique>.
- No leas ni imprimas `.env`, tokens, `service_role` ni credenciales.
- No instales dependencias. No uses datos reales.
- Presupuesto: ≤ <N> min, informe ≤ <N> palabras / <N> filas.

FORMATO DE RETORNO (exacto, sin prosa alrededor)
## Veredicto
<hecho | no hecho | bloqueado + causa, 1–3 líneas>
## Evidencia
| # | Qué verifiqué | Comando | Salida (recortada) | Resultado |
## Cambios
<ruta — qué cambió — cómo lo verifiqué>
## Deuda y dudas
## Qué NO verifiqué

SI NO PODÉS
No improvises y no inventes. Devolvé ≤ 5 líneas: (1) qué falta exactamente, (2) qué comando lo
demuestra, (3) qué alternativa permitiría avanzar.
```

## Checklist del padre, antes de enviar

- [ ] ¿El hijo tiene las tools y las rutas que el encargo da por hechas? (preflight de capacidades)
- [ ] ¿El write-set es disjunto del de los otros hijos de la oleada?
- [ ] ¿La prueba se puede correr **hoy**, con el repo en ese estado?
- [ ] ¿El formato de retorno entra en mi contexto?
- [ ] ¿Escribí qué **no** debe tocar, por nombre?
- [ ] ¿Hay un `if no puede` explícito?

Si una respuesta es "no", el encargo todavía no está listo. Un hijo al que le falta una tool no falla
con elegancia: falla después de gastar el turno.

---

# Ejemplo 1 — Frontend

```text
Eres FRONTEND: implementás una pantalla en apps/web. No decidís reglas de negocio ni tocás la base.

CONTEXTO MÍNIMO
- Repo: C:\dev\hackODS-Autonoma-2026. Rama: feat/web-42-registrar-jornada. HEAD: 4f2a9c1.
- Issue #42: "registrar jornada sin conexión". Claim vigente en el issue.
- Leé primero: apps/web/AGENTS.md, packages/sync/AGENTS.md, .opencode/skills/pwa-offline/SKILL.md.
- Verificado: el outbox ya expone `encolar(item)` y `flush()`; `fake-indexeddb` ya está configurado.

RESULTADO ESPERADO
Pantalla `apps/web/src/pantallas/jornada/RegistrarJornada.tsx` que:
1. pide fecha, menú y raciones servidas;
2. valida con el esquema Zod de `@hackods/domain` (no reimplementes la validación);
3. encola en el outbox y muestra "pendiente de sincronizar";
4. al volver la red, sincroniza y cambia el badge.
Más un test de componente y un test de persistencia con la red apagada.

PRUEBA EXIGIDA
1. `pnpm --filter @hackods/web test` → verde, con 2 tests nuevos.
2. El test offline debe fallar si se quita el `encolar(...)` (demostralo con `git stash` o comentando
   la línea, y pegá las dos salidas: roja y verde).
3. Captura o video de 10 s: form → guardar → badge "pendiente" → online → "sincronizado".

WRITE-SET
- Escribir SOLO en: apps/web/src/pantallas/jornada/**, apps/web/src/pantallas/jornada/*.test.tsx.
- Solo lectura: packages/**, supabase/**, apps/web/src/lib/**.
- Prohibido: packages/ui (pedilo si falta un primitivo), docs/, pnpm-lock.yaml.

LÍMITES
- No agregues dependencias. No commitees, no pushees, no abras PR.
- No uses datos reales ni `service_role`. No llames a Supabase desde el componente.
- ≤ 25 min. Informe ≤ 30 líneas.

FORMATO DE RETORNO
## Veredicto
## Evidencia   (tabla: test | comando | salida)
## Cambios     (ruta — qué — cómo lo verifiqué)
## Deuda       (qué falta para que esto sea "listo para PR")
## Qué NO verifiqué

SI NO PODÉS: ≤ 5 líneas con qué falta, el comando que lo demuestra y la alternativa.
```

---

# Ejemplo 2 — Nutrición (contrato)

```text
Eres NUTRICIÓN: mantenés el contrato del motor. No investigás alimentos y no escribís cifras.

CONTEXTO MÍNIMO
- Repo: C:\dev\hackODS-Autonoma-2026. Rama: feat/contracts-51-veredicto. HEAD: 9c1e4ab.
- Issue #51: "veredicto con datos faltantes en el motor".
- Leé primero: packages/nutrition/AGENTS.md, .opencode/skills/nutricion-reglas/SKILL.md.
- Decisión vigente: el paquete NO contiene valores; la composición llega por `ProveedorComposicion`.

RESULTADO ESPERADO
1. `src/motor.ts` devuelve `{ veredicto, faltantes[] }` y **nunca lanza** por un `null`.
2. `insuficiente_datos` solo si falta edad o sexo; composición faltante → resultado parcial.
3. `fixtures/ingrediente-sin-dato.json` con `null` y `[valor a confirmar]`.
4. Un test con proveedor falso en memoria (sin red, sin archivos).

PRUEBA EXIGIDA
1. `pnpm --filter @hackods/nutrition test` → verde.
2. Tabla en el informe: `caso | entrada | veredicto | faltantes | por qué` (5 filas), con la salida del
   test pegada.
3. `rg -n '[0-9]+\s*(kcal|g\b)' packages/nutrition` → sin resultados: no se agregó ninguna cifra.

WRITE-SET
- Escribir SOLO en: packages/nutrition/src/**, packages/nutrition/fixtures/**.
- Solo lectura: packages/domain/**, apps/web/**, supabase/**.
- Prohibido: agregar CSV, tablas, valores de referencia o cambiar tests existentes.

LÍMITES
- No inventes valores ni "promedios razonables". No investigues alimentos. No des consejo médico.
- No commitees, no pushees, no abras PR.
- ≤ 30 min. Informe ≤ 40 líneas.

FORMATO DE RETORNO
## Veredicto
## Casos
| Caso | Entrada | Veredicto | Faltantes | Por qué |
## Cambios
## Pendiente de confirmar   (umbrales y valores, con quién los confirma)
## Qué NO verifiqué

SI NO PODÉS: ≤ 5 líneas. Si el encargo pide "poner los valores", eso no se hace en este repo: decilo y
pará.
```

---

# Ejemplo 3 — QA

```text
Eres QA VERIFICADOR: intentás falsar el PR #57. No confiás en su descripción y no arreglás nada.

CONTEXTO MÍNIMO
- Repo: C:\dev\hackODS-Autonoma-2026. PR #57 "fix(web): raciones duplicadas al reintentar", issue #44.
- El autor dice en `## Prueba`: `pnpm --filter @hackods/web test -- raciones`.
- Verificado: hay un worktree libre en ../wt/qa-57. El commit base es 4f2a9c1.

RESULTADO ESPERADO
Veredicto `approve` o `changes`, con evidencia por criterio de aceptación del issue #44. Si es
`approve`, la línea `review/v1` lista para pegar.

PRUEBA EXIGIDA
1. `gh pr checkout 57` en ../wt/qa-57; correr el comando de `## Prueba` y pegar la salida.
2. Volver a 4f2a9c1 y correr el mismo test: debe FALLAR. Si pasa, el test no prueba el bug → `changes`.
3. `gh pr checks 57 --required` y `gh pr diff 57 --name-only` contra el `files:` del claim.
4. Buscar secretos en el diff con `rg -i '(api[_-]?key|secret|token|passw|BEGIN .*PRIVATE)'`.
5. Reproducir el flujo real: con la red apagada, registrar 2 veces la misma jornada; contar filas en
   IndexedDB (no confiar en el toast).

WRITE-SET
- Escribir SOLO en: qa/evidencia/pr-57.md.
- Todo lo demás: lectura. Prohibido editar código, tests o configuración.

LÍMITES
- No commitees, no pushees, no apruebes, no mergees, no uses `--admin`.
- No imprimas secretos; si encontrás uno, archivo:línea y valor enmascarado.
- ≤ 20 min. Informe ≤ 40 líneas.

FORMATO DE RETORNO
## Veredicto
approve | changes | bloqueado — 1 línea
## Evidencia
| # | Criterio | Comando | Salida (recortada) | Resultado |
## Hallazgos
- severidad — archivo:línea — qué falla — cómo reproducirlo
## Qué NO verifiqué

SI NO PODÉS: ≤ 5 líneas con el comando que falla y el error exacto. "No pude correrlo" nunca es
"aprobado".
```

---

## Lo que invalida un encargo (aunque el prompt sea largo)

- Prueba que solo comprueba **existencia** ("¿está la cita?"), no contenido.
- Hechos pasados como verdad sin fuente ni fecha ("no re-litigar").
- "Sé cuidadoso" en vez de "no toques `X`, `Y`, `Z`".
- Sin tope de salida: el padre recibe 30 k caracteres y no los puede integrar.
- Dos hijos con el mismo título y el mismo write-set.
