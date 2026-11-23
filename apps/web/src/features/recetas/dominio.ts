/**
 * Puente entre el recetario y `@hackods/domain`.
 *
 * Aca NO hay formulas de negocio: la explosion, el costo, el faltante y la
 * sustitucion son funciones puras del dominio. Este archivo solo:
 * - arma el mapa de precios por unidad base desde la serie demo ya existente
 *   (`medianaMovil`, la misma que usa Precios) y
 * - formatea numeros para la pantalla.
 */
import { medianaMovil, precioPorUnidadBase, type PrecioInsumo, type PreciosPorInsumo } from '@hackods/domain';
import type { UnidadBase } from '@hackods/contracts';

import type { ProductoPrecioDemo } from '../../fixtures/precios-productos.js';
import type { InsumoDemo } from '../../fixtures/recetas-demo.js';
import { formatearPrecioSoles } from '../precios/formato-precio.js';

export { formatearPrecioSoles };

function unidadDePrecio(unidad: string): 'g' | 'kg' | 'ml' | 'l' | 'unidad' | null {
  return unidad === 'g' || unidad === 'kg' || unidad === 'ml' || unidad === 'l' || unidad === 'unidad'
    ? unidad
    : null;
}

/**
 * Precio por unidad base de cada insumo, desde la ventana actual de precios.
 *
 * Usa la mediana movil del repo (no un promedio) y convierte kg -> g / l -> ml.
 * Si la muestra no alcanza o el insumo no tiene serie, el precio queda en
 * `null`: la pantalla dice `sin dato` y no se inventa un valor.
 */
export function preciosDesdeProductos(
  productos: readonly ProductoPrecioDemo[],
  insumos: readonly InsumoDemo[],
): PreciosPorInsumo {
  const porId = new Map(insumos.map((insumo) => [insumo.id, insumo]));
  const precios: Record<string, PrecioInsumo> = {};

  for (const producto of productos) {
    const insumo = porId.get(producto.id);
    if (insumo === undefined) continue;
    const unidad = unidadDePrecio(producto.unidad);
    const mediana = medianaMovil(producto.ventanaActual).mediana;
    const microPorUnidadBase =
      mediana === null || unidad === null
        ? null
        : precioPorUnidadBase(Number(mediana), unidad, insumo.unidadBase, insumo.gramosPorUnidad);
    precios[insumo.id] = { microPorUnidadBase };
  }

  return precios;
}

/** Gramos enteros con separador de miles: `19860` -> `19 860 g`. */
export function formatearGramos(gramos: number): string {
  const redondeado = Math.round(gramos);
  const signo = redondeado < 0 ? '-' : '';
  const digitos = Math.abs(redondeado)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signo}${digitos} g`;
}

/** Factor con dos decimales y coma: `1.2` -> `1,20`. */
export function formatearFactor(factor: number): string {
  return factor.toFixed(2).replace('.', ',');
}

/** Precio por kilo/litro/unidad a partir del precio por unidad base. */
export function textoPrecioVenta(precio: PrecioInsumo | undefined, unidadBase: UnidadBase): string {
  const micro = precio?.microPorUnidadBase ?? null;
  if (micro === null) return 'sin dato';
  if (unidadBase === 'unidad') return `${formatearPrecioSoles(micro)} / unidad`;
  const etiqueta = unidadBase === 'g' ? 'kg' : 'l';
  return `${formatearPrecioSoles(micro * 1000)} / ${etiqueta}`;
}
