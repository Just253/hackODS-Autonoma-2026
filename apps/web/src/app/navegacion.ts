import type { NombreIcono } from '@hackods/ui';

/**
 * Modelo de navegacion. Un solo lugar decide que destinos existen y en que
 * orden, para que la barra del telefono, el rail de escritorio y el titulo del
 * header no se contradigan.
 *
 * Dos grupos, no dos modos:
 *
 * - `DIARIOS`: lo que se hace todos los dias, en el orden en que se usa.
 * - `SECUNDARIOS`: entre ollas. No se toca a cada rato, pero tampoco se
 *   esconde: en el telefono vive en "Más", en escritorio esta siempre a la
 *   vista en el rail.
 *
 * La barra inferior del telefono muestra los cuatro diarios (cuatro es el
 * maximo que se lee de pie sin apretar) y "Más" abre el resto. Antes habia un
 * modo `simple` que bajaba la barra a tres y escondia "Plata" en "Más": el
 * numero que mas se mira quedaba a dos toques. Se fue.
 */
export interface Destino {
  readonly a: string;
  /** Texto de la barra. Corto: se lee de pie. */
  readonly texto: string;
  /** Titulo largo para el rail, el menu "Más" y el lector de pantalla. */
  readonly descripcion: string;
  readonly icono: NombreIcono;
  /** Que resuelve, en palabras de la cocinera. */
  readonly tarea: string;
}

export interface Seccion {
  /** Titulo del grupo en el rail de escritorio y en la hoja "Más". */
  readonly titulo: string;
  readonly destinos: readonly Destino[];
}

export const DIARIOS: readonly Destino[] = [
  {
    a: '/padron',
    texto: 'Padrón',
    descripcion: 'Padrón',
    icono: 'padron',
    tarea: 'Dar de alta a una persona con su código P-XXXX.',
  },
  {
    a: '/servicio',
    texto: 'Servir',
    descripcion: 'Servicio del día',
    icono: 'servicio',
    tarea: 'Anotar la ración de hoy de cada persona.',
  },
  {
    a: '/comprobante',
    texto: 'Boleta',
    descripcion: 'Comprobante',
    icono: 'comprobante',
    tarea: 'Revisar la boleta antes de que sume al presupuesto.',
  },
  {
    a: '/presupuesto',
    texto: 'Plata',
    descripcion: 'Presupuesto',
    icono: 'presupuesto',
    tarea: 'Ver cuánto hay, cuánto se gastó y cuánto queda.',
  },
] as const;

export const SECUNDARIOS: readonly Destino[] = [
  {
    a: '/precios',
    texto: 'Precios',
    descripcion: 'Precios de insumos',
    icono: 'precios',
    tarea: 'Ver el precio típico de cada insumo y si subió o bajó.',
  },
  {
    a: '/solicitud',
    texto: 'Entre ollas',
    descripcion: 'Entre ollas',
    icono: 'entreOllas',
    tarea: 'Pedir o entregar insumos a otra olla.',
  },
  {
    a: '/reporte',
    texto: 'Reporte',
    descripcion: 'Reporte entre ollas',
    icono: 'reporte',
    tarea: 'Ver el volumen movido por categoría.',
  },
] as const;

/** Los grupos, en el orden del rail. */
export const SECCIONES: readonly Seccion[] = [
  { titulo: 'Día a día', destinos: DIARIOS },
  { titulo: 'Otros', destinos: SECUNDARIOS },
] as const;

/** Destinos de la barra inferior del telefono. */
export function destinosDeBarra(): readonly Destino[] {
  return DIARIOS;
}

/** Lo que la barra del telefono deja en "Más". */
export function destinosDeMas(): readonly Destino[] {
  return SECUNDARIOS;
}

/** Todos los destinos, para resolver el titulo del header por ruta. */
export const TODOS: readonly Destino[] = [...DIARIOS, ...SECUNDARIOS];

/** El destino de una ruta, o `null` si la ruta no es del menu (hoy, ninguna). */
export function destinoDeRuta(ruta: string): Destino | null {
  return TODOS.find((destino) => ruta === destino.a || ruta.startsWith(`${destino.a}/`)) ?? null;
}
