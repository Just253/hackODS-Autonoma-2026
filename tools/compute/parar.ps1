#requires -Version 5.1
<#
  Baja el compute de pruebas (issue #64): el servicio Node y su tunel.

  Idempotente: si no hay nada corriendo, lo dice y sale con 0.
  No borra el token (`tools/compute/.token`): si se borrara, el tercero tendria
  que pedirlo de nuevo. La URL del tunel si se limpia, porque esa URL ya murio.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/parar.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$Aqui = Split-Path -Parent $PSCommandPath
$Puerto = 4400
$ArchivoPid = Join-Path $Aqui 'servicio.pid'
$ArchivoUrl = Join-Path $Aqui 'tunel-url.txt'
$ArchivoPidTunel = Join-Path $Aqui 'tunel.pid'

$bajados = 0

# 1. El servicio Node, por su pidfile.
if (Test-Path $ArchivoPid) {
  $pidTexto = (Get-Content -Path $ArchivoPid -Raw).Trim()
  if ($pidTexto -match '^\d+$') {
    $proceso = Get-Process -Id ([int]$pidTexto) -ErrorAction SilentlyContinue
    if ($proceso) {
      Stop-Process -Id $proceso.Id -Force -ErrorAction SilentlyContinue
      Write-Host "Servicio detenido (PID $($proceso.Id))." -ForegroundColor Green
      $bajados++
    }
  }
  Remove-Item -Path $ArchivoPid -ErrorAction SilentlyContinue
}

# 2. Cualquier node que haya quedado sirviendo el 4400 sin pidfile.
$sobrantes = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -match 'servicio\.mjs'
  })
foreach ($proceso in $sobrantes) {
  Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "Servicio detenido (PID $($proceso.ProcessId), sin pidfile)." -ForegroundColor Green
  $bajados++
}

# 3. El tunel que apunta a este puerto.
$tuneles = @(Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and
    $_.CommandLine -match 'tunnel' -and
    ($_.CommandLine -match "127\.0\.0\.1:$Puerto|localhost:$Puerto")
  })
foreach ($proceso in $tuneles) {
  Stop-Process -Id $proceso.ProcessId -Force -ErrorAction SilentlyContinue
  Write-Host "Tunel detenido (PID $($proceso.ProcessId))." -ForegroundColor Green
  $bajados++
}

Remove-Item -Path $ArchivoUrl -ErrorAction SilentlyContinue
Remove-Item -Path $ArchivoPidTunel -ErrorAction SilentlyContinue

if ($bajados -eq 0) {
  Write-Host 'No habia nada corriendo.' -ForegroundColor DarkGray
} else {
  Write-Host 'Listo. El token queda en tools/compute/.token.' -ForegroundColor Green
}
