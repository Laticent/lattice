---
origin: 2749
priority: P2
recorded: 2026-10-18
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# The package and plugin stylesheet gate passes an address held in a custom property.

Found by the red team on the canary harness (2026-10-18). The markup channel is fixed in the
same PR (`cssRefTargets` in `lib/core/door-attr.mjs` now lists an address-shaped string in a custom
property when the CSS reads a variable). The stylesheet channel (`gateCss`, `lib/layout/gate.js`) is
a separate code path that was not changed.

why now   — `section.p{--q:"https://x/y";background-image:image-set(var(--q) 1x)}` passes `gateCss`
            with zero findings and Chromium fetched the address in an online page. HARD RULE #22
            names stylesheets as their own channel. v1 npm plugins send no stylesheet, so no door
            reaches this today; a zip plugin's `styles` does.
where     — lib/layout/gate.js (`gateCss`); the zip-plugin `styles` path in lib/packages/read.js.
done when — `gateCss` reports the example above as a finding, with a unit test that fails without the
            change, and the canary harness gains a stylesheet attempt that goes red without it.
evidence  — the unit test red then green; the harness run.
verify    — tier 1 checker, because it changes what a gate accepts.
