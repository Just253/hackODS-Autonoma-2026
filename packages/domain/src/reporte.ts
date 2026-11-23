/**
 * Agregado "entre ollas": volumen movido por categoria para 3 ollas ficticias.
 *
 * Regla del issue #18: la salida **no puede llevar identidades**. No hay
 * `codigoP` (ningun codigo `P-XXXX`), ni alias, ni nombres de proveedores. El
 * filtro es explicito (`categoriaSegura`) y esta testeado: si alguien lo quita,
 * un test se pone rojo. La agregacion solo cuenta volumen y lo agrupa por
 * categoria; nada mas viaja.
 *
 * El reporte mide **volumen movido**, no saldo: suma `Math.abs(delta)`, asi una
 * salida (delta negativo) sube el volumen en vez de bajarlo. No es stock ni
 * gasto; es cuanto se movio en la categoria. La columna de salida se llama
 * `volumen`, no `total`, para no sugerir un saldo.
 *
 * Determinista: recibe movimientos con fecha ya asentada; no lee el reloj.
 */
import type { Movimiento } from '@hackods/contracts';

/**
 * Las 3 ollas ficticias del reporte. Solo un id opaco y un titulo publico:
 * ninguna lleva el nombre de una persona ni de un proveedor.
 */
export interface OllaFicticia {
  readonly ollaId: string;
  readonly titulo: string;
}

export const OLLAS_DEMO: readonly OllaFicticia[] = [
  { ollaId: 'olla_1', titulo: 'Olla Norte' },
  { ollaId: 'olla_2', titulo: 'Olla Centro' },
  { ollaId: 'olla_3', titulo: 'Olla Sur' },
];

/** Periodo de negocio (dias ISO), nunca derivado de un reloj. */
export interface Periodo {
  readonly desde: string;
  readonly hasta: string;
}

/**
 * Categoria de reporte por `insumoId`. Es la unica dimension que sale: nada de
 * insumo crudo con nombre de proveedor. El insumo que no este se agrupa en
 * `otros`; nunca se expone su id.
 */
const CATEGORIA_POR_INSUMO: Readonly<Record<string, string>> = {
  arroz: 'granos',
  frijol: 'granos',
  quinua: 'granos',
  aceite: 'grasas',
  papa: 'tuberculos',
  pollo: 'proteinas',
};

export const CATEGORIA_OTROS = 'otros';

/** Forma de la salida: por olla, volumen movido por categoria. Sin identidades. */
export interface FilaAgregado {
  readonly ollaId: string;
  readonly titulo: string;
  /** Volumen movido (suma de `Math.abs(delta)`) por categoria. No es un saldo. */
  readonly volumen: Readonly<Record<string, number>>;
}

export interface AgregadoEntreOllas {
  readonly periodo: Periodo;
  readonly categorias: readonly string[];
  readonly filas: readonly FilaAgregado[];
}

/**
 * Categoria de salida por insumo, con el **filtro de identidad** en un solo
 * sitio: un insumo crudo que no sea una categoria conocida cae en `otros`. Es
 * lo unico que decide que texto entra al agregado; quitarlo (devolver el
 * `insumoId` tal cual) deja salir un `P-XXXX` o un alias y el test se pone rojo.
 */
function categoriaSegura(insumoId: string): string {
  return CATEGORIA_POR_INSUMO[insumoId] ?? CATEGORIA_OTROS;
}

/** `yyyy-mm-dd` de un instante ISO (`at`), sin zona: comparacion de dia por prefijo. */
function diaDe(at: string): string {
  return at.slice(0, 10);
}

/**
 * Agrupa movimientos de despensa (de las 3 ollas) por categoria y olla para un
 * periodo. Solo entran movimientos con `diaDe(at)` dentro de `[desde, hasta]`.
 * Suma el **volumen movido** (`Math.abs(delta)`): una salida negativa sube el
 * volumen; el resultado nunca es un saldo con signo.
 */
export function agregadoEntreOllas(
  movimientos: readonly Movimiento[],
  periodo: Periodo,
  ollas: readonly OllaFicticia[] = OLLAS_DEMO,
): AgregadoEntreOllas {
  const categorias = new Set<string>();
  const porOlla = new Map<string, Map<string, number>>();

  for (const movimiento of movimientos) {
    const dia = diaDe(movimiento.at);
    if (dia < periodo.desde || dia > periodo.hasta) continue;

    const categoria = categoriaSegura(movimiento.insumoId);
    categorias.add(categoria);

    const volumen = porOlla.get(movimiento.ollaId) ?? new Map<string, number>();
    // Volumen movido: el signo del delta no resta. Un gasto sube el volumen.
    volumen.set(categoria, (volumen.get(categoria) ?? 0) + Math.abs(movimiento.delta));
    porOlla.set(movimiento.ollaId, volumen);
  }

  const listaCategorias = [...categorias].sort();
  const filas: FilaAgregado[] = ollas.map((olla) => {
    const volumen = porOlla.get(olla.ollaId) ?? new Map<string, number>();
    return {
      ollaId: olla.ollaId,
      titulo: olla.titulo,
      volumen: Object.fromEntries(volumen),
    };
  });

  return { periodo, categorias: listaCategorias, filas };
}
