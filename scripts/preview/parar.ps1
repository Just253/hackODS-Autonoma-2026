<#
  Baja el preview completo: watcher, servidor y tunel. Idempotente.

  No borra dist ni el build: solo apaga procesos. La URL del tunel se descarta
  porque muere con el proceso (y una URL vieja en el archivo seria mentira).

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/parar.ps1
#>
[CmdletBinding()]
param(
  [int]$Puerto = 4173
)

$ErrorActionPreference = 'Stop'

$Aqui = Split-Path -Parent $PSCommandPath
$bajados = @()

function Get-ProcesoPorGuion([string]$fragmento) {
  $procesos = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  if (-not $procesos) { return @() }
  return @($procesos | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$fragmento*" })
}

function Bajar([string]$fragmento, [string]$etiqueta) {
  $encontrados = @(Get-ProcesoPorGuion $fragmento)
  foreach ($proceso in $encontrados) {
    if ($proceso.ProcessId -eq $PID) { continue }
    Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
    $script:bajados += "$etiqueta (PID $($proceso.ProcessId))"
  }
}

Bajar 'actualizar.mjs' 'watcher'
Bajar 'servir.mjs' 'servidor'

# cloudflared de este preview: nombre exacto + puerto en la linea de comandos.
$tuneles = @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -and $_.CommandLine -match "127\.0\.0\.1:$Puerto|localhost:$Puerto" })
foreach ($proceso in $tuneles) {
  Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
  $bajados += "tunel (PID $($proceso.ProcessId))"
}

foreach ($archivo in @('actualizar.pid', 'servidor.pid', 'tunel.pid')) {
  Remove-Item -Path (Join-Path $Aqui $archivo) -ErrorAction SilentlyContinue
}
Remove-Item -Path (Join-Path $Aqui 'tunel-url.txt') -ErrorAction SilentlyContinue

if ($bajados.Count -eq 0) {
  Write-Host "No habia nada corriendo del preview."
} else {
  Write-Host "Bajado:" -ForegroundColor Green
  $bajados | ForEach-Object { Write-Host "  - $_" }
}

$quedan = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
if ($quedan) {
  Write-Host "Aviso: el puerto $Puerto sigue escuchando (PID $($quedan[0].OwningProcess)); no es de este preview." -ForegroundColor Yellow
}
