$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$escapedRepoRoot = $repoRoot.Replace("'", "''")

$devCommand = @"
Set-ExecutionPolicy Bypass -Scope Process -Force
Set-Location -LiteralPath '$escapedRepoRoot'
pnpm dev
"@

$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($devCommand))

Start-Process `
  -FilePath "powershell.exe" `
  -WorkingDirectory $repoRoot `
  -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    $encodedCommand
  )
