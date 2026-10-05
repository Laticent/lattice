---
origin: 2512
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2512
---

# Graduate hub-spoke into the long-running gallery

why now   — hub-spoke shipped in #2396 with its own demo deck and component gallery, but HARD RULE #8 graduates a layout into `test/integration/baseline-decks/gallery.md` in a separate post-review commit, and it has not happened. Carried from #2396's continuation brief (its P2), which never filed it.
where     — `test/integration/baseline-decks/gallery.md` (add hub-spoke slides: flat, sized, a flow class, tiered); the page-count assertions in `test/integration/`; `engineering/workflow.md` §the six galleries for the convention.
done when — the gallery carries hub-spoke slides, its page-count assertions are updated in the same commit, and `npm run test:integration` is green.
evidence  — the integration page-count diff, and the rendered gallery PDF sent for a look.
verify    — tier 0 gates: a content-only change to a baseline deck, no engine code.
