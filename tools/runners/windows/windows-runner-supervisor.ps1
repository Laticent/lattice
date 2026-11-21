# Runs on the Alienware HOST (Windows 11 Pro, Hyper-V). Loops forever:
#   1. ask GitHub for a one-job ("just-in-time") runner config,
#   2. roll the Windows CI VM back to its "clean" checkpoint and start it,
#   3. run the GitHub runner inside the VM (PowerShell Direct, no network path from host to VM needed),
#   4. when the job ends, or MaxMinutes passes, power the VM off. The next job starts from "clean".
# Nothing a job does survives it, which matters because this repo is public.
#
# One-time secrets, saved encrypted for the account that runs this script (Windows DPAPI):
#   Get-Credential -Message 'GitHub PAT (user name ignored)' | Export-Clixml C:\lattice-runner\pat.xml
#   Get-Credential -Message 'Admin account INSIDE the VM'    | Export-Clixml C:\lattice-runner\vm-cred.xml
# Optional: put a healthchecks.io URL in C:\lattice-runner\healthcheck-url.txt.
# Start at boot: see install-windows-task.ps1. Runbook: engineering/self-hosted-runners.md
#Requires -RunAsAdministrator
param(
  [string]$Repo        = 'Laticent/lattice',
  [string]$VmName      = 'lattice-win-ci',
  [string]$Checkpoint  = 'clean',
  [string]$HostLabel   = 'alienware',
  [string]$StateDir    = 'C:\lattice-runner',
  [int]   $BootTimeout = 300,
  # A job that wedges its runner, or a hostile one, cannot hold the VM forever. The longest
  # job's timeout-minutes is 40; the idle wait for a job also counts, then the VM re-registers.
  [int]   $MaxMinutes  = 180
)
$ErrorActionPreference = 'Stop'
$log = Join-Path $StateDir 'supervisor.log'
function Log($msg) {
  $line = "{0} {1}" -f (Get-Date -Format s), $msg
  Write-Host $line
  try {
    if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) { Move-Item $log "$log.1" -Force }
    Add-Content -Path $log -Value $line
  } catch { }
}

$pat    = (Import-Clixml (Join-Path $StateDir 'pat.xml')).GetNetworkCredential().Password
$vmCred = Import-Clixml (Join-Path $StateDir 'vm-cred.xml')
$hcFile = Join-Path $StateDir 'healthcheck-url.txt'
$healthUrl = if (Test-Path $hcFile) { (Get-Content $hcFile -Raw).Trim() } else { '' }
$headers = @{ Authorization = "Bearer $pat"; Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }

# Ping while the token works and the VM exists; ping /fail otherwise. Never throws.
function Send-Heartbeat {
  if (-not $healthUrl) { return }
  $ok = $false
  try {
    Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Repo/actions/runners?per_page=1" -TimeoutSec 30 | Out-Null
    $ok = [bool](Get-VM -Name $VmName -ErrorAction SilentlyContinue)
  } catch { }
  $url = if ($ok) { $healthUrl } else { "$healthUrl/fail" }
  try { Invoke-RestMethod -Uri $url -TimeoutSec 10 | Out-Null } catch { }
}

function Get-JitConfig {
  $name = "$HostLabel-win-$(Get-Date -Format yyyyMMddHHmmss)"
  $body = @{ name = $name; runner_group_id = 1; work_folder = '_work'
             labels = @('self-hosted', 'windows', 'x64', 'lattice-windows', $HostLabel) } | ConvertTo-Json
  (Invoke-RestMethod -Method Post -Headers $headers -Body $body -ContentType 'application/json' `
     -Uri "https://api.github.com/repos/$Repo/actions/runners/generate-jitconfig").encoded_jit_config
}

function Stop-CiVm {
  # Never throws: a failure here must not end the supervisor loop.
  try {
    $vm = Get-VM -Name $VmName -ErrorAction Stop
    if ($vm.State -eq 'Saved') { Remove-VMSavedState -VMName $VmName }
    elseif ($vm.State -ne 'Off') { Stop-VM -Name $VmName -TurnOff -Force }
  } catch { Log "could not stop ${VmName}: $($_.Exception.Message)" }
}

function Wait-VmReady {
  $deadline = (Get-Date).AddSeconds($BootTimeout)
  while ((Get-Date) -lt $deadline) {
    try { Invoke-Command -VMName $VmName -Credential $vmCred -ScriptBlock { $true } -ErrorAction Stop | Out-Null; return }
    catch { Start-Sleep -Seconds 5 }
  }
  throw "VM $VmName did not answer PowerShell Direct within $BootTimeout s"
}

# A host reboot must not leave the VM in a saved state that resumes mid-job.
try { Set-VM -Name $VmName -AutomaticStopAction TurnOff -AutomaticStartAction Nothing } catch { Log "Set-VM: $($_.Exception.Message)" }

$backoff = 5
while ($true) {
  $job = $null
  try {
    Send-Heartbeat
    $jit = Get-JitConfig
    $backoff = 5
    Stop-CiVm
    Restore-VMCheckpoint -VMName $VmName -Name $Checkpoint -Confirm:$false
    Start-VM -Name $VmName
    Wait-VmReady
    Log 'VM clean and booted; waiting for a job'
    $job = Invoke-Command -VMName $VmName -Credential $vmCred -AsJob -ArgumentList $jit -ScriptBlock {
      param($config)
      Set-Location 'C:\actions-runner'
      & .\run.cmd --jitconfig $config
    }
    Remove-Variable jit
    $deadline = (Get-Date).AddMinutes($MaxMinutes)
    while ($job.State -eq 'Running' -and (Get-Date) -lt $deadline) {
      Wait-Job $job -Timeout 120 | Out-Null
      Send-Heartbeat
    }
    if ($job.State -eq 'Running') { Log "VM still running after $MaxMinutes min; powering it off" }
    else { Log "job finished ($($job.State))" }
  } catch {
    Log "error: $($_.Exception.Message); retrying in $backoff s"
    Start-Sleep -Seconds $backoff
    $backoff = [Math]::Min($backoff * 2, 300)
  } finally {
    if ($job) { try { Stop-Job $job; Remove-Job $job -Force } catch { } }
    Stop-CiVm
  }
}
