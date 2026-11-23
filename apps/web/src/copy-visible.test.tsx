import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CORTE_DEMO, MOVIMIENTOS_DEMO } from './fixtures/demo';
import { FUENTE_PRECIOS_DEMO, PRODUCTO_DESTACADO, PRODUCTOS_DEMO } from './fixtures/precios-productos';
import { ComprobantePage } from './features/comprobante/ComprobantePage';
import { ConsentimientoPage } from './features/consentimiento/ConsentimientoPage';
import { InventarioPantalla } from './features/inventario/InventarioPantalla';
import { PadronPage } from './features/padron/PadronPage';
import { PreciosPantalla } from './features/precios/PreciosPantalla';
import { PresupuestoPantalla } from './features/presupuesto/PresupuestoPantalla';
import { RecetasPage } from './features/recetas/RecetasPage';
import { ReportePantalla } from './features/reporte/ReportePantalla';
import { MOVIMIENTOS_ENTRE_OLLAS, PERIODO_DEMO } from './features/reporte/fixtures';
import { ServicioPage } from './features/servicio/ServicioPage';
import { SolicitudPantalla } from './features/solicitud/SolicitudPantalla';
import { AHORA_DEMO, NUEVA_SOLICITUD_DEMO } from './features/solicitud/fixtures';

/**
 * Guardia de copy visible.
 *
 * Lo que el jurado lee no puede llevar jerga interna: umbrales del clasificador,
 * claves de categoría, ids de fila, fechas ISO ni jerga estadística. Este test
 * renderiza las siete pantallas y falla si alguna de esas palabras aparece en el
 * HTML. Si un dato técnico hace falta para la historia, va dentro de un
 * `<details>` (el sello del menú) y hay que sacarlo de esta lista con criterio.
 *
 * No es un test de estilo: es el contrato de textos del producto.
 */

/** Se queda con el texto y los atributos, sin tags, para buscar palabras. */
const PALABRAS_PROHIBIDAS: readonly { readonly patron: RegExp; readonly motivo: string }[] = [
  { patron: /\bTAU\b/, motivo: 'umbral interno del clasificador' },
  { patron: /\bmargen\b/i, motivo: 'umbral interno del clasificador' },
  { patron: /\bpiso\b/i, motivo: 'umbral interno del clasificador' },
  { patron: /\bmediana\b/i, motivo: 'jerga estadística' },
  { patron: /\bat[ií]pic[ao]s?\b/i, motivo: 'jerga estadística' },
  { patron: /\bolla_[0-9]/, motivo: 'id interno de olla' },
  { patron: /\bitem-[0-9]/, motivo: 'id interno de línea' },
  { patron: /\b20[0-9]{2}-[0-9]{2}-[0-9]{2}/, motivo: 'fecha ISO' },
  { patron: /demo-ficticio/i, motivo: 'etiqueta de andamiaje' },
  // Metatexto de desarrollo: el dictado mostraba "TODO" en el placeholder y
  // pasaba la guardia. Son marcas de trabajo pendiente, no texto de producto.
  { patron: /\bTODO\b/, motivo: 'marca de trabajo pendiente' },
  { patron: /\bFIXME\b/, motivo: 'marca de trabajo pendiente' },
  { patron: /\bBearer\b/i, motivo: 'cabecera HTTP' },
  { patron: /\bendpoint\b/i, motivo: 'jerga de API' },
  // Metatexto de demo que la pantalla leía en voz alta: decía cómo está hecha
  // la app ("datos simulados", "demo", "OCR") en vez de hablar de la olla.
  { patron: /\bsimulad[oa]s?\b/i, motivo: 'metatexto de demo' },
  { patron: /\bde demo\b/i, motivo: 'metatexto de demo' },
  { patron: /\boffline-first\b/i, motivo: 'jerga de arquitectura' },
  { patron: /\bOCR\b/, motivo: 'jerga técnica' },
  // Voseo rioplatense: la app es peruana y la cocinera tutea. El imperativo
  // rioplatense en "-á"/"-í" (Elegí, Escribí, Revisá, comprá) no va en pantalla.
  {
    patron:
      /(?:Elegí|Escribí|Revisá|Comprá|pegá|contá|registrá|necesitás|tenés|poné|andá|dictá|probá|mirá|cargá)/i,
    motivo: 'voseo rioplatense',
  },
];

/** Texto visible: se quitan los tags (y con ellos los atributos y su contenido). */
function textoVisible(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}

function pantallas(): readonly { readonly nombre: string; readonly html: string }[] {
  return [
    { nombre: 'padrón', html: renderToStaticMarkup(<PadronPage />) },
    { nombre: 'servicio', html: renderToStaticMarkup(<ServicioPage />) },
    { nombre: 'comprobante', html: renderToStaticMarkup(<ComprobantePage />) },
    // Recetario, Despensa y Consentimiento quedaron afuera hasta que el voseo
    // ("Elegí", "pegá") pasó la guardia. Se suman como el resto: sin estado
    // global, solo el primer render (la carga en curso dice "Leyendo…").
    { nombre: 'recetario', html: renderToStaticMarkup(<RecetasPage />) },
    { nombre: 'despensa', html: renderToStaticMarkup(<InventarioPantalla />) },
    { nombre: 'consentimiento', html: renderToStaticMarkup(<ConsentimientoPage />) },
    {
      nombre: 'presupuesto',
      html: renderToStaticMarkup(<PresupuestoPantalla movimientos={MOVIMIENTOS_DEMO} corte={CORTE_DEMO} />),
    },
    {
      nombre: 'precios',
      html: renderToStaticMarkup(
        <PreciosPantalla
          productos={PRODUCTOS_DEMO}
          fuente={FUENTE_PRECIOS_DEMO}
          productoInicial={PRODUCTO_DESTACADO}
        />,
      ),
    },
    {
      nombre: 'solicitud',
      html: renderToStaticMarkup(
        <SolicitudPantalla nueva={NUEVA_SOLICITUD_DEMO} ahora={AHORA_DEMO} />,
      ),
    },
    {
      nombre: 'reporte',
      html: renderToStaticMarkup(
        <ReportePantalla movimientos={MOVIMIENTOS_ENTRE_OLLAS} periodo={PERIODO_DEMO} />,
      ),
    },
  ];
}

describe('copy visible: la jerga interna no llega a la pantalla', () => {
  for (const { nombre, html } of pantallas()) {
    it(`${nombre} no muestra jerga interna`, () => {
      const texto = textoVisible(html);
      for (const { patron, motivo } of PALABRAS_PROHIBIDAS) {
        expect(texto, `${nombre}: ${motivo} (${patron})`).not.toMatch(patron);
      }
    });
  }
});
