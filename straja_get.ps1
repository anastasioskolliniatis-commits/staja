# Straja — PowerShell downloader
# Run in PowerShell on your business laptop.
# Downloads the staja app from GitHub and creates it locally.

$base = "https://raw.githubusercontent.com/anastasioskolliniatis-commits/straja/main/straja"
$root = Join-Path (Get-Location) "straja"

$files = @(
    "default/app.conf",
    "default/collections.conf",
    "default/inputs.conf",
    "default/props.conf",
    "default/transforms.conf",
    "default/savedsearches.conf",
    "default/data/ui/nav/default.xml",
    "default/data/ui/views/monitor.xml",
    "metadata/default.meta",
    "lookups/bm_tree.csv",
    "bin/bm_init.py",
    "bin/bm_collector.py",
    "bin/bm_setup.py",
    "appserver/static/monitor.html",
    "appserver/templates/monitor.html",
    "appserver/static/pages/monitor.js",
    "appserver/static/pages/monitor.js.LICENSE.txt"
)

Write-Host "==> Creating Straja at $root"

foreach ($f in $files) {
    $dest = Join-Path $root ($f -replace "/", "\")
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Write-Host "--> $f"
    Invoke-WebRequest -Uri "$base/$f" -OutFile $dest -UseBasicParsing
}

Write-Host ""
Write-Host "==> Done. straja\ is ready at $root"
Write-Host ""
Write-Host "Transfer straja\ to the Splunk server:"
Write-Host "   /opt/splunk/etc/apps/straja"
Write-Host ""
Write-Host "Then restart Splunk and run bm_setup.py"
