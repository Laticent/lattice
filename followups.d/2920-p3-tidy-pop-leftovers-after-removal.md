---
origin: 2920
priority: P3
recorded: 2026-10-27
area: docs
severity: low
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §5
source: https://github.com/Laticent/lattice/pull/2920
---

# Tidy what the pop removal left behind

```text
  P3 · [no ticket] tidy what the pop removal left behind
       why now   — pop is gone, but the vetrina delivery note still maps its lift expression to _focusStyle: pop, the token names --focus-pop and --focus-pop-shadow now belong to blur, and the examples/focus.md row slide title wraps to two lines.
       where     — engineering/decisions/2026-09-25-vetrina-delivery-presets.md lines 66 and 154; lib/base/base.focus.css (the --focus-pop tokens); examples/focus.md slide 9 heading.
       done when — the note names a value that exists, the tokens say what they do (or are renamed with the CSS and docs together), and the slide title fits on one line.
       evidence  — a render of examples/focus.md slide 9 with a one-line title.
       verify    — tier 0 gates, because it is wording and a token rename inside one component.
```
