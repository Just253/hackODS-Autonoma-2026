# CU-06 · Ver si un insumo subió de verdad

**Actor:** la organizadora que sospecha que el pollo está más caro que la semana pasada.
**Objetivo:** ver la variación de un insumo contra la **mediana** de sus últimas observaciones, con la
fuente y la fecha, sin que un outlier mueva la conclusión.

**Guion:** 2:10 (pollo +12 % contra la mediana de 7; **fixture a crear**: `supabase/seed.sql:59-65` no trae pollo)
**Área:** `web` + `contracts` · **Estado:** pantalla en `main` con 6 insumos (#61); detalle con precio típico y variación, datos fixture · Issue: #10

## Precondiciones

- Hay al menos **tres** observaciones útiles del insumo: `nMin = 3` es el mínimo para publicar mediana
  (`packages/domain/src/precios/serie.ts:94`); con menos, `muestraInsuficiente` y no hay flecha.
- Cada observación tiene canal y fuente en `precios`; la serie del dominio no los recibe (ver Frontend).
- La serie es inmutable: cada precio es un hecho con fecha, no un valor que se edita.

## Flujo

1. Se abre `/precios` desde el presupuesto o desde el menú.
2. La app lista los insumos con su última variación.
3. Se toca el pollo: serie de las últimas 7 observaciones con la mediana marcada. El % solo se muestra si
   hay N observaciones suficientes; si no, dice `sin dato`.
4. Al pie, la fecha de cada observación y el canal que viene de `precios`, no un promedio anónimo.
5. Si falta una observación, el punto se ve como hueco y dice `sin dato`: no se interpola.

## Reglas que mandan

- `DEC-2026-0004` — precio como **serie**: `insumo, canal (mayorista|minorista), unidad, precio, fecha,
  fuente, url`. Sin serie no hay "menú al costo" ni brecha.
- `DEC-2026-0008` — la tendencia se calcula contra la **mediana** de las últimas N observaciones, no
  contra un promedio que un outlier mueve.
- `DEC-2026-0007` — los precios de la demo son ficticios y se ven ficticios.

## Frontend

| Qué | Dónde | Detalle |
|---|---|---|
| Pantalla | `apps/web/src/features/precios/` | lista + serie del insumo elegido |
| Cálculo | `@hackods/domain` → `precios/serie` | `medianaMovil` devuelve `evaluadas`, `mediana`, `mad`, `minimo`, `maximo`, `muestraInsuficiente` y `p50Referencia` (`serie.ts:51-60`); **no** devuelve un % ni un campo de ventana: la ventana es el último `n` por fecha (`serie.ts:93-103`), y `mediana = null` con menos de 3 válidas (`serie.ts:157-158`) |
| Variación % | `apps/web/src/features/precios/tendencia.ts` (PR #21, rama `feat/web-10-presupuesto`, **no en `main`**) | `calcularTendencia` compara la mediana de la ventana actual con la de la previa y devuelve `variacionBp` (10000 = 100 %); sin ventana previa, `sinDato`. En `main` no existe: el % es un hueco |
| Gráfico | la pantalla | puntos con fecha; hueco visible cuando falta dato |
| Fuente | la pantalla | fecha por observación; el canal sale de `Precio.canal` (`packages/contracts/src/domain.ts:232-241`), no de la serie: `ObservacionPrecio` solo lleva `id`, `valor` y `fecha` (`serie.ts:19-23`) |

## Backend

| Qué | Dónde | Detalle |
|---|---|---|
| Tabla | `precios` | una fila por observación; nunca `update` de un precio pasado |
| Insumo | `insumos` | unidad base y equivalencias aprobadas |
| Evento | `evento_sync` | `entidad = 'precios'` (`20261123150000_modelo_base.sql:279-280`); no hay columna de tipo de evento: `precio.observado` es un nombre propuesto, no esquema |
| RLS | `precios_select` | solo lectura por olla (`20261123150000_modelo_base.sql:391-392`); **no hay policy de insert**, la observación entra por el outbox (`evento_sync_insert`, `20261123150000_modelo_base.sql:428-429`). `precios` tampoco tiene `device_id` ni `lamport` propios (`20261123150000_modelo_base.sql:101-112`): el orden lo lleva el evento |

## Criterio de aceptación

- [ ] La variación del pollo sale de la mediana de una sola ventana de N observaciones (`DEC-2026-0008`,
      `docs/DECISIONES.md:67`), nunca de un promedio.
- [ ] Un outlier que **pasa** el filtro MAD no mueve la tendencia; si se cambia la mediana por promedio,
      el test falla (ver Prueba).
- [ ] Cada punto muestra fecha, y el canal viene de `precios.canal`, no de `ObservacionPrecio`.
- [ ] Con menos de 3 observaciones válidas no hay mediana ni %: se muestra `sin dato`, no un cero.
- [ ] Una observación faltante deja un hueco visible, no un valor interpolado.
- [ ] La unidad se muestra normalizada (kg o L) y, si no se pudo normalizar, el ítem queda excluido de la
      comparación y lo dice.

## Prueba

```sh
pnpm --filter @hackods/domain test    # serie: mediana, outlier que pasa el filtro, muestra insuficiente
pnpm --filter @hackods/web test       # a escribir: no hay test de la pantalla de precios (ver CU-08)
pnpm verificar
```

Rojo→verde: con `[100_000, 100_000, 200_000]` el MAD es 0 y el respaldo `|x − mediana| > 3×mediana` no lo
excluye (`serie.ts:135-143`). La mediana da 100 000 y el promedio 133 333. Cambiar la mediana final por
promedio (`serie.ts:158`) tiene que romper el test. Un outlier que el filtro MAD ya excluyó (el de
`serie.test.ts:19-32`) no sirve para probar esto: se descarta antes de promediar.

## Qué NO hace

- No pronostica precios ni recomienda comprar.
- No compara precios entre ollas (el agregado es `CU-07`, y sin nombres de proveedores).
- No corrige una observación mal cargada: se agrega otra con la fecha correcta.

## Preguntas abiertas

- ¿N = 7 siempre, o depende del insumo? Hoy es una constante del dominio.
- ¿Qué hacemos con dos canales el mismo día (mayorista y minorista)? Se grafican juntos o se separan.
- ¿La variación es mediana actual vs mediana previa (lo que hace el PR #21) o contra la mediana de una
  sola ventana de 7 (`DEC-2026-0008`)? Hoy no coinciden.
- ¿`ObservacionPrecio` lleva `canal` y `fuente`, o la pantalla conserva los `Precio` y une por `id`? Hoy
  el tipo del dominio no alcanza para pintar el canal de cada punto.
