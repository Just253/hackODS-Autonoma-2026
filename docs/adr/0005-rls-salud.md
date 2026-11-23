# ADR 0005 — RLS por columna para los datos de salud de `personas`

- **Estado:** propuesto
- **Fecha:** 2026-11-23
- **Decisores:** B (area:api), revisa A
- **Issues:** #4

## Contexto

`personas` guarda `anemia`, `peso_kg` y `talla_cm` (Ley 29733, opt-in con
`consentimiento_seguimiento`). La única política de lectura de la tabla es
`personas_select`, que decide **por fila** (`olla_id in app.mis_ollas()`) y no
mira el rol: con `request.jwt.claims` de cocinera, `select anemia from personas`
devolvía el flag. Eso contradice la tabla de roles de `docs/ARQUITECTURA.md` §6.3
(la cocinera sirve la ración correcta sin ver el diagnóstico) y el criterio 1 del
issue #4. La #3 (nutricionista) pide lo simétrico: agregados sin identidad de
persona.

Restricciones del PR:

- `personas` es el modelo canónico y el PR #15 (en review) ya modifica el
  `supabase/seed.sql`: dividir la tabla o añadir columnas ahora genera conflicto
  y churn de modelo.
- `authenticated` es **un solo rol de base de datos** para todas las personas
  autenticadas: RLS y grants no distinguen "cocinera" de "nutricionista" por sí
  solos; el rol de olla vive en `olla_members` y se lee con `app.mi_rol()`.
- Medido en la DB local (Postgres 15.20, Supabase CLI 3.2.0):
  - `security_invoker = true` sobre una vista que lee `anemia` tras
    `revoke select (…)` falla con "permission denied for table personas".
  - `security_invoker = false` ejecuta la vista como su dueño (`postgres`), que
    **no** está sujeto a RLS: sin filtro en el SQL ve todas las ollas; y una
    policy sobre la vista se evalúa con los privilegios de quien consulta (que no
    puede leer `anemia`), así que no sirve para este caso.
  - Revirtiendo la migración, `supabase test db` falla; con una vista
    `security_invoker = true` en su lugar, la cocinera **sí** lee el detalle de
    salud (test 5 del 002).

## Decisión

Los datos de salud dejan de ser legibles por columna y pasan a leerse solo por
vistas, con el rol de olla aplicado dentro de la vista:

1. `revoke select on public.personas from authenticated` y
   `grant select` solo de las columnas no sensibles (`codigo_p`, `olla_id`,
   `anio_nacimiento`, `sexo`, `categoria`, `consentimiento_seguimiento` y
   auditoría). `notas` queda fuera.
2. `public.v_personas_salud` (`security_invoker = false`, filtra por
   `app.mis_ollas()` y `app.mi_rol(olla_id) in ('nutricionista','admin')`) da
   el detalle de salud: 0 filas para cualquier otro rol.
3. `public.v_salud_agregado` (mismo filtro) da conteos por olla y categoría
   (`personas`, `con_consentimiento`, `con_anemia`, `con_medida`,
   `peso_promedio_kg`), sin `codigo_p` ni filas individuales.

   Desvío consciente sobre "sin códigos P individuales": ese criterio del issue
   aplica a la lectura **agregada** (`v_salud_agregado`). `v_personas_salud` es
   el detalle y **sí** expone `codigo_p`, porque solo lo leen nutricionista y
   admin en sus ollas y sin el código no podrían cruzar la fila con un
   seguimiento; el código es seudónimo (D2) y aquí no revela identidad.
4. Las policies de `personas` no cambian: siguen siendo la frontera por fila.

`consentimiento_seguimiento` **sí** queda en el grant de la cocinera aunque es
adyacente a salud, a diferencia de `anemia`/`peso_kg`/`talla_cm`. Motivo: es un
booleano de proceso (¿entra al seguimiento?), no un dato clínico, y la app lo
necesita en el cliente para no ofrecer el flujo de seguimiento a quien no dio
consentimiento («negarse no le quita el plato», D2). Ocultarlo solo obligaría a
la UI a pedirlo por otra vista sin ganar privacidad: la categoría (`gestante`,
`nino`) ya denota condición, y el binario no permite inferir el diagnóstico.
Si el revisor considera el mínimo privilegio más estricto, moverlo a
`v_personas_salud` es un grant de columna de una línea y no rompe a los
consumidores del padrón que no lo piden.

## Alternativas descartadas

- **Dividir `personas` en `personas` + `personas_salud`:** cambia el modelo y el
  seed que ya toca #15; el contrato `personaSchema` y el sync tendrían que
  reintroducir un `join` por fila. Coste alto para un recorte de lectura que
  Postgres ya sabe hacer por columna.
- **Solo RLS (policy por rol):** RLS es por fila, no por columna. Una policy
  `mi_rol in ('nutricionista','admin')` sobre `personas` escondería la persona
  entera a la cocinera (no puede armar el padrón) y le mostraría a la
  nutricionista nombres/códigos de toda la olla sin recorte por columna.
- **Grants por columna sin vistas:** la cocinera pierde `select anemia` y la
  nutricionista también (mismo rol de DB); y PostgREST con `select=*` devolvería
  "permission denied for column" en vez de una lectura parcial. Admitido en
  `docs/ARQUITECTURA.md` §6.3 como paso intermedio, insuficiente solo.
- **Vista `security_invoker = true`:** medida y descartada: tras el revoke da
  "permission denied for table personas" al leer `anemia`, y con una variante
  que sí compila la cocinera lee el flag (rojo del 002).

## Consecuencias

- La cocinera conserva el padrón (código, olla, edad, sexo, categoría) y pierde
  los flags crudos: si en algún momento necesita el derivado, lo consumirá por
  una vista propia (la `v_raciones_del_dia` de §6.3 no existe todavía).
- Las vistas `security_invoker = false` se ejecutan como `postgres` y **no**
  aplican la RLS de `personas`: su `where` es la única frontera y cualquier
  cambio de política de `personas` debe replicarse ahí. El test 002 lo cubre.
- `authenticated` pierde `select notas` directo: nada del servidor lo consume
  (`packages/contracts/src/domain.ts` sigue teniéndolo en `personaSchema` para
  el sync local; si se necesita leerlo, va por una vista con el mismo patrón).
- Tooling: el camino real de PostgREST pasa por `authenticated` con LOGIN; bajo
  `supabase test db` el runner convierte el rol de conexión en NOLOGIN y dos
  sentencias relativas al rol no se pueden simular con `postgres` (dueño). El
  test usa `has_column_privilege` para la parte de privilegios y cambia de rol
  una vez por bloque de aserciones.
- Deuda: la tabla de roles de §6.3 también menciona `gestante` como flag oculto
  (hoy es `categoria`, que sí es necesaria para porcionar); documentar si el
  grupo "gestante" debe salir solo como `tipo_racion` en la vista de raciones.
