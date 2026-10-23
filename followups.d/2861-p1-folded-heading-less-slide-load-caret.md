---
origin: 2861
priority: P1
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2861
---

# Compose: a folded slide with no heading puts the load caret in hidden text

When a deck loads with a folded slide that has no heading, the starting caret can land in that slide's hidden paragraph, so the first keystrokes edit text the author cannot see. It predates #2861 (the new `startSelection` helper avoids notes, not folded text) and sits off the path of the notes work. Fix: have `startSelection` skip folded slides.


done when — loading a deck whose first slide is folded and has no heading puts the caret outside the hidden text; a unit test in `ComposeView.sync.test.tsx` pins it.
