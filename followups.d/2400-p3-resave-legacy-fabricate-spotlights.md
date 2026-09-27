---
origin: 2400
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2400
---

# Fabricate spotlight finishes saved before #2400 still download with a hard edge

```text
  P3 · [no ticket] regenerate a saved Fabricate finish's CSS from its recipe on load.
       why now   — #2400 stopped generateFinishCss from flipping a baked spotlight to its hard
                   mirror in the Studio download rule, but a finish saved earlier stores its
                   old generated CSS, so its Studio download keeps the solid-edged window until
                   someone re-saves it. The stylesheet cannot override the stored rule.
       where     — docs/src/components/studio/finish-generate.ts and wherever a saved finish's
                   CSS is loaded into a deck; lib/finishes/finish-generate.js generateFinishCss.
       done when — opening a deck with an old saved spotlight finish downloads a soft edge
                   without a manual re-save, or the Studio prompts a one-click regenerate.
       evidence  — a Studio PDF download of a deck carrying pre-#2400 generated spotlight CSS.
       verify    — tier 0 gates, because it is a load-time regeneration with a narrow reach.
```
