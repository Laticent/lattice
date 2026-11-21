# Run ONCE, as Administrator, inside the Windows CI VM (not on the Alienware host).
# Installs what Lattice's Windows jobs use, walls the VM off from private networks, then installs
# the GitHub Actions runner. After it finishes, shut the VM down and take the checkpoint named
# "clean" (see the runbook). Every job starts from that checkpoint and the VM is rolled back to
# it afterward. Re-run the monthly refresh in the runbook to patch it.
#
# Runbook: engineering/self-hosted-runners.md
#Requires -RunAsAdministrator
param(
  [Parameter(Mandatory)] [string]$RunnerVersion,   # from github.com/actions/runner/releases, no leading v
  [Parameter(Mandatory)] [string]$NodeVersion      # exact Node 22 release from nodejs.org, e.g. 22.12.0
)
$ErrorActionPreference = 'Stop'

# winget is a native command: PowerShell does not stop on its exit code, so check it.
function Install-Winget($id) {
  winget install --id $id --exact --silent --accept-source-agreements --accept-package-agreements
  # -1978335189 = already installed
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) { throw "winget install $id failed ($LASTEXITCODE)" }
}

# The tools GitHub's windows-2025 image ships that our jobs call. The suites in
# .github/platform-suites.json run under `shell: bash`, which on Windows is Git Bash.
Install-Winget Git.Git
Install-Winget Python.Python.3.12
Install-Winget jqlang.jq
Install-Winget GitHub.cli

# Node at an exact version, from nodejs.org, checked against the published SHA-256 list.
$msi = "node-v$NodeVersion-x64.msi"
$base = "https://nodejs.org/dist/v$NodeVersion"
Invoke-WebRequest "$base/$msi" -OutFile "$env:TEMP\$msi"
$want = ((Invoke-WebRequest "$base/SHASUMS256.txt").Content -split "`n" | Where-Object { $_ -match " $([regex]::Escape($msi))$" }) -split ' ' | Select-Object -First 1
if ((Get-FileHash "$env:TEMP\$msi" -Algorithm SHA256).Hash -ne $want.ToUpper()) { throw "Node MSI checksum mismatch" }
$p = Start-Process msiexec.exe -ArgumentList "/i `"$env:TEMP\$msi`" /qn" -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "Node install failed ($($p.ExitCode))" }

# This session's PATH predates the installs, so call git by its full path.
$git = Join-Path $env:ProgramFiles 'Git\cmd\git.exe'
& $git config --system core.longpaths true
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null

# Windows Defender scanning every file npm writes roughly doubles `npm ci`. The VM is rolled back
# after each job and walled off below, so exclude the runner's work folder.
Add-MpPreference -ExclusionPath 'C:\actions-runner'

# Wall the VM off from every private network: the router, the home LAN, the other CI machines on
# the same VLAN (which the router cannot separate), Tailscale and link-local. The public internet
# stays open. DNS goes to public resolvers, because the router's resolver is a private address.
$private = '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '169.254.0.0/16', '198.18.0.0/15'
New-NetFirewallRule -DisplayName 'lattice-ci: block private networks' -Direction Outbound -Action Block `
  -RemoteAddress $private -Profile Any | Out-Null
Get-NetAdapter | Where-Object Status -eq 'Up' | ForEach-Object {
  Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses '1.1.1.1', '9.9.9.9'
}

# The runner.
New-Item -ItemType Directory -Force -Path 'C:\actions-runner' | Out-Null
$zip = 'C:\actions-runner\runner.zip'
Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/download/v$RunnerVersion/actions-runner-win-x64-$RunnerVersion.zip" -OutFile $zip
Expand-Archive -Path $zip -DestinationPath 'C:\actions-runner' -Force
Remove-Item $zip

# No sleep inside the VM.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host 'Done. Shut the VM down, then on the host run:  Checkpoint-VM -Name lattice-win-ci -SnapshotName clean'
