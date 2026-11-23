#!/usr/bin/env node
// db-test — corre la suite pgTAP de supabase con el seed visible.
//
// Por qué existe: `supabase test db` monta SOLO supabase/tests en el contenedor
// de pg_prove, así que 001_seed_idempotente.sql no puede hacer `\ir ../seed.sql`
// (el seed queda fuera del mount). Este runner copia el seed junto a los tests,
// corre la suite con el CLI de Supabase y borra la copia al final: una sola
// fuente de verdad (supabase/seed.sql), sin dataset duplicado en el repo.
//
// Uso:
//   pnpm db:test                                    # CLI `supabase` del PATH (Docker)
//   SUPABASE_CLI=~/bin/supabase-local pnpm db:test  # lanzador con socket de Podman
import { copyFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { spawnSync } from 'node:child_process'

const SRC = 'supabase/seed.sql'
const DST = 'supabase/tests/fixtures/seed.txt'
const cli = process.env.SUPABASE_CLI ?? 'supabase'

mkdirSync(dirname(DST), { recursive: true })

copyFileSync(SRC, DST)
let status = 1
try {
  const r = spawnSync(cli, ['test', 'db'], { stdio: 'inherit' })
  if (r.error) {
    console.error(`db-test: no pude ejecutar "${cli}" (${r.error.code ?? r.error.message}).`)
    console.error('Instalá el CLI de Supabase o apuntá SUPABASE_CLI al binario correcto (p. ej. ~/bin/supabase-local).')
  } else {
    status = r.status ?? 1
  }
} finally {
  rmSync(DST, { force: true })
}
process.exit(status)
