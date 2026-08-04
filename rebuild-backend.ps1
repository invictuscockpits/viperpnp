# Recompile + restart ONLY the Java backend, leaving the app window running.
# Use this after changing Java code: the app reconnects on its own in a second
# or two. Saves the live config first so a restart never loses calibration.
$ErrorActionPreference = "Stop"
$repo = "C:\dev\viperpnp"
$config = "C:\dev\viper-configs\chris-real"
$mvn = "C:\dev\tools\apache-maven-3.9.9\bin\mvn.cmd"
Set-Location $repo

# Save current config first (best-effort) — a hard-learned rule.
try { Invoke-RestMethod "http://localhost:8077/api/config/save" -Method Post -TimeoutSec 15 | Out-Null; Write-Host "[rebuild] config saved" -ForegroundColor DarkGray } catch {}

Write-Host "[rebuild] compiling..." -ForegroundColor Cyan
& $mvn -o -q compile
if ($LASTEXITCODE -ne 0) { Write-Host "[rebuild] compile FAILED (backend left running)" -ForegroundColor Red; exit 1 }

$cp = "target\classes;" + (Get-Content "$repo\cp.txt" -Raw).Trim()
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
Write-Host "[rebuild] backend restarted. The app reconnects automatically." -ForegroundColor Green
