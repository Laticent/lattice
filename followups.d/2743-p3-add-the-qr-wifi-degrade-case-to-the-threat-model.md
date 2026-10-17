---
origin: 2743
priority: P3
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: docs
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §3
---

# Add the inline @qr Wi-Fi password case to the npm threat model.

why now   — the video/image plugins session found that an inline @qr{...} record leaves its typed
            text on the slide when its plugin is off, so a Wi-Fi record would print its password.
            It is a degradation leak that neither the gate nor the harness would catch.
where     — the note's §3, as a sixth gap; tracked as QR slice 2 on PR #2727 (degradesTo).
done when — the note names the case, says which check cannot see it, and links the fix.
evidence  — the edited note and `node tools/build-decisions-index.js --check`.
verify    — tier 0 gates, a docs-only edit.
