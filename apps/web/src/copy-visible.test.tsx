import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CORTE_DEMO, MOVIMIENTOS_DEMO } from './fixtures/demo';
import { FUENTE_PRECIOS_DEMO, PRODUCTO_DESTACADO, PRODUCTOS_DEMO } from './fixtures/precios-productos';
import { ComprobantePage } from './features/comprobante/ComprobantePage';
import { PadronPage } from './features/padron/PadronPage';
import { PreciosPantalla } from './features/precios/PreciosPantalla';
import { PresupuestoPantalla } from './features/presupuesto/PresupuestoPantalla';
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
