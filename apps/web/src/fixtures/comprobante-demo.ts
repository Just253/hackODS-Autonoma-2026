/**
 * Boleta ficticia de la demo (paso 4 del guion, MODO-6H seccion 4).
 *
 * Precios y cantidades son sinteticos y evidentes: no vienen de una olla real
 * ni de una boleta real. El texto crudo imita como lo imprime un proveedor
 * mayorista (abreviado y en mayusculas) porque lo que se muestra es justamente
 * que la app NO adivina el producto.
 *
 * Cuantos items quedan en `por_revisar` no se decide aca: lo decide
 * `clasificarItem()` con TAU, MARGEN y PISO del dominio. Cambia el umbral,
 * cambia el resultado.
 */
import type { Centimos, ProductoCatalogo } from '@hackods/contracts';

import type { CandidatoConProducto } from '../features/comprobante/clasificar.js';

/** Una linea tal como la imprimio la boleta, antes de clasificar. */
export interface ItemBoleta {
  readonly id: string;
  readonly lineaNo: number;
  readonly descripcionCruda: string;
  readonly cantidadTextual: string | null;
  readonly cantidadMilesimas: number | null;
  readonly unidadCruda: string | null;
  readonly unidadBase: 'g' | 'ml' | 'unidad' | null;
  readonly precioUnitarioCrudoCentavos: Centimos | null;
  /** Bruto pagado por la linea: lo que entra al presupuesto si se confirma. */
  readonly totalLineaCentavos: Centimos;
}

const c = (valor: number): Centimos => valor as Centimos;

function producto(
  id: string,
  nombre: string,
  categoria: ProductoCatalogo['categoria'],
  unidadBase: ProductoCatalogo['unidadBase'],
): ProductoCatalogo {
  return {
    id,
    slug: id.replace(/^prod-/, ''),
    nombre,
    categoria,
    subcategoria: null,
    unidadBase,
    perecedero: categoria === 'carnes' || categoria === 'verduras',
    pesoVariable: categoria === 'carnes' || categoria === 'verduras',
    rangoPrecioMinMicrocent: null,
    rangoPrecioMaxMicrocent: null,
    cantidadMinLineaMilesimas: null,
    cantidadMaxLineaMilesimas: null,
    activo: true,
    version: 1,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
  };
}

/** Catalogo minimo de la demo: solo los productos que aparecen en la boleta. */
export const CATALOGO_DEMO: readonly ProductoCatalogo[] = [
  producto('prod-arroz-extra', 'Arroz extra', 'abarrotes', 'g'),
  producto('prod-arroz', 'Arroz', 'abarrotes', 'g'),
  producto('prod-pollo-entero', 'Pollo entero', 'carnes', 'g'),
  producto('prod-pollo-pechuga', 'Pollo pechuga', 'carnes', 'g'),
  producto('prod-aceite', 'Aceite vegetal', 'abarrotes', 'ml'),
  producto('prod-papa-blanca', 'Papa blanca', 'verduras', 'g'),
  producto('prod-cebolla', 'Cebolla', 'verduras', 'g'),
  producto('prod-sal', 'Sal', 'abarrotes', 'g'),
];

/** Las 6 lineas de la boleta ficticia. Totales en centimos, sin floats. */
export const ITEMS_BOLETA: readonly ItemBoleta[] = [
  { id: 'item-01', lineaNo: 1, descripcionCruda: 'ARROZ EXTRA 5KG', cantidadTextual: '1', cantidadMilesimas: 5_000, unidadCruda: 'BOLSA 5KG', unidadBase: 'g', precioUnitarioCrudoCentavos: c(2_450), totalLineaCentavos: c(2_450) },
  { id: 'item-02', lineaNo: 2, descripcionCruda: 'ARROZ 3KG', cantidadTextual: '1', cantidadMilesimas: 3_000, unidadCruda: 'BOLSA 3KG', unidadBase: 'g', precioUnitarioCrudoCentavos: c(1_320), totalLineaCentavos: c(1_320) },
  { id: 'item-03', lineaNo: 3, descripcionCruda: 'POLLO ENTERO KG', cantidadTextual: '4.250', cantidadMilesimas: 4_250, unidadCruda: 'KG', unidadBase: 'g', precioUnitarioCrudoCentavos: c(780), totalLineaCentavos: c(3_315) },
  { id: 'item-04', lineaNo: 4, descripcionCruda: 'POLLO PECHUGA KG', cantidadTextual: '2.100', cantidadMilesimas: 2_100, unidadCruda: 'KG', unidadBase: 'g', precioUnitarioCrudoCentavos: c(1_450), totalLineaCentavos: c(3_045) },
  { id: 'item-05', lineaNo: 5, descripcionCruda: 'ACEITE VEG 1L', cantidadTextual: '3', cantidadMilesimas: 1_000, unidadCruda: 'BOT 1L', unidadBase: 'ml', precioUnitarioCrudoCentavos: c(890), totalLineaCentavos: c(2_670) },
  { id: 'item-06', lineaNo: 6, descripcionCruda: 'PAPA BLANCA KG', cantidadTextual: '8.000', cantidadMilesimas: 8_000, unidadCruda: 'KG', unidadBase: 'g', precioUnitarioCrudoCentavos: c(210), totalLineaCentavos: c(1_680) },
];

/**
 * Candidatos del doble de embeddings, por linea. Los ambiguos son a proposito:
 * - item-01 ARROZ EXTRA: s1 0,71, s2 0,68 -> margen 0,03 < 0,04 -> por_revisar.
 * - item-03 POLLO ENTERO: s1 0,66 < TAU 0,69 (sobre PISO) -> por_revisar.
 * Los otros cuatro superan TAU con margen de sobra y se auto-confirman.
 */
export const CANDIDATOS_POR_ITEM: Readonly<Record<string, readonly CandidatoConProducto[]>> = {
  'item-01': [
    { productoId: 'prod-arroz-extra', nombre: 'Arroz extra', categoria: 'abarrotes', similitud: 0.71 },
    { productoId: 'prod-arroz', nombre: 'Arroz', categoria: 'abarrotes', similitud: 0.68 },
  ],
  'item-02': [
    { productoId: 'prod-arroz-extra', nombre: 'Arroz extra', categoria: 'abarrotes', similitud: 0.79 },
    { productoId: 'prod-arroz', nombre: 'Arroz', categoria: 'abarrotes', similitud: 0.62 },
  ],
  'item-03': [
    { productoId: 'prod-pollo-entero', nombre: 'Pollo entero', categoria: 'carnes', similitud: 0.66 },
    { productoId: 'prod-pollo-pechuga', nombre: 'Pollo pechuga', categoria: 'carnes', similitud: 0.64 },
  ],
  'item-04': [
    { productoId: 'prod-pollo-pechuga', nombre: 'Pollo pechuga', categoria: 'carnes', similitud: 0.88 },
    { productoId: 'prod-pollo-entero', nombre: 'Pollo entero', categoria: 'carnes', similitud: 0.72 },
  ],
  'item-05': [
    { productoId: 'prod-aceite', nombre: 'Aceite vegetal', categoria: 'abarrotes', similitud: 0.91 },
    { productoId: 'prod-sal', nombre: 'Sal', categoria: 'abarrotes', similitud: 0.51 },
  ],
  'item-06': [
    { productoId: 'prod-papa-blanca', nombre: 'Papa blanca', categoria: 'verduras', similitud: 0.93 },
    { productoId: 'prod-cebolla', nombre: 'Cebolla', categoria: 'verduras', similitud: 0.58 },
  ],
};
