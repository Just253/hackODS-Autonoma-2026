import type { Olla, RacionSugerida, Receta, Servicio, Solicitud } from '@hackods/contracts';

export interface FilaPadron {
  readonly personaId: string;
  /** Alias, nunca nombre completo ni DNI. */
  readonly alias: string;
  readonly edadAnios: number | null;
  readonly tipoRacion: string;
  readonly marcado: boolean;
}

export interface InsumoReceta {
  readonly insumoId: string;
  readonly nombre: string;
  /** `null` = [valor a confirmar]. */
  readonly gramos: number | null;
}

/**
 * Modelo de documento independiente de la presentacion.
 * La plantilla no calcula nada: recibe el modelo armado.
 */
export type Documento =
  | { readonly tipo: 'padron'; readonly olla: Olla; readonly servicio: Servicio; readonly filas: readonly FilaPadron[] }
  | {
      readonly tipo: 'receta';
      readonly receta: Receta;
      readonly insumos: readonly InsumoReceta[];
      readonly comensales: number;
    }
  | {
      readonly tipo: 'solicitud';
      readonly solicitud: Solicitud;
      readonly origen: Olla;
      readonly destino: Olla;
    }
  | { readonly tipo: 'comprobante'; readonly racion: RacionSugerida; readonly folio: string; readonly qr: string }
  | { readonly tipo: 'etiqueta'; readonly olla: Olla; readonly fecha: string; readonly qr: string };
