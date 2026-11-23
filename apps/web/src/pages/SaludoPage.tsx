import { useEffect, useState } from 'react';

import { SCHEMA_VERSION } from '@hackods/contracts';
import { BotonGrande } from '@hackods/ui';

const MENSAJE_INICIAL = 'Hola. Esta pantalla es el esqueleto de la PWA.';

/** Versión del build desplegado, inyectada en `index.html` (`%BUILD_ID%`). */
function versionDelBuild(): string {
  return document.querySelector('meta[name="version"]')?.getAttribute('content') ?? 'dev';
}

/** `navigator.onLine` miente; se usa como pista, no como verdad. */
function useSinConexion(): boolean {
  const [sinConexion, setSinConexion] = useState(() => globalThis.navigator?.onLine === false);
  useEffect(() => {
    const apagar = (): void => setSinConexion(true);
    const encender = (): void => setSinConexion(false);
    window.addEventListener('offline', apagar);
    window.addEventListener('online', encender);
    return () => {
      window.removeEventListener('offline', apagar);
      window.removeEventListener('online', encender);
    };
  }, []);
  return sinConexion;
}

/**
 * Pantalla de humo: no hay logica de negocio, solo prueba que el arranque,
 * el router, Tailwind, los tokens y los paquetes del monorepo funcionan.
 */
export function SaludoPage() {
  const [mensaje, setMensaje] = useState(MENSAJE_INICIAL);
  const sinConexion = useSinConexion();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm uppercase tracking-wide text-gray-600">
          Contratos v{SCHEMA_VERSION} · esqueleto
        </p>
        <h1 className="text-3xl font-bold">Ollas comunes</h1>
        <p className="text-lg">
          Padrón, despensa y raciones para ollas comunes. Funciona sin internet.
        </p>
        {sinConexion && (
          <p
            role="status"
            className="rounded-lg border border-amber-500 bg-amber-50 p-3 text-lg text-amber-900"
          >
            Sin conexión. Puedes seguir trabajando: los cambios quedan pendientes de sincronizar.
          </p>
        )}
      </header>

      <section
        aria-live="polite"
        className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-lg"
      >
        {mensaje}
      </section>

      <div>
        <BotonGrande onClick={() => setMensaje('Sigue funcionando. Nada se envíó a la red.')}>
          Probar
        </BotonGrande>
      </div>

      <footer className="flex flex-col gap-1 text-sm text-gray-600">
        <span>Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.</span>
        <span>Versión: {versionDelBuild()}</span>
      </footer>
    </main>
  );
}

