import type { ReactNode } from 'react';

export interface BotonGrandeProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly disabled?: boolean;
  readonly variante?: 'primario' | 'secundario';
  /** `submit` para el botón que cierra un formulario; por defecto no envía nada. */
  readonly type?: 'button' | 'submit';
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
  type = 'button',
}: BotonGrandeProps) {
  return (
    <button
      type={type}
      className={`oc-boton oc-boton--${variante}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
