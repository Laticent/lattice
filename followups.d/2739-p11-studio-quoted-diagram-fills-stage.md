---
origin: 2739
priority: P11
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2739
---

# A Mermaid diagram inside a blockquote or a list item can be flagged as overflowing in the Studio's export, but never in the CLI's file

why now   — found while giving the CLI the nested-fence shapes (p7). For a quoted fence (`# Title`, a paragraph, `> ```mermaid …```, two more paragraphs) the Studio's live runtime draws the diagram in a box that takes the stage's remaining height, pushes the paragraphs out, and stamps `clip-marked` and `overflow`; the CLI bakes it at natural size and the slide fits. For a list-nested fence (`examples/mermaid-nested-fences.md`, slide 2) the Studio's export flags the slide on some runs and not on others: 1 pass, 2 fails in 3 runs of the parity spec. Either way the exported player's CSS keeps the overflow-tab rules the CLI's file prunes, so the two files part ways at the first stylesheet byte. The host-parity spec therefore carries neither shape; `test/integration/mermaid/mermaid-nested-fences.test.js` holds both on the CLI side.
where     — the runtime's diagram sizing for a figure whose parent is a `blockquote` (lib/runtime, lib/plugins/mermaid/mermaid.styles.css), against `bakedFigureOpenTag` in lib/plugins/mermaid/shared/baked-figure-tag.js (what the CLI ships).
done when — a deck with a quoted fence and one with a list-nested fence fit in the Studio's export on every run, and `docs/e2e/player-host-parity.spec.ts` carries `examples/mermaid-nested-fences.md` and a quoted-fence deck and passes byte for byte on five runs in a row.
evidence  — the Studio preview of the repro deck before and after (no "OVERFLOWS" tab), and the parity spec green on it.
verify    — tier 1 checker; the Studio's drawn size of a quoted diagram changes.
