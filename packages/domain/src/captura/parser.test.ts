import { describe, expect, it } from 'vitest';

import { parsearCaptura, type ItemPropuesto, type ResultadoParseo } from './parser.js';

function parse(texto: string, contexto?: Parameters<typeof parsearCaptura>[1]): ResultadoParseo {
  return parsearCaptura(texto, contexto);
}

function item(resultado: ResultadoParseo, indice = 0): ItemPropuesto {
  const encontrado = resultado.items[indice];
  if (encontrado === undefined) {
    throw new Error(`falta el item ${indice}`);
  }
  return encontrado;
}

describe('parsearCaptura: los 12 casos de §9', () => {
  it('T1 "compré dos kilos de papa a tres cincuenta"', () => {
    const resultado = parse('compré dos kilos de papa a tres cincuenta');
    const papa = item(resultado);

    expect(resultado.items).toHaveLength(1);
    expect(papa.descripcion).toBe('papa');
    expect(papa.cantidadMilesimas).toBe(2_000_000);
    expect(papa.unidadBase).toBe('g');
    expect(papa.precioUnitarioCentavos).toBe(350);
    expect(papa.precioTotalCentavos).toBe(700);
    expect(papa.avisos).toContain('TOTAL_CALCULADO');
    expect(resultado.avisos).toContain('PRODUCTO_AMBIGUO');
    expect(resultado.bloqueaConfirmacion).toBe(false);
  });

  it('T2 "jurel ocho soles el kilo" supone 1 kg y lo avisa', () => {
    const resultado = parse('jurel ocho soles el kilo');
    const jurel = item(resultado);

    expect(jurel.descripcion).toBe('jurel');
    expect(jurel.cantidadMilesimas).toBe(1_000_000);
    expect(jurel.precioUnitarioCentavos).toBe(800);
    expect(jurel.precioTotalCentavos).toBe(800);
    expect(jurel.avisos).toContain('CANTIDAD_SUPUESTA');
    expect(resultado.bloqueaConfirmacion).toBe(false);
  });

  it('T3 "gasté veinte en arroz" cuenta el dinero pero no genera serie', () => {
    const resultado = parse('gasté veinte en arroz');
    const arroz = item(resultado);

    expect(arroz.descripcion).toBe('arroz');
    expect(arroz.cantidadMilesimas).toBeNull();
    expect(arroz.unidadBase).toBeNull();
    expect(arroz.precioTotalCentavos).toBe(2_000);
    expect(arroz.avisos).toContain('SIN_CANTIDAD');
    expect(resultado.avisos).toContain('PRODUCTO_AMBIGUO');
    expect(resultado.coberturaMontoBp).toBe(10_000);
  });

  it('T4 "medio kilo de queso" queda incompleta, sin precio inventado', () => {
    const resultado = parse('medio kilo de queso');
    const queso = item(resultado);

    expect(queso.cantidadMilesimas).toBe(500_000);
    expect(queso.precioTotalCentavos).toBeNull();
    expect(queso.avisos).toContain('SIN_PRECIO');
    expect(resultado.coberturaMontoBp).toBe(0);
  });

  it('T5 "un cuarto de queso a doce el kilo"', () => {
    const resultado = parse('un cuarto de queso a doce el kilo');
    const queso = item(resultado);

    expect(queso.cantidadMilesimas).toBe(250_000);
    expect(queso.precioUnitarioCentavos).toBe(1_200);
    expect(queso.precioTotalCentavos).toBe(300);
    expect(queso.avisos).toContain('FRACCION_SIN_UNIDAD');
    expect(queso.avisos).toContain('TOTAL_CALCULADO');
  });

  it('T6 "tres bolsas de arroz a cuatro con cincuenta" no convierte bolsas', () => {
    const resultado = parse('tres bolsas de arroz a cuatro con cincuenta');
    const arroz = item(resultado);

    expect(arroz.cantidadMilesimas).toBe(3_000);
    expect(arroz.unidadBase).toBeNull();
    expect(arroz.unidadCruda).toBe('bolsas');
    expect(arroz.precioUnitarioCentavos).toBe(450);
    expect(arroz.precioTotalCentavos).toBe(1_350);
    expect(arroz.avisos).toContain('UNIDAD_SIN_EQUIVALENCIA');
  });

  it('T7 "compré papa y arroz, treinta" no reparte el monto', () => {
    const resultado = parse('compré papa y arroz, treinta');

    expect(resultado.items).toHaveLength(2);
    expect(item(resultado, 0).descripcion).toBe('papa');
    expect(item(resultado, 1).descripcion).toBe('arroz');
    expect(item(resultado, 0).precioTotalCentavos).toBeNull();
    expect(item(resultado, 1).precioTotalCentavos).toBeNull();
    expect(resultado.montoSinRepartirCentavos).toBe(3_000);
    expect(resultado.avisos).toContain('MONTO_SIN_REPARTIR');
    expect(resultado.bloqueaConfirmacion).toBe(true);
  });

  it('T8 "pollo dos kilos y medio a nueve ochenta" no confunde el "y medio"', () => {
    const resultado = parse('pollo dos kilos y medio a nueve ochenta');
    const pollo = item(resultado);

    expect(pollo.cantidadMilesimas).toBe(2_500_000);
    expect(pollo.precioUnitarioCentavos).toBe(980);
    expect(pollo.precioTotalCentavos).toBe(2_450);
    expect(pollo.avisos).toContain('TOTAL_CALCULADO');
  });

  it('T9 separa dos productos y solo calcula el que no trae total', () => {
    const resultado = parse('aceite tres litros dieciocho noventa y fideos dos kilos a cuatro');
    const aceite = item(resultado, 0);
    const fideos = item(resultado, 1);

    expect(resultado.items).toHaveLength(2);
    expect(aceite.descripcion).toBe('aceite');
    expect(aceite.cantidadMilesimas).toBe(3_000_000);
    expect(aceite.precioTotalCentavos).toBe(1_890);
    expect(aceite.precioUnitarioCentavos).toBe(630);
    expect(fideos.descripcion).toBe('fideos');
    expect(fideos.cantidadMilesimas).toBe(2_000_000);
    expect(fideos.precioUnitarioCentavos).toBe(400);
    expect(fideos.precioTotalCentavos).toBe(800);
    expect(resultado.avisos).toContain('PRODUCTO_AMBIGUO');
    expect(resultado.avisos).toContain('TOTAL_CALCULADO');
  });

  it('T10 "papa trescientos cincuenta el kilo" cae en la guarda de precio', () => {
    const resultado = parse('papa trescientos cincuenta el kilo', {
      preciosReferencia: { papa: 220 },
    });
    const papa = item(resultado);

    expect(papa.cantidadMilesimas).toBe(1_000_000);
    expect(papa.precioUnitarioCentavos).toBe(35_000);
    expect(papa.precioTotalCentavos).toBe(35_000);
    expect(papa.avisos).toContain('CANTIDAD_SUPUESTA');
    expect(papa.avisos).toContain('PRECIO_FUERA_DE_RANGO');
    expect(papa.avisos).toContain('PRECIO_AMBIGUO');
    expect(resultado.bloqueaConfirmacion).toBe(true);
  });

  it('T11 "docena de huevos cinco veinte" convierte a 12 unidades', () => {
    const resultado = parse('docena de huevos cinco veinte');
    const huevo = item(resultado);

    expect(huevo.descripcion).toBe('huevo');
    expect(huevo.cantidadMilesimas).toBe(12_000);
    expect(huevo.unidadBase).toBe('unidad');
    expect(huevo.precioTotalCentavos).toBe(520);
    expect(huevo.precioUnitarioCentavos).toBe(43);
    expect(huevo.avisos).toHaveLength(0);
  });

  it('T12 "cebolla china un atado a dos soles" conserva la presentacion', () => {
    const resultado = parse('cebolla china un atado a dos soles');
    const cebolla = item(resultado);

    expect(cebolla.descripcion).toBe('cebolla china');
    expect(cebolla.cantidadMilesimas).toBe(1_000);
    expect(cebolla.unidadBase).toBeNull();
    expect(cebolla.precioTotalCentavos).toBe(200);
    expect(cebolla.avisos).toContain('UNIDAD_SIN_EQUIVALENCIA');
    expect(resultado.bloqueaConfirmacion).toBe(false);
  });
});

describe('parsearCaptura: bordes', () => {
  it('rechaza texto vacio con zod', () => {
    expect(() => parse('   ')).toThrowError();
  });

  it('una captura siempre exige confirmacion humana', () => {
    expect(parse('docena de huevos cinco veinte').requiereConfirmacion).toBe(true);
  });
});
