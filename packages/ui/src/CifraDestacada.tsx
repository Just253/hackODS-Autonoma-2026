import type { ReactNode } from 'react';

export interface CifraDestacadaProps {
  /** Que es la cifra ("Disponible", "Raciones registradas"). */
  readonly etiqueta: string;
  /** Aclaracion corta debajo de la etiqueta. Opcional. */
  readonly nota?: string;
  /** La cifra ya formateada por quien la conoce. Este componente no calcula. */
  readonly children: ReactNode;
  /** `error` para un saldo negativo; `primario` para el dato que se viene a ver. */
  readonly tono?: 'neutro' | 'primario' | 'error';
}

/**
 * La cifra que manda en una pantalla: etiqueta arriba, numero grande abajo,
 * alineado a la izquierda (no a la derecha: el ojo baja por el borde izquierdo
 * de la tarjeta en el telefono).
 *
 * La usan el padron, el servicio, el comprobante, el presupuesto y los precios
 * para que "la cifra importante" tenga el mismo peso en las cinco.
 */
export function CifraDestacada({
  etiqueta,
  nota,
  children,
  tono = 'neutro',
}: CifraDestacadaProps) {
  const color =
    tono === 'primario' ? 'text-primario' : tono === 'error' ? 'text-error' : '';
  return (
    <div className="oc-tarjeta flex flex-col gap-1">
      <p className="text-sm font-semibold text-texto-suave">
        {etiqueta}
        {nota === undefined ? null : (
          <span className="block text-xs font-normal">{nota}</span>
        )}
      </p>
      <p className={`oc-cifra ${color}`.trim()}>{children}</p>
    </div>
  );
}
