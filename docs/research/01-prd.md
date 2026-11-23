# 01 — PRD técnico base: PWA para ollas comunes

**Producto:** PWA offline-first para registrar personas, despensa, recetas y servicios de una olla común, evaluar la dieta del servicio con criterios versionados y permitir validación por nutricionista (presencial o remota).
**Alcance de este documento:** lo mínimo que el equipo de desarrollo necesita para arrancar (roles, vocabulario, entidades, flujos, bordes). La investigación de dominio, cifras y marco normativo la hace el usuario por fuera de este archivo.

Convenciones: `[dato a confirmar: …]` = decisión que depende de investigación o del usuario, no se inventa. Todo identificador se genera en el cliente (ULID) para poder crear registros sin red.

---

## 1. Personas y roles

| Rol | Quién es | Qué hace en la app | Qué NO hace | Dispositivo típico |
|---|---|---|---|---|
| **Organizadora** | Dirigenta/presidenta de la olla; administra el padrón y las cuentas. Baja alfabetización digital. | Da de alta personas y hogares, carga despensa, planifica el servicio, imprime, autoriza pedidos a otras ollas, invita usuarios. | No valida nutricionalmente (salvo que además sea nutricionista). | Celular de gama baja, uso principal |
| **Cocinera** | Quien cocina ese turno; puede rotar. | Ve el menú del día y las raciones a preparar, descuenta insumos usados, registra lo que realmente se cocinó y las raciones entregadas. | No edita el padrón ni el dictamen nutricional. | Celular, manos ocupadas → UI de 2 toques |
| **Nutricionista** | Profesional que valida la dieta; presencial o remota. No es miembro permanente. | Revisa la evaluación automática, ajusta recetas/porciones, emite dictamen con nota, define o corrige dietas especiales. | No ve datos de contacto ni identidad completa de las personas; solo lo necesario (grupo, banderas, dieta). | Notebook o celular, sesión temporal |
| **Familia beneficiaria** | Hogar que recibe raciones. **No tiene cuenta en v1.** | Nada dentro de la app: recibe comprobante impreso/QR de sus raciones o consulta con la organizadora. | No inicia sesión, no ve el padrón, no ve banderas de otros. | — (papel o el celular de la organizadora) |
| **Olla (organización)** | El tenant: una olla = un espacio de datos aislado. | Es sujeto de configuración: padrón propio, despensa propia, criterios vigentes, folios propios, directorio de ollas vecinas. | No es un usuario: no inicia sesión. | — |

Reglas de acceso:
- Una persona puede tener membresía en más de una olla (ej. nutricionista de la red), con rol distinto por olla.
- La nutricionista remota tiene acceso **de solo lectura al padrón agregado** y escritura solo en dietas y dictámenes.
- Las banderas de salud (anemia, alergia, embarazo) son visibles solo para organizadora y nutricionista; la cocinera ve únicamente la instrucción operativa ("ración sin maní", "porción reforzada").
- Toda acción sensible (cambio de dieta, dictamen, borrado) queda en bitácora con usuario, fecha, dispositivo.

---

## 2. Glosario del dominio (definiciones operativas)

- **Olla**: organización autogestionada con padrón, despensa, cocina y responsables propios. Unidad de aislamiento de datos y de folios. Tiene al menos una persona responsable y un horario de servicio.
- **Persona**: individuo que recibe raciones de la olla. No es usuario de la app. Se identifica por nombre + hogar; puede tener banderas (anemia, alergia, embarazo) y una dieta asignada. Puede estar activa, inactiva o fallecida/retirada.
- **Hogar**: grupo de personas que reciben juntas (familia). Agrupa raciones para el reparto y evita duplicar direcciones. Una persona pertenece a lo sumo a un hogar por olla.
- **Servicio**: evento de alimentación de una olla en una fecha y turno (ej. almuerzo del 12/03). Contiene el menú (recetas), la meta de raciones, las raciones realmente entregadas, el consumo de insumos y el estado de validación. Puede haber más de un servicio por día (turnos distintos), nunca dos abiertos en el mismo turno.
- **Ración**: unidad de entrega de comida a un comensal en un servicio. Tiene tamaño (adulto / niño / gestante / especial), estado (entregada, no recogida, devuelta) y destino (persona, invitado o conteo anónimo). Una ración pertenece a exactamente un servicio.
- **Dieta**: conjunto **versionado** de restricciones y prioridades que se aplica a las raciones de una persona (ej. "sin maní", "porción reforzada en hierro", "baja en sal"). Se define por plantilla y se asigna con vigencia (desde/hasta) y origen (nutricionista o plantilla por defecto). No es un diagnóstico ni una prescripción médica.
- **Insumo**: ítem de despensa (alimento o no alimentario, ej. gas) con unidad de medida, presentación y equivalencia casera opcional. El catálogo es compartido; el stock es por olla.
- **Lote / movimiento**: el stock no se sobrescribe, se mueve. Cada entrada, salida, ajuste, merma o transferencia es un movimiento inmutable con motivo y responsable. El stock actual es la suma de movimientos.
- **Receta**: preparación con ingredientes (insumo + cantidad en gramos comestibles), rendimiento en raciones y pasos. Versionada: cambiar una receta no altera servicios ya ejecutados.
- **Solicitud entre ollas**: pedido formal de insumos de una olla a otra, con motivo agregado (no nominal), cantidades, estado y compromiso de devolución. Genera movimientos espejo (salida en origen, entrada en destino) y un acta imprimible.
- **Validación / dictamen**: resultado de evaluar un servicio contra los criterios vigentes. Puede ser **automática** (motor de reglas, explicable criterio por criterio) o **humana** (nutricionista). Se guarda quién, cuándo, con qué versión de criterios y con qué datos.
- **Criterio**: regla configurable y versionada que el motor evalúa sobre un servicio (ej. "el menú debe incluir al menos un insumo fuente de hierro", "toda persona con bandera de alergia debe tener ración sustituida"). El contenido técnico de los criterios lo define la nutricionista, no este PRD.
- **Folio**: identificador corto, legible e imprimible, único por olla y dispositivo, que liga un papel con un registro digital. Se reserva **offline** antes de imprimir.
- **Invitado**: comensal sin ficha que recibe ración en un servicio. Se cuenta como ración tipo invitado, con nombre opcional; no crea persona en el padrón.
- **Conteo anónimo**: número de raciones entregadas sin identificar a quién, usado cuando no hay tiempo o consentimiento para registrar.

Invariantes:
1. Nada se borra: se marca `anulado` con motivo. Movimientos, raciones y dictámenes son append-only.
2. Todo registro lleva `olla_id`, `creado_por`, `creado_en`, `dispositivo_id` y `version`.
3. Un servicio cerrado no se edita; se corrige con un servicio de ajuste o una anulación motivada.
4. La app nunca calcula requerimientos clínicos individuales: aplica plantillas y criterios aprobados externamente.

---

## 3. Entidades y campos preliminares

`*` = obligatorio. Tipos: `id`, `texto`, `enum`, `fecha`, `num`, `bool`, `ref`, `json`. Todos llevan además `id`, `ollo_id`, `creado_en`, `creado_por`, `actualizado_en`, `anulado_en?`.

### Organización y acceso

**Olla**
| Campo | Tipo | Notas |
|---|---|---|
| nombre* | texto | |
| codigo* | texto | corto, único, va en folios |
| direccion_ref | texto | referencia, sin geocerca obligatoria |
| distrito / provincia | texto | |
| zona_horaria* | texto | default Perú |
| turnos* | json | ej. `[{nombre:"almuerzo", hora:12}]` |
| responsable_persona_id | ref | puede ser null al inicio |
| criterios_version_activa* | ref | versión de criterios vigente |
| permite_conteo_anonimo* | bool | default true |
| estado* | enum | activa, pausada, cerrada |

**Usuario**: `nombre*`, `telefono?`, `pin_hash?`, `ultimo_acceso?`. Sin email obligatorio (muchas organizadoras no usan correo).
**Membresia**: `usuario_id*`, `olla_id*`, `rol*` (organizadora, cocinera, nutricionista, admin_red), `activa*`, `vigencia_desde*`, `vigencia_hasta?`.
**Dispositivo**: `usuario_id*`, `nombre?`, `plataforma*`, `prefijo_folio*`, `ultima_sincronizacion?`.

### Personas

**Hogar**: `codigo*`, `direccion_ref?`, `referencia?`, `n_personas?`, `recibe_reparto*` (bool).
**Persona**
| Campo | Tipo | Oblig. | Notas |
|---|---|---|---|
| nombres / apellidos | texto | sí / opcional | apellido puede omitirse si la persona no lo da |
| fecha_nacimiento | fecha | no | si falta, se usa `edad_aproximada` |
| edad_aproximada | num | no | años; obligatorio si no hay fecha |
| grupo_etario* | enum | sí | niño, adolescente, adulto, adulto_mayor |
| sexo | enum | no | |
| gestante / lactante | bool | no | bandera operativa, no diagnóstico |
| hogar_id | ref | no | |
| banderas | json | no | `{anemia:bool, alergias:[texto], otras:[texto]}` con fecha y origen |
| consentimiento* | json | sí | `{otorgado:bool, fecha, alcance}`; si es falso solo se permite conteo anónimo |
| contacto | texto | no | solo si la familia lo autoriza |
| estado* | enum | sí | activa, inactiva, retirada |
| fuente* | enum | sí | alta_normal, alta_rapida, importacion, escaneo |

**DietaPlantilla**: `nombre*`, `descripcion?`, `restricciones*` (json: insumos excluidos, alérgenos), `ajustes*` (json: tamaño de porción, prioridad), `vigente*`, `autor*`.
**AsignacionDieta**: `persona_id*`, `dieta_id*`, `desde*`, `hasta?`, `origen*` (nutricionista, plantilla_default), `nota?`.

### Alimentos

**Insumo**: `nombre*`, `categoria*`, `es_alimento*`, `unidad_base*` (g, ml, unidad), `presentacion?`, `equivalencias?` (json: "1 cucharada = 15 g", "1 atado ≈ 100 g"), `alergenos?` (json), `perecedero*`, `vida_util_dias?`.
**StockLote**: `insumo_id*`, `cantidad*`, `unidad*`, `fecha_ingreso*`, `fecha_vencimiento?`, `origen*` (donacion, compra, transferencia, cosecha), `costo_unitario?`.
**Movimiento**: `insumo_id*`, `tipo*` (entrada, salida_servicio, merma, ajuste, transferencia_salida, transferencia_entrada, devolucion), `cantidad*` (puede ser negativa en ajustes), `unidad*`, `servicio_id?`, `solicitud_id?`, `motivo?`, `cantidad_estimada*` (bool: no había balanza), `responsable_id*`, `ocurrido_en*`.

**Receta**: `nombre*`, `descripcion?`, `rendimiento_raciones*`, `tamano_racion?`, `ingredientes*` (json: `[{insumo_id, cantidad_neta, unidad, opcional}]`), `pasos*` (texto), `version*`, `autor*`, `vigente*`, `alergenos_declarados?`.
*Nota:* la composición nutricional de los insumos **no** se modela acá; entra por el catálogo externo que defina el equipo de nutrición `[dato a confirmar: fuente y formato del catálogo]`.

### Servicio y entregas

**Servicio**: `fecha*`, `turno*`, `estado*` (planificado, en_curso, cerrado, anulado), `menu*` (json: `[{receta_id, version, raciones_meta}]`), `comensales_esperados*`, `raciones_entregadas*`, `raciones_invitado*`, `raciones_anonimas*`, `raciones_no_recogidas*`, `costo_estimado?`, `observaciones?`, `validacion_id?`.
**Racion**: `servicio_id*`, `folio*`, `tipo*` (persona, invitado, anonima), `persona_id?` (obligatorio si tipo=persona), `tamano*` (adulto, niño, gestante, especial), `dieta_aplicada_id?`, `estado*` (entregada, no_recogida, devuelta), `entregada_en*`, `entregada_por*`, `sustitucion?` (texto: qué se cambió por alergia), `observacion?`.

### Validación

**CriterioVersion**: `version*`, `vigente_desde*`, `contenido*` (json de criterios), `autor*`, `aprobado_por?`.
**Evaluacion**: `servicio_id*`, `criterio_version*`, `modo*` (automatica, humana), `resultado_global*` (cumple, cumple_observaciones, no_cumple, datos_insuficientes), `detalle*` (json por criterio: resultado, explicación, dato faltante), `evaluado_en*`, `evaluado_por?` (null si automática), `nota?`, `justificacion_omision?` (obligatoria si la organizadora ignora un no_cumple).

### Colaboración entre ollas

**Solicitud**: `folio*`, `olla_origen_id*`, `olla_destino_id*`, `estado*` (borrador, enviada, aceptada_parcial, aceptada, en_camino, recibida, rechazada, cancelada), `motivo_agregado*` (ej. "dieta especial de 4 personas"; sin nombres), `items*` (json), `compromiso_devolucion?`, `servicio_id?`, `fecha_necesaria?`, `acta_adjunto_id?`.

### Trazabilidad y papel

**DocumentoImpreso**: `tipo*` (hoja_servicio, ticket_racion, acta_traslado, lista_despensa, etiqueta), `folio_desde*`, `folio_hasta*`, `formato*` (a4, 80mm, 58mm), `impreso_en*`, `dispositivo_id*`, `reimpresion_de?`.
**Adjunto**: `tipo*` (foto_papel, qr_escaneado, acta_firmada), `servicio_id?`, `solicitud_id?`, `archivo_ref*`, `hash?`, `estado*` (pendiente_conciliar, conciliado, descartado), `capturado_en*`.

Campos obligatorios mínimos para no bloquear la operación: Olla (nombre, codigo, turnos), Persona (nombre, grupo etario, consentimiento, estado, fuente), Servicio (fecha, turno, menu, estado), Racion (servicio, folio, tipo, tamaño, estado), Movimiento (insumo, tipo, cantidad, responsable).

---

## 4. Flujos

### 4.1 Alta de persona (objetivo: < 60 s, sin red)
1. La organizadora toca **+ Persona** desde el padrón.
2. La app busca duplicados por nombre similar y por hogar; muestra candidatos ("¿es la misma persona?").
3. Ingresa lo mínimo: nombre, grupo etario, hogar (existente o nuevo).
4. Marca banderas solo si la familia lo pide y acepta: anemia, alergia, gestante/lactante; registra consentimiento con fecha y alcance.
5. Asigna dieta (por defecto "estándar"; si hay bandera de alergia, exige elegir plantilla).
6. Guarda local con ULID; la persona ya está operativa sin internet.
7. Al volver la red, sincroniza; si hubo conflicto de duplicado, la app propone fusión y no borra.

**Ahorro:** reemplaza la hoja del cuaderno y hace que la dieta especial exista antes de cocinar, no después.

### 4.2 Carga de despensa
1. Elige **Despensa → Entrada**.
2. Busca el insumo en el catálogo (o lo crea con nombre, categoría, unidad).
3. Indica cantidad y unidad; elige presentación (saco, caja, atado, unidad).
4. Si hay balanza, peso bruto/neto; si no, equivalencia casera y marca `cantidad_estimada`.
5. Agrega origen (donación, compra, transferencia), fecha y vencimiento si aplica.
6. Confirma: se crea un movimiento de entrada inmutable y se recalcula el stock.
7. Opcional: imprime etiqueta con folio y fecha para el tacho o el costal.

**Ahorro:** el stock deja de ser memoria; el faltante se detecta antes de cocinar, no a mitad de la olla.

### 4.3 Planificar servicio
1. **Nuevo servicio** → fecha y turno (bloquea si ya hay uno abierto en ese turno).
2. La app propone comensales esperados desde el padrón activo, desglosado por tamaño de ración.
3. Elige recetas existentes o crea una con ingredientes y rendimiento.
4. Escala la receta a las raciones objetivo y muestra el consumo teórico de insumos.
5. Contrasta con el stock: lista de faltantes y de insumos por vencer.
6. Corre una **previsualización** de la evaluación (sin dictamen) para ver qué criterios fallarían.
7. Guarda el servicio en `planificado`; queda listo para ejecutar o para pedir insumos a otra olla.

### 4.4 Validar con nutricionista (presencial o remota)
1. La nutricionista abre el servicio planificado y ve la evaluación automática criterio por criterio, con la explicación y los datos faltantes.
2. Ajusta recetas, cantidades o la asignación de dietas especiales.
3. Re-ejecuta la evaluación y compara el antes/después.
4. Emite dictamen: aprobado u observado, con nota obligatoria si hay observación.
5. El dictamen se firma con usuario, fecha, dispositivo y versión de criterios.
6. Si es remota y no hay red: queda en cola `pendiente_validacion` y el servicio puede ejecutarse marcado como **no validado**.
7. El dictamen se refleja en la hoja de servicio impresa y en el historial de la olla.

### 4.5 Validar sin nutricionista (modo automático explicable)
1. La organizadora intenta cerrar el servicio.
2. El motor evalúa los criterios vigentes sobre menú, raciones y dietas asignadas.
3. Devuelve un resultado global: cumple / cumple con observaciones / no cumple / datos insuficientes.
4. Muestra **por qué**: criterio, dato usado y qué falta para cumplirlo.
5. Si el resultado no es "cumple", la app exige corregir o escribir una justificación para continuar.
6. El servicio se guarda como `autoevaluado: no validado por nutricionista`; pantalla e impresos lo dicen explícitamente.
7. Queda en la cola de revisión remota para que una nutricionista lo valide después.

**Decisión de producto:** el modo automático nunca se presenta como aprobación profesional. Es un semáforo con explicación, no un diagnóstico.

### 4.6 Pedir a otra olla
1. Desde un faltante del servicio o desde despensa, toca **Pedir a otra olla**.
2. Arma la solicitud con insumos, cantidades y fecha necesaria.
3. El motivo se escribe **agregado** ("dieta especial de 4 personas"), nunca con nombres ni banderas.
4. Elige olla destino del directorio de ollas conocidas (no hay directorio abierto).
5. Envía: con red va directo; sin red queda en cola y ofrece un texto plano para pasar por WhatsApp.
6. La olla destino acepta total o parcialmente; la app genera folio y acta de traslado.
7. Al entregar y recibir, se registran movimientos espejo (salida/entrada) y el compromiso de devolución.
8. Cierra la solicitud; si queda pendiente de devolución, aparece como deuda entre ollas.

### 4.7 Imprimir
1. Elige documento: hoja de servicio, tickets de ración, acta de traslado, lista de despensa o etiqueta.
2. Elige formato: A4 (impresora prestada), 80 mm o 58 mm (térmica Bluetooth).
3. Si no hay red, la app **reserva folios localmente** (`prefijo_dispositivo + secuencia`) antes de imprimir.
4. Vista previa con QR por ticket y totales por tamaño de ración.
5. Imprime con `window.print()` (A4/PDF) o con la térmica si el navegador la soporta `[dato a confirmar: soporte Web Bluetooth en los equipos del piloto]`.
6. Marca el rango como impreso; los folios no se reutilizan.
7. Reimprimir exige motivo y queda registrado como duplicado (mismo folio, marca `reimpresion`).

**Qué se imprime:** hoja de servicio (menú, raciones por tamaño, dietas especiales sin nombres), ticket de ración con QR y folio, acta de traslado entre ollas, lista de compras/faltantes, etiquetas de despensa.
**Sin internet:** se imprime igual (impresión local), con folios reservados offline; el papel es la fuente de verdad hasta sincronizar.

### 4.8 Escanear con el celular
1. Abre **Escanear** y elige modo: QR o foto de papel.
2. QR: apunta al ticket o acta; la app valida el folio y marca la ración como entregada (funciona offline).
3. Foto: captura el acta firmada o la hoja del cuaderno, recorta y confirma.
4. Asocia la captura a un servicio o a una solicitud.
5. Guarda el adjunto en cola local, comprimido, con hash.
6. Al sincronizar, la transcripción es **manual asistida**: la app muestra la foto al lado del formulario; no hay OCR automático en v1.
7. Marca el documento como conciliado y bloquea su edición.

**Qué se escanea:** tickets de ración (QR), actas de traslado firmadas, hojas de servicio en papel, comprobantes de donación.
**Sin internet:** todo el flujo funciona local; el adjunto y la conciliación se suben después. Un QR repetido se rechaza como duplicado.

---

## 5. Casos borde y fuera de alcance

### Casos borde
| Caso | Comportamiento |
|---|---|
| **Persona sin registro** (llegó y no está en el padrón) | Alta rápida de 3 campos o ración `anonima`/`invitado`; se reconcilia después. Nunca se rechaza comida por falta de ficha. |
| **Sin consentimiento** | Solo se permite conteo anónimo; no se guardan banderas ni nombre completo. |
| **Dieta especial** | La ración hereda la dieta vigente de la persona y se marca `especial`; si no hay insumo apto, la app avisa antes de cocinar. |
| **Banderas de anemia** | Se guarda como bandera operativa con fecha y origen; la app no diagnostica, no interpreta exámenes y no recomienda suplementos. |
| **Alérgico** | Bloqueo blando: alerta visible, exige confirmar sustitución y registra qué se sustituyó. Si no se confirma, no deja cerrar la ración. |
| **Invitado** | Ración tipo invitado con nombre opcional; no crea persona ni consume cupo del padrón. |
| **Olla sin balanza** | Cantidades por unidad casera con equivalencia; se marca `cantidad_estimada` y el reporte distingue estimado de pesado. |
| **Olla sin internet varios días** | Todo opera local; folios offline, cola de sync, adjuntos diferidos. Al volver la red se sincroniza sin duplicar (idempotencia por ULID). |
| **Nutricionista ausente** | Modo automático explicable + estado "no validado" + cola de revisión. |
| **Dos dispositivos editan el mismo servicio** | Gana el cierre válido más antiguo; el otro se guarda como conflicto y se resuelve a mano. Movimientos y raciones no se sobreescriben. |
| **Persona que no vino / ración no recogida** | Se marca `no_recogida`; la ración no se reasigna automáticamente (decisión de la olla). |
| **Sobrante o merma** | Movimiento de merma o devolución con motivo; nunca se ajusta el stock "a mano". |
| **Duplicado de persona** | Fusión con historial; no se borra ninguna de las dos. |
| **Niño que cambia de grupo etario** | El tamaño de ración se recalcula por fecha de nacimiento; el histórico no se reescribe. |
| **Solicitud entre ollas sin red** | Se genera texto/PDF para enviar por mensajería y se registra al recibir; el acta en papel manda. |
| **Reimpresión de tickets** | Mismo folio, marca de duplicado y motivo obligatorio. |

### Fuera de alcance (v1)
- Diagnóstico, tamizaje o tratamiento de anemia; prescripción de suplementos; historia clínica.
- Cálculo de requerimientos nutricionales individuales: solo se aplican plantillas y criterios definidos por nutrición.
- Tabla de composición de alimentos dentro del producto (el catálogo entra como dato externo).
- Cuentas para familias beneficiarias, notificaciones automáticas por SMS/WhatsApp, chatbot.
- Integración con sistemas estatales, padrón oficial o transferencias bancarias.
- Pagos, facturación electrónica, contabilidad y gestión tributaria.
- Gestión de donantes, campañas y recaudación.
- OCR/foto→datos automático; reconocimiento de escritura.
- Impresión térmica en iOS y soporte de impresoras de red.
- Directorio público de ollas o federación abierta entre ollas (solo pares conocidos).
- App nativa en stores (Capacitor queda como opción posterior).
- Analítica avanzada, reportes exportables más allá de CSV/PDF básico.
- Control sanitario, manipulación de alimentos o trazabilidad bromatológica.

---

## 6. Supuestos a confirmar y preguntas abiertas

### Los 5 supuestos que hay que confirmar con el usuario
1. **Una olla usa uno o dos celulares compartidos**, no un dispositivo por persona; el modelo de folios y la sesión por PIN asumen eso.
2. **La impresión A4/PDF es suficiente para el piloto**; la térmica Bluetooth es deseable, no requisito.
3. **La nutricionista puede validar de forma asíncrona** (días después) y eso es aceptable para el registro, siempre que el servicio se marque como no validado.
4. **Las solicitudes entre ollas son de buena fe y con compromiso de devolución**, sin scoring ni garantías.
5. **El padrón puede vivir con nombre + grupo etario**; no se exige DNI ni fecha de nacimiento para operar.

### Las 3 preguntas que este documento no puede responder solo
1. **¿Quién responde legalmente por la dieta** cuando el dictamen es automático: la organizadora, la olla o nadie? Define si el modo automático puede cerrar un servicio sin revisión humana.
2. **¿Se pueden compartir banderas de salud agregadas entre ollas** al pedir insumos, o el motivo debe ser aún más genérico? Define el nivel de detalle de las solicitudes.
3. **¿Cuál es la unidad real de rendición de cuentas** ante el programa o el donante: el servicio, la ración o la persona atendida? Define qué documento es el oficial al imprimir.

---

investigación de dominio: delegada por el usuario
