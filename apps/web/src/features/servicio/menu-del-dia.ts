/**
 * El menu firmado del dia que la pantalla de servicio muestra Y registra (#90).
 *
 * Por que existe este modulo: la racion se guardaba con `servicioId: null`
 * mientras el resumen pintaba `menusDelDiaDemo()` por su cuenta. Eran DOS
 * fuentes: la racion no quedaba ligada al menu que la cocinera tenia delante y,
 * al remontar, el resumen no decia lo mismo que se habia registrado. Aca hay
 * UNA sola lectura —`menuDelDia()`— y de ella salen el `servicioId` que se
 * guarda y la lista que pinta `ServicioResumen`.
 *
 * De donde sale el id (issue #90): del `template.id` de la opcion firmada que se
 * sirve. Es el identificador que ya tiene el menu (`menu_template.id`, UUID en
 * el seed) y el que el servidor puede volver a resolver; un id inventado por
 * fecha (`servicio-AAAA-MM-DD`) no se puede cruzar despues con la plantilla que
 * lo justifico, que es el punto de CU-03. Si el dia no trae un menu servible,
 * devuelve `null` y la pantalla lo DICE: nunca se registra con `null` en
 * silencio.
 *
 * Fuente de hoy: el fixture `menusDelDiaDemo()`. En `main` todavia no hay lectura
 * de `menu_template` en Supabase (`data/remoto.ts` no la expone), asi que
 * conectarla es deuda, no de este issue. Cuando exista, se cambia SOLO el
 * origen de `menusDelDia()` y el resto de la pantalla no se toca: el contrato de
 * este modulo es `{servicioId, menus}` ya resueltos.
 */
import {
  MenuNoServible,
  servirDelDia,
  type MenuOpcion,
  type RacionOpcion,
} from '@hackods/domain';

import { formatearDia } from '../../app/fechas.js';
import { menusDelDiaDemo } from '../../fixtures/servicio-demo.js';

/** Lo que la pantalla necesita saber del dia, y nada mas. */
export interface MenuDelDia {
  /**
   * Id con el que se guarda cada racion. Es el `template.id` de la opcion que
   * se sirve; `null` = sin menu firmado servible (la accion se deshabilita).
   */
  readonly servicioId: string | null;
  /** El MISMO menu que alimenta al resumen. Nunca se pide dos veces. */
  readonly menus: readonly MenuOpcion[];
  /** Por que no hay `servicioId`, en palabras de la cocina. `null` = hay menu. */
  readonly motivoSinMenu: string | null;
  /** Sello de la opcion servible, para la linea del encabezado de la pantalla. */
  readonly sello: { readonly fecha: string; readonly version: number } | null;
}

/**
 * Como se lee el menu. El test y, mas adelante, el origen remoto entran por
 * aca: la pantalla nunca llama al fixture por su cuenta.
 */
export type LecturaMenu = () => readonly MenuOpcion[];

/**
 * La opcion que se sirve. Si hay varias (general/A, especial/A), manda la
 * primera con porciones firmadas: la que trae el menu que se reparte. Sin
 * ninguna, la primera servible; sin ninguna servible, `null`.
 */
function opcionQueSeSirve(opciones: readonly RacionOpcion[]): RacionOpcion | null {
  return opciones.find((o) => o.porGrupo.length > 0) ?? opciones[0] ?? null;
}

/**
 * Resuelve el menu del dia UNA vez. El `servicioId` sale de aqui, no de la UI:
 * la pantalla no elige el id, lo recibe.
 */
export function menuDelDia(leer: LecturaMenu = menusDelDiaDemo): MenuDelDia {
  const menus = leer();

  if (menus.length === 0) {
    return {
      servicioId: null,
      menus,
      motivoSinMenu: 'Todavía no se cargó el menú firmado del día.',
      sello: null,
    };
  }

  let opciones: readonly RacionOpcion[];
  try {
    // `servirDelDia` valida estado, sello y porciones del padron que reciba.
    // Aca el padron no importa: se pregunta solo por la servibilidad del menu,
    // asi que se pasa la lista vacia (total 0, sin filtrar nada).
    opciones = servirDelDia(menus, []).opciones;
  } catch (error: unknown) {
    if (error instanceof MenuNoServible) {
      return {
        servicioId: null,
        menus,
        motivoSinMenu: 'El menú de hoy no se puede servir: no tiene la firma de la nutricionista.',
        sello: null,
      };
    }
    throw error;
  }

  const opcion = opcionQueSeSirve(opciones);
  if (opcion === null) {
    return {
      servicioId: null,
      menus,
      motivoSinMenu: 'El menú de hoy no trae ninguna opción servible.',
      sello: null,
    };
  }

  const template = menus.find((m) => m.template.id === opcion.templateId)?.template;
  const firma = template?.sello ?? null;
  return {
    servicioId: opcion.templateId,
    menus,
    motivoSinMenu: null,
    sello: firma === null ? null : { fecha: firma.fecha, version: firma.version },
  };
}

/** "Menú del día firmado el 1 de noviembre (versión 1)". */
export function textoDelMenu(menu: MenuDelDia): string {
  if (menu.sello === null) return 'Menú del día';
  return `Menú del día firmado el ${formatearDia(menu.sello.fecha)} (versión ${menu.sello.version})`;
}

