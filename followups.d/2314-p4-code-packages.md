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
