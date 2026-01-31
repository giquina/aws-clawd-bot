# Quick Path Update Script
# Updates all documentation to reflect new location

$oldPath = 'C:\Users\Owner\Projects\aws-clawd-bot'
$newPath = 'C:\Giquina-Projects\aws-clawd-bot'

$files = @(
    'START_HERE.md',
    'WHAT_NEXT.md',
    'README.md',
    'PROJECT_STATUS.md',
    'FILE_INDEX.md',
    'UPGRADE_ROADMAP.md',
    'docs\SETUP_GUIDE.md',
    'docs\AWS_DEPLOYMENT.md'
)

foreach ($file in $files) {
    $fullPath = Join-Path $newPath $file
    if (Test-Path $fullPath) {
        Write-Host "Updating $file..." -ForegroundColor Yellow
        $content = Get-Content $fullPath -Raw
        $content = $content -replace [regex]::Escape($oldPath), $newPath
        Set-Content $fullPath -Value $content -NoNewline
        Write-Host "  ✅ Updated" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "✅ All paths updated to: $newPath" -ForegroundColor Green
