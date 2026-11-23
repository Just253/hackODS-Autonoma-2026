<#
  Arranque unico del preview: servidor, watcher y tunel (en ese orden).

  Cada pieza queda como proceso aparte, sin ventana: este script termina y ellos
  siguen. Re-ejecutarlo no duplica nada: si el servidor ya responde, si el
  watcher ya esta vivo o si el tunel ya apunta a 4173, los reutiliza.

  Uso:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/arrancar.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/arrancar.ps1 -SinTunel
#>
[CmdletBinding()]
param(
  [int]$Puerto = 4173,
  [int]$Intervalo = 25,
  [switch]$SinTunel
)

$ErrorActionPreference = 'Stop'

$Aqui = Split-Path -Parent $PSCommandPath
$Repo = Split-Path -Parent (Split-Path -Parent $Aqui)
$Servir = Join-Path $Aqui 'servir.mjs'
$Actualizar = Join-Path $Aqui 'actualizar.mjs'
$UrlLocal = "http://127.0.0.1:$Puerto"

function Test-Salud {
  try {
    $r = Invoke-WebRequest -Uri "$UrlLocal/__preview/estado" -UseBasicParsing -TimeoutSec 2
    return ($r.StatusCode -eq 200 -and $r.Content -match 'hackods-preview')
  } catch {
    return $false
  }
}

function Get-ProcesoPorGuion([string]$fragmento) {
  $procesos = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue
  if (-not $procesos) { return @() }
  return @($procesos | Where-Object { $_.CommandLine -and $_.CommandLine -like "*$fragmento*" })
}

function Get-PidDeArchivo([string]$archivo) {
  if (-not (Test-Path $archivo)) { return $null }
  $texto = (Get-Content -Path $archivo -Raw -ErrorAction SilentlyContinue)
  if (-not $texto) { return $null }
  $n = 0
  if ([int]::TryParse($texto.Trim(), [ref]$n)) { return $n }
  return $null
}

function Test-PidVivo([int]$procesoId) {
  if (-not $procesoId) { return $false }
  return [bool](Get-Process -Id $procesoId -ErrorAction SilentlyContinue)
}

function Escribir-Pid([string]$archivo, [int]$procesoId) {
  Set-Content -Path $archivo -Value $procesoId -Encoding ASCII
}

Write-Host "Preview de hackODS - repo: $Repo"

if (-not (Test-Path $Servir) -or -not (Test-Path $Actualizar)) {
  Write-Host "Faltan los scripts del preview en $Aqui." -ForegroundColor Red
  exit 1
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "node no esta en el PATH. Instala Node 22 LTS antes de seguir." -ForegroundColor Red
  exit 1
}

# --- 1. Servidor estatico -----------------------------------------------------
$pidServidor = Join-Path $Aqui 'servidor.pid'
$logServidor = Join-Path $Aqui 'servidor.log'
$logServidorErr = Join-Path $Aqui 'servidor.err.log'

if (Test-Salud) {
  Write-Host "[1/3] Servidor ya responde en $UrlLocal (no se arranca otro)." -ForegroundColor Green
} else {
  $ocupado = Get-NetTCPConnection -LocalPort $Puerto -State Listen -ErrorAction SilentlyContinue
  if ($ocupado) {
    Write-Host "[1/3] El puerto $Puerto esta ocupado por otro proceso (PID $($ocupado[0].OwningProcess)) y no es este preview." -ForegroundColor Red
    Write-Host "      Cerralo o corre este script con -Puerto OTRO (y ajusta el tunel igual)."
    exit 1
  }
  Write-Host "[1/3] Arrancando servidor estatico en el puerto $Puerto..."
  $procesoServidor = Start-Process -FilePath $node.Source `
    -ArgumentList @($Servir, '--puerto', "$Puerto") `
    -WorkingDirectory $Repo -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $logServidor -RedirectStandardError $logServidorErr
  Escribir-Pid $pidServidor $procesoServidor.Id

  $arriba = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Salud) { $arriba = $true; break }
    if ($procesoServidor.HasExited) { break }
  }
  if (-not $arriba) {
    Write-Host "      El servidor no respondio en 20 s. Ultimas lineas de ${logServidorErr}:" -ForegroundColor Red
    if (Test-Path $logServidorErr) {
      @(Get-Content -Path $logServidorErr -Tail 10 -ErrorAction SilentlyContinue) | ForEach-Object { Write-Host "      $_" }
    }
    exit 1
  }
  Write-Host "      Servidor arriba: $UrlLocal" -ForegroundColor Green
}

# --- 2. Watcher ---------------------------------------------------------------
$pidWatcher = Join-Path $Aqui 'actualizar.pid'
$logWatcher = Join-Path $Aqui 'actualizar.log'
$logWatcherErr = Join-Path $Aqui 'actualizar.err.log'

$vivos = @(Get-ProcesoPorGuion 'actualizar.mjs')
if ($vivos.Count -gt 0) {
  Write-Host "[2/3] Watcher ya corriendo (PID $($vivos[0].ProcessId)). No se arranca otro." -ForegroundColor Green
} else {
  $anterior = Get-PidDeArchivo $pidWatcher
  if ($anterior -and (Test-PidVivo $anterior)) {
    Write-Host "[2/3] Watcher ya corriendo (PID $anterior)." -ForegroundColor Green
  } else {
    Write-Host "[2/3] Arrancando watcher (cada ${Intervalo}s contra origin/main)..."
    $procesoWatcher = Start-Process -FilePath $node.Source `
      -ArgumentList @($Actualizar, '--intervalo', "$Intervalo") `
      -WorkingDirectory $Repo -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $logWatcher -RedirectStandardError $logWatcherErr
    Escribir-Pid $pidWatcher $procesoWatcher.Id
    Start-Sleep -Seconds 1
    if ($procesoWatcher.HasExited) {
      Write-Host "      El watcher se cerro al arrancar. Revisa ${logWatcherErr}:" -ForegroundColor Red
      if (Test-Path $logWatcherErr) {
        @(Get-Content -Path $logWatcherErr -Tail 10 -ErrorAction SilentlyContinue) | ForEach-Object { Write-Host "      $_" }
      }
      exit 1
    }
    Write-Host "      Watcher arriba (PID $($procesoWatcher.Id)); log: $(Join-Path $Aqui 'preview.log')" -ForegroundColor Green
  }
}

# --- 3. Tunel -----------------------------------------------------------------
$UrlFile = Join-Path $Aqui 'tunel-url.txt'
if ($SinTunel) {
  Write-Host "[3/3] Tunel omitido (-SinTunel). Solo local: $UrlLocal" -ForegroundColor Yellow
} else {
  Write-Host "[3/3] Tunel de Cloudflare..."
  & (Join-Path $Aqui 'tunel.ps1') -Puerto $Puerto
  if ($LASTEXITCODE -ne 0) {
    Write-Host "El tunel no quedo arriba (codigo $LASTEXITCODE). El servidor y el watcher siguen andando." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "--- Preview ------------------------------------------------"
Write-Host "  local   : $UrlLocal"
if (Test-Path $UrlFile) {
  Write-Host "  publica : $((Get-Content -Path $UrlFile -Raw).Trim())"
}
Write-Host "  version : $(Join-Path $Repo 'apps/web/dist/version.txt')"
Write-Host "  eventos : $(Join-Path $Aqui 'preview.log')"
Write-Host "  parar   : powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preview/parar.ps1"
Write-Host "------------------------------------------------------------"
Write-Host ""
Write-Host "Nota: si el checkout no esta en main, el watcher lo avisa en preview.log" -ForegroundColor DarkGray
Write-Host "(campo head_main=distinto) y el preview muestra HEAD, no origin/main." -ForegroundColor DarkGray
