/**
 * Bloque de cuenta dentro de la hoja de ajustes del `Shell` (y del panel
 * lateral en escritorio).
 *
 * Tres situaciones, tres salidas honestas:
 *
 * - Backend **remoto**: cuatro botones con las cuentas demo fijas, sin inputs.
 *   La contrasena no se tipea en una tablet de la olla.
 * - Backend **local**: no hay `auth.users` con esas cuentas; se entra con
 *   `app.enroll(codigo, pin, deviceId)` por la Edge Function `enroll`. El PIN
 *   es la credencial real de la olla, no una cuenta inventada.
 * - **Sin configurar**: se dice y los botones quedan deshabilitados.
 *
 * Siempre se muestra a que backend apunta el build (`local`/`remoto`): el seed
 * local y el proyecto remoto tienen datos distintos y nadie tiene que adivinar
 * cual esta viendo.
 *
 * El estado vive en `useCuenta` (una sola instancia en `Shell`), asi el panel
 * lateral y la hoja del telefono no abren dos suscripciones de auth.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ControlCuenta } from './cuenta.js';
import { CUENTAS_DEMO } from './cuentas-demo.js';
import { idDeDispositivo } from './dispositivo.js';

const BOTON =
  'min-h-11 min-w-0 rounded-oc border border-borde-fuerte bg-superficie px-2 text-xs font-semibold text-texto disabled:opacity-60';
const CAMPO = 'oc-campo w-full text-sm';

export function CuentaSupabase({ cuenta }: { readonly cuenta: ControlCuenta }) {
  const navegar = useNavigate();
  const [codigoOlla, setCodigoOlla] = useState('');
  const [pin, setPin] = useState('');

  const esLocal = cuenta.backend === 'local';
  const ocupada = cuenta.inicializando || cuenta.ocupado;

  const salir = (): void => {
    void cuenta.salir().then(() => {
      navegar('/', { replace: true });
    });
  };

  const enrolar = (evento: FormEvent<HTMLFormElement>): void => {
    evento.preventDefault();
    void cuenta.enrolar({ codigoOlla, pin, deviceId: idDeDispositivo() });
  };

  return (
    <div className="flex flex-col gap-2" data-cuenta={cuenta.estado} data-backend={cuenta.backend ?? 'sin-configurar'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-texto-suave">Cuenta</span>
        <span className="text-[0.6875rem] font-semibold text-texto-suave" data-etiqueta-backend="">
          {cuenta.backend === null ? 'sin configurar' : `backend ${cuenta.backend}`}
        </span>
      </div>

      {cuenta.estado === 'autenticado' ? (
        <>
          <p className="truncate text-xs text-texto" data-email-sesion="">
            {cuenta.email ?? 'sin dato'}
          </p>
          <button type="button" onClick={salir} disabled={cuenta.ocupado} className={BOTON}>
            Salir
          </button>
        </>
      ) : (
        <>
          {cuenta.estado === 'sin_configurar' ? (
            <>
              <p className="text-xs font-semibold text-texto" data-estado="sin-configurar">
                Supabase no configurado
              </p>
              <p className="text-xs text-texto-suave">
                Falta <code>VITE_SUPABASE_URL</code> o <code>VITE_SUPABASE_ANON_KEY</code> en el{' '}
                <code>.env</code> de la raíz. Sin eso la app no consulta ninguna olla.
              </p>
            </>
          ) : esLocal ? (
            <>
              <p className="text-xs text-texto-suave">
                Este backend es el Supabase local: no tiene las cuentas demo. Entrá con el código
                de la olla y su PIN (el seed usa <strong>1234</strong>).
              </p>
              <form onSubmit={enrolar} className="flex flex-col gap-1">
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-texto-suave">Código de olla</span>
                  <input
                    name="codigoOlla"
                    value={codigoOlla}
                    onChange={(e) => setCodigoOlla(e.target.value.toUpperCase())}
                    autoComplete="off"
                    spellCheck={false}
                    className={CAMPO}
                    placeholder="DEMHAA"
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-texto-suave">PIN</span>
                  <input
                    name="pin"
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoComplete="off"
                    className={CAMPO}
                  />
                </label>
                <button type="submit" disabled={ocupada} className={BOTON}>
                  Entrar a esta olla
                </button>
              </form>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {/* Un boton apagado sin motivo deja a la persona adivinando. */}
              {CUENTAS_DEMO.map((opcion) => (
                <button
                  key={opcion.email}
                  type="button"
                  disabled={ocupada}
                  onClick={() => void cuenta.entrar(opcion)}
                  className={BOTON}
                >
                  {opcion.texto}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {cuenta.error === null ? null : (
        <p role="alert" className="text-xs font-semibold text-error" data-error-cuenta="">
          {cuenta.error}
        </p>
      )}
    </div>
  );
}
