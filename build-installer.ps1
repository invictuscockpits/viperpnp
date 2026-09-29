# ViperPNP installer build.
#
#   .\build-installer.ps1              full build -> NSIS installer (unsigned)
#   .\build-installer.ps1 -SkipJre     reuse the previously built bundled JRE
#
# Pipeline: compile backend -> jar classes -> stage runtime deps -> build the
# UI (vite) -> stage as backend-served web dir -> jlink a trimmed JRE ->
# tauri build (NSIS). Output lands in
# viper-ui\src-tauri\target\release\bundle\nsis\.
#
# Signing: run this without the token for test builds. With the token present,
# sign the produced installer afterwards (signtool) or wire the cert into
# tauri.conf bundle>windows and rebuild.
param(
  [switch]$SkipJre
)
$ErrorActionPreference = "Stop"
$repo = "C:\dev\viperpnp"
$ui = "$repo\viper-ui"
$res = "$ui\src-tauri\resources"
$mvn = "C:\dev\tools\apache-maven-3.9.9\bin\mvn.cmd"
$jdk = "C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"

Set-Location $repo

Write-Host "[1/6] compiling backend..." -ForegroundColor Cyan
& $mvn -o -q compile
if ($LASTEXITCODE -ne 0) { Write-Host "backend compile FAILED" -ForegroundColor Red; exit 1 }

Write-Host "[2/6] jarring backend classes..." -ForegroundColor Cyan
& "$jdk\bin\jar.exe" --create --file "$repo\target\viperpnp.jar" -C "$repo\target\classes" .
if ($LASTEXITCODE -ne 0) { Write-Host "jar FAILED" -ForegroundColor Red; exit 1 }

Write-Host "[3/6] staging backend runtime (deps + jar)..." -ForegroundColor Cyan
if (Test-Path "$res\backend") { Remove-Item -Recurse -Force "$res\backend" }
New-Item -ItemType Directory -Force "$res\backend" | Out-Null
& $mvn -o -q dependency:copy-dependencies "-DincludeScope=runtime" "-DoutputDirectory=$res\backend"
if ($LASTEXITCODE -ne 0) { Write-Host "copy-dependencies FAILED" -ForegroundColor Red; exit 1 }
Copy-Item "$repo\target\viperpnp.jar" "$res\backend\viperpnp.jar"

Write-Host "[4/6] building UI (vite)..." -ForegroundColor Cyan
Set-Location $ui
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { Write-Host "UI build FAILED" -ForegroundColor Red; exit 1 }
if (Test-Path "$res\web") { Remove-Item -Recurse -Force "$res\web" }
Copy-Item -Recurse "$ui\dist" "$res\web"

Write-Host "[5/6] bundled JRE..." -ForegroundColor Cyan
if ($SkipJre -and (Test-Path "$res\jre\bin\javaw.exe")) {
  Write-Host "  reusing existing jre" -ForegroundColor DarkGray
} else {
  if (Test-Path "$res\jre") { Remove-Item -Recurse -Force "$res\jre" }
  & "$jdk\bin\jlink.exe" --add-modules "java.se,jdk.unsupported,jdk.crypto.ec,jdk.zipfs,jdk.charsets" `
    --strip-debug --no-man-pages --no-header-files --compress=2 --output "$res\jre"
  if ($LASTEXITCODE -ne 0) { Write-Host "jlink FAILED" -ForegroundColor Red; exit 1 }
}

Write-Host "[6/6] tauri build (NSIS)..." -ForegroundColor Cyan
Set-Location $ui
& npx.cmd tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "tauri build FAILED" -ForegroundColor Red; exit 1 }

$out = Get-ChildItem "$ui\src-tauri\target\release\bundle\nsis\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Host ""
Write-Host "INSTALLER: $($out.FullName)  ($([math]::Round($out.Length/1MB)) MB)" -ForegroundColor Green
