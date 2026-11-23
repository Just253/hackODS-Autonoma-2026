import { NavLink, Outlet } from 'react-router-dom';

/**
 * Shell de la PWA: navegacion entre las rutas del esqueleto.
 * Archivo caliente (MODO-6H §2.1): lo edita el dueno de `area:web`.
 */
const ENLACES = [
  { a: '/padron', texto: 'Padrón' },
  { a: '/servicio', texto: 'Servicio' },
  { a: '/comprobante', texto: 'Comprobante' },
  { a: '/presupuesto', texto: 'Presupuesto' },
  { a: '/precios', texto: 'Precios' },
  { a: '/solicitud', texto: 'Entre ollas' },
  { a: '/reporte', texto: 'Reporte' },
] as const;

export function Shell() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Ollas comunes</h1>
        <p className="text-gray-600">Funciona sin internet. Nada se envía a la red.</p>
      </header>

      <nav aria-label="Secciones" className="flex flex-wrap gap-2">
        {ENLACES.map(({ a, texto }) => (
          <NavLink
            key={a}
            to={a}
            className={({ isActive }) =>
              `rounded border border-gray-400 px-3 py-2 ${isActive ? 'bg-gray-200 font-semibold' : ''}`
            }
          >
            {texto}
          </NavLink>
        ))}
      </nav>

      <main>
        <Outlet />
      </main>

      <footer className="text-sm text-gray-600">
        Datos simulados. Esto apoya la decisión de la olla; no es un diagnóstico.
      </footer>
    </div>
  );
}
