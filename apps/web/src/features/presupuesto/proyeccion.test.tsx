import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CORTE_DEMO, movimientoDemo } from '../../fixtures/demo';
import { calcularPresupuesto, type CortePresupuesto } from './dominio';
import { PresupuestoPantalla } from './PresupuestoPantalla';

const render = (
  movimientos: Parameters<typeof PresupuestoPantalla>[0]['movimientos'],
  // Anotado: sin `: CortePresupuesto` TypeScript infiere el tipo literal de
  // `CORTE_DEMO` y luego no acepta un corte con otra fecha.
  corte: CortePresupuesto = CORTE_DEMO,
): string => renderToStaticMarkup(<PresupuestoPantalla movimientos={movimientos} corte={corte} />);

/** La fila "Proyección al cierre" del HTML renderizado. */
function filaProyeccion(html: string): string {
  const desde = html.indexOf('Proyección al cierre');
  return html.slice(desde, desde + 400);
}

describe('PresupuestoPantalla · proyección sin base (MEDIA 5)', () => {
  it('con muestra insuficiente dice "sin dato" y NO muestra una cifra de proyección', () => {
    // Corte el mismo día que empieza el período -> 1 día transcurrido (< 3).
    // `CORTE_DEMO` es un literal const: se reanota para poder cambiar la fecha.
    const corteReciente: CortePresupuesto = {
      ...CORTE_DEMO,
      instante: '2026-11-01T09:00:00Z',
      fechaNegocio: '2026-11-01',
    };
    const movs = [
      movimientoDemo('a1', 'asignacion', 180_000, '2026-11-01T09:00:00Z'),
      movimientoDemo('g1', 'gasto', 20_000, '2026-11-01T09:00:00Z'),
    ];

    const resultado = calcularPresupuesto(movs, corteReciente);
    expect(resultado.muestraInsuficiente).toBe(true);

    const fila = filaProyeccion(render(movs, corteReciente));
    expect(fila).toContain('sin dato');
    // Ni el número del dominio ni un "S/ …" cualquiera en esa fila.
    expect(fila).not.toMatch(/S\/\s?\d/);
  });

  it('con base suficiente sí muestra la proyección (no se rompió el caso normal)', () => {
    const movs = [
      movimientoDemo('a1', 'asignacion', 180_000, '2026-11-01T09:00:00Z'),
      movimientoDemo('g1', 'gasto', 90_000, '2026-11-05T10:00:00Z'),
    ];
    const resultado = calcularPresupuesto(movs, CORTE_DEMO);
    expect(resultado.muestraInsuficiente).toBe(false);

    const fila = filaProyeccion(render(movs));
    expect(fila).not.toContain('sin dato');
    expect(fila).toMatch(/S\/\s?\d/);
  });
});
