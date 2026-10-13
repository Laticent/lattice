---
origin: 2650
priority: P2
recorded: 2026-10-13
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2650#issuecomment-6142132263
---

# Run the inline e2e specs on a real iPhone

why now   — #2650 changed the inline-code dispatcher on both render paths. It was driven in
            Chromium, Firefox and WebKit on Linux, and never on iOS Safari or ARM, which HARD
            RULE #23 makes UNVERIFIED rather than tested. This needs the owner's device; a cloud
            session cannot reach one.
where     — docs/e2e/inline-pill-grammar.spec.ts, inline-grammar-marp-mirror.spec.ts,
            inline-code-register.spec.ts and plugins-tab.spec.ts. The webkit projects in
            docs/playwright.config.ts only run specs tagged @webkit-*, so a scratch config with
            no `grep` runs these four.
done when — the four specs pass on the device, or the PR says UNVERIFIED and moves on.
evidence  — the run output or screenshots from the device.
verify    — tier 0 gates: no code change is expected, and a failure becomes its own item.
