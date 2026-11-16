---
origin: 3239
priority: P4
recorded: 2026-11-16
area: website
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — the slide strip's class label is its own reader; #3239 changed the photo readers and Compose's badge, and left the strip as it was on main
source: https://github.com/Laticent/lattice/pull/3239
---

# The slide strip labels a later heading part by the wrong class

why now   — On a `split: headings` deck whose first part carries a running `<!-- class: image -->`, the engine draws both
            parts as `image` slides, but the strip under the Studio preview labels the second part `text`. Seen while
            screenshotting #3239 at 820px (the strip reads `1 image`, `2 text`); the preview itself is right.
where     — the strip's per-slide class label (the component that renders the `N <layout>` chips under the preview); what
            it should read is the engine's per-part class, as lib/core/slide-class-spans.js resolves it.
done when — the strip names each heading part by the class the engine resolves for it, carried classes included.
evidence  — a docs unit or e2e case on a split deck with a carried class, red today, green after.
verify    — self-review with the gates; screenshots at 1440, 820 and 390.
