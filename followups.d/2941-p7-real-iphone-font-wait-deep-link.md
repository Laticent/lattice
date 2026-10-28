---
origin: 2941
priority: P7
recorded: 2026-10-28
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
source: https://github.com/Laticent/lattice/pull/2951
---

# Open the flowchart and state-chart deep links on a real iPhone

```text
  P7 · [no ticket] run the #2951 font-wait fix on iOS Safari
       why now   — #2951 stopped the Playground hanging in WebKit on `?c=state-chart&view=read&s=anti-patterns`
                   and `c=flowchart`. It was verified on Playwright's WebKit (WPE) with the iPhone 15 Pro
                   profile, never on a real iPhone. The cause (WebKit returns an already-settled
                   `document.fonts.ready` while a face loads) was shown on that build only.
       where     — docs/src/lib/trama/pipeline.ts `waitForFonts`; the deep links above on the deployed site.
       done when — both links load and stay responsive on a real iPhone, or a fresh hang is filed with its cause.
       evidence  — a screenshot from the device of the anti-patterns slide, and the iOS version.
       verify    — tier 0 gates, because it only reads the site; a fix would be tier 1 (shared Trama kernel).
```
