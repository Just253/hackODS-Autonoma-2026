/**
 * Puente al dominio para precios. `medianaMovil` y `mediana` vienen de
 * `@hackods/domain` (mediana de 7 + filtro MAD). Acá no se reimplementan.
 */
export {
  medianaMovil,
  mediana,
  redondearMitadArriba,
  type ObservacionPrecio,
  type ResultadoSerie,
} from '@hackods/domain';
