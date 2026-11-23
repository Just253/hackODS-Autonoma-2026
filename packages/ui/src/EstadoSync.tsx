export interface EstadoSyncProps {
  /** Texto ya redactado por la app: el componente no decide que decir. */
  readonly texto: string;
  /** `pendiente` mientras haya cambios sin enviar; `local` tras un push. */
  readonly tono: 'pendiente' | 'local';
}

/**
 * Chip de estado de sincronizacion. Presentacional: no sabe de outbox ni de
 * red, solo pinta un texto y un tono con los tokens de `tokens.css`.
 *
 * El texto de la app (`apps/web`) es deliberadamente literal: "pendiente de
 * sincronizar (local)" / "Sincronizado (local)". Nunca un "Sincronizado" a
 * secas, que daria a entender una red que en la demo no existe.
 */
export function EstadoSync({ texto, tono }: EstadoSyncProps) {
  return (
    <p className={`oc-estado oc-estado--${tono}`} role="status" aria-live="polite">
      {texto}
    </p>
  );
}