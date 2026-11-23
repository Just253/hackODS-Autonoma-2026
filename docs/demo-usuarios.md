# Cuentas demo

Solo entorno de demo (proyecto Supabase de hackathon). **Jamás en producción.**
Datos ficticios (D7): las personas y ollas no existen.

| Cuenta | Contraseña | Rol / olla |
| --- | --- | --- |
| `cocinera@demo.hackods.test` | `Demo1234!` | cocinera en olla 1 |
| `organizadora@demo.hackods.test` | `Demo1234!` | organizadora en olla 2 |
| `nutricionista@demo.hackods.test` | `Demo1234!` | nutricionista en olla 1 |
| `admin@demo.hackods.test` | `Demo1234!` | admin en ollas 1 y 3 |

Se siembran con `node scripts/seed-usuarios-demo.mjs` (necesita `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` por env). Los datos ricos vienen de
`supabase/seeds/demo-grande.sql`, que corre después de `seed.sql`.

## Verificar que un JWT ve solo su olla

```bash
TOKEN=$(curl -s -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d '{"email":"cocinera@demo.hackods.test","password":"Demo1234!"}' | jq -r .access_token)

curl -s -w '\nHTTP %{http_code}\n' "$SUPABASE_URL/rest/v1/ollas?select=id,titulo" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN"
```

Esperado: `cocinera` ve 1 olla, `admin` ve 2. Nunca pegar el token en un issue o log.
