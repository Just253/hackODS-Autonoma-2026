<#
.SYNOPSIS
    Preflight de solo lectura antes de tomar una tarea en un repo de GitHub.

.DESCRIPTION
    Antes de decir "hay un bug" o "ya lo arregle", este script contesta con datos:
      - Que issues abiertos Y cerrados ya hablan del tema (busqueda por texto y por huella).
      - Que PRs abiertos/cerrados y que ramas remotas ya tocan el tema.
      - Quien esta asignado y que claims activos / vencidos hay (comentarios "claim:").
      - Que commits recientes tocan los archivos del area.
      - Como esta el CI (rama por defecto y PRs abiertos).
      - Si el issue trae un evidence pack completo (score de secciones).

    NO ESCRIBE NADA EN GITHUB. Solo usa: gh issue list/view, gh pr list/checks,
    gh api GET, gh repo view y git ls-remote / git log. Ningun POST, PATCH ni DELETE.

.PARAMETER Repo
    owner/name. Si se omite, se deduce del directorio actual con gh repo view.

.PARAMETER Area
    Area funcional, ej. auth. Alimenta la huella fp_<area>_<sym>.

.PARAMETER Sym
    Sintoma corto en kebab-case, ej. login-timeout. Alimenta la huella.

.PARAMETER Text
    Texto libre a buscar (palabras sueltas; GitHub las combina con AND).

.PARAMETER Paths
    Archivos o prefijos de ruta del area, para buscar commits recientes.

.PARAMETER Days
    Ventana de commits recientes. Default 30.

.PARAMETER ClaimTtlHours
    Horas sin heartbeat para considerar vencido un claim. Default 48.

.PARAMETER Limit
    Maximo de resultados por busqueda. Default 20.

.PARAMETER Json
    Emite el reporte como JSON (para que lo consuma otro agente).

.PARAMETER OutFile
    Escribe ademas un reporte Markdown en esa ruta.

.PARAMETER SelfTest
    Modo offline: prueba el parseo y la clasificacion contra fixtures/*.json.
    No llama a gh ni a la red.

.EXAMPLE
    powershell -NoProfile -File preflight.ps1 -Repo Just253/autonoma-cli -Area auth -Sym login-timeout -Text "login timeout" -Paths src/auth

.EXAMPLE
    powershell -NoProfile -File preflight.ps1 -SelfTest

.NOTES
    Compatible con Windows PowerShell 5.1. No requiere jq.
    El archivo es ASCII a proposito: PS 5.1 lee .ps1 sin BOM como ANSI y los
    acentos se corrompen. Si lo editas, no agregues caracteres no ASCII.
#>
#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$Repo,
    [string]$Area,
    [string]$Sym,
    [string]$Text,
    [string[]]$Paths = @(),
    [int]$Days = 30,
    [int]$ClaimTtlHours = 24,
    [int]$Limit = 20,
    [switch]$Json,
    [string]$OutFile,
    [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$script:Q = [char]34   # comilla doble, para no pelear con el parser de PowerShell

# ---------------------------------------------------------------------------
# Helpers generales
# ---------------------------------------------------------------------------

function New-Note {
    param([string]$Level, [string]$Message)
    [pscustomobject]@{ level = $Level; message = $Message }
}

function ConvertTo-Slug {
    param([string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
    $s = $Value.ToLowerInvariant()
    $s = [regex]::Replace($s, '[^a-z0-9]+', '_')
    $s = [regex]::Replace($s, '_+', '_').Trim('_')
    return $s
}

function Get-FingerprintToken {
    # Huella estable y buscable: un solo token snake_case, sin puntuacion.
    # Motivo (verificado): GitHub indexa los identificadores con guion bajo como
    # UN SOLO token atomico, y la puntuacion se descarta al tokenizar.
    param([string]$AreaName, [string]$SymName)
    $a = ConvertTo-Slug $AreaName
    $s = ConvertTo-Slug $SymName
    if (-not $a -and -not $s) { return $null }
    if (-not $a) { return "fp_$s" }
    if (-not $s) { return "fp_$a" }
    return "fp_${a}_$s"
}

function ConvertTo-IsoDay([datetimeoffset]$Value) {
    return $Value.UtcDateTime.ToString('yyyy-MM-dd')
}

# ---------------------------------------------------------------------------
# Wrapper gh: solo verbos de lectura, con array splatting (evita el infierno
# de comillas de PowerShell 5.1 al pasar argumentos a un .exe nativo).
# ---------------------------------------------------------------------------

function Invoke-GhRead {
    param([string[]]$GhArgs)

    $raw = & gh @GhArgs 2>&1
    if ($LASTEXITCODE -ne 0) {
        $msg = ($raw | Out-String).Trim()
        throw "gh $($GhArgs -join ' ') fallo (exit $LASTEXITCODE): $msg"
    }
    $text = ($raw | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return $null }
    return $text
}

function Get-GhJson {
    param([string[]]$GhArgs)
    $text = Invoke-GhRead -GhArgs $GhArgs
    if (-not $text) { return , @() }
    $parsed = $text | ConvertFrom-Json
    # ConvertFrom-Json devuelve un objeto suelto cuando hay 1 elemento.
    # La coma evita que PowerShell desenrolle el array al retornar, asi el
    # llamador siempre recibe una coleccion y puede usar .Count sin sustos.
    return , @($parsed)
}

function Resolve-Repo {
    param([string]$Explicit)
    if ($Explicit) { return $Explicit }
    $v = Get-GhJson -GhArgs @('repo', 'view', '--json', 'nameWithOwner')
    if (-not $v -or $v.Count -eq 0) {
        throw "No pude deducir el repo. Pasa -Repo owner/name (o corre desde un clon git)."
    }
    return $v[0].nameWithOwner
}

# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------

function Find-Issues {
    param(
        [string]$RepoName,
        [string[]]$Queries,
        [int]$Max
    )
    $fields = 'number,title,state,stateReason,labels,assignees,updatedAt,closedAt,url,body,closedByPullRequestsReferences'
    $seen = @{}
    $out = @()
    foreach ($q in $Queries) {
        if ([string]::IsNullOrWhiteSpace($q)) { continue }
        $items = Get-GhJson -GhArgs @(
            'issue', 'list', '-R', $RepoName, '--state', 'all',
            '--search', $q, '--limit', "$Max", '--json', $fields
        )
        foreach ($i in $items) {
            $key = "$($i.number)"
            if (-not $seen.ContainsKey($key)) {
                $seen[$key] = $true
                $out += [pscustomobject]@{
                    number    = $i.number
                    title     = $i.title
                    state     = $i.state
                    stateReason = $i.stateReason
                    labels    = @($i.labels | ForEach-Object { $_.name })
                    assignees = @($i.assignees | ForEach-Object { $_.login })
                    updatedAt = $i.updatedAt
                    closedAt  = $i.closedAt
                    url       = $i.url
                    body      = $i.body
                    closingPrs = @($i.closedByPullRequestsReferences | ForEach-Object { $_.number })
                    matchedBy = @($q)
                }
            }
            else {
                foreach ($o in $out) {
                    if ("$($o.number)" -eq $key) { $o.matchedBy += $q }
                }
            }
        }
    }
    return @($out)
}

function Find-Prs {
    param(
        [string]$RepoName,
        [string[]]$Queries,
        [int]$Max
    )
    $fields = 'number,title,state,isDraft,headRefName,reviewDecision,mergeStateStatus,updatedAt,url,body,files'
    $seen = @{}
    $out = @()
    foreach ($q in $Queries) {
        if ([string]::IsNullOrWhiteSpace($q)) { continue }
        $items = Get-GhJson -GhArgs @(
            'pr', 'list', '-R', $RepoName, '--state', 'all',
            '--search', $q, '--limit', "$Max", '--json', $fields
        )
        foreach ($p in $items) {
            $key = "$($p.number)"
            if (-not $seen.ContainsKey($key)) {
                $seen[$key] = $true
                $out += [pscustomobject]@{
                    number        = $p.number
                    title         = $p.title
                    state         = $p.state
                    isDraft       = $p.isDraft
                    headRefName   = $p.headRefName
                    reviewDecision = $p.reviewDecision
                    mergeStateStatus = $p.mergeStateStatus
                    updatedAt     = $p.updatedAt
                    url           = $p.url
                    files         = @($p.files | ForEach-Object { $_.path })
                    matchedBy     = @($q)
                }
            }
        }
    }
    return @($out)
}

function Get-OpenPrBranches {
    param([string]$RepoName, [int]$Max = 100)
    $items = Get-GhJson -GhArgs @(
        'pr', 'list', '-R', $RepoName, '--state', 'open',
        '--limit', "$Max", '--json', 'number,headRefName,title,isDraft'
    )
    return @($items | ForEach-Object {
        [pscustomobject]@{
            number      = $_.number
            headRefName = $_.headRefName
            title       = $_.title
            isDraft     = $_.isDraft
        }
    })
}

function Get-RemoteBranches {
    param([string]$RepoName)
    # 1) git ls-remote si hay un clon con remoto (barato, trae todas las ramas).
    $url = "https://github.com/$RepoName.git"
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & git ls-remote --heads $url 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -eq 0) {
        return @($raw | ForEach-Object {
            $m = [regex]::Match("$_", 'refs/heads/(.+)$')
            if ($m.Success) { $m.Groups[1].Value }
        } | Where-Object { $_ })
    }
    # 2) Fallback por API (una pagina; suficiente para inventario de ramas).
    # OJO: --jq con salida escalar no es JSON valido, se lee como texto plano.
    $txt = Invoke-GhRead -GhArgs @('api', "repos/$RepoName/branches?per_page=100", '--jq', '.[].name')
    if (-not $txt) { return @() }
    return @($txt -split "`r?`n" | Where-Object { $_ })
}

function Find-BranchByKeyword {
    param([string[]]$Branches, [string[]]$Keywords)
    $hits = @()
    foreach ($b in $Branches) {
        $low = $b.ToLowerInvariant()
        foreach ($k in $Keywords) {
            if (-not $k) { continue }
            $tokens = @($k.ToLowerInvariant().Split(' ', [System.StringSplitOptions]::RemoveEmptyEntries))
            $all = $true
            foreach ($t in $tokens) { if ($low -notmatch [regex]::Escape($t)) { $all = $false } }
            if ($all) { $hits += $b; break }
        }
    }
    return @($hits | Select-Object -Unique)
}

function Get-RecentCommits {
    param([string]$RepoName, [string[]]$FilePaths, [int]$WindowDays)
    $since = [datetimeoffset]::UtcNow.AddDays(-1 * $WindowDays).ToString('yyyy-MM-ddTHH:mm:ssZ')
    $out = @()
    foreach ($p in $FilePaths) {
        if (-not $p) { continue }
        $enc = [uri]::EscapeDataString($p)
        $items = Get-GhJson -GhArgs @(
            'api', "repos/$RepoName/commits?path=$enc&since=$since&per_page=10",
            '--jq', '[.[] | {sha:.sha, date:.commit.author.date, author:.commit.author.name, msg:.commit.message}]'
        )
        foreach ($c in $items) {
            $first = "$($c.msg)" -split "`n" | Select-Object -First 1
            $out += [pscustomobject]@{
                path   = $p
                sha    = $c.sha
                short  = if ($c.sha) { "$($c.sha)".Substring(0, 8) } else { '' }
                date   = $c.date
                author = $c.author
                message = $first
            }
        }
    }
    return @($out)
}

function Get-DefaultBranch {
    param([string]$RepoName)
    $v = Get-GhJson -GhArgs @('repo', 'view', $RepoName, '--json', 'defaultBranchRef')
    if ($v -and $v.Count -gt 0 -and $v[0].defaultBranchRef) { return $v[0].defaultBranchRef.name }
    return 'main'
}

function Get-CiSummary {
    param([string]$RepoName, [string]$Branch)
    # Ojo: el endpoint de check-runs exige un SHA, no un nombre de rama.
    # Y --jq con salida escalar no es JSON valido: se lee como texto.
    $sha = Invoke-GhRead -GhArgs @('api', "repos/$RepoName/commits/$Branch", '--jq', '.sha')
    if (-not $sha) { return $null }
    $runs = Get-GhJson -GhArgs @(
        'api', "repos/$RepoName/commits/$sha/check-runs",
        '--jq', '[.check_runs[] | {name:.name, status:.status, conclusion:.conclusion}]'
    )
    $failing = @($runs | Where-Object { $_.conclusion -and $_.conclusion -notin @('success', 'skipped', 'neutral') })
    $pending = @($runs | Where-Object { $_.status -ne 'completed' })
    return [pscustomobject]@{
        branch   = $Branch
        sha      = $sha
        total    = @($runs).Count
        failing  = @($failing | ForEach-Object { $_.name })
        pending  = @($pending | ForEach-Object { $_.name })
    }
}

function Get-PrChecks {
    param([string]$RepoName, [int]$PrNumber)
    # gh pr checks sale con codigo != 0 cuando la rama no reporto checks.
    # Eso no es un error del preflight: devolvemos un resumen vacio y listo.
    try {
        $items = Get-GhJson -GhArgs @(
            'pr', 'checks', "$PrNumber", '-R', $RepoName,
            '--json', 'name,state,bucket'
        )
    }
    catch {
        return [pscustomobject]@{
            number  = $PrNumber
            total   = 0
            failing = @()
            pending = @()
            note    = 'sin checks reportados'
        }
    }
    $fail = @($items | Where-Object { $_.bucket -in @('fail', 'cancel') })
    $pend = @($items | Where-Object { $_.bucket -in @('pending', '') })
    return [pscustomobject]@{
        number  = $PrNumber
        total   = @($items).Count
        failing = @($fail | ForEach-Object { $_.name })
        pending = @($pend | ForEach-Object { $_.name })
        note    = ''
    }
}

# ---------------------------------------------------------------------------
# Claims: comentarios claim/v1, heartbeat/v1, release/v1, reclaim/v1
# Gramatica canonica: doc 02-protocolo-coordinacion.md, seccion 3.2.
# Aca solo se LEE y se calcula estado; escribir claims es de scripts/claim.sh.
# ---------------------------------------------------------------------------

function ConvertFrom-ClaimComment {
    <#
        Linea canonica (clave:valor separados por espacio):
          claim/v1 issue:142 by:@ana agent:ana-lead-3f2a area:api branch:feat/... started:... ttl:24h searched:... files:... fp:fp_api_auth_login_timeout
          heartbeat/v1 issue:142 agent:ana-lead-3f2a at:... head:9c1e4ab state:coding
          release/v1 issue:142 by:@ana agent:... reason:done at:... pr:187 next:none
          reclaim/v1 issue:142 by:@caro agent:... from:@ana agent:... last_activity:... evidence:9c1e4ab at:... notice:12h
        Se acepta ademas el formato legacy con pipes ("claim: X | fp:... | branch:...").
        Todo lo que no empiece con el verbo se ignora (texto humano).
    #>
    param(
        [Parameter(Mandatory = $true)]$Comment,
        [int]$TtlHours = 24,
        [datetimeoffset]$Now = [datetimeoffset]::UtcNow
    )

    $body = "$($Comment.body)"
    $lines = $body -split "`r?`n"
    $claims = @()
    foreach ($line in $lines) {
        $m = [regex]::Match($line, '^\s*(claim|heartbeat|release|reclaim)(?:/v1)?\s*:?\s+(.+)$', 'IgnoreCase')
        if (-not $m.Success) { continue }

        $kind = $m.Groups[1].Value.ToLowerInvariant()
        $rest = $m.Groups[2].Value

        $fields = @{}
        foreach ($piece in ($rest -split '[|\s]+')) {
            if ([string]::IsNullOrWhiteSpace($piece)) { continue }
            $kv = [regex]::Match($piece, '^([A-Za-z_]+):(.+)$')
            if ($kv.Success) {
                $fields[$kv.Groups[1].Value.ToLowerInvariant()] = $kv.Groups[2].Value.Trim()
            }
            elseif (-not $fields.ContainsKey('_verb_first')) {
                $fields['_verb_first'] = $piece
            }
        }

        $ttl = $TtlHours
        if ($fields['ttl']) {
            $tm = [regex]::Match($fields['ttl'], '^(\d+)')
            if ($tm.Success) { $ttl = [int]$tm.Groups[1].Value }
        }

        $agent = $fields['agent']
        if (-not $agent) { $agent = $fields['by'] }
        if (-not $agent) { $agent = $fields['_verb_first'] }
        if (-not $agent) { $agent = "$($Comment.author.login)" }

        $claims += [pscustomobject]@{
            kind        = $kind
            agent       = $agent
            by          = $fields['by']
            author      = "$($Comment.author.login)"
            fingerprint = $fields['fp']
            area        = $fields['area']
            branch      = $fields['branch']
            files       = $fields['files']
            scope       = $fields['scope']
            ttlHours    = $ttl
            started     = if ($fields['started']) { $fields['started'] } else { $fields['start'] }
            expires     = $fields['expires']
            at          = $fields['at']
            reason      = $fields['reason']
            outcome     = $fields['outcome']
            from        = $fields['from']
            notice      = $fields['notice']
            head        = $fields['head']
            state       = $fields['state']
            pr          = $fields['pr']
            next        = $fields['next']
            issue       = $fields['issue']
            commentAt   = "$($Comment.createdAt)"
            createdAt   = $Comment.createdAt
            url         = "$($Comment.url)"
            text        = $line.Trim()
        }
    }
    return @($claims)
}

function Get-ClaimState {
    <#
        Estado de un claim, determinista:
          released         -> hay release/v1 del mismo agente posterior al claim
          reclaimed        -> hay reclaim/v1 posterior y ya paso su notice
          reclaim-pending  -> hay reclaim/v1 posterior y el notice NO vencio
          orphan           -> sin actividad hace mas que el ttl del claim
          expiring-soon    -> actividad entre 60% y 100% del ttl
          active           -> el resto
        "Actividad" aca = heartbeat/v1 del mismo agente, o el propio comentario del claim.
        El doc 02 agrega el push a la rama como actividad; eso lo mira el orquestador
        con git log / gh api (no se puede ver desde los comentarios).
    #>
    param(
        [Parameter(Mandatory = $true)]$Claim,
        [object[]]$Heartbeats = @(),
        [object[]]$Releases = @(),
        [object[]]$Reclaims = @(),
        [int]$TtlHours = 24,
        [datetimeoffset]$Now = [datetimeoffset]::UtcNow
    )

    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $styles = [System.Globalization.DateTimeStyles]::AdjustToUniversal
    $claimAt = [datetimeoffset]::Parse($Claim.commentAt, $culture, $styles)

    $ttl = if ($Claim.ttlHours) { [int]$Claim.ttlHours } else { $TtlHours }

    $lastTouch = $claimAt
    foreach ($h in $Heartbeats) {
        if ($h.author -ne $Claim.author -and $h.agent -ne $Claim.agent) { continue }
        $hAt = [datetimeoffset]::Parse($h.commentAt, $culture, $styles)
        if ($hAt -gt $lastTouch) { $lastTouch = $hAt }
    }

    $released = $false
    foreach ($r in $Releases) {
        $rAt = [datetimeoffset]::Parse($r.commentAt, $culture, $styles)
        if ($rAt -gt $claimAt -and $rAt -le $Now) { $released = $true }
    }

    $reclaimState = ''
    foreach ($rc in $Reclaims) {
        $rcAt = [datetimeoffset]::Parse($rc.commentAt, $culture, $styles)
        if ($rcAt -le $claimAt -or $rcAt -gt $Now) { continue }
        $noticeHours = 12
        if ($rc.notice) {
            $nm = [regex]::Match($rc.notice, '^(\d+)')
            if ($nm.Success) { $noticeHours = [int]$nm.Groups[1].Value }
        }
        if (($Now - $rcAt).TotalHours -ge $noticeHours) { $reclaimState = 'reclaimed' }
        elseif ($reclaimState -ne 'reclaimed') { $reclaimState = 'reclaim-pending' }
    }

    $idleHours = ($Now - $lastTouch).TotalHours

    $state = 'active'
    if ($released) { $state = 'released' }
    elseif ($reclaimState) { $state = $reclaimState }
    elseif ($idleHours -gt $ttl) { $state = 'orphan' }
    elseif ($idleHours -gt ($ttl * 0.6)) { $state = 'expiring-soon' }

    return [pscustomobject]@{
        state       = $state
        agent       = $Claim.agent
        by          = $Claim.by
        author      = $Claim.author
        branch      = $Claim.branch
        files       = $Claim.files
        area        = $Claim.area
        fingerprint = $Claim.fingerprint
        idleHours   = [math]::Round($idleHours, 1)
        ttlHours    = $ttl
        since       = $lastTouch.ToString('yyyy-MM-ddTHH:mm:ssZ')
        reason      = $Claim.reason
        url         = $Claim.url
    }
}

function Get-IssueClaims {
    param([string]$RepoName, [int]$IssueNumber, [int]$TtlHours)
    $items = @(Get-GhJson -GhArgs @(
            'issue', 'view', "$IssueNumber", '-R', $RepoName,
            '--json', 'comments'
        ))
    if ($items.Count -eq 0) { return @() }
    $comments = @($items[0].comments)
    $all = @()
    foreach ($c in $comments) { $all += ConvertFrom-ClaimComment -Comment $c -TtlHours $TtlHours }

    $hb = @($all | Where-Object { $_.kind -eq 'heartbeat' })
    $rel = @($all | Where-Object { $_.kind -eq 'release' })
    $rec = @($all | Where-Object { $_.kind -eq 'reclaim' })

    $out = @()
    foreach ($cl in @($all | Where-Object { $_.kind -eq 'claim' })) {
        $out += Get-ClaimState -Claim $cl -Heartbeats $hb -Releases $rel -Reclaims $rec -TtlHours $TtlHours
    }
    return @($out)
}

# ---------------------------------------------------------------------------
# Evidence pack
# ---------------------------------------------------------------------------

$script:EvidenceSections = @(
    @{ key = 'repro';    label = 'Pasos para reproducir'; patterns = @('pasos para reproducir', 'steps to reproduce', 'repro', 'reproducir') },
    @{ key = 'expected'; label = 'Esperado';              patterns = @('esperado', 'expected') },
    @{ key = 'actual';   label = 'Actual';                patterns = @('actual', 'observed') },
    @{ key = 'commit';   label = 'Commit y version';      patterns = @('commit', 'version', 'sha') },
    @{ key = 'evidence'; label = 'Evidencia';             patterns = @('evidencia', 'evidence', 'log:', 'logs', 'stack trace', 'salida', 'output', '.log', 'screenshot', 'captura', 'traceback') },
    @{ key = 'fingerprint'; label = 'Huella';             patterns = @('fp_', '[area:') }
)

function Test-EvidencePack {
    param([string]$Body)
    $text = if ($Body) { $Body.ToLowerInvariant() } else { '' }
    $found = @()
    $missing = @()
    foreach ($sec in $script:EvidenceSections) {
        $hit = $false
        foreach ($p in $sec.patterns) { if ($text.Contains($p)) { $hit = $true; break } }
        if ($hit) { $found += $sec.label } else { $missing += $sec.label }
    }
    $score = if ($script:EvidenceSections.Count -gt 0) {
        [math]::Round(100.0 * $found.Count / $script:EvidenceSections.Count)
    } else { 0 }
    return [pscustomobject]@{
        score   = $score
        found   = $found
        missing = $missing
        complete = ($missing.Count -eq 0)
    }
}

# ---------------------------------------------------------------------------
# Clasificacion
# ---------------------------------------------------------------------------

function Get-Verdict {
    param(
        [object[]]$Issues = @(),
        [object[]]$Prs = @(),
        [object[]]$Claims = @(),
        [object[]]$Commits = @()
    )

    $openIssues   = @($Issues | Where-Object { $_.state -eq 'OPEN' })
    $closedIssues = @($Issues | Where-Object { $_.state -eq 'CLOSED' })
    $openPrs      = @($Prs | Where-Object { $_.state -eq 'OPEN' })
    $mergedPrs    = @($Prs | Where-Object { $_.state -eq 'MERGED' })

    $activeClaims = @($Claims | Where-Object { $_.state -in @('active', 'expiring-soon', 'reclaim-pending') })
    $staleClaims  = @($Claims | Where-Object { $_.state -eq 'orphan' })
    $activeOpenPrs = @($openPrs | Where-Object { -not $_.isDraft })

    $status = 'NUEVO'
    $why = @()

    if ($activeOpenPrs.Count -gt 0) {
        $status = 'EN-CURSO'
        $why += "PR abierto: #$($activeOpenPrs[0].number) ($($activeOpenPrs[0].headRefName))"
    }
    elseif ($activeClaims.Count -gt 0) {
        $status = 'EN-CURSO'
        $why += "claim activo de $($activeClaims[0].agent) (idle $($activeClaims[0].idleHours)h)"
    }
    elseif ($openIssues.Count -gt 0) {
        $status = 'REAL-ABIERTO'
        $why += "issue abierto #$($openIssues[0].number) con $($openIssues[0].closingPrs.Count) PR de cierre"
    }
    elseif ($closedIssues.Count -gt 0) {
        $fixed = @($closedIssues | Where-Object { $_.stateReason -eq 'COMPLETED' -or $_.closingPrs.Count -gt 0 })
        if ($fixed.Count -gt 0) {
            $status = 'YA-RESUELTO'
            $why += "issue #$($fixed[0].number) cerrado como COMPLETED el $($fixed[0].closedAt)"
        }
        else {
            $status = 'YA-RESUELTO'
            $why += "issue #$($closedIssues[0].number) cerrado como $($closedIssues[0].stateReason) (no planeado)"
        }
    }

    if ($staleClaims.Count -gt 0) {
        $why += "OJO: $($staleClaims.Count) claim(s) vencido(s), reclamables con aviso"
    }
    if ($Commits.Count -gt 0) {
        $why += "$($Commits.Count) commit(s) recientes tocan el area (ultimo $($Commits[0].short))"
    }

    return [pscustomobject]@{
        status   = $status
        reasons  = @($why)
        counts   = [pscustomobject]@{
            openIssues   = $openIssues.Count
            closedIssues = $closedIssues.Count
            openPrs      = $openPrs.Count
            mergedPrs    = $mergedPrs.Count
            activeClaims = $activeClaims.Count
            staleClaims  = $staleClaims.Count
            commits      = $Commits.Count
        }
    }
}

# ---------------------------------------------------------------------------
# Reporte
# ---------------------------------------------------------------------------

function Write-Report {
    param($Report)

    $lines = @()
    $lines += "# Preflight $($Report.repo) - $($Report.scope)"
    $lines += ''
    $lines += "Generado: $($Report.generatedAt)"
    $lines += "Huella:   $($Report.fingerprint)"
    $lines += ''
    $lines += "## Veredicto: $($Report.verdict.status)"
    foreach ($r in $Report.verdict.reasons) { $lines += "- $r" }
    $lines += ''
    $lines += "## Issues ($($Report.issues.Count))"
    if ($Report.issues.Count -eq 0) { $lines += 'Sin coincidencias.' }
    foreach ($i in $Report.issues) {
        $lbl = ($i.labels -join ',')
        $asg = if ($i.assignees.Count -gt 0) { $i.assignees -join ',' } else { '-' }
        $ev = if ($i.evidence) { "evidence:$($i.evidence.score)%" } else { 'evidence:-' }
        $stateLabel = if ($i.stateReason) { "$($i.state)/$($i.stateReason)" } else { $i.state }
        $lines += "- #$($i.number) [$stateLabel] $($i.title)"
        $lines += "    labels:$lbl assignee:$asg $ev  $($i.url)"
    }
    $lines += ''
    $lines += "## PRs ($($Report.prs.Count))"
    if ($Report.prs.Count -eq 0) { $lines += 'Sin coincidencias.' }
    foreach ($p in $Report.prs) {
        $draft = if ($p.isDraft) { ' draft' } else { '' }
        $lines += "- #$($p.number) [$($p.state)$draft] $($p.title)  rama:$($p.headRefName) review:$($p.reviewDecision)"
    }
    $lines += ''
    $lines += "## Claims ($($Report.claims.Count))"
    if ($Report.claims.Count -eq 0) { $lines += 'Ninguno.' }
    foreach ($c in $Report.claims) {
        $fpTxt = if ($c.fingerprint) { " fp:$($c.fingerprint)" } else { '' }
        $brTxt = if ($c.branch) { " rama:$($c.branch)" } else { '' }
        $fileTxt = if ($c.files) { " files:$($c.files)" } else { '' }
        $lines += "- [$($c.state)] $($c.agent) (@$($c.author)) idle:$($c.idleHours)h ttl:$($c.ttlHours)h$fpTxt$brTxt$fileTxt"
    }
    $lines += ''
    $lines += "## Ramas candidatas ($($Report.branches.Count))"
    if ($Report.branches.Count -eq 0) { $lines += 'Ninguna.' }
    foreach ($b in $Report.branches) { $lines += "- $b" }
    $lines += ''
    $lines += "## Commits recientes en el area ($($Report.commits.Count))"
    if ($Report.commits.Count -eq 0) { $lines += 'Ninguno.' }
    foreach ($c in $Report.commits) {
        $lines += "- $($c.short) $($c.date) $($c.author): $($c.message)  ($($c.path))"
    }
    $lines += ''
    $lines += '## CI'
    if ($Report.ci) {
        $lines += "- Rama $($Report.ci.branch) @ $($Report.ci.sha.Substring(0, [Math]::Min(8, $Report.ci.sha.Length))): $($Report.ci.total) checks, fallando: $(if ($Report.ci.failing.Count) { $Report.ci.failing -join ',' } else { 'ninguno' })"
    }
    else { $lines += '- Sin datos de CI.' }
    foreach ($pc in $Report.prChecks) {
        $noteTxt = if ($pc.note) { " ($($pc.note))" } else { '' }
        $lines += "- PR #$($pc.number): $($pc.total) checks, fallando: $(if ($pc.failing.Count) { $pc.failing -join ',' } else { 'ninguno' })$noteTxt"
    }
    return ($lines -join "`n")
}

# ---------------------------------------------------------------------------
# Modo SelfTest (offline, sin gh)
# ---------------------------------------------------------------------------

function Invoke-SelfTest {
    $root = $PSScriptRoot
    $fail = 0
    $pass = 0

    function Assert-Equal {
        param($Actual, $Expected, [string]$Name)
        if ("$Actual" -eq "$Expected") {
            $script:selfPass++
            Write-Host "  OK   $Name"
        }
        else {
            $script:selfFail++
            Write-Host "  FAIL $Name (esperado '$Expected', obtenido '$Actual')"
        }
    }
    function Assert-True {
        param([bool]$Condition, [string]$Name)
        if ($Condition) { $script:selfPass++; Write-Host "  OK   $Name" }
        else { $script:selfFail++; Write-Host "  FAIL $Name" }
    }
    $script:selfPass = 0
    $script:selfFail = 0

    Write-Host "== huella =="
    Assert-Equal (Get-FingerprintToken 'api' 'auth-login-timeout') 'fp_api_auth_login_timeout' 'area+sintoma'
    Assert-Equal (Get-FingerprintToken 'Auth Service' 'Login Timeout') 'fp_auth_service_login_timeout' 'normaliza espacios'
    Assert-Equal (Get-FingerprintToken 'api' '') 'fp_api' 'solo area'
    Assert-Equal (Get-FingerprintToken '' '') $null 'vacio -> null'

    Write-Host "== evidence pack =="
    $fx = Join-Path $root 'fixtures'
    $issueBody = Get-Content -Raw -Path (Join-Path $fx 'issue-complete.md')
    $ev = Test-EvidencePack $issueBody
    Assert-Equal $ev.score 100 'evidence completo = 100'
    Assert-True $ev.complete 'evidence completo marca complete'
    $badBody = Get-Content -Raw -Path (Join-Path $fx 'issue-incomplete.md')
    $ev2 = Test-EvidencePack $badBody
    Assert-True ($ev2.score -lt 100) 'evidence incompleto < 100'
    Assert-True ($ev2.missing -contains 'Evidencia') 'detecta falta de evidencia'

    Write-Host "== claims (claim/v1) =="
    $comments = Get-Content -Raw -Path (Join-Path $fx 'comments.json') | ConvertFrom-Json
    $claims = @()
    foreach ($c in @($comments)) { $claims += ConvertFrom-ClaimComment -Comment $c }
    Assert-Equal $claims.Count 4 'parsea claim/heartbeat/release/reclaim'
    $theClaim = @($claims | Where-Object { $_.kind -eq 'claim' })[0]
    Assert-Equal $theClaim.agent 'ana-lead-3f2a' 'agente del claim'
    Assert-Equal $theClaim.by '@ana' 'handle del claim'
    Assert-Equal $theClaim.area 'api' 'area del claim'
    Assert-Equal $theClaim.fingerprint 'fp_api_auth_login_timeout' 'huella del claim'
    Assert-Equal $theClaim.branch 'feat/api-142-oauth-refresh' 'rama del claim'
    Assert-Equal $theClaim.files 'services/api/src/auth/**' 'files del claim'
    Assert-Equal $theClaim.ttlHours 24 'ttl del claim'
    Assert-Equal $theClaim.issue '142' 'issue del claim'

    $hb = @($claims | Where-Object { $_.kind -eq 'heartbeat' })
    $rel = @($claims | Where-Object { $_.kind -eq 'release' })
    $rec = @($claims | Where-Object { $_.kind -eq 'reclaim' })
    Assert-Equal $hb[0].state 'coding' 'estado del heartbeat'

    $cs = Get-ClaimState -Claim $theClaim -Heartbeats $hb -Releases @() -Reclaims @() -Now ([datetimeoffset]::Parse('2026-11-21T00:00:00Z'))
    Assert-Equal $cs.state 'active' 'con heartbeat reciente = active'

    $cs2 = Get-ClaimState -Claim $theClaim -Heartbeats @() -Releases @() -Reclaims @() -Now ([datetimeoffset]::Parse('2026-11-30T00:00:00Z'))
    Assert-Equal $cs2.state 'orphan' 'sin actividad > ttl = orphan'

    $cs3 = Get-ClaimState -Claim $theClaim -Heartbeats $hb -Releases $rel -Reclaims @() -Now ([datetimeoffset]::Parse('2026-11-26T00:00:00Z'))
    Assert-Equal $cs3.state 'released' 'release posterior = released'

    $cs4 = Get-ClaimState -Claim $theClaim -Heartbeats @() -Releases @() -Reclaims @() -Now ([datetimeoffset]::Parse('2026-11-21T06:00:00Z'))
    Assert-Equal $cs4.state 'expiring-soon' '60-100% del ttl = expiring-soon'

    $cs5 = Get-ClaimState -Claim $theClaim -Heartbeats @() -Releases @() -Reclaims $rec -Now ([datetimeoffset]::Parse('2026-11-24T18:00:00Z'))
    Assert-Equal $cs5.state 'reclaim-pending' 'reclaim con notice vigente = reclaim-pending'

    $cs6 = Get-ClaimState -Claim $theClaim -Heartbeats @() -Releases @() -Reclaims $rec -Now ([datetimeoffset]::Parse('2026-11-25T06:00:00Z'))
    Assert-Equal $cs6.state 'reclaimed' 'reclaim con notice vencido = reclaimed'

    Write-Host "== clasificacion =="
    $v1 = Get-Verdict -Issues @([pscustomobject]@{ state = 'OPEN'; number = 10; closingPrs = @(); } )
    Assert-Equal $v1.status 'REAL-ABIERTO' 'issue abierto sin PR = REAL-ABIERTO'

    $v2 = Get-Verdict -Issues @([pscustomobject]@{ state = 'CLOSED'; number = 11; stateReason = 'COMPLETED'; closedAt = '2026-01-01'; closingPrs = @(99) })
    Assert-Equal $v2.status 'YA-RESUELTO' 'cerrado COMPLETED con PR = YA-RESUELTO'

    $v3 = Get-Verdict -Issues @() -Prs @([pscustomobject]@{ state = 'OPEN'; number = 12; headRefName = 'fix/x'; isDraft = $false })
    Assert-Equal $v3.status 'EN-CURSO' 'PR abierto no draft = EN-CURSO'

    $v4 = Get-Verdict -Issues @() -Claims @([pscustomobject]@{ state = 'active'; agent = 'agent-A'; idleHours = 2 })
    Assert-Equal $v4.status 'EN-CURSO' 'claim activo = EN-CURSO'

    $v5 = Get-Verdict -Issues @() -Prs @() -Claims @()
    Assert-Equal $v5.status 'NUEVO' 'nada conocido = NUEVO'

    $v6 = Get-Verdict -Issues @([pscustomobject]@{ state = 'OPEN'; number = 1; closingPrs = @() }) -Claims @([pscustomobject]@{ state = 'orphan'; agent = 'ghost'; idleHours = 200 })
    Assert-True (@($v6.reasons | Where-Object { $_ -match 'vencido' }).Count -gt 0) 'avisa claim huerfano'

    Write-Host "== ramas =="
    $br = @('feature/login-timeout', 'fix/auth-login-timeout', 'chore/bump-deps')
    $hits = Find-BranchByKeyword -Branches $br -Keywords @('login timeout', 'login-timeout')
    Assert-Equal $hits.Count 2 'encuentra 2 ramas por palabras'

    Write-Host ''
    Write-Host "SelfTest: $script:selfPass OK, $script:selfFail FAIL"
    if ($script:selfFail -gt 0) { exit 1 }
    exit 0
}

if ($SelfTest) {
    Invoke-SelfTest
    return
}

# ---------------------------------------------------------------------------
# Flujo principal (solo lectura)
# ---------------------------------------------------------------------------

if (-not $Area -and -not $Sym -and -not $Text) {
    throw "Pasa al menos -Area, -Sym o -Text. Ejemplo: -Area auth -Sym login-timeout -Text 'login timeout'"
}

$repoName = Resolve-Repo -Explicit $Repo
$fp = Get-FingerprintToken $Area $Sym

$queries = @()
if ($fp) { $queries += "$fp in:body" }
if ($Text) { $queries += ($Text.Trim() + ' in:title,body') }
if ($Area) { $queries += "$Area in:title" }

Write-Host "Preflight sobre $repoName" -ForegroundColor Cyan
if ($fp) { Write-Host "Huella: $fp" }

$issues  = @(Find-Issues -RepoName $repoName -Queries $queries -Max $Limit)
$prs     = @(Find-Prs -RepoName $repoName -Queries $queries -Max $Limit)

# Claims solo de los issues abiertos candidatos (para no gastar API en cerrados)
$claims = @()
$openCandidates = @($issues | Where-Object { $_.state -eq 'OPEN' } | Select-Object -First 10)
foreach ($i in $openCandidates) {
    $claims += Get-IssueClaims -RepoName $repoName -IssueNumber $i.number -TtlHours $ClaimTtlHours
}

# Evidencia por issue
foreach ($i in $issues) { $i | Add-Member -NotePropertyName evidence -NotePropertyValue (Test-EvidencePack $i.body) -Force }

# Ramas
$openPrBranches = @(Get-OpenPrBranches -RepoName $repoName)
$remoteBranches = @(Get-RemoteBranches -RepoName $repoName)
$keywords = @()
if ($Text) { $keywords += $Text }
if ($Sym) { $keywords += ($Sym -replace '-', ' '); $keywords += $Sym }
if ($Area) { $keywords += $Area }
if ($fp) { $keywords += $fp }
$branchHits = @(Find-BranchByKeyword -Branches $remoteBranches -Keywords $keywords)

# Commits
$commits = @()
if ($Paths.Count -gt 0) { $commits = @(Get-RecentCommits -RepoName $repoName -FilePaths $Paths -WindowDays $Days) }
$commits = @($commits | Sort-Object { $_.date } -Descending)

# CI
$defaultBranch = Get-DefaultBranch -RepoName $repoName
$ci = $null
try { $ci = Get-CiSummary -RepoName $repoName -Branch $defaultBranch }
catch { $ci = $null }
$prChecks = @()
foreach ($p in @($prs | Where-Object { $_.state -eq 'OPEN' } | Select-Object -First 5)) {
    $prChecks += Get-PrChecks -RepoName $repoName -PrNumber $p.number
}

$verdict = Get-Verdict -Issues $issues -Prs $prs -Claims $claims -Commits $commits

$scopeLabel = if ($fp) { $fp } elseif ($Text) { $Text } else { $Area }
$report = [pscustomobject]@{
    repo        = $repoName
    scope       = $scopeLabel
    fingerprint = $fp
    generatedAt = [datetimeoffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    queries     = $queries
    verdict     = $verdict
    issues      = $issues
    prs         = $prs
    claims      = $claims
    branches    = $branchHits
    openPrBranches = $openPrBranches
    commits     = $commits
    ci          = $ci
    prChecks    = $prChecks
}

$md = Write-Report -Report $report

if ($Json) {
    $report | ConvertTo-Json -Depth 8
}
else {
    Write-Host ''
    Write-Host $md
}

if ($OutFile) {
    $md | Out-File -FilePath $OutFile -Encoding UTF8
    Write-Host "Reporte escrito en $OutFile" -ForegroundColor Yellow
}
