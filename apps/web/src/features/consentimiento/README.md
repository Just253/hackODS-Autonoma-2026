# Consentimiento

Dos permisos separados del plato (seguimiento y estadísticas) con texto sin jerga y revocación que gana.

Lee el padrón local (`P-XXXX`, sin nombres) y las firmas de la tabla Dexie `consentimiento`; escribe una fila nueva por firma y su evento en el outbox, nunca un UPDATE.

**Texto visible:** el código de la persona se nombra como código, sin el marcador de plantilla `P-XXXX`.

**Área de toque:** el `<label>` envuelve casilla y título con `min-h-12` (48 px, `--toque-minimo`), no solo la casilla de 24 px. **Estados:** «Revocado» va en color de texto + marca `●-`; el marrón `pendiente` queda para lo que espera la red.
