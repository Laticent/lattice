---
origin: 2314
priority: P4
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-24-code-package-contract.md
---

# Investigate what refusing a code package at OS layer OFF would break.

Decided 2026-10-17 (threat-model note §6, decision 6): keep today's behavior, and measure before
deciding again. Today's behavior: lib/core/os-sandbox.js turns Chromium's OS sandbox on where the
machine allows it; the consent text names the layer (on, on by platform default, or OFF); the
approval is pinned to the bytes and the layer; a render whose browser gives only a weaker layer
than the one approved is refused. An approval at OFF is allowed (contract note §9).

History    — the owner decided on 2026-09-26: "(c) where the CLI can arrange it, else (b)" (run the
            browser as an unprivileged user with the OS sandbox on where possible; else run with
            it off and say so). lib/core/os-sandbox.js implements it and quotes this file for it.
            Measured 2026-10-17 as root in the cloud container: a Chromium under /root reads OFF
            (renderer runs as root); a Chromium under /opt/pw-browsers reads ON (as nobody).
            Edge: if the layer probe fails at approval time, nothing is pinned and no later
            render is refused for a weak layer.
Also       — lib/packages/code-door.js:6 and lib/packages/code-bundle.js:36 cite this file for text
            it does not hold ("the doors must carry", how an installed CLI gets a bundler). Find
            where that text went, or fix the two comments.

why now   — a Chromium escape on a machine whose layer reads OFF lands with that machine's full
            reach, and the desktop app will run packages on machines nobody measured.
where     — lib/core/os-sandbox.js (launchCodeSandbox, offReason, offRemedy), lib/packages/trust.js,
            lib/packages/cli.js (the consent text), 2026-09-24-code-package-contract.md §9;
            related: followups.d/2411-p2-cli-os-sandbox-other-platforms.md (macOS and Windows).
done when — a short note lists each place packages run (CI runners, containers, root and non-root
            Linux, the Studio iframe door, macOS, Windows, the desktop app), says which read OFF
            and why, says what refusing OFF would break for each, and recommends: refuse, warn
            only (today), or refuse only above a stated risk. The owner then decides again.
evidence  — the layer reading from each environment, taken with the same measurement the contract
            note uses (the renderer's Seccomp mode in /proc on Linux), pasted into the note.
verify    — tier 1 checker for the note; tier 2 trio only if the owner chooses to refuse OFF,
            because that changes which machines can run packages at all.

Measured 2026-10-18 (partial; `launchCodeSandbox` called directly, Chromium 131, this cloud container, root, Linux): the puppeteer-cache
Chromium under `/root/.cache/puppeteer` reads **OFF** (reason `unprivileged-user-cannot-run`: `nobody` cannot execute a binary under `/root`;
the renderer runs as root); the Playwright Chromium under `/opt/pw-browsers/chromium-1194` reads **ON** (renderer runs as `nobody`). The
session's default `CHROME_PATH` is the first, so every code-package run in this container's default setup is at OFF, and the npm-plugin
admission test (`test/integration/export/npm-plugin-admission.test.js`) exercises its refusal branch here. Not measured, and still needed
for the note this item asks for: CI runners (the note expects Ubuntu 24.04 to read OFF through AppArmor), non-root Linux, macOS, Windows,
the Studio iframe door, the desktop app. What refusing OFF would break is therefore known for one environment only: here, every
default-configured code-package and plugin run; the fix there is `CHROME_PATH` pointed at a Chromium `nobody` can run.

