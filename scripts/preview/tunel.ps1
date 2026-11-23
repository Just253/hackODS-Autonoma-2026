<#
  Un solo tunel de Cloudflare para el preview (puerto 4173).

  Regla: el tunel se crea UNA vez y se reutiliza. Si ya hay un cloudflared
  apuntando a este puerto, este script no arranca otro: imprime la URL guardada
  y sale. Reiniciar cloudflared cambia la URL, por eso no se reinicia solo.

  La URL publica se guarda en tunel-url.txt.
  -Reiniciar  baja el tunel actual y crea uno nuevo (la URL cambia; es explicito).

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/tunel.ps1
#>
[CmdletBinding()]
param(
  [int]$Puerto = 4173,
  [switch]$Reiniciar
)

$ErrorActionPreference = 'Stop'

$Aqui = Split-Path -Parent $PSCommandPath
$UrlFile = Join-Path $Aqui 'tunel-url.txt'
$PidFile = Join-Path $Aqui 'tunel.pid'
$LogSalida = Join-Path $Aqui 'tunel.log'
$LogError = Join-Path $Aqui 'tunel.err.log'
$Destino = "http://127.0.0.1:$Puerto"   # literal, no localhost: evita el desvio a ::1

function Get-ProcesoTunel {
  $procesos = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue
  if (-not $procesos) { return @() }
  return @(
    $procesos | Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match 'tunnel' -and
      ($_.CommandLine -match "127\.0\.0\.1:$Puerto|localhost:$Puerto")
    }
  )
}

function Get-UrlDelLog {
  $texto = ''
  foreach ($archivo in @($LogSalida, $LogError)) {
    if (Test-Path $archivo) {
      $texto += "`n" + (Get-Content -Path $archivo -Raw -ErrorAction SilentlyContinue)
    }
  }
  $hallados = [regex]::Matches($texto, 'https://[a-z0-9-]+\.trycloudflare\.com')
  if ($hallados.Count -gt 0) { return $hallados[$hallados.Count - 1].Value }
  return $null
}

function Get-UrlGuardada {
  if (-not (Test-Path $UrlFile)) { return $null }
  $url = (Get-Content -Path $UrlFile -Raw -ErrorAction SilentlyContinue)
  if (-not $url) { return $null }
  $url = $url.Trim()
  if ($url -match '^https://[a-z0-9-]+\.trycloudflare\.com$') { return $url }
  return $null
}

$activos = @(Get-ProcesoTunel)

if ($activos.Count -gt 0 -and -not $Reiniciar) {
  $url = Get-UrlGuardada
  if (-not $url) {
    $url = Get-UrlDelLog
    if ($url) { Set-Content -Path $UrlFile -Value $url -Encoding ASCII }
  }
  Write-Host "Tunel ya activo (PID $($activos[0].ProcessId)). No se crea otro: la URL no cambia." -ForegroundColor Green
  if ($url) {
    Write-Host "URL publica: $url" -ForegroundColor Cyan
  } else {
    Write-Host "La URL todavia no aparece en $LogError. Revisalo en unos segundos." -ForegroundColor Yellow
  }
  exit 0
}

if ($Reiniciar -and $activos.Count -gt 0) {
  Write-Host "Reiniciando el tunel pedido con -Reiniciar (la URL va a cambiar)..." -ForegroundColor Yellow
  foreach ($proceso in $activos) { Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cmd) {
  Write-Host "cloudflared no esta en el PATH. No se instala nada solo; el comando es:" -ForegroundColor Yellow
  Write-Host "  winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  Write-Host "Despues de instalarlo, abri una consola nueva y volve a correr este script."
  exit 1
}

$version = (& $cmd.Source --version 2>&1) -join ' '
Write-Host "cloudflared: $version"

# Una URL vieja con un proceso muerto es mentira: se borra antes de arrancar.
Remove-Item -Path $UrlFile -ErrorAction SilentlyContinue
Remove-Item -Path $LogSalida, $LogError -ErrorAction SilentlyContinue

Write-Host "Abriendo tunel hacia $Destino (una sola vez)..."
$proceso = Start-Process -FilePath $cmd.Source `
  -ArgumentList @('tunnel', '--no-autoupdate', '--url', $Destino) `
  -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $LogSalida -RedirectStandardError $LogError

Set-Content -Path $PidFile -Value $proceso.Id -Encoding ASCII

$url = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $url = Get-UrlDelLog
  if ($url) { break }
  if ($proceso.HasExited) { break }
}

if (-not $url) {
  Write-Host "No se pudo leer la URL en 60 s." -ForegroundColor Red
  if ($proceso.HasExited) {
    Write-Host "cloudflared salio con codigo $($proceso.ExitCode). Ultimas lineas:" -ForegroundColor Red
    Remove-Item -Path $PidFile -ErrorAction SilentlyContinue
  } else {
    Write-Host "El proceso sigue vivo (PID $($proceso.Id)); la URL puede tardar mas." -ForegroundColor Yellow
  }
  foreach ($archivo in @($LogError, $LogSalida)) {
    if (Test-Path $archivo) {
      $lineas = @(Get-Content -Path $archivo -Tail 12 -ErrorAction SilentlyContinue)
      if ($lineas.Count -gt 0) {
        Write-Host "--- $archivo"
        $lineas | ForEach-Object { Write-Host "  $_" }
      }
    }
  }
  exit 1
}

Set-Content -Path $UrlFile -Value $url -Encoding ASCII

Write-Host ""
Write-Host "Tunel arriba (PID $($proceso.Id))." -ForegroundColor Green
Write-Host "URL publica: $url" -ForegroundColor Cyan
Write-Host "Guardada en: $UrlFile"
Write-Host "Aviso: es publica; solo sirve archivos estaticos de apps/web/dist."
