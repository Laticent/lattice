---
origin: 2800
priority: P2
recorded: 2026-10-20
source: https://github.com/Laticent/lattice/pull/2800
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md
---

# Give the export's capture browser Chromium's OS sandbox.

why now   — The owner's speed rule (2026-10-20) is one browser per export, so function-plot now draws in a
            fresh context of the capture browser rather than in the code sandbox's own browser. The capture
            browser launches with `--no-sandbox` on every platform, so plots lost the OS layer they had on
            macOS, Windows and an unprivileged Linux. Launching the capture browser itself the way
            `launchCodeSandbox` does would give that layer to plots AND to the capture page, with no extra
            browser.
where     — lattice.js `renderExport` (`launchOpts`); lib/core/os-sandbox.js `launchCodeSandbox`;
            lib/export/locked-figures.js.
risk      — As root on Linux `launchCodeSandbox` runs Chromium as `nobody`, which cannot read a deck's
            pictures or the export it writes under `/root`; and where the sandbox cannot start it tries
            again, which costs a launch. Measure both before switching: no export may get slower or lose
            a picture.
done when — the capture browser reads `on` from `rendererSandboxed` on macOS, Windows and an unprivileged
            Linux; root-in-a-container keeps working; every export is byte-identical and no slower.
