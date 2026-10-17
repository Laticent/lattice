---
origin: 2744
priority: P2
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §8
source: https://github.com/Laticent/lattice/pull/2744#issuecomment-6229753016
---

# Mosaico slice 2: range items and the template strategy, first user the columns / rows panes

why now   — the next build-order slice; unblocks panes that size themselves
where     — decision note §4.1 (join closure) and §8 item 2; docs/src/lib/mosaico/
done when — a property test of the join closure; panes render through template with a demo deck
            (HARD RULE #9); pane slides unchanged except where the deck says otherwise
evidence  — rendered PDFs of the demo deck, light and dark, via SendUserFile; before/after renders of
            every committed pane deck
verify    — tier 2 adversarial trio, because it is a new kernel that changes every pane slide
