/**
 * Estado honesto de una pantalla que hoy lee Supabase: si no hay sesion, no hay
 * filas que mostrar y NO se cae a fixtures.
 *
 * Antes cada pantalla mostraba el mismo juego de datos ficticios en cualquier
 * olla; eso es exactamente lo que este bloque prohíbe. Dice que falta entrar y,
 * cuando el build no trae las variables, por que no puede consultar nada.
 *
 * Se diferencia `sin_configurar` de `anonimo` a proposito: "falta el `.env`" y
 * "falta iniciar sesion" son dos arreglos distintos para quien esta delante.
 */
import { estadoConexion } from '../data/supabase.js';

export function AvisoSinSesion({ que }: { readonly que: string }) {
  const configurado = estadoConexion() !== 'sin_configurar';

  return (
    <div className="oc-tarjeta flex flex-col gap-2" role="status" data-estado="sin-sesion">
      <p className="text-lg font-bold">Conectá Supabase para ver {que}</p>
      {configurado ? (
        <p className="text-sm text-texto-suave">
          Entra con una cuenta demo desde Ajustes: el botón «Más» en el teléfono, el panel
          lateral en la computadora. Sin sesión no se muestra nada: la app no inventa
          personas ni precios.
        </p>
      ) : (
        <p className="text-sm text-texto-suave">
          Este build no trae <code>VITE_SUPABASE_URL</code> ni{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>. Sin esas dos variables la app no consulta
          ninguna olla, así que no hay datos que mostrar.
        </p>
      )}
    </div>
  );
}
