---
origin: 3362
priority: P3
recorded: 2026-11-28
area: engine
severity: low
deferred: off-path — older than 3362 (same result at 893ade752) and identical on the engine and Marp, and the fix is a choice of contract the owner makes: draw both, or warn
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# A note followed by a `_Source:_` line draws neither, and `lint:deck` says nothing

```text
  P3 · [no ticket] decide whether a slide can close with a note AND a source line
       why now   — measured 2026-11-28 on the engine and in a real VS Code preview: after a
                   list, `> insight` + `Note.` draws both beats, `> insight` + `_Source: …_`
                   draws both, but `Note.` + `_Source: …_` (with or without the insight)
                   promotes neither paragraph. Both stay plain body text, on cards-grid,
                   split-panel and split-compare alike. An annotation IS a below-note
                   (lib/base/base.docs.md §Annotation), so there is one slot; the kernel
                   promotes a paragraph only right after a structural block, and the source
                   line follows the note. `lint:deck` is silent. Authors read "the coda is a
                   key insight, a note and a source line" (PR 3362's own summary) as three.
       done when — the owner picks one: the source line may follow a note (and both draw),
                   or `lint:deck` warns that only one may close the slide; docs say which.
```
