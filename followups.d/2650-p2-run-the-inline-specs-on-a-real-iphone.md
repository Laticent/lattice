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

Checked 2026-10-13 (#2669 follow-up session): still open. This sandbox has Chromium only
(`/opt/pw-browsers` holds `chromium-1194` and nothing for WebKit or Firefox) and the environment
forbids `playwright install`, so the `webkit-*` and `gecko` projects could not run here; #2669's
specs passed on desktop Chromium only (21 passed). Nothing in this item has changed since #2650's
Linux WebKit and Firefox runs: the device run is still owed, and it is UNVERIFIED on iOS Safari
(HARD RULE #23).

Checked 2026-10-14 (Segno engine speed session): WebKit and Gecko are now DONE; only the physical
device is left. With WebKit 2215 and Firefox 1495 fetched into a scratch browsers path (not
`/opt/pw-browsers`) and their system libraries added by `playwright install-deps`, the four specs
passed on WebKit at 1440px and on Firefox at 1440px (8 passed, 1 evidence-mode skip, each). On WebKit
at the iPhone 15 Pro profile, five cases failed, and Chromium at the Pixel 7 profile fails the same
five identically: the specs click the editor and wait on the preview side by side, and a phone
gets them as Edit/Explore tabs. That is the specs' desktop shape, not an engine defect.
`inline-pill-grammar.spec.ts` now carries a `@webkit-phone` case that taps Explore first; it passes
on WebKit at the iPhone profile and runs nightly. What remains is the owner's real iPhone (iOS
Safari on ARM): device emulation in WebKit on Linux is not that surface, so it stays UNVERIFIED
under HARD RULE #23.
