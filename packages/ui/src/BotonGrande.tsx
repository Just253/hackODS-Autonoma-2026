import type { ReactNode } from 'react';

export interface BotonGrandeProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly variante?: 'primario' | 'secundario';
}

/**
 * Boton de accion primaria: objetivo tactil >= 48 px y foco visible.
 * Presentacional: no sabe de ollas ni de datos.
 */
export function BotonGrande({
  children,
  onClick,
  disabled = false,
  variante = 'primario',
}: BotonGrandeProps) {
  return (
    <button
      type="button"
      className={`oc-boton oc-boton--${variante}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
