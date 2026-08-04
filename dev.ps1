# ViperPNP one-command dev launcher.
#
#   .\dev.ps1
#
# Compiles the Java backend, starts it on :8077, then opens the app window
# (Tauri) with live-reloading UI. Edit the React/TS and it hot-reloads on its
# own. When the Java backend changes, run .\rebuild-backend.ps1 (the app just
# reconnects). Close the app window to stop the UI; stop the backend with
# .\stop-dev.ps1.
$ErrorActionPreference = "Stop"
$repo = "C:\dev\viperpnp"
$config = "C:\dev\viper-configs\chris-real"
$mvn = "C:\dev\tools\apache-maven-3.9.9\bin\mvn.cmd"
Set-Location $repo

Write-Host "[dev] compiling backend..." -ForegroundColor Cyan
& $mvn -o -q compile
if ($LASTEXITCODE -ne 0) { Write-Host "[dev] backend compile FAILED" -ForegroundColor Red; exit 1 }

if (-not (Test-Path "$repo\cp.txt")) {
  Write-Host "[dev] caching classpath (one time)..." -ForegroundColor Cyan
  & $mvn -o -q dependency:build-classpath "-Dmdep.outputFile=cp.txt"
}
$cp = "target\classes;" + (Get-Content "$repo\cp.txt" -Raw).Trim()

Write-Host "[dev] (re)starting backend on :8077..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 8077 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force } catch {} }
Start-Sleep -Milliseconds 500

$java = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot\bin\java.exe"
if (-not (Test-Path $java)) { $java = "java" }
$jvm = @(
  "-cp", $cp,
  "-Dviper.port=8077", "-Dviper.autoconnect=false", "-Djava.awt.headless=true",
  "--add-opens=java.base/java.lang=ALL-UNNAMED",
  "--add-opens=java.desktop/java.awt=ALL-UNNAMED",
  "--add-opens=java.desktop/java.awt.color=ALL-UNNAMED",
  "org.openpnp.viper.ViperServer", $config
)
Start-Process -FilePath $java -ArgumentList $jvm -WorkingDirectory $repo `
  -RedirectStandardOutput "$repo\viper-server.log" `
  -RedirectStandardError "$repo\viper-server.err.log" -WindowStyle Hidden

for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 700
  try { Invoke-RestMethod "http://localhost:8077/api/feeders" -TimeoutSec 3 | Out-Null; break } catch {}
}
Write-Host "[dev] backend up. Opening the app (live UI)..." -ForegroundColor Green

Set-Location "$repo\viper-ui"
& npm run tauri dev
