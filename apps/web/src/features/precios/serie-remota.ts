/**
 * De filas de `precios` (Supabase) a lo que pinta `PreciosPantalla`.
 *
 * Reglas que aplica, todas del contrato (docs/contracts/comprobantes.md §8.2,
 * parametros P1) y ninguna inventada aca:
 *
 * - Una serie por `(insumo, canal, unidad)`: mayorista y minorista NO se
 *   mezclan (DEC-2026-0008).
 * - Ventana actual `[t-30, t]`, ventana previa `[t-60, t-31]`; `t` es la fecha
 *   de la ultima compra de ESA serie. Por que la ultima compra y no "hoy": una
 *   serie cargada la semana pasada no puede quedar vacia solo porque pasaron
 *   los dias; la comparacion es contra si misma.
 * - La mediana, el filtro de atipicos y el `N_min = 3` los hace
 *   `calcularTendencia` -> `medianaMovil` de `@hackods/domain`. Aca no se
 *   calcula ningun precio.
 *
 * La conversion de unidad es la del seed (`supabase/seed.sql`): `precio` esta en
 * microcentesimos por unidad base y la pantalla muestra la unidad de compra
 * (`g` -> kg, `ml` -> L, `unidad` -> unidad), asi que 420000 -> S/ 4,20 / kg y
 * 50000 -> S/ 0,50 / unidad. El factor sale de 1 céntimo = 10 000 micro y
 * 1 000 g/L por unidad de compra: 1 000 / 1 000 000 * 10 000 = 10.
 */
import type { Microcentesimos } from '@hackods/contracts';

import type { PrecioRemoto } from '../../data/remoto.js';
import type { ObservacionPrecio } from './dominio.js';
import type { ProductoPrecio } from './PreciosPantalla.js';

/** Dias de cada ventana, contrato P1. */
export const DIAS_VENTANA_ACTUAL = 30;
export const DIAS_VENTANA_PREVIA = 30;
const DIA_MS = 86_400_000;
/** Ver el comentario de arriba: micro de la fila -> micro de la unidad visible. */
const MICRO_POR_UNIDAD_VISIBLE = 10;

export function microDesdeFila(precio: number): number {
  return Math.round(precio * MICRO_POR_UNIDAD_VISIBLE);
}

function micro(valor: number): Microcentesimos {
  return valor as Microcentesimos;
}

/** Medianoche UTC de `AAAA-MM-DD`; `NaN` si la fecha no es una fecha. */
function instante(fecha: string): number {
  return Date.parse(`${fecha}T00:00:00Z`);
}

function haceDias(instanteBase: number, dias: number): number {
  return instanteBase - dias * DIA_MS;
}

export interface Ventanas {
  readonly actual: readonly ObservacionPrecio[];
  readonly previa: readonly ObservacionPrecio[];
}

/**
 * Separa una serie ya ordenada por fecha en las dos ventanas del contrato. Lo
 * que cae fuera de `[t-60, t]` no entra: es historia que la pantalla no compara.
 */
export function partirVentanas(
  filas: readonly PrecioRemoto[],
  referencia: string,
): Ventanas {
  const base = instante(referencia);
  if (Number.isNaN(base)) return { actual: [], previa: [] };

  const desdeActual = haceDias(base, DIAS_VENTANA_ACTUAL);
  const desdePrevia = haceDias(base, DIAS_VENTANA_ACTUAL + DIAS_VENTANA_PREVIA);
  const hastaPrevia = haceDias(base, DIAS_VENTANA_ACTUAL + 1);

  const actual: ObservacionPrecio[] = [];
  const previa: ObservacionPrecio[] = [];

  for (const fila of filas) {
    const dia = instante(fila.fecha);
    if (Number.isNaN(dia)) continue;
    const observacion: ObservacionPrecio = {
      id: `${fila.insumoId}:${fila.canal}:${fila.fecha}`,
      valor: micro(microDesdeFila(fila.precio)),
      fecha: fila.fecha,
    };
    if (dia >= desdeActual && dia <= base) {
      actual.push(observacion);
    } else if (dia >= desdePrevia && dia <= hastaPrevia) {
      previa.push(observacion);
    }
  }

  return { actual, previa };
}

/**
 * Un `ProductoPrecio` por serie. El canal va en el nombre porque la pantalla
 * compara series y no puede aparentar que un solo precio mezcla los dos
 * mercados.
 */
export function productosDeLaSerie(
  filas: readonly PrecioRemoto[],
): readonly ProductoPrecio[] {
  const grupos = new Map<string, PrecioRemoto[]>();
  for (const fila of filas) {
    const clave = `${fila.insumoId}\u0000${fila.canal}\u0000${fila.unidad}`;
    const grupo = grupos.get(clave);
    if (grupo === undefined) {
      grupos.set(clave, [fila]);
    } else {
      grupo.push(fila);
    }
  }

  const productos: ProductoPrecio[] = [];
  for (const grupo of grupos.values()) {
    const ordenadas = [...grupo].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const referencia = ordenadas[ordenadas.length - 1]?.fecha;
    const primera = ordenadas[0];
    if (referencia === undefined || primera === undefined) continue;

    const { actual, previa } = partirVentanas(ordenadas, referencia);
    productos.push({
      id: `${primera.insumoId}:${primera.canal}:${primera.unidad}`,
      nombre: `${primera.insumo} (${primera.canal})`,
      unidad: primera.unidad,
      ventanaActual: actual,
      ventanaPrevia: previa,
    });
  }

  return productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
