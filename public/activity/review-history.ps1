<#
  review-history.ps1 — read-only review of the laptop's browser history.

  One line, in PowerShell (normal is fine, run as the account you're reviewing):

    irm https://kirtanjain.com/activity/review-history.ps1 | iex

  Extracts a day's history from Edge, leftover Chrome, and Brave, prints it,
  and saves a CSV + the raw copies to the Desktop. READ-ONLY: it copies the
  history databases to a temp folder and never touches the browser's own files.

  Default day is today; review a past day with:
    & ([scriptblock]::Create((irm https://kirtanjain.com/activity/review-history.ps1))) -Date 2026-10-20
#>
param(
  [string]$Date = (Get-Date -Format 'yyyy-MM-dd'),
  [string]$OutDir = "$env:USERPROFILE\Desktop\browser-review"
)
$ErrorActionPreference = 'Stop'
$tmp = Join-Path $env:TEMP ('bh_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp, $OutDir | Out-Null

# --- get sqlite3.exe (resolve the current tools zip from sqlite.org) -----
Write-Host 'Fetching sqlite3...'
$sqlite = Join-Path $tmp 'sqlite3.exe'
$page = (Invoke-WebRequest -UseBasicParsing 'https://www.sqlite.org/download.html').Content
$rel = [regex]::Match($page, '20\d\d/sqlite-tools-win-x64-\d+\.zip').Value
if (-not $rel) { throw 'Could not resolve the sqlite tools download URL from sqlite.org.' }
$zip = Join-Path $tmp 'sqlite.zip'
Invoke-WebRequest -UseBasicParsing "https://www.sqlite.org/$rel" -OutFile $zip
Expand-Archive $zip -DestinationPath $tmp -Force
Copy-Item (Get-ChildItem $tmp -Recurse -Filter sqlite3.exe | Select-Object -First 1).FullName $sqlite -Force

# --- locate history databases -------------------------------------------
$browsers = @(
  @{ name = 'Edge'; root = "$env:LOCALAPPDATA\Microsoft\Edge\User Data" },
  @{ name = 'Chrome'; root = "$env:LOCALAPPDATA\Google\Chrome\User Data" },
  @{ name = 'Brave'; root = "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data" }
)
$rows = New-Object System.Collections.ArrayList
$ep = "v.visit_time/1000000-11644473600" # Chrome/Edge store microseconds since 1601

foreach ($b in $browsers) {
  if (-not (Test-Path $b.root)) { continue }
  $profDirs = Get-ChildItem $b.root -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'History') }
  foreach ($p in $profDirs) {
    try {
      $src = Join-Path $p.FullName 'History'
      $copy = Join-Path $tmp ("$($b.name)_$($p.Name)_History")
      Copy-Item $src $copy -Force
      foreach ($w in '-wal', '-journal') { if (Test-Path "$src$w") { Copy-Item "$src$w" "$copy$w" -Force } }
      Copy-Item $copy (Join-Path $OutDir ("$($b.name)_$($p.Name)_History.sqlite")) -Force
      $q = "SELECT '$($b.name)/$($p.Name)', datetime($ep,'unixepoch','localtime'), u.title, u.url FROM visits v JOIN urls u ON u.id=v.url WHERE date($ep,'unixepoch','localtime')='$Date' ORDER BY v.visit_time;"
      foreach ($line in (& $sqlite -separator "`t" $copy $q 2>$null)) {
        $f = $line -split "`t", 4
        if ($f.Count -ge 4) { [void]$rows.Add([pscustomobject]@{ When = $f[1]; Browser = $f[0]; Title = $f[2]; Url = $f[3] }) }
      }
    } catch {
      Write-Warning "Could not read $($b.name)/$($p.Name) (is the browser open? close it and re-run): $_"
    }
  }
}

# --- report --------------------------------------------------------------
$sorted = $rows | Sort-Object When
$csv = Join-Path $OutDir "history-$Date.csv"
$sorted | Export-Csv -NoTypeInformation -Path $csv

Write-Host ''
Write-Host "Found $($sorted.Count) history entries for $Date." -ForegroundColor Cyan
$sorted | Select-Object When, Browser, Title, Url | Format-Table -AutoSize | Out-String -Width 4000 | Write-Host

$chromeLeft = Test-Path "$env:LOCALAPPDATA\Google\Chrome\User Data"
Write-Host ''
if ($chromeLeft) { Write-Host 'Chrome user data is still on disk, so its history above is recoverable.' -ForegroundColor Yellow }
else { Write-Host 'Chrome user data was removed with the uninstall — only Edge/Brave history remains (he may have ticked "also clear browsing data").' -ForegroundColor Yellow }
Write-Host ''
Write-Host "Saved CSV and raw copies to: $OutDir" -ForegroundColor Green
