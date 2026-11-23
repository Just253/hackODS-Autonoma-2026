import type { ReactNode } from 'react';

export interface EncabezadoPantallaProps {
  /** Titulo de la pantalla. Es el `h2` que sigue al nombre de la olla del cascaron. */
  readonly titulo: string;
  /** Que resuelve la pantalla, en una linea. Se lee primero que los datos. */
  readonly descripcion?: ReactNode;
  /** Dato o accion a la derecha (una fecha, un enlace). Opcional. */
  readonly alLado?: ReactNode;
}

/**
 * Cabecera de pantalla: titulo, una linea de contexto y, si hace falta, algo a
 * la derecha. Se usa en las siete pantallas para que la jerarquia no dependa de
 * que cada una elija su tamano de letra.
 *
 * En el telefono el titulo es grande y la descripcion va debajo; en escritorio
 * el bloque no se estira a todo el ancho: el texto se corta en
 * `--ancho-lectura` (~70 caracteres) y lo que sobra queda para el dato lateral.
 */
export function EncabezadoPantalla({
  titulo,
  descripcion,
  alLado,
}: EncabezadoPantallaProps) {
  // `div` y no `header`: cada pantalla vive dentro del `<main>` del cascarón y
  // siete `<header>` anidados convertían siete encabezados de página en otros
  // tantos landmarks `banner`. La jerarquía la da el `h2`.
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">{titulo}</h2>
        {descripcion === undefined ? null : (
          <p className="max-w-[var(--ancho-lectura)] text-sm text-texto-suave">{descripcion}</p>
        )}
      </div>
      {alLado === undefined ? null : <div className="shrink-0 text-sm">{alLado}</div>}
    </div>
  );
}
