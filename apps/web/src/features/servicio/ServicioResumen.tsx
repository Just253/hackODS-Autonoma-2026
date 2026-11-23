/**
 * Resumen del servicio del dia calculado por `@hackods/domain`.
 *
 * Presentacional y SIN estado: recibe el menu firmado y el padron ya cargados y
 * llama a `servirDelDia(menus, personas)`. No calcula porciones, no inventa
 * cifras: si el dominio lanza `MenuNoServible`, se dice que campo falla y se
 * muestra `sin dato`, nunca un numero a mano (DEC-2026-0003).
 *
 * El total de raciones NO es una constante: sale de `opcion.total`, que el
 * dominio deriva del padron vigente. Si cambia el padron, cambia el numero.
 */
import type { Persona } from '@hackods/contracts';
import { MenuNoServible, servirDelDia, type MenuOpcion, type RacionOpcion } from '@hackods/domain';

export interface ServicioResumenProps {
  readonly menus: readonly MenuOpcion[];
  readonly personas: readonly Persona[];
}

const NOMBRE_GRUPO: Readonly<Record<string, string>> = {
  adulto: 'Adulto',
  adulto_mayor: 'Adulto mayor',
  menor_5: 'Nino o nina menor de 5',
  gestante: 'Gestante',
  lactante_6_23m: 'Lactante 6 a 23 meses',
};

const NOMBRE_PERFIL: Readonly<Record<string, string>> = {
  general: 'General',
  especial: 'Especial',
};

function grupo(g: string): string {
  return NOMBRE_GRUPO[g] ?? g;
}

function perfil(p: string): string {
  return NOMBRE_PERFIL[p] ?? p;
}

/** Hash completo, corto en pantalla pero con el valor entero en `title`. */
function Hash({ valor }: { readonly valor: string }) {
  return (
    <span className="font-mono text-sm" title={valor} data-testid="sello-hash">
      {valor.slice(0, 12)}...
    </span>
  );
}

function TarjetaOpcion({
  opcion,
  menus,
}: {
  readonly opcion: RacionOpcion;
  readonly menus: readonly MenuOpcion[];
}) {
  const menu = menus.find((m) => m.template.id === opcion.templateId);
  const sello = menu?.template.sello ?? null;

  return (
    <article className="flex flex-col gap-2 rounded-lg border border-gray-300 p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">
          Opcion {opcion.opcion} - {perfil(opcion.perfil)}
        </h3>
        {sello !== null ? (
          <p className="text-gray-600" data-estado="sello">
            Firmado por {sello.nutricionista} ({sello.cnp}), {sello.fecha}. Sello v
            {sello.version}, hash <Hash valor={sello.hash} />
          </p>
        ) : (
          <p className="text-gray-600" data-estado="sin-sello">
            Sello: <strong>sin dato</strong> - el menu no trae sello del nutricionista.
          </p>
        )}
      </header>

      <p className="text-lg font-semibold" data-testid="total-raciones">
        Total de raciones: {opcion.total}
      </p>

      {opcion.porGrupo.length > 0 ? (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-gray-300">
              <th className="py-1">Grupo</th>
              <th className="py-1">Personas</th>
              <th className="py-1">Porcion</th>
              <th className="py-1">Raciones</th>
            </tr>
          </thead>
          <tbody>
            {opcion.porGrupo.map((fila) => (
              <tr key={fila.grupo} className="border-b border-gray-200">
                <td className="py-1">{grupo(fila.grupo)}</td>
                <td className="py-1">{fila.personas}</td>
                <td className="py-1">
                  {fila.porcion} {fila.unidad}
                </td>
                <td className="py-1">
                  {fila.raciones} {fila.unidad}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-600">
          Porcion por grupo: <strong>sin dato</strong> - esta opcion no trae platos firmados.
        </p>
      )}

      {opcion.gruposSinPorcion.length > 0 ? (
        <p className="text-gray-600" data-estado="grupos-sin-porcion">
          Grupos sin porcion firmada:{' '}
          <strong>{opcion.gruposSinPorcion.map(grupo).join(', ')}</strong> - no se inventa una
          porcion.
        </p>
      ) : null}
    </article>
  );
}

export function ServicioResumen({ menus, personas }: ServicioResumenProps) {
  let opciones: ReturnType<typeof servirDelDia>['opciones'];
  try {
    opciones = servirDelDia(menus, personas).opciones;
  } catch (error: unknown) {
    if (error instanceof MenuNoServible) {
      return (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-4" role="alert">
          <p className="font-semibold">El menu de hoy no se puede servir.</p>
          <p className="text-gray-700">
            Campo: <strong>{error.campo}</strong> - {error.detalle}.
          </p>
          <p className="text-gray-700">
            Porciones y total: <strong>sin dato</strong>.
          </p>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-3" aria-label="Servicio del dia">
      {opciones.map((opcion) => (
        <TarjetaOpcion key={opcion.templateId} opcion={opcion} menus={menus} />
      ))}
    </div>
  );
}