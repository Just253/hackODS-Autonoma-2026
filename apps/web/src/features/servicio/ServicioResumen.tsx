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
 *
 * Texto: en la cara va "Menú del día firmado por la nutricionista · 1 de
 * noviembre". El CNP, la version y el hash son la prueba para quien la pida:
 * viven en un `<details>` ("Ver sello"), no en el parrafo.
 */
import type { Persona } from '@hackods/contracts';
import { MenuNoServible, servirDelDia, type MenuOpcion, type RacionOpcion } from '@hackods/domain';

import { formatearDia } from '../../app/fechas.js';

export interface ServicioResumenProps {
  readonly menus: readonly MenuOpcion[];
  readonly personas: readonly Persona[];
}

const NOMBRE_GRUPO: Readonly<Record<string, string>> = {
  adulto: 'Adulto',
  adulto_mayor: 'Adulto mayor',
  menor_5: 'Niño o niña menor de 5',
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

/** La unidad llega como dato (`g`, `ml`); en pantalla se lee completa. */
const NOMBRE_UNIDAD: Readonly<Record<string, string>> = {
  g: 'gramos',
  ml: 'mililitros',
  unidad: 'unidades',
};

function unidad(u: string): string {
  return NOMBRE_UNIDAD[u] ?? u;
}

/** Hash completo, corto en pantalla pero con el valor entero en `title`. */
function Hash({ valor }: { readonly valor: string }) {
  return (
    <span className="font-mono text-sm" title={valor} data-testid="sello-hash">
      {valor.slice(0, 12)}...
    </span>
  );
}

/**
 * El error del dominio traducido a lo que se lee en la cocina.
 *
 * `MenuNoServible.campo` es un identificador tecnico (`estado`, `sello.hash`,
 * `porcion.<grupo>`): la cocinera no lo entiende y no deberia tener que
 * entenderlo. La frase de cocina va afuera, a la vista; el campo y el detalle
 * siguen existiendo adentro del `<details>`, para quien los busque. Si el campo
 * es uno que no conocemos, la frase es generica: nunca se filtra un
 * `porcion.adulto` a la pantalla.
 */
export function fraseDeCocina(error: MenuNoServible): string {
  switch (error.campo) {
    case 'estado':
      return 'El menú de hoy no tiene la aprobación de la nutricionista.';
    case 'sello':
      return 'El menú de hoy no tiene la firma de la nutricionista.';
    case 'sello.hash':
    case 'sello.version':
      return 'La firma del menú no coincide con lo que se va a servir.';
    case 'menu':
      return 'Todavía no se eligió el menú del día.';
    default:
      return 'Algo en el menú del día no está bien. Revisa con la nutricionista antes de servir.';
  }
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
    <article className="oc-tarjeta flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-base font-semibold">
          Opción {opcion.opcion} · {perfil(opcion.perfil)}
        </h4>
        <p className="text-lg font-semibold tabular-nums" data-testid="total-raciones">
          Total de raciones: {opcion.total}
        </p>
      </div>

      {sello !== null ? (
        <div className="flex flex-col gap-1" data-estado="sello">
          <p className="text-sm text-texto-suave">
            Menú del día firmado por la nutricionista · {formatearDia(sello.fecha)}
          </p>
          <details className="text-sm text-texto-suave">
            <summary className="cursor-pointer font-semibold">Ver sello</summary>
            <p className="pt-1 text-xs">
              {sello.nutricionista} · {sello.cnp} · versión {sello.version} · hash{' '}
              <Hash valor={sello.hash} />
            </p>
          </details>
        </div>
      ) : (
        <p className="text-sm text-texto-suave" data-estado="sin-sello">
          Sello: <strong>sin dato</strong> - el menú no trae firma del nutricionista.
        </p>
      )}

      {opcion.porGrupo.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="oc-tabla">
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col" className="oc-num">
                  Personas
                </th>
                <th scope="col" className="oc-num">
                  Porción
                </th>
                <th scope="col" className="oc-num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {opcion.porGrupo.map((fila) => (
                <tr key={fila.grupo}>
                  <th scope="row">{grupo(fila.grupo)}</th>
                  <td className="oc-num">{fila.personas}</td>
                  <td className="oc-num">
                    {fila.porcion} {unidad(fila.unidad)}
                  </td>
                  <td className="oc-num">
                    {fila.raciones} {unidad(fila.unidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-texto-suave">
          Porción por grupo: <strong>sin dato</strong> - esta opción no trae platos firmados.
        </p>
      )}

      {opcion.gruposSinPorcion.length > 0 ? (
        <p className="text-sm text-texto-suave" data-estado="grupos-sin-porcion">
          Grupos sin porción firmada:{' '}
          <strong>{opcion.gruposSinPorcion.map(grupo).join(', ')}</strong> - no se inventa una
          porción.
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
        <div className="oc-estado" data-estado="alerta" role="alert">
          <span className="oc-estado__etiqueta">Atención</span>
          <p className="font-semibold">El menú de hoy no se puede servir.</p>
          <p className="font-semibold" data-estado="motivo-en-cocina">
            {fraseDeCocina(error)}
          </p>
          <p className="text-sm">
            Porciones y total: <strong>sin dato</strong>.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold">
              Ver detalle para quien revise el menú
            </summary>
            <p className="pt-1 text-xs">
              Campo: <strong>{error.campo}</strong> — {error.detalle}.
            </p>
          </details>
        </div>
      );
    }
    throw error;
  }

  return (
    <div className="flex flex-col gap-3" aria-label="Servicio del día">
      {opciones.map((opcion) => (
        <TarjetaOpcion key={opcion.templateId} opcion={opcion} menus={menus} />
      ))}
    </div>
  );
}
