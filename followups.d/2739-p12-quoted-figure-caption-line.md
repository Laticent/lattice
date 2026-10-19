---
origin: 2739
priority: P12
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.9
source: https://github.com/Laticent/lattice/pull/2776
---

# A line right after a baked Mermaid figure in a quote or list item is swallowed into the figure's HTML block

why now   — the P5 checker found it: `> ```mermaid … ```` followed by `> Caption **bold**` on the next line. The bake splices an HTML block over the fence, and markdown-it ends a type-6/7 HTML block only at a blank line, so the caption joins the block and shows `**bold**` as literal text; the Studio renders it as a paragraph. The flat bake (a top-level fence followed by a line with no blank between) does the same today, so this predates #2776 and the nested shapes only add cases.
where     — the splice in lib/plugins/mermaid/mermaid.bake.js `bakeSource` (end of the loop) and `reprefix` in lib/plugins/mermaid/shared/nested-fences.js: end the replacement with a blank line (prefixed for a quote) when the next source line is not blank.
done when — a deck with a caption line directly after a fence (flat, quoted and list-nested) renders the caption as markdown in the CLI's PDF, as the Studio does.
evidence  — the CLI PDF page of such a deck before and after.
verify    — tier 1 checker; CLI PDF bytes change for decks with that shape, so it stops for the owner's export sign-off.
