# One-time Windows setup for the ERP server. Run in an ADMIN PowerShell:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   & "\\wsl.localhost\Ubuntu-24.04\home\mrmdev\Code\mrm\deploy\local\windows-setup.ps1"
#
# 1. Lets the router's forwarded port 9443 reach WSL (mirrored networking blocks inbound by default).
# 2. Starts WSL at boot, before anyone logs in, so the systemd services come up after power cuts.
# 3. Stops the PC from sleeping.
$ErrorActionPreference = "Stop"
$distro = "Ubuntu-24.04"
$wslVmCreatorId = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}"

# Recreate the rules so re-running the script also updates the port.
Remove-NetFirewallHyperVRule -Name "MRM-ERP-HTTPS" -ErrorAction SilentlyContinue
New-NetFirewallHyperVRule -Name "MRM-ERP-HTTPS" -DisplayName "MRM ERP HTTPS (WSL)" `
  -Direction Inbound -VMCreatorId $wslVmCreatorId -Protocol TCP -LocalPorts 9443 -Action Allow | Out-Null
Remove-NetFirewallRule -Name "MRM-ERP-HTTPS" -ErrorAction SilentlyContinue
New-NetFirewallRule -Name "MRM-ERP-HTTPS" -DisplayName "MRM ERP HTTPS (WSL)" `
  -Direction Inbound -Protocol TCP -LocalPort 9443 -Action Allow | Out-Null

$user = "$env:USERDOMAIN\$env:USERNAME"
$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d $distro --exec /bin/sh -c 'exec sleep infinity'"
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$credential = Get-Credential -UserName $user -Message "Windows password for $user (the task runs without anyone logged in)"
Register-ScheduledTask -TaskName "MRM ERP - start WSL" -Action $action -Trigger $trigger -Settings $settings `
  -User $user -Password $credential.GetNetworkCredential().Password -RunLevel Highest -Force | Out-Null

powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host "Done: port 9443 open to WSL, WSL starts at boot, sleep disabled."
