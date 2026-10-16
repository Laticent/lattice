---
origin: 2704
priority: P4
recorded: 2026-10-15
area: website
severity: low
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §11
source: https://github.com/Laticent/lattice/pull/2704
---

# The Playground keeps its own slide scanner instead of the deck outliner

why now   — a second implementation of which-slide-is-this, the class of drift this PR removed from the Studio.
where     — docs/src/playground/ caret → slide mapping.
done when — the Playground reads the deck outliner through a hub, and its scanner is deleted.
evidence  — a Playground caret test on a heading-split deck.
verify    — unit + a docs-site screenshot at three widths.
