---
origin: 2824
priority: P1
recorded: 2026-10-21
area: engine
severity: medium
swimlane: lib/components/imagery/image/image.docs.md
source: https://github.com/Laticent/lattice/pull/2824
---

# A `![bg](data:image/svg+xml;base64,…)` line renders as literal text on the slide, not as a photo.

Found while fixing the pale-photo e2e on #2824. `origin/main` does the same, so #2824 did not cause it. A `data:image/png;base64,…` line works.

```text
  P1 · [followups.d/2824-p1-base64-svg-bg-line-renders-as-text.md]
       why now   — an author who pastes an SVG data URI gets the markdown as card text and an
                   overflow warning, with no diagnostic naming the cause.
       where     — the `![bg]` lifter (lib/core/bg-directive.js BG_RE) and the declaration
                   sink (`realDeclValueIsSafe`, lib/engine/slides.js); render
                   `![bg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)` with `node dist/lattice.js`.
       done when — the SVG data URI becomes the slide's photo, or lint says why it cannot.
       evidence  — the rendered HTML (`data-img-composition`, no literal `![bg]`) and a unit test.
       verify    — tier 1 checker, because it touches the engine's declaration sink (#22 area).
```
