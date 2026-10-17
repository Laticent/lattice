---
origin: 2314
priority: P4
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: engine
severity: medium
swimlane: engineering/decisions/2026-09-24-code-package-contract.md
---

# Decide whether code packages must refuse to run without an OS-level sandbox.

Recreated 2026-10-17. lib/core/code-sandbox.js and the code-package contract both cite this
file, and it was never committed, so the question had no live record.

why now   — the CLI launches Chromium with --no-sandbox, so both walls are browser policy over a
            renderer a Chromium exploit could escape. The code door's header says so under
            "NOT CLAIMED HERE" and leaves the decision to the owner.
where     — lib/core/code-sandbox.js header; the contract note's section on the two walls.
done when — the owner decides: require the OS sandbox and refuse to run without it, or accept the
            current posture in writing; the code header cites that decision.
evidence  — the owner's recorded decision, plus a run of code-sandbox-network.test.js if the
            posture changes.
verify    — tier 2 adversarial trio if the answer is to require it, because it changes which
            machines can run packages at all.
