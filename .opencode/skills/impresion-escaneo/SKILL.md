---
name: Impresión y escaneo
description: Reportes en PDF, tickets de 58/80 mm, captura con cámara y OCR con confirmación humana. Cargar al tocar impresión, PDF, cámara o lectura de vouchers.
---

# Impresión y escaneo

## Cuándo se carga

- Hay que imprimir o exportar un reporte, un cierre de caja o un ticket.
- Se agrega cámara, foto de voucher o lectura de texto.
- Alguien propone "impresora térmica Bluetooth" o "que el OCR cargue solo".

## Decisión base

**Primero PDF y `window.print()`. La térmica nativa es un extra, no el camino principal.** En una olla
común el 90% de los casos se resuelve con un A4 o con un PDF compartido por WhatsApp. Una impresora
térmica Bluetooth exige permisos, emparejamiento y un plugin nativo: si falla en la demo, no hay plan B.

| Salida | Cómo | Costo | Riesgo |
|---|---|---|---|
| Reporte A4 | HTML + `@media print` → `window.print()` o PDF | bajo | bajo |
| Ticket 80 mm | CSS `@page { size: 80mm auto }` → PDF | bajo | bajo (impresora del SO) |
| Térmica ESC/POS | plugin Capacitor / WebBluetooth | alto | alto (permisos, modelo, ancho) |
| Compartir PDF | `navigator.share` / descarga | bajo | bajo |

Regla: la UI ofrece **"Imprimir"** y **"Compartir PDF"**. "Imprimir en térmica" solo si existe hardware
probado y un ADR.

## Reporte imprimible

- Un solo componente de reporte por tipo (`cierre-jornada`, `aporte-mensual`, `receta`), con datos ya
  calculados: la plantilla **no** calcula nada.
- `@media print`: ocultar navegación y botones, blanco y negro legible, sin fondos que se coman la tinta,
  números alineados, `break-inside: avoid` en filas.
- Encabezado: nombre de la olla, fecha, "documento de control interno".
- Pie: quién lo generó y el id del registro (para poder rastrear el papel).
- **No es un comprobante fiscal.** No pongas RUC, "boleta", "factura" ni numeración tributaria.

## PDF

- Generación en cliente con `pdf-lib` solo si hace falta un archivo real (no solo imprimir).
- El PDF se genera desde los mismos datos que la pantalla; si hay dos cálculos, hay dos verdades.
- Tamaño objetivo < 500 KB por reporte. Sin imágenes si no aportan.
- Nombre: `olla-<slug>-<tipo>-<YYYY-MM-DD>.pdf`.

## Cámara y vouchers

1. Preferí `<input type="file" accept="image/*" capture="environment">`: menos permisos y funciona en
   cualquier WebView. `getUserMedia` solo si se necesita vista previa o encuadre.
2. Comprimir antes de guardar: lado mayor ≤ 1600 px, JPEG calidad ~0.7, objetivo ≤ 300 KB.
3. Guardar el **original** y el texto extraído en campos separados; nunca pisar la imagen con el OCR.
4. La foto es un dato sensible: se guarda local, se sube solo si hace falta, y se puede borrar.

## OCR

- `tesseract.js` en el cliente, con `spa` (y `eng` si hay marcas). Es pesado: se carga **bajo demanda**,
  nunca en el arranque de la app.
- Salida: texto + confianza por línea. Confianza baja no se autocompleta.
- **Confirmación humana obligatoria**: el OCR propone monto/fecha/proveedor; la persona acepta o corrige.
  Nunca se crea un movimiento solo por OCR.
- Si el texto no se puede leer, se dice "no se pudo leer" y se ofrece cargar a mano.

## Qué se testea

- Reporte con 0 raciones, con 1 y con 200 (no se rompe el salto de página).
- Impresión en blanco y negro: los totales siguen siendo legibles.
- Captura: imagen de 12 MP se comprime bajo el objetivo y no se deforma.
- OCR con una imagen conocida: extrae el monto correcto; con una borrosa: pide confirmación, no inventa.
- Cancelar la cámara no deja estados colgados.

## Anti-patrones

- Imprimir `innerHTML` de la pantalla sin `print.css` (sale el menú y el botón).
- Generar el PDF en el servidor para algo que la persona necesita sin red.
- Autocompletar el total desde el OCR.
- Prometer impresión térmica sin haberla probado con el modelo exacto de la olla.
- Llamar "comprobante" a un reporte interno.

## Fuente

- `docs/guias/impresion.md` (hardware probado, si existe).
- MDN: `window.print`, `@page`, `navigator.share`, `HTMLCanvasElement.toBlob`.
- tesseract.js (idiomas y límites de rendimiento).
- ESC/POS: especificación del fabricante del modelo concreto, no genérica.
