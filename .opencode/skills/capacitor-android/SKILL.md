---
name: Capacitor Android
description: Cuándo empaquetar la PWA como app Android, cómo se configura, qué permisos y qué no puede ir en el APK. Cargar al tocar apps/mobile, capacitor.config, AndroidManifest o builds de Android.
---

# Capacitor Android

## Cuándo se carga

- Alguien pide "una app para el celular" o "que salga en Play Store".
- Hay que usar cámara, archivos o impresión que el navegador no resuelve bien.
- Falla un build, un permiso o la app no arranca sin red.

## Decisión primero

**No se agrega Capacitor por default.** La PWA instalable cubre el caso normal (agregar a pantalla de
inicio, offline, cámara por `input file`). Se agrega solo si un ADR justifica una capacidad nativa
(impresión térmica, escaneo continuo, archivos locales) o la distribución en tienda.

Sin ADR que lo justifique, el PR de `apps/mobile` no se acepta.

## Puesta en marcha

```bash
pnpm --filter @hackods/web build            # el webDir debe existir antes de sync
pnpm exec cap add android
pnpm exec cap sync android
pnpm exec cap open android                  # abre Android Studio
```

`capacitor.config.ts`: `appId` estable (`pe.hackods.ollas`), `appName` visible, `webDir: ../web/dist`,
`server.androidScheme: 'https'`, sin `server.url` en producción (eso apunta a un dev server y rompe el
offline).

## Permisos (AndroidManifest)

- Cámara: `android.permission.CAMERA` **solo** si se usa `getUserMedia`. Con `<input capture>` no hace
  falta.
- Archivos: usar el selector del sistema; evitar `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE`.
- Internet: viene por default; no agregues permisos "por si acaso". Cada permiso se justifica en el PR.

## Seguridad

- `android:usesCleartextTraffic="false"`. Nada de HTTP en producción.
- El APK es **público**: solo puede contener la `anon key`. `service_role`, keystore y
  `google-services.json` no van al repo ni al bundle.
- Sin `console.log` de datos personales en release.
- Actualizaciones del WebView: no borres el almacenamiento al actualizar. IndexedDB debe sobrevivir; se
  prueba instalando la versión N+1 encima de la N.

## Comportamiento offline

- La app debe abrir y mostrar datos **sin red desde el primer arranque tras la instalación** (el shell va
  en el APK).
- El back de Android no debe cerrar la app en medio de un formulario: se intercepta y se pregunta.
- Safe areas (notch) y teclado: el formulario no queda tapado.
- El ciclo de vida mata el WebView: el flush del outbox ocurre en `pause`/`resume` además de
  `visibilitychange`.

## Build y versión

| Dato | Regla |
|---|---|
| `versionCode` | entero, +1 en cada build que se distribuye |
| `versionName` | semver visible, igual al release |
| Firma | keystore **fuera del repo**, respaldo en un gestor de secretos |
| CI | solo `assembleDebug`; el release lo firma y sube una persona |
| Tamaño | objetivo < 10 MB; si crece, se revisan assets |

```bash
cd apps/mobile/android && ./gradlew assembleDebug
```

## Checklist antes de decir "la app anda"

- [ ] Instalación limpia en un teléfono real (no solo emulador).
- [ ] Modo avión: abre, muestra datos, permite registrar y queda "pendiente".
- [ ] Volver la red: sincroniza una sola vez.
- [ ] Cámara: permiso denegado no rompe la pantalla; se puede cargar a mano.
- [ ] Back, rotación y teclado no pierden el formulario.
- [ ] Actualizar encima de la versión anterior conserva los datos.
- [ ] Sin secretos en el APK (`unzip -p app.apk assets/... | rg` sobre lo que corresponda).

## Anti-patrones

- `server.url` apuntando a `localhost` en un build de release.
- Meter la app en la tienda para una hackathon sin keystore respaldado: se pierde la cuenta.
- Permisos declarados que nunca se usan (rechazo en revisión y desconfianza del usuario).
- Duplicar la app: dos bases, dos códigos. Capacitor envuelve el **mismo** `apps/web`.

## Fuente

- `docs/adr/0004-capacitor.md` (decisión y por qué).
- Documentación de Capacitor: configuración, Android, ciclo de vida.
- Documentación de Android: permisos, `usesCleartextTraffic`, firma de apps.
