import type { ReactNode } from 'react';

/**
 * Los cuatro estados de una pantalla. Se dibujan con `EstadoPantalla`: el mismo
 * componente para todos, para que "cargando" no se vea como "sin conexion".
 * `listo` no dibuja nada: cuando hay datos, la pantalla se pinta sola.
 */
export type Estado = 'listo' | 'cargando' | 'error' | 'sin-conexion';

export interface EstadoPantallaProps {
  readonly estado: Exclude<Estado, 'listo'>;
  /** Que pasa. Se lee primero que el color. */
  readonly children: ReactNode;
  /** Que puede hacer la persona ahora. Sin esto, el error es un callejon. */
  readonly accion?: ReactNode;
}

/**
 * Bloque de estado de pantalla: borde de color + etiqueta de palabra.
 *
 * El texto y el color dicen lo mismo dos veces a proposito (daltonismo, sol,
 * pantalla rayada, lector de pantalla). `role` cambia con el estado:
 * "cargando" es `status` (cortesia), el error es `alert` (interrumpe).
 */
export function EstadoPantalla({ estado, children, accion }: EstadoPantallaProps) {
  const etiqueta =
    estado === 'cargando' ? 'Cargando' : estado === 'error' ? 'Error' : 'Sin conexión';

  return (
    <div
      className="oc-estado"
      data-estado={estado}
      role={estado === 'error' ? 'alert' : 'status'}
      aria-busy={estado === 'cargando' || undefined}
    >
      <span className="oc-estado__etiqueta">{etiqueta}</span>
      <div>{children}</div>
      {accion !== undefined ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
