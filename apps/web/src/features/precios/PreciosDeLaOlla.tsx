/**
 * Precios de la olla: la version conectada de `PreciosPantalla`.
 *
 * - Con sesion (`Sesion.modo === 'cloud'`): pide `seriePrecios(ollaId)` a
 *   Supabase y pinta las series REALES de esa olla.
 * - Sin sesion o sin env: dice que hay que conectar Supabase. No hay fixtures:
 *   que todas las ollas mostraran el mismo juego de datos fue el bug.
 * - Error de red o RLS: estado `error` con reintento. Tampoco cae a fixtures.
 *
 * La pantalla de presentacion (`PreciosPantalla`) sigue recibiendo props: aca
 * vive el acceso a datos, alla el dibujo. La cuenta de la mediana es de
 * `tendencia.ts` -> `@hackods/domain`.
 */
import { useEffect, useState } from 'react';

import { EncabezadoPantalla } from '@hackods/ui';

import { useSesion } from '../../app/sesion.js';
import { AvisoSinSesion } from '../../app/AvisoSinSesion.js';
import { useClienteRemoto } from '../../data/ProveedorRemoto.js';
import { seriePrecios } from '../../data/remoto.js';
import { PreciosPantalla, type ProductoPrecio } from './PreciosPantalla.js';
import { productosDeLaSerie } from './serie-remota.js';

/** De donde salen los precios cuando vienen de la olla. */
const FUENTE_REMOTA = 'Precios registrados en la olla';

type EstadoDatos = 'cargando' | 'listo' | 'error';

export function PreciosDeLaOlla() {
  const { sesion } = useSesion();
  const cliente = useClienteRemoto();
  const [estado, setEstado] = useState<EstadoDatos>('cargando');
  const [productos, setProductos] = useState<readonly ProductoPrecio[]>([]);
  const [intento, setIntento] = useState(0);

  const enNube = sesion.modo === 'cloud';

  useEffect(() => {
    if (!enNube) return;
    let vigente = true;
    setEstado('cargando');
    void seriePrecios(sesion.ollaId, cliente).then((resultado) => {
      if (!vigente) return;
      if (!resultado.ok) {
        setProductos([]);
        setEstado('error');
        return;
      }
      setProductos(productosDeLaSerie(resultado.datos));
      setEstado('listo');
    });
    return () => {
      vigente = false;
    };
  }, [enNube, sesion.ollaId, cliente, intento]);

  const reintentar = (): void => setIntento((n) => n + 1);

  if (!enNube) {
    return (
      <section className="flex flex-col gap-4 lg:gap-6">
        <EncabezadoPantalla titulo="Precio de los insumos" />
        <AvisoSinSesion que="los precios" />
      </section>
    );
  }

  if (estado === 'error') {
    return (
      <PreciosPantalla
        productos={[]}
        fuente={FUENTE_REMOTA}
        estado="error"
        onReintentar={reintentar}
      />
    );
  }

  if (estado === 'cargando') {
    return <PreciosPantalla productos={[]} fuente={FUENTE_REMOTA} estado="cargando" />;
  }

  if (productos.length === 0) {
    return (
      <section className="flex flex-col gap-4 lg:gap-6">
        <EncabezadoPantalla titulo="Precio de los insumos" />
        <div className="oc-tarjeta flex flex-col gap-1" data-estado="vacio">
          <span className="oc-estado__etiqueta text-texto-suave">Sin precios</span>
          <p>
            Esta olla todavía no tiene compras registradas. No se muestra ningún precio de
            ejemplo.
          </p>
        </div>
      </section>
    );
  }

  return <PreciosPantalla productos={productos} fuente={FUENTE_REMOTA} />;
}
