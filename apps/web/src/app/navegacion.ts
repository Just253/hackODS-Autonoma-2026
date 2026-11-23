import type { NombreIcono } from '@hackods/ui';

import type { Rol, Sesion } from './sesion.js';

/**
 * Modelo de navegacion. Un solo lugar decide que destinos existen, en que
 * orden y PARA QUE ROL, para que la barra del telefono, el rail de escritorio
 * y el titulo del header no se contradigan ni muestren lo que el rol no hace.
 *
 * Dos grupos, no dos modos:
 *
 * - `DIARIOS`: lo que se hace todos los dias, en el orden en que se usa.
 * - `SECUNDARIOS`: entre ollas. No se toca a cada rato, pero tampoco se
 *   esconde: en el telefono vive en "Más", en escritorio esta siempre a la
 *   vista en el rail.
 *
 * La barra inferior del telefono muestra los diarios (cuatro es el maximo que
 * se lee de pie sin apretar) y "Más" abre el resto. Antes habia un modo
 * `simple` que bajaba la barra a tres y escondia "Plata" en "Más": el numero
 * que mas se mira quedaba a dos toques. Se fue.
 *
 * Navegacion por rol (FE-02, DEC-20261123-1358-8feaf9). Cada `Destino` declara
 * sus `roles` y este modulo filtra por la sesion. Ocultar el enlace NO es la
 * barrera: `router.tsx` vuelve a comprobar el rol de la RUTA (una url escrita a
 * mano no entra) y el servidor vuelve a decidir con `olla_members` (42501). La
 * matriz completa y el porque de cada fila estan en `MATRIZ_ROL`.
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
  /** Roles que pueden ver este destino. Ni uno mas: la matriz manda. */
  readonly roles: readonly Rol[];
}

export interface Seccion {
  /** Titulo del grupo en el rail de escritorio y en la hoja "Más". */
  readonly titulo: string;
  readonly destinos: readonly Destino[];
}

/**
 * MATRIZ DE ROLES POR RUTA (FE-02, DEC-20261123-1358-8feaf9).
 *
 * Las siete rutas reales de hoy son `padron`, `servicio`, `comprobante`,
 * `presupuesto`, `precios`, `solicitud`, `reporte`. Cada destino declara sus
 * roles a continuacion, y cada fila se justifica aqui con criterio de producto.
 * Regla de fondo, de la DEC-20261123-1349-d04467: cada accion se autoriza por
 * ROL y por OLLA, y la UI no le muestra a un rol datos que su trabajo no pide
 * (la cocinera no ve salud individual ni dinero si no le toca).
 *
 * `cocinera` — quien cocina y sirve el dia:
 *   - `servicio`: anotar la racion de hoy es literalmente su tarea.
 *   - `comprobante`: revisa la boleta del dia antes de que sume; es el unico
 *     documento que le corresponde leer. NO ve plata ni presion de costo.
 *   - `padron` (alta de personas): NO. Dar de alta/corregir/baja del padron es
 *     de la organizadora (DEC-…d04467); la cocinera ve a quien sirve, no quien
 *     figura en el padron. Ademas la pantalla de hoy es de escritura.
 *   - `presupuesto`, `precios`, `solicitud`, `reporte`: NO. Son dinero y
 *     compras entre ollas; la DEC dice que "el dinero no se muestra si el rol
 *     no lo pide". `solicitud` (pedir/entregar insumos) incluye comprometer
 *     volumen: es de la organizadora.
 *   - Deuda de producto: cuando exista la pantalla de MENU firmado (contenido
 *     del dia), la cocinera entra ahi. Hoy no hay ruta de menu.
 *
 * `organizadora` — administra la olla y su dinero:
 *   - `padron`: da de alta, corrige y da de baja (DEC-…d04467).
 *   - `presupuesto`: el "cuanto hay / cuanto queda" es su numero.
 *   - `precios`: la serie de precios de insumos guia la compra; es decision de
 *     compra, o sea suya.
 *   - `solicitud`: pedir o entregar insumos a otra olla es operacion de
 *     administracion y compromete stock.
 *   - `reporte`: ve el volumen movido entre ollas de SU olla; lo necesita para
 *     rendir cuentas a la asamblea.
 *   - `servicio` y `comprobante`: NO de entrada. El servicio lo registra quien
 *     sirve (la cocinera). La boleta la revisa la cocinera en el momento; si
 *     luego hiciera falta que la organizadora la corrija, eso es una DECISION
 *     de producto (que la ruta delegue a la organizadora sin darle servicio).
 *     Hoy no se la damos: no inventamos permiso que no este escrito.
 *
 * `nutricionista` — valida y firma el menu, NO la operacion:
 *   - `servicio`: lo unico hoy que le deja ver la racion del dia de la olla,
 *     util como contexto minimo del menu servido. La DEC pide que vea "menu /
 *     salud agregada / firma", NINGUNA de esas pantallas existe todavia, asi
 *     que su acceso es MINIMO y es una deuda de producto, no un error de esta
 *     rama.
 *   - `padron`, `comprobante`, `presupuesto`, `precios`, `solicitud`,
 *     `reporte`: NO. Nada de esto es su trabajo; la DEC-…d04467 agrega que NO
 *     firma con acceso a dinero ni a PII del padron.
 *
 * `admin` — plataforma global (DEC-…d04467): ve TODAS las rutas, incluida
 *   `reporte`, que es su vista de auditoria del movimiento entre ollas. El
 *   admin de plataforma no es el de una olla: su acceso global esta en el
 *   servidor; aca solo es "puede entrar a toda seccion".
 */
export const MATRIZ_ROL: Readonly<Record<Rol, readonly string[]>> = {
  cocinera: ['/servicio', '/comprobante'],
  organizadora: ['/padron', '/presupuesto', '/precios', '/solicitud', '/reporte'],
  nutricionista: ['/servicio'],
  admin: ['/padron', '/servicio', '/comprobante', '/presupuesto', '/precios', '/solicitud', '/reporte'],
} as const;

export const DIARIOS: readonly Destino[] = [
  {
    a: '/padron',
    texto: 'Padrón',
    descripcion: 'Padrón',
    icono: 'padron',
    tarea: 'Dar de alta a una persona con su código P-XXXX.',
    roles: ['organizadora', 'admin'],
  },
  {
    a: '/servicio',
    texto: 'Servir',
    descripcion: 'Servicio del día',
    icono: 'servicio',
    tarea: 'Anotar la ración de hoy de cada persona.',
    roles: ['cocinera', 'nutricionista', 'admin'],
  },
  {
    a: '/comprobante',
    texto: 'Boleta',
    descripcion: 'Comprobante',
    icono: 'comprobante',
    tarea: 'Revisar la boleta antes de que sume al presupuesto.',
    roles: ['cocinera', 'admin'],
  },
  {
    a: '/presupuesto',
    texto: 'Plata',
    descripcion: 'Presupuesto',
    icono: 'presupuesto',
    tarea: 'Ver cuánto hay, cuánto se gastó y cuánto queda.',
    roles: ['organizadora', 'admin'],
  },
] as const;

export const SECUNDARIOS: readonly Destino[] = [
  {
    a: '/precios',
    texto: 'Precios',
    descripcion: 'Precios de insumos',
    icono: 'precios',
    tarea: 'Ver el precio típico de cada insumo y si subió o bajó.',
    roles: ['organizadora', 'admin'],
  },
  {
    a: '/solicitud',
    texto: 'Entre ollas',
    descripcion: 'Entre ollas',
    icono: 'entreOllas',
    tarea: 'Pedir o entregar insumos a otra olla.',
    roles: ['organizadora', 'admin'],
  },
  {
    a: '/reporte',
    texto: 'Reporte',
    descripcion: 'Reporte entre ollas',
    icono: 'reporte',
    tarea: 'Ver el volumen movido por categoría.',
    roles: ['organizadora', 'admin'],
  },
] as const;

/** Los grupos, en el orden del rail. */
export const SECCIONES: readonly Seccion[] = [
  { titulo: 'Día a día', destinos: DIARIOS },
  { titulo: 'Otros', destinos: SECUNDARIOS },
] as const;

/** Destinos de la barra inferior del telefono, SOLO los de este rol. */
export function destinosDeBarra(sesion: Pick<Sesion, 'rol'>): readonly Destino[] {
  return DIARIOS.filter((destino) => destino.roles.includes(sesion.rol));
}

/** Lo que la barra del telefono deja en "Más", SOLO los de este rol. */
export function destinosDeMas(sesion: Pick<Sesion, 'rol'>): readonly Destino[] {
  return SECUNDARIOS.filter((destino) => destino.roles.includes(sesion.rol));
}

/**
 * Secciones del rail de escritorio, filtradas por rol. Una seccion que se
 * queda sin destinos para este rol no se dibuja: "Día a día" vacio o "Otros"
 * vacio es un encabezado que promete algo que no hay.
 */
export function seccionesDe(sesion: Pick<Sesion, 'rol'>): readonly Seccion[] {
  return SECCIONES.map((seccion) => ({
    titulo: seccion.titulo,
    destinos: seccion.destinos.filter((destino) => destino.roles.includes(sesion.rol)),
  })).filter((seccion) => seccion.destinos.length > 0);
}

/** Todos los destinos, para resolver el titulo del header por ruta. */
export const TODOS: readonly Destino[] = [...DIARIOS, ...SECUNDARIOS];

/** El destino de una ruta, o `null` si la ruta no es del menu (hoy, ninguna). */
export function destinoDeRuta(ruta: string): Destino | null {
  return TODOS.find((destino) => ruta === destino.a || ruta.startsWith(`${destino.a}/`)) ?? null;
}

/**
 * Puede este rol entrar a esta ruta del menu. Es la MISMA regla que usa el
 * router para la guarda y el mismo `roles` que filtra la barra: una sola
 * fuente, para que "lo que no ve" y "lo que no puede abrir" no se separen.
 * Una ruta que no es del menu (hoy, ninguna) no tiene destino y se deja pasar
 * a proposito: la guarda de una ruta concreta es del destino, no del router a
 * ciegas.
 */
export function rolPuedeEntrar(sesion: Pick<Sesion, 'rol'>, ruta: string): boolean {
  const destino = destinoDeRuta(ruta);
  if (destino === null) return true;
  return destino.roles.includes(sesion.rol);
}

/**
 * Ruta inicial de cada rol (FE-03 parcial, el minimo de FE-02): cada rol
 * aterriza donde le sirve, no en una portada generica.
 *
 * - `cocinera` → `/servicio`: lo primero del dia es servir.
 * - `organizadora` → `/padron`: su trabajo empieza por saber quien esta.
 * - `nutricionista` → `/servicio`: lo unico que hoy puede ver de la olla,
 *   mientras no exista la pantalla de menu/firma.
 * - `admin` → `/padron`: la misma puerta de la olla; desde ahi audita todo.
 *
 * Todo destino de esta tabla esta en `MATRIZ_ROL` de ese rol; lo verifica un
 * test (`rutaInicial` de ningun rol puede caer en una ruta prohibida, o el rol
 * aterrizaria en una redireccion).
 */
export const RUTA_INICIAL: Readonly<Record<Rol, string>> = {
  cocinera: '/servicio',
  organizadora: '/padron',
  nutricionista: '/servicio',
  admin: '/padron',
} as const;

/** A donde aterriza este rol. */
export function rutaInicial(sesion: Pick<Sesion, 'rol'>): string {
  return RUTA_INICIAL[sesion.rol];
}
