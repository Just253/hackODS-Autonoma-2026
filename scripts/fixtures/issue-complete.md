# Login se queda colgado 30s y devuelve "connection reset"

Huella: fp_auth_login_timeout

## Pasos para reproducir

1. `git clone https://github.com/ejemplo/app && cd app`
2. `cp .env.example .env`
3. `npm ci && npm run dev`
4. Abrir http://localhost:3000/login, usuario `demo@demo.com`, password `demo`
5. Click en "Entrar" y esperar

## Esperado

Redireccion a `/dashboard` en menos de 2 segundos.

## Actual

Spinner infinito. A los 30 segundos la consola muestra:

```
POST /api/login 504 (Gateway Timeout)
Error: read ECONNRESET at TLSWrap.onStreamRead
```

## Commit y version

- commit: 4f2c1ab (rama main)
- version: 0.9.3
- OS: Windows 11 26100, Node 22.11.0

## Evidencia

- log completo: adjunto `login-timeout.log`
- captura: `login-spinner.png`
- test que falla: `npm test -- auth.login.spec.ts` -> 1 failed

## Alcance

- src/auth/**
- src/api/login.ts
