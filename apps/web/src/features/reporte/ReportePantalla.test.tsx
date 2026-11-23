import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MOVIMIENTOS_ENTRE_OLLAS, PERIODO_DEMO } from './fixtures';
import { ReportePantalla } from './ReportePantalla';

function render(props: Partial<Parameters<typeof ReportePantalla>[0]> = {}): string {
  return renderToStaticMarkup(
    <ReportePantalla movimientos={MOVIMIENTOS_ENTRE_OLLAS} periodo={PERIODO_DEMO} {...props} />,
  );
}

describe('ReportePantalla', () => {
  it('una columna por olla ficticia (3 ollas)', () => {
    const html = render();
    expect(html).toContain('Olla Norte');
    expect(html).toContain('Olla Centro');
    expect(html).toContain('Olla Sur');
    expect(html).toContain('data-reporte="entre-ollas"');
  });

  it('muestra el volumen movido por categoria (granos: 20000 y 5000)', () => {
    const html = render();
    expect(html).toContain('granos');
    expect(html).toContain('20000');
    expect(html).toContain('5000');
  });

  it('el encabezado dice "volumen movido", no un saldo/total', () => {
    const html = render();
    expect(html.toLowerCase()).toContain('volumen movido');
  });

  it('una olla que solo movio en negativo muestra volumen positivo', () => {
    const salida = {
      id: 's1',
      ollaId: 'olla_1',
      insumoId: 'arroz',
      delta: -15000,
      motivo: 'salida' as const,
      autor: 'test',
      at: '2026-11-10T09:00:00.000Z',
      createdAt: '2026-11-10T09:00:00.000Z',
      updatedAt: '2026-11-10T09:00:00.000Z',
      deletedAt: null,
      deviceId: 'dev',
      lamport: 1,
    };
    const html = render({ movimientos: [salida] });
    expect(html).toContain('15000');
    expect(html).not.toContain('-15000');
  });

  it('la pantalla NO contiene codigoP ni alias del fixture', () => {
    const html = render();
    expect(html).not.toMatch(/P-[A-Z0-9]{4}/);
    expect(html).not.toContain('Alias de Juana');
    expect(html.toLowerCase()).not.toContain('alias');
  });

  it('sin movimientos avisa que no hay datos del periodo', () => {
    const html = render({ movimientos: [] });
    expect(html).toContain('No hay movimientos');
  });
});
