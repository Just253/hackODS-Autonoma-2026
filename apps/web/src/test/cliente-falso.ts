/**
 * Doble de `ClienteDatos` para tests: devuelve filas fijas o un error, sin red.
 *
 * Registra cada consulta (tabla, columnas y filtros) para que los tests puedan
 * afirmar dos cosas que importan: que se pide SOLO lo permitido (el padron no
 * trae salud) y que el filtro por olla esta puesto.
 */
import type { ClienteDatos, ConsultaFilas, RespuestaFilas } from '../data/cliente-remoto.js';

export interface TablaFalsa {
  readonly filas?: readonly unknown[];
  /** Si aparece, la consulta falla con este mensaje (simula RLS o red). */
  readonly error?: string;
}

export interface ConsultaRegistrada {
  readonly tabla: string;
  readonly columnas: string;
  readonly filtros: readonly (readonly [string, string])[];
  readonly orden: string | null;
  readonly limite: number | null;
}

export interface ClienteFalso {
  readonly cliente: ClienteDatos;
  readonly consultas: readonly ConsultaRegistrada[];
}

interface EstadoConsulta {
  filtros: (readonly [string, string])[];
  orden: string | null;
  limite: number | null;
}

export function clienteFalso(
  tablas: Readonly<Record<string, TablaFalsa | readonly unknown[]>>,
): ClienteFalso {
  const consultas: ConsultaRegistrada[] = [];

  const cliente: ClienteDatos = {
    from(tabla: string) {
      return {
        select<Fila>(columnas: string): ConsultaFilas<Fila> {
          const entrada = tablas[tabla];
          const datos: TablaFalsa =
            entrada === undefined
              ? { filas: [] }
              : Array.isArray(entrada)
                ? { filas: entrada }
                : (entrada as TablaFalsa);
          const estado: EstadoConsulta = { filtros: [], orden: null, limite: null };

          const ejecutar = async (): Promise<RespuestaFilas<Fila>> => {
            consultas.push({
              tabla,
              columnas,
              filtros: [...estado.filtros],
              orden: estado.orden,
              limite: estado.limite,
            });
            if (datos.error !== undefined) {
              return { data: null, error: { message: datos.error } };
            }
            let filas = [...(datos.filas ?? [])] as Fila[];
            for (const [columna, valor] of estado.filtros) {
              filas = filas.filter(
                (fila) => String((fila as Record<string, unknown>)[columna]) === valor,
              );
            }
            return { data: filas, error: null };
          };

          const consulta: ConsultaFilas<Fila> = {
            eq(columna, valor) {
              estado.filtros.push([columna, valor]);
              return consulta;
            },
            order(columna) {
              estado.orden = columna;
              return consulta;
            },
            limit(cantidad) {
              estado.limite = cantidad;
              return consulta;
            },
            then(exito, fallo) {
              return ejecutar().then(exito, fallo);
            },
          };
          return consulta;
        },
      };
    },
  };

  return { cliente, consultas };
}
