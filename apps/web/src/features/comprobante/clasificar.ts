/**
 * De los candidatos de embeddings al `Clasificacion` del contrato.
 *
 * `docs/contracts/clasificacion.md` (seccion 4.3): dos puertas + piso.
 *   s1 >= tau  Y  (s1 - s2) >= margen  ->  confirmado
 *   s1 >= piso (sin superar la puerta) ->  por_revisar
 *   s1 <  piso                         ->  desconocido
 *
 * Los tres numeros salen de CONFIG_CLASIFICACION de @hackods/domain: aca no
 * hay 0,69 / 0,04 / 0,45 escritos a mano (DEC-2026-0008).
 */
import { CONFIG_CLASIFICACION } from '@hackods/domain';
import type { CandidatoProducto, Clasificacion, MotivoClasificacion } from '@hackods/contracts';

import type { ItemBoleta } from '../../fixtures/comprobante-demo.js';

/** Lo que devuelve el doble de embeddings: producto y similitud coseno. */
export interface CandidatoConProducto {
  readonly productoId: string;
  readonly nombre: string;
  readonly categoria: string;
  readonly similitud: number;
}

export interface ConfiguracionUmbrales {
  readonly tau: number;
  readonly margen: number;
  readonly piso: number;
}

const CANDIDATOS_MAXIMOS = 3;

function seisDecimales(valor: number): number {
  return Math.round(valor * 1_000_000) / 1_000_000;
}

/**
 * Clasifica un item. Funcion pura: mismos candidatos, mismo resultado; sin
 * reloj, sin red y sin azar. `config` existe solo para los tests: la pantalla
 * usa el valor del dominio y no le pasa nada.
 */
export function clasificarItem(
  item: ItemBoleta,
  candidatos: readonly CandidatoConProducto[],
  config: ConfiguracionUmbrales = CONFIG_CLASIFICACION,
): Clasificacion {
  const top = [...candidatos].sort((a, b) => b.similitud - a.similitud).slice(0, CANDIDATOS_MAXIMOS);
  const primero = top[0];
  const segundo = top[1];

  const candidatosContrato: CandidatoProducto[] = top.map((candidato) => ({
    productoId: candidato.productoId,
    nombre: candidato.nombre,
    categoria: candidato.categoria,
    similitud: seisDecimales(candidato.similitud),
    origen: 'embedding',
  }));

  if (primero === undefined) {
    return {
      itemId: item.id,
      estado: 'desconocido',
      productoId: null,
      candidatos: [],
      confianza: 0,
      motivo: 'sin_catalogo',
      unidadBase: item.unidadBase,
      cantidadBase: null,
      precioPorUnidadBase: null,
      requiereRevision: true,
    };
  }

  const s1 = primero.similitud;
  // Sin segundo candidato el margen es la similitud: no hay empate posible.
  const s2 = segundo?.similitud ?? 0;
  const margen = s1 - s2;

  let estado: Clasificacion['estado'];
  let motivo: MotivoClasificacion;

  if (s1 < config.piso) {
    estado = 'desconocido';
    motivo = 'similitud_baja';
  } else if (s1 >= config.tau && margen >= config.margen) {
    estado = 'confirmado';
    motivo = 'similitud_alta';
  } else if (s1 < config.tau) {
    // Hay candidato pero no alcanza la puerta de similitud.
    estado = 'por_revisar';
    motivo = 'similitud_baja';
  } else {
    // Supera la similitud pero empata con el segundo: no se auto-confirma.
    estado = 'por_revisar';
    motivo = 'margen_insuficiente';
  }

  return {
    itemId: item.id,
    estado,
    productoId: estado === 'confirmado' ? primero.productoId : null,
    candidatos: candidatosContrato,
    confianza: seisDecimales(s1),
    motivo,
    unidadBase: item.unidadBase,
    cantidadBase: item.cantidadMilesimas === null ? null : (item.cantidadMilesimas as NonNullable<Clasificacion['cantidadBase']>),
    precioPorUnidadBase: null,
    requiereRevision: estado !== 'confirmado',
  };
}

/**
 * La invariante de DEC-2026-0008: nada suma al presupuesto sin confirmar.
 * Un solo lugar decide; la pantalla y el test leen de aca.
 */
export function sumaAlPresupuesto(estado: Clasificacion['estado']): boolean {
  return estado === 'confirmado';
}
