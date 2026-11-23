---
description: Prepara y ensaya la demo con datos sembrados. Congela el alcance.
agent: orquestador
---

Prepará la demo (**$ARGUMENTS** = duración objetivo en minutos; default 5).

**Regla de congelamiento:** desde que arranca este comando no entra ninguna feature nueva. Solo se
arregla lo que rompe la demo, en ramas `fix/demo-*`, y se avisa en `coordination`.

1. `/seed demo` en local y verificación de que la app arranca sin red (DevTools → Offline → recargar).
2. Guion de 5 escenas, con una frase por escena y el clic exacto:
   a. Registrar una jornada sin conexión (se ve el badge "pendiente").
   b. Volver online y ver la sincronización.
   c. Ver el costo por ración calculado desde eventos (no tecleado).
   d. Ver el aporte nutricional de la receta con su fuente.
   e. Imprimir/compartir el reporte del día (PDF A4 u 80 mm).
3. Ensayo cronometrado, dos veces: una con red y una con la red apagada al inicio. Anotá el tiempo
   real de cada escena.
4. Plan B por escena: captura o video ya generado, por si falla el proyector, la cámara o el wifi.
5. Verificá que **no** haya datos reales en pantalla (alias, montos del seed) ni secretos visibles.

**Prohibido:** agregar features, tocar `main`, deployar a producción, usar datos reales, "arreglar en
vivo" durante la demo, mostrar la consola o el editor, prometer métricas que no están medidas.

**Salida:** tabla `escena | qué se dice | qué se clica | duración | plan B`, más la lista de riesgos con
su mitigación y el commit exacto que se va a mostrar.
