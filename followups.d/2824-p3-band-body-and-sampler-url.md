---
origin: 2824
priority: P3
recorded: 2026-10-21
area: imagery
severity: low
swimlane: lib/components/imagery/image/image.docs.md
source: https://github.com/Laticent/lattice/pull/2824
---

# A band body of several elements is not centered against a tall heading, and the Studio sampler reads the photo URL with its own pattern.

```text
  P3 · [followups.d/2824-p3-band-body-and-sampler-url.md]
       why now   — both are small debts #2824 named; the second is reuse (HARD RULE #15).
       where     — image.styles.css band grid (a body of two or more elements keeps the heading
                   spanning its rows); docs/src/components/studio/card-ink-sampler.ts vs
                   `firstCssUrl`, which is CommonJS, so it needs an .mjs kernel first.
       done when — the body centers against the heading, and the sampler shares one URL reader.
       evidence  — a rendered band slide with a three-paragraph body; the unit test for the reader.
       verify    — tier 0 gates, because the change is local to one component and one helper.
```
