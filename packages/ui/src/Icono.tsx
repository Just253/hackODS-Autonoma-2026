/**
 * Iconos de la navegacion. SVG inline a proposito: una libreria de iconos
 * suma ~40 KB para cuatro glifos. Trazo de 2 px, caja de 24, `currentColor`
 * para que el color salga del token del enlace, nunca de un hexadecimal.
 */
import type { ReactNode } from 'react';

export type NombreIcono = 'padron' | 'servicio' | 'comprobante' | 'presupuesto' | 'precios' | 'mas';

const TRAZOS: Readonly<Record<NombreIcono, ReactNode>> = {
  // Personas del padron: un grupo, no un usuario con nombre.
  padron: (
    <>
      <path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M2 20c0-3.3 2.7-6 6-6 1.4 0 2.7.5 3.7 1.3" />
      <path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M14.5 20c0-3 2.5-5.5 5.5-5.5" />
    </>
  ),
  // Plato servido: la ración del día.
  servicio: (
    <>
      <path d="M3 12h18" />
      <path d="M4.5 12a7.5 7.5 0 0 1 15 0" />
      <path d="M2 20h20" />
      <path d="M9 9c0-2 1.5-2.5 1.5-4.5" />
      <path d="M13.5 8.5C13.5 7 15 6.5 15 5" />
    </>
  ),
  // Boleta: papel con líneas y corte inferior.
  comprobante: (
    <>
      <path d="M6 3h12v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5Z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
    </>
  ),
  // Monedero: presupuesto.
  presupuesto: (
    <>
      <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
      <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9H5" />
      <path d="M17 13.5h.01" />
    </>
  ),
  // Serie de precios: línea que sube y baja.
  precios: (
    <>
      <path d="M3 20V4" />
      <path d="M3 20h18" />
      <path d="M6 15l4-5 3 3 5-7" />
      <path d="M18 6h.01" />
    </>
  ),
  // Menú secundario: más opciones, sin una hamburguesa genérica.
  mas: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
};

export interface IconoProps {
  readonly nombre: NombreIcono;
  /** Decorativo por defecto: el enlace ya lleva su texto. */
  readonly titulo?: string;
}

export function Icono({ nombre, titulo }: IconoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={titulo === undefined ? true : undefined}
      role={titulo === undefined ? undefined : 'img'}
      focusable="false"
    >
      {titulo === undefined ? null : <title>{titulo}</title>}
      {TRAZOS[nombre]}
    </svg>
  );
}
