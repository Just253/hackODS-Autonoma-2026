import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CORTE_DEMO, movimientoDemo } from '../../fixtures/demo';
import * as dominio from './dominio';
import { calcularPresupuesto } from './dominio';
import { PresupuestoPantalla } from './PresupuestoPantalla';

const render = (movimientos: Parameters<typeof PresupuestoPantalla>[0]['movimientos'], corte = CORTE_DEMO): string =>
  renderToStaticMarkup(<PresupuestoPantalla movimientos={movimientos} corte={corte} />);

/**
 * Un presupuesto de 100 000 exactos con un gasto tal que el consumo en puntos
 * base sea EXACTAMENTE `bp`. Devuelve los movimientos.
 */
function conConsumoBp(bp: number) {
  return [
    movimientoDemo('a1', 'asignacion', 100_000, '2026-11-01T09:00:00Z'),
    movimientoDemo('g1', 'gasto', Math.round((bp * 100_000) / 10_000), '2026-11-10T10:00:00Z'),
  ];
}

describe('PresupuestoPantalla · umbral 80/100 derivado del dominio', () => {
  it('límite exacto: 7 999 bp NO alerta, 8 000 bp SÍ (la alerta nace justo en 8 000)', () => {
    const justoAbajo = conConsumoBp(7_999);
    const justo = conConsumoBp(8_000);

    // Precondición del propio dominio: no se asume, se comprueba.
    expect(calcularPresupuesto(justoAbajo, CORTE_DEMO).consumoBp).toBe(7_999);
    expect(calcularPresupuesto(justo, CORTE_DEMO).consumoBp).toBe(8_000);

    // Se mira el aviso del 80 % por su texto, no por `data-tono`: la alerta
    // `proyeccion_excede` tambien usa tono "atencion" y ensuciaria la asercion.
    const aviso80 = /Pasaste el 80 % del presupuesto/;
    expect(render(justoAbajo)).not.toMatch(aviso80);
    expect(render(justo)).toMatch(aviso80);
    expect(render(justo)).toContain('80,00 %');
  });

  it('el límite 100 % también lo decide el dominio, no la pantalla', () => {
    const noventaYNueve = conConsumoBp(9_999);
    const cien = conConsumoBp(10_000);

    expect(render(noventaYNueve)).not.toContain('data-tono="critica"');
    expect(render(cien)).toContain('data-tono="critica"');
    expect(render(cien)).toContain('100,00 %');
  });

  /**
   * La aserción que importa: la pantalla NO debe tener el umbral propio.
   *
   * Comparar `render(8000)` contra `calcularPresupuesto(8000)` es vacuoso: si
   * el umbral del dominio cambia, los dos cambian juntos y el test sigue verde.
   *
   * La prueba que sí sirve: el dominio alerta a 7 999 (umbral movido) y la
   * pantalla debe avisar. Después, al revés: el dominio NO alerta aunque el
   * consumo esté en 8 000, y la pantalla NO debe avisar. Si la pantalla tuviera
   * `bp >= 8_000` propio, el segundo caso la delataría.
   */
  it('deriva las alertas del dominio: avisa cuando el dominio alerta, aunque el numero diga otra cosa', () => {
    // Caso 1: consumo 7 999 (hoy sin alerta) + dominio que sí alerta -> avisa.
    const conAlerta = vi.spyOn(dominio, 'calcularPresupuesto').mockReturnValue({
      ...calcularPresupuesto(conConsumoBp(7_999), CORTE_DEMO),
      consumoBp: 7_999,
      alertas: [{ tipo: 'presupuesto_80', severidad: 'atencion', claveDedup: 'simulado' }],
    });
    try {
      expect(render(conConsumoBp(7_999))).toMatch(/Pasaste el 80 % del presupuesto/);
    } finally {
      conAlerta.mockRestore();
    }

    // Caso 2: consumo 8 000 (el numero del umbral viejo) + dominio SIN alerta ->
    // NO avisa. Una comparacion propia `bp >= 8_000` en la pantalla fallaria aca.
    const sinAlerta = vi.spyOn(dominio, 'calcularPresupuesto').mockReturnValue({
      ...calcularPresupuesto(conConsumoBp(8_000), CORTE_DEMO),
      consumoBp: 8_000,
      alertas: [],
    });
    try {
      expect(render(conConsumoBp(8_000))).not.toMatch(/Pasaste el 80 % del presupuesto/);
    } finally {
      sinAlerta.mockRestore();
    }
  });
});
