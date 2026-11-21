# Self-hosted CI runners

How to turn the owner's two home machines into GitHub Actions runners for Laticent/lattice. The
Dell Precision workstation runs Linux jobs. The Alienware R16 runs Windows jobs, and also Linux
jobs in a VM. They work alongside GitHub's own runners, not instead of them.

The scripts live in `tools/runners/`. This page is the runbook, so follow it top to bottom.

## Why: the 20-job cap, measured

An audit of all 19,309 workflow runs from 2026-11-07 to 2026-11-21 found that slowness comes from
a queue, not from slow jobs:

| Measure | Value |
|---|---|
| Jobs running at once, busy night of 11-15 | **exactly 20 for 7 hours**, with 30–86 more queued |
| Queue wait before a merge-queue job starts | median 6.3 min, p90 30 min |
| Merge-queue run, created to done | median 45 min, p90 93 min |
| Compute used | about 17,000 job-minutes a day |
| `ci.yml` minutes spent on PR runs a newer push cancelled | 23% |
| Merge-queue runs cancelled | 9, every one a job hitting `timeout-minutes` |

GitHub gives a public repo on the Free plan **20 concurrent hosted jobs**. Jobs on self-hosted
runners do not count toward that cap, so every job moved home frees a hosted slot for macOS, iOS,
CodeQL and the rest. The raw audit data was a one-off pull through the Actions API and is not
committed.

## What runs where

| Machine | OS | Runs | Runners |
|---|---|---|---|
| Dell Precision (2 × Xeon, 24 threads, 48 GB) | Ubuntu Server 24.04 LTS | Linux jobs | 8 Docker slots, 3 CPUs / 5.5 GB each (16 after a RAM upgrade to 128 GB) |
| Alienware R16 (i9, 32 GB) | Windows 11 Pro + Hyper-V | Windows jobs; Linux jobs in a VM | 1 Windows VM + an Ubuntu VM with 4 Docker slots |
| Precision laptop | Windows | Nothing; it is the owner's workstation | 0 |
| GitHub-hosted | macOS 26, iOS Simulator | Everything Apple, CodeQL, overflow | the 20 free slots |

**How a job finds the right machine.** Each runner carries labels. Linux runners carry
`self-hosted, linux, x64, lattice-linux, <host>`. The Windows runner carries
`self-hosted, windows, x64, lattice-windows, alienware`. GitHub gives a job only to a runner whose
labels include every label in the job's `runs-on`, so a Windows job waits for the Alienware and
never lands on Linux.

**Why each job gets a fresh machine.** The repo is public, so anyone can open a pull request, and
a pull request's code runs on these machines. Each runner therefore lives for exactly one job:

- **Linux:** a new Docker container per job, deleted when the job ends. It has no shared volumes,
  no Docker socket and no host folders, so nothing one job writes can reach the next.
- **Windows:** a Hyper-V VM rolled back to a clean checkpoint before every job.
- **Both:** registered with a **just-in-time (JIT) config**, a single-use registration GitHub
  issues per job, so no reusable runner token ever sits on disk inside a job.

## 1. Network: the CI VLAN

Set this up on your router before anything else.

1. Create a VLAN for CI (for example VLAN 50, `10.50.0.0/24`) and put both machines' **wired**
   ports on it.
2. Firewall rules, in this order:
   - CI VLAN → internet: **allow**.
   - CI VLAN → any private range (your LAN, the router's admin page): **deny**.
   - LAN → CI VLAN: deny, except from your laptop if you want direct SSH. Tailscale (step 2.4)
     makes this unnecessary.
3. Cap the VLAN at 200 Mbps each way, as planned.
4. **Open no inbound ports and forward nothing.** Runners only make outbound HTTPS connections:
   they long-poll `github.com` for work.

**The router cannot separate two machines on the same VLAN.** Traffic between them is switched
and never reaches the router's firewall. So each machine adds its own wall:

- **Linux** (`tools/runners/linux/firewall.sh`): job containers get `REJECT` on every private
  range, including the other CI machines and Tailscale's `100.64.0.0/10`, and cannot open a
  connection to their own host (its sshd, anything on `0.0.0.0`). Containers also cannot reach
  each other. Jobs resolve names through public DNS (`1.1.1.1`, `9.9.9.9`), because the router's
  resolver is a private address the wall blocks.
- **Windows VM** (`guest-setup.ps1`): an outbound Windows Firewall rule blocks the same private
  ranges, and DNS points at the same public resolvers. Both are baked into the `clean` checkpoint.

**Bandwidth.** In the image test, `npm ci` took 89 s through a proxy. Thirteen jobs starting at
once all download packages and GitHub cache entries over the same 200 Mbps. If job logs show
`npm ci` or "Restore cache" getting slower as load rises, add a local npm caching proxy. Until
the numbers show that, don't.

## 2. Dell Precision: Linux host

1. **Install Ubuntu Server 24.04 LTS** (minimal, with OpenSSH). It matches the `ubuntu-24.04` jobs
   the golden PDFs are rendered on. Keep Windows 10 as the second boot entry if you like, but:
   - `/etc/default/grub`: `GRUB_DEFAULT=0`, `GRUB_TIMEOUT=5`, then `sudo update-grub`. Any
     unattended reboot then lands in Linux.
   - BIOS: GRUB/Ubuntu first in boot order, **AC Recovery → Power On**, VT-x and VT-d on.
   - Windows 10: turn **Fast Startup off** (Power Options). It locks the disks Linux shares.
2. **Never sleep:**
   `sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target`
3. **Patches without surprise reboots:**
   `sudo apt install unattended-upgrades`, then in `/etc/apt/apt.conf.d/50unattended-upgrades` set
   `Unattended-Upgrade::Automatic-Reboot "true";` and
   `Unattended-Upgrade::Automatic-Reboot-Time "04:00";`.
4. **Tailscale**, for admin from anywhere: `curl -fsSL https://tailscale.com/install.sh | sh &&
   sudo tailscale up --ssh`.
5. **Docker:** install Docker Engine from docs.docker.com (the apt repository route), then
   `sudo systemctl enable --now docker`.
6. **The runner files:**
   ```bash
   sudo mkdir -p /opt/lattice-runner /etc/lattice-runner
   sudo cp tools/runners/linux/* /opt/lattice-runner/
   sudo cp /opt/lattice-runner/runner.env.example /etc/lattice-runner/env
   sudo chmod 600 /etc/lattice-runner/env && sudo nano /etc/lattice-runner/env   # paste the token (step 5)
   cd /opt/lattice-runner && sudo ./build-image.sh                                # about 2 minutes
   ```
7. **Start it, and keep the image current:**
   ```bash
   sudo cp /opt/lattice-runner/lattice-runners.service /opt/lattice-runner/lattice-runner-image.{service,timer} /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now lattice-runners lattice-runner-image.timer
   journalctl -u lattice-runners -f
   ```
   GitHub → Settings → Actions → Runners should now list 8 idle runners named `precision-N-…`.
   They disappear as they take jobs and reappear as fresh ones.

   **Stopping the service cancels running jobs** after 30 seconds, and GitHub shows them as
   failed. Stop it when the runner list shows no busy runners.

   **A container lives at most 180 minutes** (`LATTICE_MAX_CONTAINER_MINUTES`). That includes
   the idle wait for a job, so an idle slot re-registers every three hours. The limit means a
   job that wedges its own runner cannot hold a slot forever.

`lattice-runner-image.timer` rebuilds the image every day at 04:30. GitHub stops sending jobs to
a runner that is more than about 30 days behind its latest release. A new release therefore
reaches jobs within a day, so jobs don't spend their first minute self-updating the runner, and a
forced full rebuild every ISO week picks up Ubuntu and Node security fixes. Each new job uses the
new image; jobs already running are not touched. The script also deletes old image tags and keeps
Docker's build cache under 20 GB.

**Disk.** One image is about 5 GB, and a job's writes have no quota: a job that fills the disk
stops every slot until it ends. Put `/var/lib/docker` on its own partition (200 GB or more), so a
full Docker disk cannot take the operating system down with it.

**RAM is the Precision's limit, not cores.** Lattice jobs launch Chromium and render PDFs.
Going to 128 GB (used DDR4 ECC RDIMMs are cheap) and setting `LATTICE_SLOTS=16` doubles its
capacity.

## 3. Alienware R16: Windows 11 Pro host

Hyper-V needs Windows 11 **Pro** (`winver` shows the edition). Home has no Hyper-V; upgrading to
Pro is a paid key.

1. **Host settings:** BIOS **Restore on AC power loss → On**. Power plan High performance, sleep
   Never, `powercfg /h off`. Windows Update: set active hours and pause feature updates, then patch
   on your own schedule. Install Tailscale.
2. **Hyper-V:** `Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All`, then
   reboot. Create an **External** virtual switch on the wired NIC.
   **Keep the Alienware host itself off the CI VLAN.** It is your personal machine, so only the
   VMs belong on the CI VLAN:
   - make the switch port a trunk carrying your home LAN untagged and the CI VLAN tagged;
   - tag each CI VM's adapter: `Set-VMNetworkAdapterVlan -VMName lattice-win-ci -Access -VlanId 50`
     (the same for `lattice-linux-ci`).

   The host then stays on the home LAN, where the router's CI-to-LAN deny rule protects it.
3. **Linux VM** (`lattice-linux-ci`): 12 vCPUs, 22 GB fixed RAM (dynamic memory off), Ubuntu
   Server 24.04. Inside it, follow §2 steps 2–7 with `LATTICE_SLOTS=4`,
   `LATTICE_MEMORY_PER_JOB=5000m`, `LATTICE_HOST_LABEL=alienware`. In Hyper-V, set the VM's
   *Automatic Start Action* to **Always start**.
4. **Windows VM** (`lattice-win-ci`): 4 vCPUs, 6 GB, Generation 2. GitHub's `windows-2025` image
   is Windows Server 2025, so that is the closest guest. A Windows 11 Pro guest also works. **The
   guest needs its own license**, and an evaluation copy is for evaluation, not ongoing CI.
   1. Inside the VM, as Administrator, run
      `tools/runners/windows/guest-setup.ps1 -RunnerVersion <x.y.z> -NodeVersion <22.x.y>`,
      taking the current versions from github.com/actions/runner/releases and nodejs.org.
   2. Shut the VM down. On the host: `Checkpoint-VM -Name lattice-win-ci -SnapshotName clean`.
   3. **Refresh the checkpoint monthly.** Every job rolls the VM back, so it never gets Windows
      updates, Defender signatures or a new runner on its own. Once a month, and whenever
      actions/runner ships a release: stop the scheduled task, then restore `clean` and boot it.
      Run Windows Update, replace `C:\actions-runner` with the new runner zip, shut the VM down,
      run `Remove-VMCheckpoint -VMName lattice-win-ci -Name clean` followed by
      `Checkpoint-VM -Name lattice-win-ci -SnapshotName clean`, and start the task.

   The job runs as the VM's administrator account through a PowerShell Direct session, with no
   interactive desktop. That is what lets the host drive it without any network path, and the
   rollback and the guest firewall are what contain it. A job that needs a logged-in desktop
   would behave differently from GitHub's `windows-2025`; none of today's Windows suites does.
5. **Windows supervisor** (host, as Administrator):
   ```powershell
   New-Item -ItemType Directory C:\lattice-runner
   Get-Credential -Message 'GitHub PAT (user name ignored)' | Export-Clixml C:\lattice-runner\pat.xml
   Get-Credential -Message 'Admin account INSIDE the VM'    | Export-Clixml C:\lattice-runner\vm-cred.xml
   .\tools\runners\windows\install-windows-task.ps1
   ```
   The scheduled task starts at boot. For each job it rolls the VM back to `clean`, boots it, runs
   one job through PowerShell Direct and powers the VM off. A VM still running after 180 minutes
   is powered off. Log: `C:\lattice-runner\supervisor.log` (rotated at 10 MB). For monitoring,
   put a healthchecks.io URL in `C:\lattice-runner\healthcheck-url.txt`.

Memory budget on 32 GB: about 4 GB for Windows, 22 GB for the Linux VM, 6 GB for the Windows VM.
Gaming on the Alienware while CI is busy will be slow; stop the Linux VM first if you need the RAM.

## 4. GitHub settings

1. Settings → Actions → General → **Approval for running fork pull request workflows from
   contributors** → *Require approval for all external contributors*. A stranger's PR then runs
   nothing on these machines until you approve it.
2. **The token both supervisors use.** Create it under your profile → Settings → Developer
   settings → Fine-grained tokens:
   - repository access: only `Laticent/lattice`;
   - permission: **Administration: Read and write** (minting JIT configs needs it);
   - expiry: 90 days, with a reminder to rotate it.

## 5. Monitoring

Create three free checks at healthchecks.io, one per supervisor: the Precision, the Alienware's
Linux VM and the Windows supervisor. Use a period of 2 minutes and a grace of 10. Put the Linux
URLs in `LATTICE_HEALTHCHECK_URL` and the Windows one in `C:\lattice-runner\healthcheck-url.txt`.

A supervisor pings only while it can still serve jobs: its token works (it makes an
authenticated API read each time) and the image, network or VM exists. Otherwise it pings
`<url>/fail`. So an expired token or a broken Docker shows up as an alert on your phone, not as a
silent dead host. GitHub's runner list also shows which runners are online.

## 6. Moving jobs to the runners (not done yet)

The workflows still use hosted runners only. Changing them changes the CI contract, which is the
owner's call (CLAUDE.md, SECOND FILTER row 2). The proposed change routes through **repository
variables**, so switching back to hosted runners is a settings edit, not a commit:

```yaml
# ci.yml, for each Linux job
runs-on: ${{ fromJSON(vars.LINUX_RUNNER || '"ubuntu-24.04"') }}
```

| Variable | Self-hosted value | Back to hosted |
|---|---|---|
| `LINUX_RUNNER` | `["self-hosted","lattice-linux"]` | delete the variable |
| `WINDOWS_RUNNER` | `["self-hosted","lattice-windows"]` (replaces `windows-2025` in `platform-suites.yml`'s plan) | delete the variable |

Recommended order: the heaviest `ci.yml` jobs first (the integration shards, `unit`,
`golden-diff`, `studio-smoke`), then measure queue time for a week against the numbers at the
top of this page.

Two things to watch on the first runs:

- **Golden renders.** The image matches `ubuntu-24.04`'s distro and the packages CI installs, but
  not every font and library on GitHub's image. Run `golden-diff` on a self-hosted runner and on
  a hosted one against the same commit before moving the PR gate.
- **`apt-cached` and `playwright-browsers`.** These actions restore their caches from GitHub. On
  this image the packages and browsers are already installed, so those steps should pass straight
  through. If they still download, short-circuit them on `runner.environment == 'self-hosted'`.

## What has been verified, and where

| Claim | Surface | Result |
|---|---|---|
| The Linux image builds | Docker 29 in the cloud sandbox, through its proxy, with the `gh` step removed (the sandbox blocks `cli.github.com`) | built in 110 s |
| The image runs real Lattice work under per-job limits | same, `--cpus 3 --memory 5500m --shm-size 2g` | `npm ci` 89 s, `npm run build` 123 s, a unit test file 4/4 passing |
| Tools are present for the `runner` user | same | Node 22, npm 10, git, jq, zsh, poppler, ImageMagick 6, Noto Color Emoji, Playwright Chromium/WebKit/Firefox, actions/runner, passwordless sudo |
| Shell scripts are lint-clean | shellcheck | clean |
| Supervisor registers JIT runners and takes jobs | **UNVERIFIED** | needs the owner's token and machine |
| `firewall.sh` blocks private ranges | Docker + iptables in the cloud sandbox, a container on `lattice-ci` connecting to `10.0.0.1:443` | without the rules: connects; with them: `Network is unreachable`; running it twice adds no duplicate rules |
| A job container can still resolve names with the wall up | same, `--dns 1.1.1.1 --dns 9.9.9.9` | resolves; through a private resolver (`--dns 10.99.0.1`, the bug this fixes) it fails |
| A job container cannot connect to its own host, or to another job | same, a listener on the host and one in a second container | host: refused with the INPUT rule, connects without it; container to container: `Network is unreachable` (`enable_icc=false`); public HTTPS still connects |
| A runner that dies at once backs off instead of looping | the real `runner-supervisor.sh` and Docker, a stand-in GitHub API handing out an invalid JIT config | 4 registrations in 45 s (5, 10, 20, 40 s apart); the token never on a command line; temporary config files removed; the stop trap ran |
| The weekly rebuild really rebuilds | `docker build` twice with one `CACHE_EPOCH`, then a new one | same week: every step cached; new week: everything after the base rebuilt |
| `firewall.sh` installs on Ubuntu 24.04's nftables-backed iptables | a privileged `ubuntu:24.04` container, `iptables v1.8.10 (nf_tables)`, a `lattice-ci0` bridge | 7 forwarding rules and 1 INPUT rule; a second run adds none. Packet behavior was tested on the sandbox's iptables (rows above), not on a real Ubuntu host |
| The Windows scripts parse | PowerShell 7.4.6 parser on Linux | all three parse with 0 errors; PSScriptAnalyzer **not run** |
| Every Windows script | **UNVERIFIED** | needs Hyper-V; nothing Windows ran here |
