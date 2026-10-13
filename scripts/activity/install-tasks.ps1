<#
  install-tasks.ps1 — register the uploader (as the child's user, every 10 min)
  and the watchdog (as SYSTEM, at startup). Run as administrator.

  It also reports the account layout it finds, so you can see whether the
  child's account is standard (as the design assumes) or an administrator
  (in which case he can remove these — the report will still show the gap).

  Pass the ingest token and, optionally, a label:
    .\install-tasks.ps1 -Token '<ingest-token>' -ChildUser 'DESKTOP\kid' -Label 'his-laptop'
#>
param(
  [Parameter(Mandatory)] [string]$Token,
  [Parameter(Mandatory)] [string]$ChildUser,
  [string]$Label = 'his-laptop',
  [string]$Ingest = 'https://kirtanjain.com/learning/api/activity/ingest'
)

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an elevated PowerShell (Run as administrator).'
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# --- report the account layout -------------------------------------------
$short = $ChildUser.Split('\')[-1]
$admins = (Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
if ($admins -match [regex]::Escape($short)) {
  Write-Warning "ACCOUNT CHECK: '$ChildUser' is in Administrators. He can stop/remove the tracker; the report will show the gap but cannot prevent it. Consider making his account Standard."
} else {
  Write-Output "ACCOUNT CHECK: '$ChildUser' appears to be a Standard account. Good — the watchdog running as SYSTEM is protected from him."
}

# Config lives at Machine scope so BOTH scheduled tasks (the child-user uploader
# and the SYSTEM watchdog) inherit it with no per-user setup. Machine env is
# readable by the child, which matches the ingest token's stated blast radius.
[Environment]::SetEnvironmentVariable('AW_TOKEN', $Token, 'Machine')
[Environment]::SetEnvironmentVariable('AW_LABEL', $Label, 'Machine')
[Environment]::SetEnvironmentVariable('AW_INGEST', $Ingest, 'Machine')

# --- uploader: child user, every 10 minutes ------------------------------
$uploadAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\upload.ps1`""
$uploadTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10)
# A laptop runs on battery; the defaults would suspend uploads when unplugged.
$uploadSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'AW Upload' -Action $uploadAction -Trigger $uploadTrigger -Settings $uploadSettings `
  -User $ChildUser -RunLevel Limited -Force | Out-Null
Write-Output 'Registered scheduled task: AW Upload (child user, every 10 min).'

# --- watchdog: SYSTEM, at startup ----------------------------------------
$wdAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$here\watchdog.ps1`""
$wdTrigger = New-ScheduledTaskTrigger -AtStartup
$wdPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# ExecutionTimeLimit Zero = no limit; the watchdog is a long-running loop and
# would otherwise be killed at the 72-hour default, silently ending reporting.
$wdSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'AW Watchdog' -Action $wdAction -Trigger $wdTrigger `
  -Principal $wdPrincipal -Settings $wdSettings -Force | Out-Null
Write-Output 'Registered scheduled task: AW Watchdog (SYSTEM, at startup).'
