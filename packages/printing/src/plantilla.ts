import type { Documento } from './documento.js';

export function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function tituloDocumento(doc: Documento): string {
  switch (doc.tipo) {
    case 'padron':
      return `Padron del dia - ${doc.olla.titulo}`;
    case 'receta':
      return doc.receta.titulo;
    case 'solicitud':
      return `Solicitud de insumos - ${doc.origen.titulo}`;
    case 'comprobante':
      return `Comprobante ${doc.folio}`;
    case 'etiqueta':
      return `Etiqueta - ${doc.olla.titulo} - ${doc.fecha}`;
  }
}

/**
 * Esqueleto de plantilla imprimible (HTML + @media print). El contenido real
 * por tipo de documento es M4. Aca solo se garantiza el envoltorio y el escape.
 */
export function plantillaHtml(doc: Documento): string {
  return [
    `<article class="doc doc--${doc.tipo} pagina">`,
    `  <h1>${escapar(tituloDocumento(doc))}</h1>`,
    '  <p class="doc__pendiente">[contenido a completar]</p>',
    '</article>',
  ].join('\n');
}
