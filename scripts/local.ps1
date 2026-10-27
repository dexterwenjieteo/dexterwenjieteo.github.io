param(
  [ValidateSet('dev', 'dev:with-admin', 'check', 'build', 'preview', 'verify', 'test', 'admin', 'sync:publications', 'sync:mock', 'sync:due')]
  [string]$Task = 'dev'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$env:ASTRO_TELEMETRY_DISABLED = '1'
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  & $npmCommand.Source run $Task
} else {
  $runtimeNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
  $localNpm = Join-Path (Get-Location) '.tools\npm\node_modules\npm\bin\npm-cli.js'
  if (!(Test-Path -LiteralPath $runtimeNode) -or !(Test-Path -LiteralPath $localNpm)) {
    throw 'Install Node.js 22.12 or newer (including npm), reopen PowerShell, then run npm install and npm run dev.'
  }
  $env:Path = (Split-Path -Parent $runtimeNode) + ';' + $env:Path
  & $runtimeNode $localNpm run $Task
}
exit $LASTEXITCODE
