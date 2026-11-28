# Run once on the Alienware host, as Administrator, from the folder holding these scripts.
# Registers a scheduled task that starts windows-runner-supervisor.ps1 at boot (before anyone
# logs in) and restarts it if it exits. It runs as the account you type, because the DPAPI-encrypted
# secrets in C:\lattice-runner can only be read by the account that saved them.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$dir = 'C:\lattice-runner'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot 'windows-runner-supervisor.ps1') -Destination $dir -Force

$cred = Get-Credential -Message 'Windows account to run the runner supervisor (the one that saved pat.xml and vm-cred.xml)'
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
              -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$dir\windows-runner-supervisor.ps1`""
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -DontStopOnIdleEnd -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'Lattice Windows runner' -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName 'Lattice Windows runner'
Write-Host "Installed. Log: $dir\supervisor.log"
