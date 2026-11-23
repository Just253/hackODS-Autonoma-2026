import type { NombreIcono } from '@hackods/ui';

import type { Modo } from './modo.js';

/**
 * Modelo de navegacion. Un solo lugar decide que destinos existen y en que
 * orden, para que la barra, el menu secundario y el modo no se contradigan.
 *
 * Regla del modo `simple`: la barra inferior tiene **como maximo 3 destinos**.
 * Todo lo demas vive en "Mas". Si un dia se quiere agregar un cuarto destino a
 * `simple`, se saca otro; la barra no crece.
 */
export interface Destino {
  readonly a: string;
  /** Texto de la barra. Corto: se lee de pie. */
  readonly texto: string;
  /** Titulo largo para el menu "Mas" y el lector de pantalla. */
  readonly descripcion: string;
  readonly icono: NombreIcono;
  /** Que resuelve, en palabras de la cocinera. Se usa en Ajustes. */
  readonly tarea: string;
}

/**
 * Destinos diarios, en el orden en que se usan: se da de alta a la persona,
 * se sirve, se revisa la boleta y se mira cuanto queda.
 */
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
    descripcion: 'Presupuesto de la olla',
    icono: 'presupuesto',
    tarea: 'Ver cuánto hay, cuánto se gastó y cuánto queda.',
  },
] as const;

/** Lo que no se toca todos los dias. */
export const SECUNDARIOS: readonly Destino[] = [
  {
    a: '/precios',
    texto: 'Precios',
    descripcion: 'Precio del pollo',
    icono: 'precios',
    tarea: 'Ver la mediana del precio y si subió o bajó.',
  },
  {
    a: '/solicitud',
    texto: 'Entre ollas',
    descripcion: 'Entre ollas',
    icono: 'mas',
    tarea: 'Pedir o entregar insumos a otra olla.',
  },
  {
    a: '/reporte',
    texto: 'Reporte',
    descripcion: 'Reporte entre ollas',
    icono: 'precios',
    tarea: 'Ver el volumen movido por categoría.',
  },
] as const;

/** Destinos de la barra inferior. `simple` nunca pasa de tres. */
export function destinosDeBarra(modo: Modo): readonly Destino[] {
  return modo === 'simple' ? DIARIOS.slice(0, 3) : DIARIOS;
}

/** Lo que `simple` esconde en "Mas", en el mismo orden. */
export function destinosDeMas(modo: Modo): readonly Destino[] {
  return modo === 'simple' ? [...DIARIOS.slice(3), ...SECUNDARIOS] : SECUNDARIOS;
}

/** Todos los destinos, para resolver el titulo del header por ruta. */
export const TODOS: readonly Destino[] = [...DIARIOS, ...SECUNDARIOS];

/** El destino de una ruta, o `null` si la ruta no es del menu (hoy, ninguna). */
export function destinoDeRuta(ruta: string): Destino | null {
  return TODOS.find((destino) => ruta === destino.a || ruta.startsWith(`${destino.a}/`)) ?? null;
}
