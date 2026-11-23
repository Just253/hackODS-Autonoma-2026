import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CORTE_DEMO, MOVIMIENTOS_DEMO, movimientoDemo } from '../../fixtures/demo';
import { PresupuestoPantalla } from './PresupuestoPantalla';

const render = (props: Parameters<typeof PresupuestoPantalla>[0]): string =>
  renderToStaticMarkup(<PresupuestoPantalla {...props} />);

describe('PresupuestoPantalla', () => {
  it('muestra asignado, gastado, disponible y proyección en enteros de céntimos', () => {
    const html = render({ movimientos: MOVIMIENTOS_DEMO, corte: CORTE_DEMO });

    // §7.5: A 180 000, G 145 330, D 19 670, proyección 242 217.
    expect(html).toContain('S/ 1 800,00');
    expect(html).toContain('S/ 1 453,30');
    expect(html).toContain('S/ 196,70');
    expect(html).toContain('S/ 2 422,17');
    // Nunca un flotante suelto tipo "1453.3".
    expect(html).not.toMatch(/\d+\.\d{1,}/);
  });

  it('alerta al 80 % visible con el porcentaje y sin bloquear (sin overlay ni rol dialog)', () => {
    const html = render({ movimientos: MOVIMIENTOS_DEMO, corte: CORTE_DEMO });

    expect(html).toContain('80 %');
    expect(html).toContain('89,07 %');
    expect(html).toContain('data-tono="atencion"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    // La tabla sigue visible: la alerta no reemplaza la pantalla.
    expect(html).toContain('Resumen del presupuesto');
  });

  it('al 100 % muestra alerta crítica con el porcentaje', () => {
    const agotado = [
      movimientoDemo('a1', 'asignacion', 100_000, '2026-11-01T09:00:00Z'),
      movimientoDemo('a2', 'gasto', 100_000, '2026-11-20T10:00:00Z'),
    ];
    const html = render({
      movimientos: agotado,
      corte: { ...CORTE_DEMO, instante: '2026-11-20T10:00:00Z', fechaNegocio: '2026-11-20' },
    });

    expect(html).toContain('data-tono="critica"');
    expect(html).toContain('100,00 %');
    expect(html).toContain('Usaste todo el presupuesto');
  });

  it('sin asignado muestra "sin dato" en consumo, nunca un 100 % falso', () => {
    const sinAsignado = [movimientoDemo('s1', 'gasto', 10_000, '2026-11-10T10:00:00Z')];
    const html = render({ movimientos: sinAsignado, corte: CORTE_DEMO });

    expect(html).toContain('sin dato');
    expect(html).not.toContain('100,00 %');
  });

  it('estado sin conexión avisa "pendiente de sincronizar" sin perder los números', () => {
    const html = render({ movimientos: MOVIMIENTOS_DEMO, corte: CORTE_DEMO, estado: 'sin-conexion' });

    expect(html).toContain('pendiente de sincronizar');
    expect(html).toContain('S/ 1 800,00');
  });

  it('estado cargando y error no revientan', () => {
    expect(render({ movimientos: [], corte: CORTE_DEMO, estado: 'cargando' })).toContain('Cargando');
    expect(render({ movimientos: [], corte: CORTE_DEMO, estado: 'error' })).toContain('role="alert"');
  });
});

