# Runs on the Alienware HOST (Windows 11 Pro, Hyper-V). Loops forever:
#   1. ask GitHub for a one-job ("just-in-time") runner config,
#   2. roll the Windows CI VM back to its "clean" checkpoint and start it,
#   3. run the GitHub runner inside the VM (PowerShell Direct, no network path from host to VM needed),
#   4. when the job ends, power the VM off. The next job starts from "clean" again.
# Nothing a job does survives it, which matters because this repo is public.
#
# One-time secrets, saved encrypted for the account that runs this script (Windows DPAPI):
#   Get-Credential -Message 'GitHub PAT (user name ignored)' | Export-Clixml C:\lattice-runner\pat.xml
#   Get-Credential -Message 'Admin account INSIDE the VM'    | Export-Clixml C:\lattice-runner\vm-cred.xml
# Start at boot: see install-windows-task.ps1. Runbook: engineering/self-hosted-runners.md
#Requires -RunAsAdministrator
param(
  [string]$Repo        = 'Laticent/lattice',
  [string]$VmName      = 'lattice-win-ci',
  [string]$Checkpoint  = 'clean',
  [string]$HostLabel   = 'alienware',
  [string]$StateDir    = 'C:\lattice-runner',
  [int]   $BootTimeout = 300
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $StateDir 'supervisor.log'
function Log($msg) { $line = "{0} {1}" -f (Get-Date -Format s), $msg; Write-Host $line; Add-Content -Path $log -Value $line }

$pat    = (Import-Clixml (Join-Path $StateDir 'pat.xml')).GetNetworkCredential().Password
$vmCred = Import-Clixml (Join-Path $StateDir 'vm-cred.xml')
$headers = @{ Authorization = "Bearer $pat"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }

function Get-JitConfig {
  $name = "$HostLabel-win-$(Get-Date -Format yyyyMMddHHmmss)"
  $body = @{ name = $name; runner_group_id = 1; work_folder = '_work'
             labels = @('self-hosted', 'windows', 'x64', 'lattice-windows', $HostLabel) } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Headers $headers -Body $body -ContentType 'application/json' `
     -Uri "https://api.github.com/repos/$Repo/actions/runners/generate-jitconfig").encoded_jit_config
}

function Wait-VmReady {
  $deadline = (Get-Date).AddSeconds($BootTimeout)
  while ((Get-Date) -lt $deadline) {
    try { Invoke-Command -VMName $VmName -Credential $vmCred -ScriptBlock { $true } -ErrorAction Stop | Out-Null; return }
    catch { Start-Sleep -Seconds 5 }
  }
  throw "VM $VmName did not answer PowerShell Direct within $BootTimeout s"
}

$backoff = 5
while ($true) {
  try {
    $jit = Get-JitConfig
    $backoff = 5
    if ((Get-VM -Name $VmName).State -ne 'Off') { Stop-VM -Name $VmName -TurnOff -Force }
    Restore-VMCheckpoint -VMName $VmName -Name $Checkpoint -Confirm:$false
    Start-VM -Name $VmName
    Wait-VmReady
    Log 'VM clean and booted; waiting for a job'
    Invoke-Command -VMName $VmName -Credential $vmCred -ArgumentList $jit -ScriptBlock {
      param($config)
      Set-Location 'C:\actions-runner'
      & .\run.cmd --jitconfig $config
    }
    Log 'job finished'
  } catch {
    Log "error: $($_.Exception.Message); retrying in $backoff s"
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min($backoff * 2, 300)
  } finally {
    Remove-Variable jit -ErrorAction SilentlyContinue
    if ((Get-VM -Name $VmName).State -ne 'Off') { Stop-VM -Name $VmName -TurnOff -Force }
  }
}
