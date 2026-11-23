/**
 * La unidad del precio dicha como se compra en el mercado.
 *
 * El dominio guarda la unidad base (`g`, `ml`) porque es la que hace exacta la
 * cuenta; en la feria nadie pide "1 000 g de arroz", pide un kilo. Este mapeo
 * vive aca y no se importa de otra pantalla: es texto de esta pantalla.
 *
 * Mismo criterio que la captura de inventario (`unidadTexto`): `g` -> kg,
 * `ml` -> L, todo lo demas se cuenta por unidad. No se inventan unidades que
 * el dominio no use; si llega una desconocida, se muestra tal como vino.
 */
export function unidadLegible(unidad: string): string {
  const limpia = unidad.trim().toLowerCase();
  if (limpia === 'g' || limpia === 'gr' || limpia === 'gramo' || limpia === 'gramos') {
    return 'kg';
  }
  if (
    limpia === 'ml' ||
    limpia === 'mililitro' ||
    limpia === 'mililitros' ||
    limpia === 'l' ||
    limpia === 'lt' ||
    limpia === 'litro' ||
    limpia === 'litros'
  ) {
    return 'L';
  }
  if (limpia === 'unidad' || limpia === 'unidades' || limpia === 'u' || limpia === 'und') {
    return 'unidad';
  }
  return unidad;
}
