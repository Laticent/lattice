---
origin: 2789
priority: P2
recorded: 2026-10-21
area: engine
severity: medium
swimlane: lib/transformers/masthead-lift.js
source: owner's review of the P3 sign-off render of examples/panes-sketch.md, 2026-10-21
---

# Each pane in a `_pane` slide draws its own page number ("1") at its bottom left

why now   — on `examples/panes-sketch.md` slides 2, 4 and 5, every `<lat-pane>` carries a `.cell-footer` holding `<span class="lat-pagination">1</span>`, so a stray "1" prints under each pane beside the real slide number. It is not from the P3 PDF change: the same "1"s are in the pre-fix PDF and in Chrome's own print (`--chrome-pdf`). Likely cause: masthead-lift.js (~line 130) adds a `.lat-pagination` span to any paginated frame without one, and a pane carries the `form` frame class, so it counts as one.
where     — lib/transformers/masthead-lift.js (skip a `lat-pane` host), then check `lib/core/panes.js` and the pane CSS for anything that relies on the footer.
done when — a `_pane` slide has one page number, the slide's, and the pane footers carry no number.
evidence  — the writer-independent HTML of `panes-sketch.md` before and after, plus the rendered slide 2 in light and dark.
verify    — tier 1 checker; per-feature demo deck (HARD RULE #9) since it changes a slide a human sees.
