<#
  chrome-policy.ps1 — the visible-monitoring policy, run once as administrator.

  It does two things, machine-wide, via HKLM (works on an unmanaged / non-domain
  Windows box):
    1. Disables Incognito mode  (IncognitoModeAvailability = 1)
       so there is no private browsing gap for the web watcher to miss.
    2. Force-installs the ActivityWatch web extension so it cannot be turned
       off from within Chrome.

  This is the chosen alternative to network/DNS monitoring: it closes the
  incognito gap in the open, rather than trying to recover private browsing
  after the fact. Verify afterwards at chrome://policy (Reload policies).

  NOTE: confirm the extension ID below from the Chrome Web Store listing for
  "ActivityWatch Web Watcher" before running — Google can reissue IDs.
#>

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this in an elevated PowerShell (Run as administrator).'
}

$AwExtId = if ($env:AW_EXT_ID) { $env:AW_EXT_ID } else { 'nglaklhklhcoonedhgnpgddginnjdadi' } # verify!
$Chrome = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
$Force  = "$Chrome\ExtensionInstallForcelist"

New-Item -Path $Chrome -Force | Out-Null
Set-ItemProperty -Path $Chrome -Name 'IncognitoModeAvailability' -Type DWord -Value 1

New-Item -Path $Force -Force | Out-Null
Set-ItemProperty -Path $Force -Name '1' -Type String -Value "$AwExtId;https://clients2.google.com/service/update2/crx"

Write-Output 'Policy written. Open chrome://policy, click "Reload policies", and confirm:'
Write-Output '  IncognitoModeAvailability = 1'
Write-Output "  ExtensionInstallForcelist contains $AwExtId"
Write-Output 'Then restart Chrome.'
