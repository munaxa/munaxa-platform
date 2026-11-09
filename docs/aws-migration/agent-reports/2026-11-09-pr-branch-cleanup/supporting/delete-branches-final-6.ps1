# Deletes the 6 outdated branches the owner chose to remove on 9 Nov 2026 (keeps claude/zealous-cori-v2b9l4).
# Each delete is pinned to the exact tip, so a moved branch is skipped. Tips are recorded in branch-disposition.tsv.
$tmp = Join-Path $env:TEMP ("munaxa-branch-cleanup-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
Push-Location $tmp
git init -q
Write-Host "== munaxa: deleting 1 branch(es)"
git push https://github.com/munaxa/munaxa.git "--force-with-lease=refs/heads/claude/nonprod-provenance-investigation:612588cd97514f83e73bc04bdd06ae1cb10f541e" ":refs/heads/claude/nonprod-provenance-investigation"
Write-Host "exit code: $LASTEXITCODE"
Write-Host "== munaxa-identity: deleting 1 branch(es)"
git push https://github.com/munaxa/munaxa-identity.git "--force-with-lease=refs/heads/claude/aws-nonprod-dns-decision:da4f53124aee859ce0888c7d335f39afb82373c6" ":refs/heads/claude/aws-nonprod-dns-decision"
Write-Host "exit code: $LASTEXITCODE"
Write-Host "== munaxa-work: deleting 1 branch(es)"
git push https://github.com/munaxa/munaxa-work.git "--force-with-lease=refs/heads/claude/munaxa-product-readiness-audit-8mr34d:b608790878c8a5f9a28e673bf8f6c0f8b1d29dd6" ":refs/heads/claude/munaxa-product-readiness-audit-8mr34d"
Write-Host "exit code: $LASTEXITCODE"
Write-Host "== munaxa-school: deleting 1 branch(es)"
git push https://github.com/munaxa/munaxa-school.git "--force-with-lease=refs/heads/claude/school-auth-security-review-11ssy8:8a5b1d4b40eaa6b9cd07e6b95e5a96f0f2c9cef8" ":refs/heads/claude/school-auth-security-review-11ssy8"
Write-Host "exit code: $LASTEXITCODE"
Write-Host "== munaxa-docs: deleting 2 branch(es)"
git push https://github.com/munaxa/munaxa-docs.git "--force-with-lease=refs/heads/claude/amazing-turing-09vlks:03af11c07b17c9e80d644c04ef4f87a1dd699717" "--force-with-lease=refs/heads/claude/smk1-smoke-evidence:8cf4572c929974dc1ddc2e94bb3be3a253c92b12" ":refs/heads/claude/amazing-turing-09vlks" ":refs/heads/claude/smk1-smoke-evidence"
Write-Host "exit code: $LASTEXITCODE"
Pop-Location
Remove-Item -Recurse -Force $tmp
