# Run ONCE, as Administrator, inside the Windows CI VM (not on the Alienware host).
# Installs what Lattice's Windows jobs use, then the GitHub Actions runner. After it finishes,
# shut the VM down and take the checkpoint named "clean" (see the runbook). Every job starts
# from that checkpoint and the VM is rolled back to it afterward.
#
# Runbook: engineering/self-hosted-runners.md
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

# The tools GitHub's windows-2025 image ships that our jobs call. The suites in
# .github/platform-suites.json run under `shell: bash`, which on Windows is Git Bash.
winget install --id Git.Git            --exact --silent --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS  --exact --silent --accept-source-agreements --accept-package-agreements --version 22.*
winget install --id Python.Python.3.12 --exact --silent --accept-source-agreements --accept-package-agreements
winget install --id jqlang.jq          --exact --silent --accept-source-agreements --accept-package-agreements
winget install --id GitHub.cli         --exact --silent --accept-source-agreements --accept-package-agreements

# Windows Defender scanning every file npm writes roughly doubles `npm ci`. The VM is rolled back
# after each job and walled off by the VLAN, so exclude the runner's work folder.
Add-MpPreference -ExclusionPath 'C:\actions-runner'

# Long paths: node_modules nests deeply.
New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force | Out-Null
git config --system core.longpaths true

# The runner. Pass the version shown at https://github.com/actions/runner/releases (no leading v).
$version = Read-Host 'actions/runner version (for example 2.330.0)'
New-Item -ItemType Directory -Force -Path 'C:\actions-runner' | Out-Null
$zip = "C:\actions-runner\runner.zip"
Invoke-WebRequest -Uri "https://github.com/actions/runner/releases/download/v$version/actions-runner-win-x64-$version.zip" -OutFile $zip
Expand-Archive -Path $zip -DestinationPath 'C:\actions-runner' -Force
Remove-Item $zip

# No sleep, no automatic restarts inside the VM.
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0

Write-Host 'Done. Shut the VM down, then on the host run:  Checkpoint-VM -Name lattice-win-ci -SnapshotName clean'
