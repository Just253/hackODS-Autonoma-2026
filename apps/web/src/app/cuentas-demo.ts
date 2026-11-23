/**
 * Las cuatro cuentas demo del proyecto Supabase de la hackathon.
 *
 * Son cuentas FIJAS y publicas (`docs/demo-usuarios.md`): el boton entra
 * directo, no hay formulario de email/contrasena que la cocinera tenga que
 * tipear en una tablet. La contrasena esta en el documento publico del repo, no
 * es un secreto y no da acceso a ningun dato real (D7: todo ficticio).
 *
 * Esto NO es el login del producto: produccion usa enrolamiento por PIN
 * (`docs/adr/0008-enrolamiento.md`). Si el proyecto remoto no tiene estas
 * cuentas sembradas (`pnpm db:demo-usuarios`), el boton muestra el error y no
 * entra: no se inventa una sesion.
 */
export interface CuentaDemo {
  /** Texto del boton, en el idioma del rol. */
  readonly texto: string;
  readonly email: string;
  readonly clave: string;
}

export const CUENTAS_DEMO: readonly CuentaDemo[] = [
  { texto: 'Entrar como Cocinera', email: 'cocinera@demo.hackods.test', clave: 'Demo1234!' },
  {
    texto: 'Entrar como Organizadora',
    email: 'organizadora@demo.hackods.test',
    clave: 'Demo1234!',
  },
  {
    texto: 'Entrar como Nutricionista',
    email: 'nutricionista@demo.hackods.test',
    clave: 'Demo1234!',
  },
  { texto: 'Entrar como Admin', email: 'admin@demo.hackods.test', clave: 'Demo1234!' },
] as const;
