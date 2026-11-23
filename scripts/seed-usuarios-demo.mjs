#!/usr/bin/env node
/**
 * `node scripts/seed-usuarios-demo.mjs` — crea las 4 cuentas demo del proyecto
 * Supabase REMOTO y las engancha a sus ollas (members / devices / olla_members).
 *
 * SOLO PARA DEMO: usa `service_role`, que salta RLS. Jamás en código de la app ni
 * contra producción. Sin dependencias: Node 22 (fetch global).
 *
 * Env obligatorias (nunca hardcodeadas; el .env vive fuera del repo o chmod 600):
 *   SUPABASE_URL=https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE=<service_role key>
 *
 *   set -a; . .env.remote-db; set +a; node scripts/seed-usuarios-demo.mjs
 *
 * Idempotente: busca el usuario por email antes de crearlo y hace upsert
 * (`Prefer: resolution=merge-duplicates`) en las tablas.
 *
 * Por qué `members.id = auth.users.id`: `devices.user_id` y las policies de RLS
 * (`app.mis_ollas()` junta `devices.user_id = auth.uid()` con `olla_members`)
 * solo necesitan esa unión. Reutilizar el uuid del auth user como id de member
 * evita una tabla de mapeo y hace el script repetible sin IDs provisorios.
 */

const URL_BASE = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE;

if (!URL_BASE || !SERVICE_ROLE) {
  console.error(
    'Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.\n' +
      '  set -a; . .env.remote-db; set +a; node scripts/seed-usuarios-demo.mjs',
  );
  process.exit(1);
}

const OLLA = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const PASSWORD = 'Demo1234!';

/** Cuentas demo y sus ollas/roles. */
const CUENTAS = [
  { email: 'cocinera@demo.hackods.test', nombre: 'Cocinera Demo', ollas: [{ n: 1, rol: 'cocinera' }] },
  { email: 'organizadora@demo.hackods.test', nombre: 'Organizadora Demo', ollas: [{ n: 2, rol: 'organizadora' }] },
  { email: 'nutricionista@demo.hackods.test', nombre: 'Nutricionista Demo', ollas: [{ n: 1, rol: 'nutricionista' }] },
  {
    email: 'admin@demo.hackods.test',
    nombre: 'Admin Demo',
    ollas: [
      { n: 1, rol: 'admin' },
      { n: 3, rol: 'admin' },
    ],
  },
];

const cabeceras = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
  'Content-Type': 'application/json',
};

async function llamar(ruta, opciones = {}) {
  const res = await fetch(`${URL_BASE}${ruta}`, { ...opciones, headers: { ...cabeceras, ...opciones.headers } });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${ruta.slice(0, 60)} -> HTTP ${res.status}: ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

/** Usuarios de auth por email (paginado, 200 por página). */
async function usuariosPorEmail() {
  const mapa = new Map();
  for (let page = 1; ; page++) {
    const datos = await llamar(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const lista = datos?.users ?? [];
    for (const u of lista) if (u.email) mapa.set(u.email.toLowerCase(), u);
    if (lista.length < 200) return mapa;
  }
}

async function asegurarUsuario(mapa, cuenta) {
  const existente = mapa.get(cuenta.email.toLowerCase());
  if (existente) return existente.id;
  const creado = await llamar('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: cuenta.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { demo: true, nombre: cuenta.nombre },
    }),
  });
  return creado.id;
}

async function main() {
  const mapa = await usuariosPorEmail();

  for (const cuenta of CUENTAS) {
    const userId = await asegurarUsuario(mapa, cuenta);

    // pin_hash/recovery_hash ficticios y marcados: estas cuentas se loguean por
    // auth (email+password), no por PIN.
    await llamar('/rest/v1/members?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([
        { id: userId, pin_hash: '$2a$10$demo.demo.demo.demo.demo.demo.demo.demo.demo', recovery_hash: `demo-recovery-${userId.slice(0, 8)}` },
      ]),
    });

    await llamar('/rest/v1/devices?on_conflict=user_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{ user_id: userId, member_id: userId, last_seen: '2026-11-23T12:00:00Z' }]),
    });

    await llamar('/rest/v1/olla_members?on_conflict=member_id,olla_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(cuenta.ollas.map(({ n, rol }) => ({ member_id: userId, olla_id: OLLA(n), rol }))),
    });

    console.log(`${cuenta.email} -> ${cuenta.ollas.map(({ n, rol }) => `olla ${n}:${rol}`).join(', ')}`);
  }

  let users = 0;
  for (let page = 1; ; page++) {
    const datos = await llamar(`/auth/v1/admin/users?page=${page}&per_page=200`);
    users += (datos?.users ?? []).length;
    if ((datos?.users ?? []).length < 200) break;
  }
  const devices = await llamar('/rest/v1/devices?select=user_id&limit=1000');
  const cuentaOllas = await llamar('/rest/v1/olla_members?select=member_id,olla_id,rol&limit=1000');
  console.log(`\nauth users: ${users} | devices: ${devices.length} | olla_members: ${cuentaOllas.length}`);
}

main().catch((e) => {
  console.error(`Seed de usuarios demo fallido: ${e.message}`);
  process.exit(1);
});
