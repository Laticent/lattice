---
origin: 2411
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2411
---

# Verify the CLI's OS sandbox for code packages on macOS, Windows and non-root Linux

```text
why now   — it is the one gap holding #2411 at "high" rather than "very high". The CLI's code-package door has two walls: the Worker with its network constructors removed under the frame's no-network policy (verified on every platform the tests run on), and the OS sandbox under Chromium's renderer. The second is verified only as root on Linux with Chromium 141 (the renderer runs as `nobody`, seccomp mode 2). On other platforms the door reports the layer it got in the consent text, but nobody has watched what it gets.
where     — lib/core/os-sandbox.js (launchCodeSandbox: the root/`nobody` path, the fallbacks, MIN_CHROMIUM_MAJOR); lib/packages/cli.js (the consent text); contract note engineering/decisions/2026-09-24-code-package-contract.md §9.
done when — test/integration/export/code-package-door.test.js has been run on macOS, on Windows and as a non-root Linux user, and for each the reported layer (on/off, and why) is recorded in contract note §9 and matches what the OS actually applied; any platform where the report is wrong is fixed.
evidence  — the test output and the consent text from each machine, pasted into the PR; on Linux, /proc/<renderer>/status Seccomp as the ground truth.
verify    — tier 1 checker: it is a claim about a security layer, but the code path already had the trio; the new facts are per-platform measurements.
```

Needs a machine this cloud session does not have: a Mac, a Windows host, and a Linux login that is not root.
