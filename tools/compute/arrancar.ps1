#requires -Version 5.1
<#
  Arranca el compute de pruebas (issue #64): servicio en 127.0.0.1:4400 y, salvo
  -SinTunel, su tunel de Cloudflare.

  Es idempotente: si el /health ya responde, no levanta un segundo proceso; si el
  tunel ya apunta al 4400, no crea otro (la URL no cambia).

  Genera el token en tools/compute/.token si falta (gitignored) y NO lo imprime.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/arrancar.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/compute/arrancar.ps1 -SinTunel
#>
[CmdletBinding()]
param(
  [switch]$SinTunel
)

$ErrorActionPreference = 'Stop'

$Aqui = Split-Path -Parent $PSCommandPath
$Puerto = 4400
$Base = "http://127.0.0.1:$Puerto"
$ArchivoToken = Join-Path $Aqui '.token'
$ArchivoPid = Join-Path $Aqui 'servicio.pid'
$LogSalida = Join-Path $Aqui 'servicio.log'
$LogError = Join-Path $Aqui 'servicio.err.log'

function New-Token {
  $bytes = New-Object 'byte[]' 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Get-Token {
  if (-not (Test-Path $ArchivoToken)) {
    Set-Content -Path $ArchivoToken -Value (New-Token) -Encoding ASCII -NoNewline
    Write-Host "Token nuevo en $ArchivoToken (no se imprime el valor)." -ForegroundColor DarkGray
  }
  return (Get-Content -Path $ArchivoToken -Raw).Trim()
}

function Test-Salud {
  param([string]$Token)
  try {
    $r = Invoke-RestMethod -Uri "$Base/health" -Headers @{ Authorization = "Bearer $Token" } -TimeoutSec 4
    return $r
  } catch {
    return $null
  }
}

$Token = Get-Token

$salud = Test-Salud -Token $Token
if ($salud) {
  Write-Host "El servicio ya estaba arriba (uptime $($salud.uptime) s). No se levanta otro." -ForegroundColor Green
} else {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Host 'node no esta en el PATH. Se necesita Node 22 (el repo ya exige >= 22).' -ForegroundColor Red
    exit 1
  }
  $version = (& $node.Source --version) -replace '^v', ''
  if ([int]($version.Split('.')[0]) -lt 22) {
    Write-Host "Node $version es viejo: se necesita 22 o mas." -ForegroundColor Red
    exit 1
  }

  # Un pidfile viejo con el proceso muerto es mentira: se ignora.
  Remove-Item -Path $ArchivoPid -ErrorAction SilentlyContinue

  Write-Host "Arrancando node servicio.mjs (v$version) en $Base ..."
  $proceso = Start-Process -FilePath $node.Source `
    -ArgumentList @('servicio.mjs') `
    -WorkingDirectory $Aqui `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $LogSalida -RedirectStandardError $LogError

  Set-Content -Path $ArchivoPid -Value $proceso.Id -Encoding ASCII

  $salud = $null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $salud = Test-Salud -Token $Token
    if ($salud) { break }
    if ($proceso.HasExited) { break }
  }

  if (-not $salud) {
    Write-Host "El servicio no respondio /health en 30 s." -ForegroundColor Red
    if ($proceso.HasExited) { Write-Host "node salio con codigo $($proceso.ExitCode)." }
    foreach ($archivo in @($LogError, $LogSalida)) {
      if (Test-Path $archivo) {
        Write-Host "--- $archivo" -ForegroundColor DarkGray
        Get-Content -Path $archivo -Tail 12 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" }
      }
    }
    exit 1
  }

  Write-Host "Servicio arriba (PID $($proceso.Id))." -ForegroundColor Green
}

Write-Host ("  embed: {0} (dim {1}, cargado: {2})" -f $salud.embed.modelo, $salud.embed.dim, $salud.embed.cargado)
Write-Host ("  asr:   {0} (cargado: {1})" -f $salud.asr.modelo, $salud.asr.cargado)
$motorOcr = if ($salud.ocr.motor) { $salud.ocr.motor } else { 'ninguno (ver /extract)' }
Write-Host ("  ocr:   {0}" -f $motorOcr)

if ($SinTunel) {
  Write-Host 'Tunel omitido (-SinTunel).' -ForegroundColor DarkGray
} else {
  Write-Host ''
  & (Join-Path $Aqui 'tunel.ps1') -Puerto $Puerto
}
