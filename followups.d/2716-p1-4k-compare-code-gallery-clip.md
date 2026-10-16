---
origin: 2716
priority: P1
recorded: 2026-10-16
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §11
source: https://github.com/Laticent/lattice/pull/2716
---

# Two galleries ship a compare-code line one column past the 4K pane

why now   — `code-line-clipped` names it on both: a 48-column line in a `compare-code` pane at `size: 4K`, where the pane fits 47 (measured, lib/authoring/code-pane-columns.js), so its last character is cut in the rendered gallery. Pre-existing; not fixed in #2716 because HARD RULE #8 keeps feature PRs out of the long-running galleries.
where     — examples/gallery-jargon.md slide 45 and test/integration/baseline-decks/gallery.md slide 34 (`npm run lint:deck -- <file>` names the line).
done when — both lines fit 47 columns, or the slides move to a full-width `code` pane; `lint:deck:all` reports no `code-line-clipped` on either.
evidence  — the rendered 4K page before and after, showing the last character.
verify    — tier 0 gates: a content edit in a gallery, in its own graduation-style commit.
