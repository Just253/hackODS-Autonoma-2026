/**
 * Servicio del dia: del menu firmado al numero de raciones por grupo y total.
 *
 * Referencia: `docs/DECISIONES.md` D3 (menu semanal firmado + porcion por grupo).
 * - Puro: sin React, sin Supabase, sin red, sin reloj. Determinista.
 * - El total se DERIVA del padron y de las porciones firmadas; nunca es una constante.
 * - Un menu sin sello, sin publicar o con hash que no corresponde NO se sirve: se
 *   rechaza con `MenuNoServible` y el mensaje dice que campo falla.
 * - El padron son solo registros vigentes (`deletedAt === null`); una baja logica no come.
 * - Todas las opciones (A y B) se sirven: mismo padron, una `RacionOpcion` por plantilla.
 */
import type {
  Categoria,
  GrupoEtario,
  MenuTemplate,
  Persona,
  Portion,
  Substitution,
} from '@hackods/contracts';

import { MenuNoServible } from './errors.js';
import { sha256Hex } from './crypto/sha256.js';

/** Platos y porciones firmadas del dia, como las filas de `dish`/`portion` del seed. */
export interface PlatoServicio {
  readonly id: string;
  readonly momento: 'almuerzo' | 'cena';
  readonly titulo: string;
  /** Insumos del plato (`ingredient.insumo_id`). */
  readonly insumos: readonly string[];
  /** Una fila `portion` por grupo. Nunca se repite el grupo a proposito. */
  readonly porciones: readonly Portion[];
}

/** Una plantilla firmada con SU contenido: platos del dia y sustituciones de la plantilla. */
export interface MenuOpcion {
  /** La plantilla firmada (`menu_template`): estado, sello y hash. */
  readonly template: MenuTemplate;
  readonly platos: readonly PlatoServicio[];
  /** Filas `substitution` de esta plantilla. Solo las que estan aca son validas. */
  readonly sustituciones: readonly Substitution[];
}

/** @deprecated alias de `MenuOpcion`; conservado para no romper imports previos. */
export type MenuDelDia = MenuOpcion;

export interface RacionPorGrupo {
  readonly grupo: GrupoEtario;
  /** Que categoria del padron se mapeo a este grupo. */
  readonly categoria: Categoria;
  readonly personas: number;
  /** Gramos firmados por persona en el plato. */
  readonly porcion: number;
  readonly unidad: Portion['unidad'];
  /** personas x porcion, en la unidad de la porcion. */
  readonly raciones: number;
}

export interface RacionOpcion {
  readonly opcion: MenuTemplate['opcion'];
  readonly perfil: MenuTemplate['perfil'];
  readonly templateId: string;
  readonly porGrupo: readonly RacionPorGrupo[];
  /** El padron completo oficial del dia: `personas`. La suma en gramos es informativa. */
  readonly total: number;
  /** Suma de porciones de TODOS los platos (almuerzo + cena), no solo una comida. */
  readonly totalGramos: number;
  readonly gruposSinPorcion: readonly GrupoEtario[];
}

export interface SustitucionAplicada {
  readonly insumoOrigenId: string;
  readonly insumoDestinoId: string;
  readonly factor: number;
  readonly aprobadaPor: string;
}

export interface SustitucionFaltante {
  readonly platoId: string;
  readonly insumoOrigenId: string;
  /** Texto explicito pedido por el criterio de sustitucion. */
  readonly estado: 'sin sustituto';
}

export interface ResultadoServicio {
  /** Una opcion por plantilla servida (A y B, o las que lleguen). */
  readonly opciones: readonly RacionOpcion[];
  readonly sustituciones: {
    readonly aprobadas: readonly SustitucionAplicada[];
    readonly sinSustituto: readonly SustitucionFaltante[];
  };
}

/**
 * Categoria del padron -> grupo etario de la porcion firmada.
 *
 * Decision propia (D-17): `nino` es `menor_5` y `lactante` es `lactante_6_23m`, que es
 * la unica porcion que el contrato firma para ese grupo. `menor_6m` no come porcion
 * del servicio (lactancia), asi que el padron no puede caer ahi sin inventar.
 */
const GRUPO_POR_CATEGORIA: Readonly<Record<Categoria & string, GrupoEtario & string>> = {
  adulto: 'adulto',
  adulto_mayor: 'adulto_mayor',
  nino: 'menor_5',
  gestante: 'gestante',
  lactante: 'lactante_6_23m',
};

const CAMPOS_SERVIBLES: readonly GrupoEtario[] = [
  'adulto',
  'adulto_mayor',
  'menor_5',
  'gestante',
  'lactante_6_23m',
];

/**
 * Deduce el sello a partir de las columnas `sello_*` del seed. Si la plantilla trae
 * columnas de sello sin objeto `sello`, es una plantilla firmada cuyo sello no llego
 * al cliente: eso tambien es "sin sello".
 */
function selloDe(template: MenuTemplate): MenuTemplate['sello'] {
  return template.sello ?? null;
}

function rechazar(template: MenuTemplate, campo: string, detalle: string): never {
  throw new MenuNoServible(template.id, campo, detalle);
}

/**
 * Puerto de la validacion de sello: verifica estado y sello. El hash contra el
 * contenido lo cierra `esMenuServible` (que necesita el contenido del dia).
 */
function exigirFirma(template: MenuTemplate): NonNullable<MenuTemplate['sello']> {
  if (template.estado !== 'publicado' && template.estado !== 'aprobado') {
    rechazar(template, 'estado', `estado "${template.estado}": el menu no esta aprobado`);
  }
  const sello = selloDe(template);
  if (sello === null) {
    rechazar(template, 'sello', 'el menu no tiene sello del nutricionista');
  }
  if (sello.hash !== template.hash) {
    rechazar(
      template,
      'sello.hash',
      `el hash del sello (${sello.hash.slice(0, 12)}...) no coincide con el del menu`,
    );
  }
  if (sello.version !== template.version) {
    rechazar(
      template,
      'sello.version',
      `sello v${sello.version} contra menu v${template.version}`,
    );
  }
  return sello;
}

/**
 * Raciones del dia para las plantillas firmadas y un padron.
 *
 * @param menus las opciones firmadas del dia (una por plantilla: A, B, ...)
 * @param personas padron vigente; las bajas logicas se filtran aca
 *
 * Valida TODAS las plantillas antes de tocar el padron: si una no es servible, no
 * se sirve ninguna (un servicio a medias es peor que un error claro).
 */
export function servirDelDia(
  menus: readonly MenuOpcion[],
  personas: readonly Persona[],
): ResultadoServicio {
  if (menus.length === 0) {
    throw new MenuNoServible('(sin menu)', 'menu', 'no hay ninguna plantilla que servir');
  }

  // Puertos 1 y 2: estado + sello y hash contra el contenido, por cada plantilla.
  for (const menu of menus) {
    exigirFirma(menu.template);
    esMenuServible(menu.template, menu.platos);
  }

  const vigentes = personas.filter((persona) => persona.deletedAt === null);

  // Conteo por grupo; todo `0` declarado para que un grupo sin porcion no sea ambiguo.
  const conteo = new Map<GrupoEtario, number>();
  for (const grupo of CAMPOS_SERVIBLES) conteo.set(grupo, 0);
  for (const persona of vigentes) {
    const grupo = GRUPO_POR_CATEGORIA[persona.categoria];
    if (grupo === undefined) {
      // Enum cerrado: hoy no ocurre. La guarda evita inflar un grupo fantasma si
      // llega una categoria nueva sin grupo asignado.
      rechazar(
        menus[0]!.template,
        'categoria',
        `la categoria "${persona.categoria}" del padron no tiene grupo etario`,
      );
    }
    conteo.set(grupo, (conteo.get(grupo) ?? 0) + 1);
  }

  const opciones = menus.map((menu) => racionDeOpcion(menu, conteo, vigentes.length));

  const aprobadas: SustitucionAplicada[] = [];
  const sinSustituto: SustitucionFaltante[] = [];
  for (const menu of menus) {
    const resuelto = resolverSustituciones(menu);
    aprobadas.push(...resuelto.aprobadas);
    sinSustituto.push(...resuelto.sinSustituto);
  }

  return { opciones, sustituciones: { aprobadas, sinSustituto } };
}

/** Una `RacionOpcion` a partir de una plantilla y el conteo por grupo del padron. */
function racionDeOpcion(
  menu: MenuOpcion,
  conteo: ReadonlyMap<GrupoEtario, number>,
  totalPersonas: number,
): RacionOpcion {
  // Porcion por grupo: se toma del primer plato que la declare. Si dos platos del
  // mismo grupo declaran gramos distintos, el menu no es servible: no se elige uno.
  const porcionPorGrupo = new Map<GrupoEtario, Portion>();
  for (const plato of menu.platos) {
    const vistos = new Set<GrupoEtario>();
    for (const porcion of plato.porciones) {
      if (vistos.has(porcion.grupo)) {
        rechazar(
          menu.template,
          `porcion.${porcion.grupo}`,
          `el plato ${plato.id} declara dos porciones para el mismo grupo`,
        );
      }
      vistos.add(porcion.grupo);
      const previa = porcionPorGrupo.get(porcion.grupo);
      if (previa && (previa.cantidad !== porcion.cantidad || previa.unidad !== porcion.unidad)) {
        rechazar(
          menu.template,
          `porcion.${porcion.grupo}`,
          `gramos distintos en el dia (${previa.cantidad} ${previa.unidad} vs ${porcion.cantidad} ${porcion.unidad})`,
        );
      }
      if (!previa) porcionPorGrupo.set(porcion.grupo, porcion);
    }
  }

  const porGrupo: RacionPorGrupo[] = [];
  const gruposSinPorcion: GrupoEtario[] = [];
  for (const grupo of CAMPOS_SERVIBLES) {
    const personasGrupo = conteo.get(grupo) ?? 0;
    const porcion = porcionPorGrupo.get(grupo);
    if (personasGrupo === 0) continue;
    if (!porcion) {
      gruposSinPorcion.push(grupo);
      continue;
    }
    porGrupo.push({
      grupo,
      categoria: categoriaDe(grupo),
      personas: personasGrupo,
      porcion: porcion.cantidad,
      unidad: porcion.unidad,
      raciones: personasGrupo * porcion.cantidad,
    });
  }

  // El total en gramos suma CADA plato con sus porciones (almuerzo + cena). Un grupo
  // sin porcion no aporta al plato que no la declara.
  let totalGramos = 0;
  for (const plato of menu.platos) {
    for (const porcion of plato.porciones) {
      const personasGrupo = conteo.get(porcion.grupo) ?? 0;
      totalGramos += personasGrupo * porcion.cantidad;
    }
  }

  return {
    opcion: menu.template.opcion,
    perfil: menu.template.perfil,
    templateId: menu.template.id,
    porGrupo,
    total: totalPersonas,
    totalGramos,
    gruposSinPorcion,
  };
}

/** Categoria canonica del padron que alimenta un grupo firmado. */
function categoriaDe(grupo: GrupoEtario): Categoria {
  for (const [categoria, candidato] of Object.entries(GRUPO_POR_CATEGORIA)) {
    if (candidato === grupo) return categoria as Categoria;
  }
  // Solo puede pasar si se agrega un grupo a CAMPOS_SERVIBLES sin mapearlo.
  throw new Error(`sin categoria para el grupo ${grupo}`);
}

/**
 * Solo las sustituciones aprobadas en la plantilla. Nada de equivalencias inferidas:
 * si el insumo no esta en la plantilla, se dice `sin sustituto`.
 */
function resolverSustituciones(menu: MenuDelDia): ResultadoServicio['sustituciones'] {
  const aprobadas: SustitucionAplicada[] = [];
  const sinSustituto: SustitucionFaltante[] = [];
  const visto = new Set<string>();
  // Solo cuenta lo aprobado PARA ESTA plantilla: `substitution.template_id`.
  const deLaPlantilla = menu.sustituciones.filter(
    (sustitucion) => sustitucion.templateId === menu.template.id,
  );

  for (const sustitucion of deLaPlantilla) {
    const clave = `${sustitucion.insumoOrigenId}->${sustitucion.insumoDestinoId}`;
    if (visto.has(clave)) continue;
    visto.add(clave);
    aprobadas.push({
      insumoOrigenId: sustitucion.insumoOrigenId,
      insumoDestinoId: sustitucion.insumoDestinoId,
      factor: sustitucion.factor,
      aprobadaPor: sustitucion.aprobadaPor,
    });
  }

  // Insumos que pide el menu y no tienen sustituto aprobado en la plantilla: se dicen
  // uno por plato, sin factor inventado.
  for (const plato of menu.platos) {
    for (const insumoId of plato.insumos) {
      const tiene = deLaPlantilla.some((s) => s.insumoOrigenId === insumoId);
      if (tiene) continue;
      sinSustituto.push({ platoId: plato.id, insumoOrigenId: insumoId, estado: 'sin sustituto' });
    }
  }

  return { aprobadas, sinSustituto };
}

/**
 * Un menu es servible si esta `aprobado`/`publicado`, tiene sello valido y el hash
 * del sello es el de su contenido del dia (estable: `id`, `momento`, `titulo` y las
 * porciones `grupo`/`cantidad`/`unidad` de cada plato). Las versiones, sellos y
 * timestamps del contrato no entran al hash.
 *
 * TODO(M3) cerrado: antes lanzaba `NoImplementado`.
 */
export function esMenuServible(
  template: MenuTemplate,
  platos: readonly PlatoServicio[] = [],
): boolean {
  const sello = exigirFirma(template);
  // El hash canonico es sha256 de la serializacion, en hex (formato de `sello.hash`).
  const esperado = sha256Hex(serializarContenido(template, platos));
  if (sello.hash !== esperado) {
    rechazar(template, 'sello.hash', 'el hash del sello no corresponde al contenido del dia');
  }
  return true;
}

/**
 * Texto estable que se firma del dia. Claves en orden fijo, sin objetos anidados
 * con orden arbitrario, sin espacios: dos renders del mismo menu dan el mismo hash.
 */
export function serializarContenido(
  template: MenuTemplate,
  platos: readonly PlatoServicio[],
): string {
  const dias = platos
    .map((plato) => {
      const porciones = plato.porciones
        .map((porcion) => `${porcion.grupo}:${porcion.cantidad}:${porcion.unidad}`)
        .sort()
        .join(',');
      return `${plato.id}|${plato.momento}|${plato.titulo}|${porciones}`;
    })
    .sort()
    .join(';');
  return `menu:${template.id}|perfil:${template.perfil}|opcion:${template.opcion}|${dias}`;
}
