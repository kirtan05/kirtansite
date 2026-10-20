<#
  activity monitor — self-contained laptop installer, hosted on the site.

  One line, in an ELEVATED PowerShell (right-click Start → Terminal (Admin)):

    irm https://kirtanjain.com/activity/setup.ps1 | iex

  It prompts for the INGEST token, auto-detects the logged-in user to monitor,
  downloads its two runtime scripts, installs ActivityWatch, applies the Chrome
  policy (incognito off + web watcher forced), registers the uploader and
  watchdog, and starts tracking. Visible monitoring: the tray icon stays.
  Safe to re-run. Override anything with the params below if auto-detect is wrong.
#>
param(
  [string]$Token,
  [string]$ChildUser,
  [string]$Label = 'his-laptop',
  [string]$BaseUrl = 'https://kirtanjain.com/activity',
  [string]$Ingest = 'https://kirtanjain.com/learning/api/activity/ingest',
  [string]$ExtId = 'nglaklhklhcoonedhgnpgddginnjdadi', # AW web watcher (Chrome Web Store)
  [string]$EdgeExtId = ''                              # AW web watcher on Edge Add-ons, if you have it
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an ELEVATED PowerShell (right-click Start -> Terminal (Admin)).'
}

# --- token (prompt if not passed) ---------------------------------------
# Plain (visible) prompt: a masked prompt won't echo a paste, which is
# confusing over a remote session. The token also lives in machine env after
# install, so showing it here reveals nothing it doesn't already expose.
if (-not $Token) {
  $Token = (Read-Host 'Paste the INGEST token, then press Enter').Trim()
}
if (-not $Token) { throw 'No token given.' }

# --- auto-detect the interactive user to monitor ------------------------
if (-not $ChildUser) {
  $ChildUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
  if (-not $ChildUser) { $ChildUser = "$env:USERDOMAIN\$env:USERNAME" }
}
Write-Host "Monitoring account: $ChildUser" -ForegroundColor Cyan

$short = $ChildUser.Split('\')[-1]
$admins = Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
if ($admins -match [regex]::Escape($short)) {
  Write-Warning "$ChildUser is an Administrator, so he can stop or remove the tracker. The nightly report will still show the gap, but it is not tamper-proof. To fix: give him a Standard account and keep a separate admin for yourself, then re-run with -ChildUser on his account."
}

# --- download the two runtime scripts -----------------------------------
Write-Host 'Downloading runtime scripts...'
$dir = 'C:\ProgramData\aw-monitor'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in 'upload.ps1', 'watchdog.ps1') {
  Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$f" -OutFile (Join-Path $dir $f)
}

# --- ActivityWatch -------------------------------------------------------
# winget's first run can block on a hidden source-agreement prompt, so pass
# --accept-source-agreements and --disable-interactivity and let its output
# show. If winget is missing or fails, fall back to the direct installer.
$awInstalled = $false
if (Get-Command winget -ErrorAction SilentlyContinue) {
  if (winget list --id ActivityWatch.ActivityWatch -e --accept-source-agreements --disable-interactivity 2>&1 | Select-String 'ActivityWatch') {
    Write-Host 'ActivityWatch already installed.'
    $awInstalled = $true
  } else {
    Write-Host 'Installing ActivityWatch via winget (first run can take a minute)...'
    winget install --id ActivityWatch.ActivityWatch -e --silent `
      --accept-source-agreements --accept-package-agreements --disable-interactivity
    if ($LASTEXITCODE -eq 0) { $awInstalled = $true } else { Write-Warning "winget exited $LASTEXITCODE; trying the direct installer." }
  }
}
if (-not $awInstalled) {
  Write-Host 'Installing ActivityWatch from the official release...'
  $awUrl = 'https://github.com/ActivityWatch/activitywatch/releases/latest/download/activitywatch-setup.exe'
  $awExe = Join-Path $env:TEMP 'activitywatch-setup.exe'
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $awUrl -OutFile $awExe
    Start-Process -FilePath $awExe -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART' -Wait
    $awInstalled = $true
  } catch {
    Write-Warning "Automatic install failed ($_). Install ActivityWatch manually from https://activitywatch.net, then re-run."
  }
}

# --- Browser policy: disable private browsing; force the web watcher -----
Write-Host 'Applying browser policy and registering tasks...'

# Chrome: incognito off + web watcher force-installed from the Chrome store.
$chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
New-Item -Path $chrome -Force | Out-Null
Set-ItemProperty -Path $chrome -Name 'IncognitoModeAvailability' -Type DWord -Value 1
New-Item -Path "$chrome\ExtensionInstallForcelist" -Force | Out-Null
Set-ItemProperty -Path "$chrome\ExtensionInstallForcelist" -Name '1' -Type String -Value "$ExtId;https://clients2.google.com/service/update2/crx"

# Edge (his browser). InPrivate uses a different policy name. Force-installing
# an extension from the Chrome store is blocked on non-domain machines, so for
# Edge we rely on the window watcher's titles (captured even in InPrivate) and
# only force the extension if an Edge Add-ons id was supplied.
$edge = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
New-Item -Path $edge -Force | Out-Null
Set-ItemProperty -Path $edge -Name 'InPrivateModeAvailability' -Type DWord -Value 1
if ($EdgeExtId) {
  New-Item -Path "$edge\ExtensionInstallForcelist" -Force | Out-Null
  Set-ItemProperty -Path "$edge\ExtensionInstallForcelist" -Name '1' -Type String -Value "$EdgeExtId;https://edge.microsoft.com/extensionwebstorebase/v1/crx"
}

# --- config at machine scope (both tasks inherit it) --------------------
[Environment]::SetEnvironmentVariable('AW_TOKEN', $Token, 'Machine')
[Environment]::SetEnvironmentVariable('AW_LABEL', $Label, 'Machine')
[Environment]::SetEnvironmentVariable('AW_INGEST', $Ingest, 'Machine')

# --- scheduled tasks -----------------------------------------------------
$upAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dir\upload.ps1`""
$upTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10)
$upSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'AW Upload' -Action $upAction -Trigger $upTrigger -Settings $upSettings -User $ChildUser -RunLevel Limited -Force | Out-Null
Write-Host 'Registered: AW Upload (every 10 min).'

$wdAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$dir\watchdog.ps1`""
$wdTrigger = New-ScheduledTaskTrigger -AtStartup
$wdPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$wdSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'AW Watchdog' -Action $wdAction -Trigger $wdTrigger -Principal $wdPrincipal -Settings $wdSettings -Force | Out-Null
Write-Host 'Registered: AW Watchdog (SYSTEM, at startup).'

# --- start now -----------------------------------------------------------
Start-ScheduledTask -TaskName 'AW Upload'
$aw = Get-ChildItem "$env:ProgramFiles\ActivityWatch", "${env:ProgramFiles(x86)}\ActivityWatch" -Filter 'aw-qt.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($aw) { Start-Process $aw.FullName; Write-Host 'Started ActivityWatch.' }
else { Write-Host 'Could not find aw-qt.exe — launch ActivityWatch once from the Start menu.' -ForegroundColor Yellow }

Write-Host ''
Write-Host 'Done. Reboot to start the watchdog.' -ForegroundColor Green
Write-Host 'Edge: window titles (the site/video name) are captured automatically — no extension needed.' -ForegroundColor Green
Write-Host 'For clean URLs in Edge, optionally install "ActivityWatch Web Watcher" from Edge Add-ons by hand.' -ForegroundColor Green
Write-Host 'Data appears at https://kirtanjain.com/learning/coach/activity within ~10 minutes.' -ForegroundColor Green
