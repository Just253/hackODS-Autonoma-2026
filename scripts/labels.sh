#!/usr/bin/env bash
# scripts/labels.sh — crear/actualizar los labels del protocolo (docs/PROTOCOL.md Anexo C).
# Idempotente. Se ejecuta UNA vez por repo, por una persona con permisos.
# Idempotente: se puede correr de nuevo. No borra labels viejos; eso se limpia a mano.
set -euo pipefail
labels=(
  "status:triage|EDEDED|Sin reproducir ni acotar. No se puede reclamar."
  "status:ready|0E8A16|Acotado: criterio de aceptación y prueba esperada escritos."
  "status:claimed|1D76DB|Claim vigente de un agente."
  "status:in-review|5319E7|PR no-draft esperando revisión cruzada."
  "status:blocked|B60205|Espera otro issue o una decisión."
  "area:web|BFD4F2|Dueño: frontend / apps de usuario."
  "area:api|F9D0C4|Dueño: servicios, jobs, persistencia."
  "area:infra|D0E8D0|Dueño: infra, CI, scripts, docs de proceso."
  "area:contracts|F7C6E0|Compartido: contratos e interfaces. Requiere 2 aprobaciones."
  "type:bug|D73A4A|Algo está roto respecto de lo esperado."
  "type:feat|A2EEEF|Comportamiento nuevo."
  "type:chore|FEF2C0|Mantenimiento sin cambio de comportamiento."
  "type:docs|C5DEF5|Documentación y ADRs."
  "type:spike|D4C5F9|Investigación timeboxed. No se mergea a main."
  "p0|B60205|Producción rota. Se atiende ya."
  "p1|D93F0B|Bloquea a alguien del equipo."
  "p2|FBCA04|Cuando se pueda."
  "needs:human|000000|Requiere decisión o acción de un humano."
  "needs:decision|6F42C1|Requiere ADR antes de seguir."
  "coordination|006B75|Issue único de estado del equipo (fijado)."
  "duplicate|CFD3D7|Ya existe otro issue para esto."
  "handoff|FFD8A8|Cambio de dueño documentado con handoff/v1."
)
for entry in "${labels[@]}"; do
  IFS='|' read -r name color desc <<<"$entry"
  gh label create "$name" --color "$color" --description "$desc" --force >/dev/null
  echo "ok  $name"
done
