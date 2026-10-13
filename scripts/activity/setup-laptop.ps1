<#
  setup-laptop.ps1 — one-line install for his Windows laptop.

  Run in an elevated PowerShell, from this folder:

    powershell -ExecutionPolicy Bypass -File .\setup-laptop.ps1 -Token '<INGEST_TOKEN>' -ChildUser 'PCNAME\hisuser'

  It installs ActivityWatch, applies the Chrome policy (incognito off + the web
  watcher force-installed), registers the uploader and watchdog tasks, reports
  the account layout, and starts the tracker. Visible monitoring: the tray icon
  stays on screen. Safe to re-run.
#>
param(
  [Parameter(Mandatory)] [string]$Token,
  [Parameter(Mandatory)] [string]$ChildUser,
  [string]$Label = 'his-laptop',
  [string]$Ingest = 'https://kirtanjain.com/learning/api/activity/ingest',
  [string]$ExtId = 'nglaklhklhcoonedhgnpgddginnjdadi' # AW web watcher; verify on the Web Store
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an elevated PowerShell (Run as administrator).'
}
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. ActivityWatch (via winget; skip if already installed).
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget not found. Install "App Installer" from the Microsoft Store, then re-run.'
}
if (-not (winget list --id ActivityWatch.ActivityWatch -e 2>$null | Select-String 'ActivityWatch')) {
  Write-Output 'Installing ActivityWatch...'
  winget install --id ActivityWatch.ActivityWatch -e --accept-source-agreements --accept-package-agreements
} else {
  Write-Output 'ActivityWatch already installed.'
}

# 2. Chrome policy (chrome-policy.ps1 reads $env:AW_EXT_ID).
$env:AW_EXT_ID = $ExtId
& "$here\chrome-policy.ps1" 2>&1 | Write-Output

# 3. Scheduled tasks + machine-scope config + account check.
& "$here\install-tasks.ps1" -Token $Token -ChildUser $ChildUser -Label $Label -Ingest $Ingest

# 4. Start ActivityWatch now (it also autostarts at login).
$aw = Get-ChildItem "$env:ProgramFiles\ActivityWatch", "${env:ProgramFiles(x86)}\ActivityWatch" -Filter 'aw-qt.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($aw) { Start-Process $aw.FullName; Write-Output 'Started ActivityWatch.' }
else { Write-Output 'Could not find aw-qt.exe — start ActivityWatch once manually.' }

Write-Output ''
Write-Output 'Done. Sign in as the child to confirm the tray icon, install the AW web extension in Chrome'
Write-Output '(forced by policy, approve it once), and reboot to start the watchdog. Data appears at'
Write-Output 'https://kirtanjain.com/learning/coach/activity within ~10 minutes.'
