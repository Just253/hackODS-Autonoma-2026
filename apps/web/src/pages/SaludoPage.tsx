import { useState } from 'react';

import { SCHEMA_VERSION } from '@hackods/contracts';
import { BotonGrande } from '@hackods/ui';

const MENSAJE_INICIAL = 'Hola. Esta pantalla es el esqueleto de la PWA.';

/**
 * Pantalla de humo: no hay logica de negocio, solo prueba que el arranque,
 * el router, Tailwind, los tokens y los paquetes del monorepo funcionan.
 */
export function SaludoPage() {
  const [mensaje, setMensaje] = useState(MENSAJE_INICIAL);

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
      </header>

      <section
        aria-live="polite"
        className="rounded-lg border border-gray-300 bg-gray-50 p-4 text-lg"
      >
        {mensaje}
      </section>

      <div>
        <BotonGrande onClick={() => setMensaje('Sigue funcionando. Nada se envió a la red.')}>
          Probar
        </BotonGrande>
      </div>

      <footer className="text-sm text-gray-600">
        Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.
      </footer>
    </main>
  );
}
