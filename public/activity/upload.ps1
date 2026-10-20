<#
  upload.ps1 — reads new ActivityWatch events from the local server and POSTs
  them to kirtanjain.com/learning/api/activity/ingest.

  Runs as the child's user, from Task Scheduler, every 10 minutes. Keeps a
  per-bucket cursor so an offline laptop catches up on the next run. Each run
  also POSTs (even with no events) so the site's "last seen" is a heartbeat.

  Config comes from environment or the variables below. The ingest token is
  the shared secret; keep it only in this user's profile.
#>

$ErrorActionPreference = 'Stop'

$Server   = if ($env:AW_SERVER)   { $env:AW_SERVER }   else { 'http://localhost:5600' }
$Ingest   = if ($env:AW_INGEST)   { $env:AW_INGEST }   else { 'https://kirtanjain.com/learning/api/activity/ingest' }
$Token    = $env:AW_TOKEN                       # required
$Label    = if ($env:AW_LABEL)    { $env:AW_LABEL }    else { 'his-laptop' }
$StateDir = Join-Path $env:LOCALAPPDATA 'aw-uploader'

if (-not $Token) { throw 'AW_TOKEN is not set.' }
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

# A stable device id, created once and reused.
$DeviceFile = Join-Path $StateDir 'device-id.txt'
if (-not (Test-Path $DeviceFile)) { [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N') | Set-Content $DeviceFile }
$DeviceId = (Get-Content $DeviceFile -Raw).Trim()

# Map AW bucket type → our bucket name.
function BucketKind($type) {
  switch -Wildcard ($type) {
    'currentwindow'   { 'window' }
    'afkstatus'       { 'afk' }
    'web.tab.current' { 'web' }
    default           { $null }
  }
}

$cursorPath = Join-Path $StateDir 'cursors.json'
$cursors = if (Test-Path $cursorPath) { Get-Content $cursorPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }
# ConvertFrom-Json gives a PSCustomObject; normalise to a hashtable we can write.
$cur = @{}; foreach ($p in $cursors.PSObject.Properties) { $cur[$p.Name] = $p.Value }

$CHUNK = 25   # must stay <= the server's MAX_EVENTS
$buckets = Invoke-RestMethod -Uri "$Server/api/0/buckets/" -Method Get
$events = New-Object System.Collections.ArrayList
$newCur = @{}

foreach ($prop in $buckets.PSObject.Properties) {
  $id = $prop.Name
  $kind = BucketKind $prop.Value.type
  if (-not $kind) { continue }

  # Fetch from the cursor INCLUSIVE, so the most recent (still-open) event is
  # re-sent each run — AW grows its duration in place, and the server upserts
  # it on a deterministic key, so this corrects the duration without dupes.
  $since = if ($cur[$id]) { "?start=$([uri]::EscapeDataString($cur[$id]))&limit=-1" } else { '?limit=2000' }
  $rows = Invoke-RestMethod -Uri "$Server/api/0/buckets/$id/events$since" -Method Get
  $maxTs = $cur[$id]
  foreach ($e in $rows) {
    if ($cur[$id] -and ([datetime]$e.timestamp -lt [datetime]$cur[$id])) { continue } # strictly older only
    [void]$events.Add([pscustomobject]@{ bucket = $kind; timestamp = $e.timestamp; duration = $e.duration; data = $e.data })
    if (-not $maxTs -or ([datetime]$e.timestamp -gt [datetime]$maxTs)) { $maxTs = $e.timestamp }
  }
  if ($maxTs) { $newCur[$id] = $maxTs } elseif ($cur[$id]) { $newCur[$id] = $cur[$id] }
}

# POST in chunks (plus a heartbeat on the final one). Every POST is idempotent,
# so a mid-run failure simply retries next run; cursors advance only if ALL
# chunks this run succeeded.
$all = @($events)
$ok = $true
for ($i = 0; $i -lt [Math]::Max(1, $all.Count); $i += $CHUNK) {
  $slice = if ($all.Count -eq 0) { @() } else { $all[$i..([Math]::Min($i + $CHUNK - 1, $all.Count - 1))] }
  $isLast = ($i + $CHUNK) -ge $all.Count
  $payload = @{
    device    = $Label
    device_id = $DeviceId
    events    = @($slice)
    tracker   = if ($isLast) { @(@{ kind = 'heartbeat'; at = (Get-Date).ToUniversalTime().ToString('o') }) } else { @() }
  } | ConvertTo-Json -Depth 6 -Compress
  try {
    $resp = Invoke-RestMethod -Uri $Ingest -Method Post -ContentType 'application/json' `
      -Headers @{ Authorization = "Bearer $Token" } -Body $payload
    if (-not $resp.ok) { $ok = $false; break }
  } catch { $ok = $false; Write-Output "post failed: $_"; break }
  if ($all.Count -eq 0) { break }
}

if ($ok) {
  ($newCur | ConvertTo-Json -Compress) | Set-Content $cursorPath
  Write-Output ("uploaded {0} events in chunks of {1}" -f $all.Count, $CHUNK)
} else {
  Write-Output 'upload incomplete; cursors not advanced, will retry next run'
  exit 1
}
