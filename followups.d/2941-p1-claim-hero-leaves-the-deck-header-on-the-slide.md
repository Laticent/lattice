---
origin: 2941
priority: P1
recorded: 2026-10-28
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-26-playground-anti-pattern-slide.md
source: https://github.com/Laticent/lattice/pull/2941
---

# claim-hero drops the bands but leaves a deck-level header over the heading

why now   — #2941 hid it with `_header: ''` on the generated anti-pattern slides, so any hand-written slide that sets `claim-hero` in a deck with a `header:` still prints the header over its heading.
where     — `lib/base/base.modifiers.css` (the claim dial) and wherever the running header is emitted; `examples/claim.md` has no deck header, which is why it never showed.
done when — a slide with `claim-hero` in a deck that sets `header:` renders no header text over the heading, with a render test, and the `_header: ''` in `tools/build-component-docs.js` can go.
evidence  — the golden-diff "after" panel of #2941 at `4ec43b6` (topic slide 5): "LATTICE · TOPIC" printed over "When NOT to reach for topic."
verify    — export-bytes change: render a deck with a header and claim-hero in light and dark and show the owner.
