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
  [string]$ExtId = 'nglaklhklhcoonedhgnpgddginnjdadi' # AW web watcher; verify on the Web Store
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an ELEVATED PowerShell (right-click Start -> Terminal (Admin)).'
}

# --- token (prompt if not passed) ---------------------------------------
if (-not $Token) {
  $sec = Read-Host 'Paste the INGEST token' -AsSecureString
  $Token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
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
$dir = 'C:\ProgramData\aw-monitor'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
foreach ($f in 'upload.ps1', 'watchdog.ps1') {
  Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/$f" -OutFile (Join-Path $dir $f)
}

# --- ActivityWatch (winget) ---------------------------------------------
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget not found. Install "App Installer" from the Microsoft Store, then re-run.'
}
if (-not (winget list --id ActivityWatch.ActivityWatch -e 2>$null | Select-String 'ActivityWatch')) {
  Write-Host 'Installing ActivityWatch...'
  winget install --id ActivityWatch.ActivityWatch -e --accept-source-agreements --accept-package-agreements
} else {
  Write-Host 'ActivityWatch already installed.'
}

# --- Chrome policy: incognito off, web watcher force-installed ----------
$chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
$force = "$chrome\ExtensionInstallForcelist"
New-Item -Path $chrome -Force | Out-Null
Set-ItemProperty -Path $chrome -Name 'IncognitoModeAvailability' -Type DWord -Value 1
New-Item -Path $force -Force | Out-Null
Set-ItemProperty -Path $force -Name '1' -Type String -Value "$ExtId;https://clients2.google.com/service/update2/crx"

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
Write-Host 'Done. In Chrome, approve the forced ActivityWatch extension once, then reboot to start the watchdog.' -ForegroundColor Green
Write-Host 'Data appears at https://kirtanjain.com/learning/coach/activity within ~10 minutes.' -ForegroundColor Green
