/**
 * Error de programacion, no de datos: el contrato recibido no esta completo o es invalido.
 * Un umbral faltante tiene que fallar aca y no convertirse en un 0 silencioso.
 */
export class ContratoInvalido extends Error {
  override name = 'ContratoInvalido';
  readonly campos: readonly string[];

  constructor(mensaje: string, campos: readonly string[] = []) {
    super(campos.length > 0 ? `${mensaje} Campos: ${campos.join(', ')}` : mensaje);
    this.campos = campos;
  }
}

/** La funcion existe con su firma pero el algoritmo no esta implementado todavia. */
export class NoImplementado extends Error {
  override name = 'NoImplementado';

  constructor(fn: string) {
    super(`${fn}(): pendiente de implementacion (esqueleto M0)`);
  }
}
