# Stops the ViperPNP dev backend (port 8077). Close the app window separately.
$ErrorActionPreference = "SilentlyContinue"
Get-NetTCPConnection -LocalPort 8077 -State Listen | ForEach-Object {
  try { Stop-Process -Id $_.OwningProcess -Force; Write-Host "stopped backend PID $($_.OwningProcess)" } catch {}
}
