# --- run from C:\Users\CJ\dev\bet1865 ---

$expected = "C:\Users\CJ\dev\bet1865"
if ((Get-Location).Path -ne $expected) {
    Write-Host "WARNING: not in $expected - cd there first." -ForegroundColor Yellow
    exit 1
}

try {
    $dq = [char]34
    $sq = [char]39
    $patternText = "\s*capture\s*=\s*($dq|$sq)environment\1"

    $found = Get-ChildItem -Path "src" -Recurse -Include *.tsx,*.ts -ErrorAction Stop |
        Select-String -Pattern $patternText

    if (-not $found) {
        Write-Host "No file with a capture attribute set to environment found under src. Aborting." -ForegroundColor Red
        exit 1
    }

    Write-Host "Found match(es) in:" -ForegroundColor Cyan
    $found | ForEach-Object { Write-Host " - $($_.Path):$($_.LineNumber)" }

    $regex = New-Object System.Text.RegularExpressions.Regex($patternText)
    $filesToEdit = $found | Select-Object -ExpandProperty Path -Unique
    foreach ($file in $filesToEdit) {
        $content = Get-Content $file -Raw
        $newContent = $regex.Replace($content, "")
        Set-Content -Path $file -Value $newContent -NoNewline
        Write-Host "Edited: $file" -ForegroundColor Green
    }

    git diff

    Write-Host ""
    Write-Host "Review the diff above." -ForegroundColor Yellow
    $proceed = Read-Host "Proceed with verify + commit + push? (y/n)"
    if ($proceed -ne "y") {
        Write-Host "Stopping. Changes are still on disk, uncommitted." -ForegroundColor Yellow
        exit 0
    }

    npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) { throw "tsc failed" }

    npx eslint .
    if ($LASTEXITCODE -ne 0) { throw "eslint failed" }

    npx vitest run
    if ($LASTEXITCODE -ne 0) { throw "vitest failed" }

    npx next build
    if ($LASTEXITCODE -ne 0) { throw "next build failed" }

    git add -A
    git commit -m "Remove capture attribute from slip upload input so Android opens picker, not camera"
    git push

    Write-Host ""
    Write-Host "Done - pushed to origin/main." -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "ERROR: $_" -ForegroundColor Red
}