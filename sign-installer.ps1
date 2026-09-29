# Sign a built ViperPNP installer with the hardware-token cert.
#
#   .\sign-installer.ps1
#   .\sign-installer.ps1 -Subject "Invictus Machine LLC"
#
# Signs the newest NSIS installer in the bundle output. Requires the signing
# token to be plugged in (the CSP will prompt for the PIN). Uses SHA-256 and
# an RFC 3161 timestamp so the signature outlives the cert.
param(
  [string]$Subject = "Invictus",
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)
$ErrorActionPreference = "Stop"
$bundle = "C:\dev\viperpnp\viper-ui\src-tauri\target\release\bundle\nsis"
$exe = Get-ChildItem "$bundle\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $exe) { Write-Host "no installer found in $bundle" -ForegroundColor Red; exit 1 }

# Find signtool from the Windows SDK
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { Write-Host "signtool.exe not found (install the Windows SDK)" -ForegroundColor Red; exit 1 }

Write-Host "signing $($exe.Name) as '$Subject'..." -ForegroundColor Cyan
& $signtool.FullName sign /n $Subject /fd SHA256 /td SHA256 /tr $TimestampUrl $exe.FullName
if ($LASTEXITCODE -ne 0) { Write-Host "signing FAILED" -ForegroundColor Red; exit 1 }

& $signtool.FullName verify /pa $exe.FullName
Write-Host "signed: $($exe.FullName)" -ForegroundColor Green
