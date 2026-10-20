<#
  watchdog.ps1 — reports (does not prevent) the tracker being stopped.

  Runs as SYSTEM via Task Scheduler "at startup", so a standard user cannot
  remove it. It watches for the ActivityWatch process disappearing and POSTs a
  single 'stopped' tracker event; when it comes back it POSTs 'started'. It
  never relaunches or blocks anything — the design is notice-and-report, in
  keeping with /learning's "never block, always show".

  It deliberately holds the device id and token the same way the uploader does,
  reading them from the child's LOCALAPPDATA so there is one source of truth.
#>

$ErrorActionPreference = 'Continue'
$Ingest = if ($env:AW_INGEST) { $env:AW_INGEST } else { 'https://kirtanjain.com/learning/api/activity/ingest' }
$Token  = $env:AW_TOKEN
$Label  = if ($env:AW_LABEL) { $env:AW_LABEL } else { 'his-laptop' }

if (-not $Token) { Write-Output 'watchdog: AW_TOKEN missing; exiting'; exit 0 }

# Find the child's uploader state (watchdog runs as SYSTEM, so LOCALAPPDATA differs).
# The uploader creates device-id.txt on its first run, which may be after the
# watchdog starts at boot — so wait for it rather than exiting permanently.
$StateDir = if ($env:AW_STATE) { $env:AW_STATE } else { "$env:SystemDrive\Users\*\AppData\Local\aw-uploader" }
$DeviceId = $null
while (-not $DeviceId) {
  $DeviceFile = Get-ChildItem -Path $StateDir -Filter 'device-id.txt' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($DeviceFile) { $DeviceId = (Get-Content $DeviceFile.FullName -Raw).Trim() }
  else { Start-Sleep -Seconds 60 }
}

function Post-Tracker($kind, $detail) {
  $body = @{
    device = $Label; device_id = $DeviceId; events = @()
    tracker = @(@{ kind = $kind; at = (Get-Date).ToUniversalTime().ToString('o'); detail = $detail })
  } | ConvertTo-Json -Depth 5 -Compress
  try {
    Invoke-RestMethod -Uri $Ingest -Method Post -ContentType 'application/json' `
      -Headers @{ Authorization = "Bearer $Token" } -Body $body | Out-Null
  } catch { Write-Output "watchdog: post failed: $_" }
}

function Running { [bool](Get-Process -Name 'aw-qt', 'aw-server', 'aw-server-rust' -ErrorAction SilentlyContinue) }

# Report the state at startup too: if AW is not running when the watchdog
# comes up (e.g. it was quit before a reboot), that is itself a 'stopped'.
$was = Running
if (-not $was) { Post-Tracker 'stopped' 'ActivityWatch not running at watchdog startup' }
while ($true) {
  Start-Sleep -Seconds 30
  $is = Running
  if ($was -and -not $is) { Post-Tracker 'stopped' 'ActivityWatch process not running' }
  elseif (-not $was -and $is) { Post-Tracker 'started' $null }
  $was = $is
}
