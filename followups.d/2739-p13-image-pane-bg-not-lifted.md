---
origin: 2739
priority: P13
recorded: 2026-10-19
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.6
source: https://github.com/Laticent/lattice/pull/2776
---

# An `image` pane's `![bg]` is never lifted to its panel, even where the pane renders as its own `image` slide

why now   — the fourth checker on #2776's bg-lift rewrite found it, and it is older than that PR: 77e4c99 and `main` behave the same. A panes slide (`<!-- _pane: image -->` …) on a deck the engine splits by pane (a 9:16 deck, or panes that do not fit side by side) renders the image pane as an ordinary slide with class `image`, but the deck-level lift sees the panes slide's own class and the pane render (`renderPane`) never runs for a split page, so the picture lands as a full-bleed section background with the text on top.
where     — lib/core/bg-image.js `liftImageBgImages` calls `slideClassSpans(full, { panes: false })`; the default (`panes` on) already returns the split pages with their pane classes, so the change is likely that one option, plus a check that the carved (unsplit) case still lifts only inside `renderPane`.
done when — a 9:16 deck with an image pane draws the half-canvas panel on the image page, and a 16:9 deck with the same panes is byte-identical to today.
evidence  — the CLI PDF page of both decks before and after.
verify    — tier 1 checker; export bytes change for decks with that shape, so it stops for the owner's export sign-off.
