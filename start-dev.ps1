param(
  [int]$StartupTimeoutSeconds = 120,
  [string]$HealthUrl = "http://localhost:3001"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$escapedRepoRoot = $repoRoot.Replace("'", "''")

$devCommand = @"
Set-ExecutionPolicy Bypass -Scope Process -Force
Set-Location -LiteralPath '$escapedRepoRoot'
pnpm dev
"@

$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($devCommand))

$devProcess = Start-Process `
  -FilePath "powershell.exe" `
  -WorkingDirectory $repoRoot `
  -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    $encodedCommand
  ) `
  -PassThru

if (-not $devProcess) {
  throw "Failed to open the dev server terminal."
}

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
$lastHealthError = $null

do {
  if ($devProcess.HasExited) {
    throw "The dev server terminal exited before $HealthUrl became reachable."
  }

  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Write-Host "Dev server is reachable at $HealthUrl."
      exit 0
    }
  } catch {
    $lastHealthError = $_.Exception.Message
  }

  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)

Write-Warning "The dev server terminal is open, but $HealthUrl did not respond within $StartupTimeoutSeconds seconds."
if ($lastHealthError) {
  Write-Warning "Last readiness check: $lastHealthError"
}

exit 2
