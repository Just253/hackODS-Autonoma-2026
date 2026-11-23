#!/usr/bin/env bash
# preflight.sh - Preflight de SOLO LECTURA antes de tomar una tarea en GitHub.
#
# Equivalente bash de preflight.ps1. Requiere: gh (autenticado), git, jq, awk.
# En Windows correr desde Git Bash. En Linux/macOS directo.
#
# NO ESCRIBE NADA EN GITHUB: solo gh issue list/view, gh pr list/checks,
# gh api GET, gh repo view y git ls-remote. Ningun POST/PATCH/DELETE.
#
# Uso:
#   ./preflight.sh --repo owner/name --area auth --sym login-timeout \
#                  --text "login timeout" --paths src/auth,src/api/login.ts
#
#   ./preflight.sh --repo owner/name --area auth --sym login-timeout --json
#   ./preflight.sh --selftest          # prueba parseo/clasificacion sin red
#   ./preflight.sh --help
#
# Salida: reporte Markdown por stdout (o --out archivo), o JSON con --json.

set -uo pipefail

REPO=""
AREA=""
SYM=""
TEXT=""
PATHS=""
DAYS=30
TTL=48
LIMIT=20
JSON_OUT=0
OUT_FILE=""
SELFTEST=0
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

usage() {
  awk 'NR>1 { if ($0 ~ /^#/) { sub(/^# ?/, ""); print; next } else { exit } }' "$0"
}

die() { echo "ERROR: $*" >&2; exit 1; }

# Programa jq que extrae claims de una lista de comentarios (gramatica claim/v1
# del doc 02-protocolo-coordinacion.md, con fallback al formato legacy con pipes).
# Entrada: array de {author:{login}, body, createdAt, url}
# Salida:  un objeto por linea con agente, huella, rama, idleHours y estado.
CLAIM_JQ='
  . as $cs
  | ([ $cs[] | { author: .author.login, at: (.createdAt | fromdateiso8601) } ]) as $act
  | ([ $cs[] | select(.body | test("(?i)^\\s*release(/v1)?\\s*:?\\s+"; "m"))
       | { author: .author.login, at: (.createdAt | fromdateiso8601) } ]) as $rels
  | ([ $cs[] | select(.body | test("(?i)^\\s*reclaim(/v1)?\\s*:?\\s+"; "m"))
       | { at: (.createdAt | fromdateiso8601),
           notice: ((try (.body | capture("notice:(?<n>[0-9]+)h").n | tonumber) catch 12)) } ]) as $recs
  | $cs[]
  | select(.body | test("(?i)^\\s*claim(/v1)?\\s*:?\\s+"; "m"))
  | . as $c
  | ( $c.body | split("\n") | map(select(test("(?i)^\\s*claim(/v1)?\\s*:?\\s+"))) | first ) as $line
  | ( [ $line | scan("([A-Za-z_]+):([^\\s|]+)") ] | map({ (.[0]): .[1] }) | add // {} ) as $f
  | ($c.createdAt | fromdateiso8601) as $ct
  | ([ $act[] | select(.author == $c.author.login and .at <= $nowEpoch) | .at ] | max) as $last
  | (((( $nowEpoch - $last ) / 3600) * 10 | floor) / 10) as $idle
  | ((try ($f.ttl | capture("(?<n>[0-9]+)").n | tonumber) catch $ttl)) as $claimTtl
  | ([ $rels[] | select(.author == $c.author.login and .at > $ct and .at <= $nowEpoch) ] | length > 0) as $released
  | ([ $recs[] | select(.at > $ct and .at <= $nowEpoch) ] | sort_by(.at) | last) as $reclaim

  | {
      agent: ($f.agent // $f.by // $c.author.login),
      by: ($f.by // ""),
      fp: ($f.fp // ""),
      area: ($f.area // ""),
      branch: ($f.branch // ""),
      files: ($f.files // ""),
      author: $c.author.login,
      started: ($f.started // ""),
      ttlHours: $claimTtl,
      url: $c.url,
      idleHours: $idle
    }
  | .state = (
      if $released then "released"
      elif ($reclaim != null and ((($nowEpoch - $reclaim.at) / 3600) >= $reclaim.notice)) then "reclaimed"
      elif ($reclaim != null) then "reclaim-pending"
      elif $idle > $claimTtl then "orphan"
      elif $idle > ($claimTtl * 0.6) then "expiring-soon"
      else "active" end
    )
'

# ---------------------------------------------------------------------------
# Selftest offline: sin red, sin gh, sin jq (el parseo de claims es via jq,
# asi que ese bloque se salta si jq no esta).
# ---------------------------------------------------------------------------
selftest() {
  local pass=0 fail=0
  check() { # check <nombre> <esperado> <obtenido>
    if [ "$2" = "$3" ]; then pass=$((pass+1)); printf '  OK   %s\n' "$1"
    else fail=$((fail+1)); printf '  FAIL %s (esperado "%s", obtenido "%s")\n' "$1" "$2" "$3"; fi
  }

  echo "== huella =="
  check "area+sym" "fp_auth_login_timeout" "$(fingerprint auth login-timeout)"
  check "normaliza" "fp_auth_service_login_timeout" "$(fingerprint 'Auth Service' 'Login Timeout')"
  check "solo area" "fp_auth" "$(fingerprint auth '')"

  echo "== version de bash =="
  if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then echo "  OK   bash ${BASH_VERSION} (>=4, soporta mapfile)"
  else echo "  FAIL bash ${BASH_VERSION} (<4)"; fail=$((fail+1)); fi

  echo "== claim parsing + estado (claim/v1) =="
  if command -v jq >/dev/null 2>&1; then
    local fx="$FIXTURES/comments.json" out ep_act ep_old ep_rel ep_rec ep_rec2
    [ -f "$fx" ] || die "falta fixture $fx"
    ep_act="$(jq -n '"2026-11-21T00:00:00Z" | fromdateiso8601')"    # heartbeat 20h antes -> active
    ep_old="$(jq -n '"2026-11-23T00:00:00Z" | fromdateiso8601')"
    ep_rel="$(jq -n '"2026-11-26T00:00:00Z" | fromdateiso8601')"    # release del 25 -> released
    ep_rec="$(jq -n '"2026-11-24T18:00:00Z" | fromdateiso8601')"    # reclaim 11:00, notice 12h -> pending
    ep_rec2="$(jq -n '"2026-11-25T06:00:00Z" | fromdateiso8601')"   # notice vencido -> reclaimed

    out="$(jq -c --argjson ttl 24 --argjson nowEpoch "$ep_act" "$CLAIM_JQ" "$fx" 2>&1)"
    check "un claim" "1" "$(printf '%s\n' "$out" | grep -c .)"
    check "agente" "ana-lead-3f2a" "$(printf '%s' "$out" | jq -r .agent)"
    check "handle" "@ana" "$(printf '%s' "$out" | jq -r .by)"
    check "huella" "fp_api_auth_login_timeout" "$(printf '%s' "$out" | jq -r .fp)"
    check "rama" "feat/api-142-oauth-refresh" "$(printf '%s' "$out" | jq -r .branch)"
    check "files" "services/api/src/auth/**" "$(printf '%s' "$out" | jq -r .files)"
    check "ttl del claim" "24" "$(printf '%s' "$out" | jq -r .ttlHours)"
    check "con heartbeat reciente" "active" "$(printf '%s' "$out" | jq -r .state)"

    out="$(jq -c --argjson ttl 24 --argjson nowEpoch "$ep_old" "$CLAIM_JQ" "$fx")"
    check "sin actividad > ttl" "orphan" "$(printf '%s' "$out" | jq -r .state)"

    out="$(jq -c --argjson ttl 24 --argjson nowEpoch "$ep_rel" "$CLAIM_JQ" "$fx")"
    check "release posterior" "released" "$(printf '%s' "$out" | jq -r .state)"

    out="$(jq -c --argjson ttl 24 --argjson nowEpoch "$ep_rec" "$CLAIM_JQ" "$fx")"
    check "reclaim con notice vigente" "reclaim-pending" "$(printf '%s' "$out" | jq -r .state)"

    out="$(jq -c --argjson ttl 24 --argjson nowEpoch "$ep_rec2" "$CLAIM_JQ" "$fx")"
    check "reclaim con notice vencido" "reclaimed" "$(printf '%s' "$out" | jq -r .state)"
  else
    echo "  SKIP jq no esta en el PATH"
  fi

  echo "== evidence pack =="
  local body score=0
  body="pasos para reproducir: 1) npm ci. esperado: dashboard. actual: spinner. commit 4f2c1ab. evidencia: log."
  local pat
  for pat in "pasos para reproducir" "esperado" "actual" "commit" "evidencia"; do
    case "$body" in *"$pat"*) score=$((score+1));; esac
  done
  check "score 5/5" "5" "$score"

  echo
  echo "Selftest: $pass OK, $fail FAIL"
  [ "$fail" -eq 0 ] || exit 1
  exit 0
}

slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/_/g; s/^_+//; s/_+$//; s/__+/_/g'
}

fingerprint() {
  local a s
  a="$(slug "${1:-}")"
  s="$(slug "${2:-}")"
  if [ -z "$a" ] && [ -z "$s" ]; then return 1; fi
  if [ -z "$a" ]; then printf 'fp_%s' "$s"; return 0; fi
  if [ -z "$s" ]; then printf 'fp_%s' "$a"; return 0; fi
  printf 'fp_%s_%s' "$a" "$s"
}

# ---------------------------------------------------------------------------
# Argumentos
# ---------------------------------------------------------------------------
FIXTURES="$(cd "$(dirname "$0")" 2>/dev/null && pwd)/fixtures"

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="${2:-}"; shift 2 ;;
    --area) AREA="${2:-}"; shift 2 ;;
    --sym) SYM="${2:-}"; shift 2 ;;
    --text) TEXT="${2:-}"; shift 2 ;;
    --paths) PATHS="${2:-}"; shift 2 ;;
    --days) DAYS="${2:-30}"; shift 2 ;;
    --ttl) TTL="${2:-48}"; shift 2 ;;
    --limit) LIMIT="${2:-20}"; shift 2 ;;
    --json) JSON_OUT=1; shift ;;
    --out) OUT_FILE="${2:-}"; shift 2 ;;
    --selftest) SELFTEST=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "argumento desconocido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ "$SELFTEST" -eq 1 ] && selftest

command -v gh >/dev/null 2>&1 || die "falta gh en el PATH"
command -v jq >/dev/null 2>&1 || die "falta jq. Instalalo, o usa preflight.ps1 (no necesita jq)"
command -v git >/dev/null 2>&1 || die "falta git en el PATH"

if [ -z "$AREA" ] && [ -z "$SYM" ] && [ -z "$TEXT" ]; then
  die "pasa al menos --area, --sym o --text"
fi

if [ -z "$REPO" ]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)" || true
  [ -n "$REPO" ] || die "no pude deducir el repo; pasa --repo owner/name"
fi

FP="$(fingerprint "$AREA" "$SYM" 2>/dev/null || true)"
NOW_EPOCH="$(date -u +%s)"

QUERIES=()
[ -n "$FP" ] && QUERIES+=("$FP in:body")
[ -n "$TEXT" ] && QUERIES+=("$TEXT in:title,body")
[ -n "$AREA" ] && QUERIES+=("$AREA in:title")

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Preflight sobre $REPO" >&2
[ -n "$FP" ] && echo "Huella: $FP" >&2

# ---------------------------------------------------------------------------
# Issues y PRs (varias busquedas, dedup por numero)
# ---------------------------------------------------------------------------
: > "$TMP/issues.ndjson"
for q in "${QUERIES[@]:-}"; do
  [ -z "$q" ] && continue
  if gh issue list -R "$REPO" --state all --search "$q" --limit "$LIMIT" \
      --json number,title,state,stateReason,labels,assignees,updatedAt,closedAt,url,body,closedByPullRequestsReferences \
      > "$TMP/chunk.json" 2>"$TMP/err.txt"; then
    jq -c '.[]' "$TMP/chunk.json" >> "$TMP/issues.ndjson"
  else
    echo "aviso: fallo la busqueda de issues [$q]: $(head -1 "$TMP/err.txt")" >&2
  fi
done
jq -s 'unique_by(.number)' "$TMP/issues.ndjson" > "$TMP/issues.json" 2>/dev/null || echo '[]' > "$TMP/issues.json"

: > "$TMP/prs.ndjson"
for q in "${QUERIES[@]:-}"; do
  [ -z "$q" ] && continue
  if gh pr list -R "$REPO" --state all --search "$q" --limit "$LIMIT" \
      --json number,title,state,isDraft,headRefName,reviewDecision,mergeStateStatus,updatedAt,url,files \
      > "$TMP/chunk2.json" 2>"$TMP/err2.txt"; then
    jq -c '.[]' "$TMP/chunk2.json" >> "$TMP/prs.ndjson"
  else
    echo "aviso: fallo la busqueda de PRs [$q]: $(head -1 "$TMP/err2.txt")" >&2
  fi
done
jq -s 'unique_by(.number)' "$TMP/prs.ndjson" > "$TMP/prs.json" 2>/dev/null || echo '[]' > "$TMP/prs.json"

# ---------------------------------------------------------------------------
# Ramas remotas
# ---------------------------------------------------------------------------
git ls-remote --heads "https://github.com/$REPO.git" 2>/dev/null \
  | sed -nE 's|.*refs/heads/(.*)$|\1|p' > "$TMP/branches.txt"
if [ ! -s "$TMP/branches.txt" ]; then
  gh api "repos/$REPO/branches?per_page=100" --jq '.[].name' > "$TMP/branches.txt" 2>/dev/null || true
fi

KW=""
[ -n "$TEXT" ] && KW="$KW $TEXT"
[ -n "$SYM" ] && KW="$KW $SYM $(printf '%s' "$SYM" | tr '-' ' ')"
[ -n "$AREA" ] && KW="$KW $AREA"
[ -n "$FP" ] && KW="$KW $FP"

: > "$TMP/branch-hits.txt"
while IFS= read -r br; do
  [ -z "$br" ] && continue
  low="$(printf '%s' "$br" | tr '[:upper:]' '[:lower:]')"
  for k in $KW; do
    kl="$(printf '%s' "$k" | tr '[:upper:]' '[:lower:]')"
    case "$low" in *"$kl"*) printf '%s\n' "$br" >> "$TMP/branch-hits.txt"; break;; esac
  done
done < "$TMP/branches.txt"
sort -u "$TMP/branch-hits.txt" -o "$TMP/branch-hits.txt"

# ---------------------------------------------------------------------------
# Claims de los issues abiertos candidatos
# ---------------------------------------------------------------------------
printf '[]' > "$TMP/claims.json"
if jq -e 'length > 0' "$TMP/issues.json" >/dev/null 2>&1; then
  : > "$TMP/claims.ndjson"
  while IFS= read -r n; do
    [ -z "$n" ] && continue
    if gh issue view "$n" -R "$REPO" --json comments --jq '.comments' > "$TMP/c.json" 2>/dev/null; then
      jq -c --argjson ttl "$TTL" --argjson nowEpoch "$NOW_EPOCH" "$CLAIM_JQ" "$TMP/c.json" \
        >> "$TMP/claims.ndjson" 2>>"$TMP/claimerr.txt" || true
    fi
  done < <(jq -r '.[] | select(.state == "OPEN") | .number' "$TMP/issues.json" | head -10)
  jq -s '.' "$TMP/claims.ndjson" > "$TMP/claims.json" 2>/dev/null || printf '[]' > "$TMP/claims.json"
fi

# ---------------------------------------------------------------------------
# Commits recientes en el area
# ---------------------------------------------------------------------------
: > "$TMP/commits.ndjson"
if [ -n "$PATHS" ]; then
  SINCE="$(date -u -d "-$DAYS days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"$DAYS"d +%Y-%m-%dT%H:%M:%SZ)"
  IFS=',' read -ra PARTS <<< "$PATHS"
  for p in "${PARTS[@]}"; do
    enc="$(printf '%s' "$p" | sed -e 's| |%20|g' -e 's|/|%2F|g')"
    gh api "repos/$REPO/commits?path=$enc&since=$SINCE&per_page=10" \
      --jq '.[] | {sha:.sha, date:.commit.author.date, author:.commit.author.name, msg:.commit.message}' \
      >> "$TMP/commits.ndjson" 2>/dev/null || true
  done
fi
jq -s 'sort_by(.date) | reverse' "$TMP/commits.ndjson" > "$TMP/commits.json" 2>/dev/null || echo '[]' > "$TMP/commits.json"

# ---------------------------------------------------------------------------
# CI de la rama por defecto (check-runs necesita SHA, no nombre de rama)
# ---------------------------------------------------------------------------
DEF_BRANCH="$(gh repo view "$REPO" --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || echo main)"
DEF_SHA="$(gh api "repos/$REPO/commits/$DEF_BRANCH" --jq '.sha' 2>/dev/null || true)"
printf '[]' > "$TMP/ci.json"
if [ -n "$DEF_SHA" ]; then
  gh api "repos/$REPO/commits/$DEF_SHA/check-runs" \
    --jq '[.check_runs[] | {name:.name, status:.status, conclusion:.conclusion}]' \
    > "$TMP/ci.json" 2>/dev/null || printf '[]' > "$TMP/ci.json"
fi

# ---------------------------------------------------------------------------
# Reporte
# ---------------------------------------------------------------------------
if [ "$JSON_OUT" -eq 1 ]; then
  jq -n --arg repo "$REPO" --arg fp "$FP" --arg now "$NOW" \
        --arg area "$AREA" --arg sym "$SYM" --arg text "$TEXT" --argjson ttl "$TTL" \
        --argjson issues "$(cat "$TMP/issues.json")" \
        --argjson prs "$(cat "$TMP/prs.json")" \
        --argjson claims "$(cat "$TMP/claims.json")" \
        --argjson commits "$(cat "$TMP/commits.json")" \
        --argjson ci "$(cat "$TMP/ci.json")" \
        --arg branches "$(cat "$TMP/branch-hits.txt")" \
    '{ repo:$repo, fingerprint:$fp, generatedAt:$now,
       scope:{area:$area, sym:$sym, text:$text, ttlHours:$ttl},
       issues:$issues, prs:$prs, claims:$claims, commits:$commits, ci:$ci,
       branches:($branches | split("\n") | map(select(length>0))) }'
  exit 0
fi

{
  echo "# Preflight $REPO - ${FP:-$TEXT}"
  echo "Generado: $NOW"
  echo "Huella:   ${FP:-(sin huella)}"
  echo
  echo "## Issues"
  jq -r '
    def evscore($b):
      ([ ["pasos para reproducir","steps to reproduce","repro","reproducir"],
         ["esperado","expected"],
         ["actual","observed"],
         ["commit","version","sha"],
         ["evidencia","evidence","log:","logs","stack trace","salida","output",".log","screenshot","captura","traceback"],
         ["fp_","[area:"]
       ]) as $sections
      | ([ $sections[] as $pats
           | select([ $pats[] as $p | select((($b // "") | ascii_downcase) | contains($p)) ] | length > 0)
         ] | length) as $f
      | (($f * 100 / 6) | floor);
    def asg: [.assignees[].login] | join(",") | if . == "" then "-" else . end;
    if length == 0 then "Sin coincidencias."
    else
      .[] | "  - #\(.number) [\(.state)\(if .stateReason then "/" + .stateReason else "" end)] \(.title)\n      labels:\([.labels[].name]|join(",")) assignee:\(asg) evidence:\(evscore(.body))%  \(.url)"
    end' "$TMP/issues.json"
  echo
  echo "## PRs"
  jq -r 'if length == 0 then "Sin coincidencias."
    else .[] | "  - #\(.number) [\(.state)\(if .isDraft then " draft" else "" end)] \(.title)\n      rama:\(.headRefName) review:\(.reviewDecision // "-")  \(.url)"
    end' "$TMP/prs.json"
  echo
  echo "## Claims"
  jq -r 'if length == 0 then "Ninguno."
    else .[] | "  - [\(.state)] \(.agent) (@\(.author)) idle:\(.idleHours)h ttl:TTLH  \(.url)"
    end' "$TMP/claims.json" | sed "s/TTLH/${TTL}h/"
  echo
  echo "## Ramas candidatas"
  if [ -s "$TMP/branch-hits.txt" ]; then sed 's/^/  - /' "$TMP/branch-hits.txt"; else echo "Ninguna."; fi
  echo
  echo "## Commits recientes en el area"
  jq -r 'if length == 0 then "Ninguno."
    else .[] | "  - \(.sha[0:8]) \(.date) \(.author): \(.msg | split("\n")[0])"
    end' "$TMP/commits.json"
  echo
  echo "## CI"
  jq -r --arg b "$DEF_BRANCH" --arg s "${DEF_SHA:0:8}" '
    if length == 0 then "  - Rama \($b) @ \($s): sin datos"
    else "  - Rama \($b) @ \($s): \(length) checks, fallando: "
      + ([ .[] | select(.conclusion != null and .conclusion != "success" and .conclusion != "skipped" and .conclusion != "neutral") | .name ] | join(",") | if . == "" then "ninguno" else . end)
    end' "$TMP/ci.json"
} > "$TMP/report.md"

cat "$TMP/report.md"
if [ -n "$OUT_FILE" ]; then
  cp "$TMP/report.md" "$OUT_FILE"
  echo "Reporte escrito en $OUT_FILE"
fi
