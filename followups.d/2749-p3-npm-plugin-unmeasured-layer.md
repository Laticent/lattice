---
origin: 2749
priority: P3
recorded: 2026-10-19
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.5
---

# Decide whether an npm plugin runs where the OS layer is `unmeasured` on macOS and Windows.

why now   — the loader shipped (§5.5), so npm plugins can now reach a Mac or a Windows machine. Decision 7
            says a failed probe counts as OFF; on those platforms no probe exists, and today they are admitted
            because Chromium's sandbox is on there by default.
where     — lib/core/os-sandbox.js `npmLayerRefusal` (one line); its unit test.
done when — the owner chooses: keep admitting `unmeasured` off Linux (today), refuse it, or measure the layer
            on those platforms first (Seatbelt on macOS, the renderer's integrity level on Windows).
evidence  — the owner's answer.
verify    — the unit test for the chosen rule, red then green.
