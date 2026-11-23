#!/usr/bin/env node
/**
 * `pnpm db:seed` — corre supabase/seed.sql contra la base remota (o staging).
 * Equivalente portable del `psql "$SUPABASE_DB_URL" -f ...` del plan, que no
 * funciona en cmd/PowerShell de Windows.
 *
 * Requiere: psql en PATH y la variable SUPABASE_DB_URL (nunca se commitea).
 */
import { spawnSync } from 'node:child_process';

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    'Falta SUPABASE_DB_URL. Ejemplo:\n' +
      '  PowerShell: $env:SUPABASE_DB_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"; pnpm db:seed\n' +
      '  bash:       SUPABASE_DB_URL="postgresql://..." pnpm db:seed',
  );
  process.exit(1);
}

const resultado = spawnSync(
  'psql',
  [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/seed.sql'],
  { stdio: 'inherit' },
);

if (resultado.error) {
  console.error(`No se pudo ejecutar psql: ${resultado.error.message}`);
  process.exit(1);
}

process.exit(resultado.status ?? 1);
