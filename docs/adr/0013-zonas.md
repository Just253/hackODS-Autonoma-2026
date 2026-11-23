# ADR-0013 — Zonas y precios por zona

**Estado**: aceptado (issue #92). **Contexto**: `ollas.distrito` era texto libre y
cada olla guardaba su propia serie de `precios`; dos ollas del mismo cono no
compartían nada y la demo duplicaba la serie 8 veces.

**Decisión**: `zonas` (catálogo fijo: `lima-sur`, `lima-este`, `lima-norte`, con
sus distritos) agrupa ollas por `ollas.zona_id` (backfill por distrito) y
`precios_zona` guarda **una** fila por `(zona, insumo, canal, fecha)`, en
microcentésimos por unidad base como `precios.precio`. La lee cualquier miembro
de una olla de la zona. La escribe el servidor: sin `INSERT` de cliente.

**Admin global**: `app.es_admin_global()` es true si el `auth.uid()` es `admin`
en cualquier olla; `app.mis_ollas()` devuelve entonces **todas** las ollas. El
rol sigue siendo por olla (`app.mi_rol`): el admin global opera la red, pero las
policies que piden rol en una olla concreta siguen filtrando por esa olla.

**Consecuencia**: la serie por olla (`precios`) no se toca; migrar la demo a la
serie de zona es un cambio de datos, no de modelo.
