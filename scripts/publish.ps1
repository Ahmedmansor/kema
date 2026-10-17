$ErrorActionPreference = 'Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
$previousIndex = $env:GIT_INDEX_FILE
$publishIndex = Join-Path ([System.IO.Path]::GetTempPath()) ('kema-pages-' + [guid]::NewGuid() + '.index')
try {
  npm test
  if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  Set-Content -LiteralPath 'dist/.nojekyll' -Value '' -NoNewline
  $env:GIT_INDEX_FILE = $publishIndex
  git --work-tree=dist read-tree --empty
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare deployment index.' }
  git --work-tree=dist add --all
  if ($LASTEXITCODE -ne 0) { throw 'Could not stage deployment.' }
  $tree = git write-tree
  if ($LASTEXITCODE -ne 0) { throw 'Could not create deployment tree.' }
  $parent = git rev-parse --verify refs/heads/gh-pages 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Fetch the existing gh-pages branch before publishing.' }
  $commit = git commit-tree $tree -p $parent -m 'Publish static Kema application without personal data'
  if ($LASTEXITCODE -ne 0) { throw 'Could not create deployment commit.' }
  git update-ref refs/heads/gh-pages $commit $parent
  if ($LASTEXITCODE -ne 0) { throw 'Deployment branch changed; try again.' }
  git push origin gh-pages
  if ($LASTEXITCODE -ne 0) { throw 'Deployment push failed. Fetch and reconcile gh-pages before retrying.' }
  Write-Output 'Published application files. Check the Pages deployment in GitHub Actions.'
} finally {
  $env:GIT_INDEX_FILE = $previousIndex
  if (Test-Path -LiteralPath $publishIndex) { Remove-Item -LiteralPath $publishIndex }
  if (Test-Path -LiteralPath 'dist/.nojekyll') { Remove-Item -LiteralPath 'dist/.nojekyll' }
  Pop-Location
}
