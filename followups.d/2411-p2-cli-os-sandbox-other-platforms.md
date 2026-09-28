---
origin: 2411
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2411
---

# Verify the CLI's OS sandbox for code packages on macOS and Windows

```text
why now   — it is the one gap holding #2411 at "high" rather than "very high". The CLI's code-package door has two walls: the Worker with its network constructors removed under the frame's no-network policy (verified on every platform the tests run on), and the OS sandbox under Chromium's renderer. The second is verified only as root on Linux with Chromium 141 (the renderer runs as `nobody`, seccomp mode 2). On other platforms the door reports the layer it got in the consent text, but nobody has watched what it gets.
where     — lib/core/os-sandbox.js (launchCodeSandbox: the root/`nobody` path, the fallbacks, MIN_CHROMIUM_MAJOR); lib/packages/cli.js (the consent text); contract note engineering/decisions/2026-09-24-code-package-contract.md §9.
done when — test/integration/export/code-package-door.test.js has been run on macOS and on Windows (non-root Linux: done 2026-09-28, contract note §9), and for each the reported layer (on/off, and why) is recorded in contract note §9 and matches what the OS actually applied; any platform where the report is wrong is fixed.
evidence  — the test output and the consent text from each machine, pasted into the PR; on Linux, /proc/<renderer>/status Seccomp as the ground truth.
verify    — tier 1 checker: it is a claim about a security layer, but the code path already had the trio; the new facts are per-platform measurements.
```

Needs a machine this cloud session does not have: a Mac and a Windows host. Non-root Linux was measured
in a cloud session with a throwaway account (contract note §9).

**The tester runs `tools/verify-code-sandbox`** (added after #2435): from a checkout of this
repository, `./tools/verify-code-sandbox.sh` on Linux or macOS, `tools\verify-code-sandbox.cmd` on
Windows. It walks them through eight steps (install, refuse, approve, a control, the approved render
with a network log, the OS layer measured independently of Lattice, and the automated door test),
checks each result itself, asks them to confirm, and writes `code-sandbox-report-<os>-<time>.md`.
That report is the evidence above; paste it into the PR. The owner has no Mac, so macOS waits on a
tester who has one; Windows comes later.

**First runner results (2026-09-28, PR #2459, `--non-interactive` on GitHub runners):**
- macOS (`macos-latest`): steps 1–7 pass. Lattice reports "on by the platform's default, not
  measured", and no renderer runs with `--no-sandbox`. The Activity Monitor half needs a person.
- Ubuntu 24.04 (`ubuntu-latest`, non-root): AppArmor stops Chrome's sandbox from starting for an
  ordinary user (`kernel.apparmor_restrict_unprivileged_userns`), so Lattice falls back and
  reports OFF. That report is true, but the consent text's remedy ("set CHROME_PATH to a
  Chromium the unprivileged user can run") is the wrong advice there: the fix is an AppArmor
  profile for the browser or that sysctl. Fix the remedy text for this case.
- Windows (`windows-latest`): after the launchers build only `tools/build-css.js` (the full build
  fails on Windows, `followups.d/2459-p2-windows-prepare-skips-the-build.md`), all eight steps
  pass (run 36443137686). Lattice reports "on by the platform's default, not measured"; 3
  renderers, none with `--no-sandbox`. Process Explorer's integrity level needs a person.
- macOS, rerun (runs 36438111974 and 36443137686): all eight steps pass, door test 6 of 6.

What remains for this card is the human half only: a person on a Mac reads Activity Monitor's
Sandbox column, and a person on Windows reads Process Explorer's integrity level, both through
the tool's step 7.
