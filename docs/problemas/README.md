# Problemas

Un archivo por problema, en la categoría que le toca. El ID lo emite el registro
(`docs/ids/REGISTRO.md`); acá no se numera nada a mano.

## Abrir

```bash
pnpm ids:nuevo --tipo PRB --categoria dinero --titulo "Boleta duplicada suma dos veces"
```

Crea `docs/problemas/dinero/PRB-<fecha>-<hora>-<hex>.md` desde `_plantilla.md` y agrega la fila al
registro. Después se completa el cuerpo y se commitea junto con la evidencia.

## Categorías

```text
dominio/     reglas de negocio, actores, glosario
datos/       modelo, migraciones, seed, importación
offline/     sync, conflictos, outbox, pérdida de datos
backend/     Supabase, RLS, funciones, compute
web/         PWA, UI, accesibilidad, impresión
nutricion/   menú firmado, porciones, restricciones
dinero/      comprobantes, precios, presupuesto, duplicados
seguridad/   privacidad, PII, auth, tokens
docs/        contradicciones y documentación faltante
infra/       CI, ramas, entorno, dependencias
```

Una categoría nueva se crea cuando hay **dos** problemas que no entran en ninguna existente.

## Reglas

1. **Un problema, un archivo.** Si dos personas reportan lo mismo, el segundo se marca
   `duplicado_de:<ID>` y se cierra; no se borra.
2. **`afecta` y `relacionado` no son decorativos**: son cómo alguien descubre, antes de tocar un
   archivo, que ya hay un problema abierto sobre él.
3. **Sin PII**: alias, no nombres; sin DNI, sin direcciones, sin fotos.
4. **No es un backlog.** Si el problema ya es trabajo concreto, se abre el issue `#N` y el PRB pasa a
   `resuelto` con `relacionado: #N`.
5. **No se declara resuelto sin prueba rojo→verde** en `## Cómo se cierra`.

## Buscar

```bash
rg -l '^categoria: dinero' docs/problemas          # por categoría
rg -l 'afecta:.*presupuesto' docs/problemas        # qué toca un archivo
rg -l "estado: abierto" docs/problemas             # lo que sigue vivo
```

El estado también vive en el registro, así que `rg 'abierto' docs/ids/REGISTRO.md` da la misma
respuesta sin abrir archivos.
