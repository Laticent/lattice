---
origin: 3145
priority: P1
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md
deferred: large — a product bug in how the open object editor tracks its target, found by an e2e; it needs its own trace and fix, not a test change
source: https://github.com/Laticent/lattice/pull/3145
---

# A pick in Compose's object editor can write to the NEXT object on the line

why now   — `docs/e2e/compose-spark-phone.spec.ts:25` ("the sheet and the two-row bar hold at 390px, dark") taps the spark
            in `Revenue \`~{12 14 13 17 21, bar, c3}\` and \`{SHIPPED, c2}\`.`, the sheet opens, the spark is the selected
            node (the attached screenshot shows its outline), and a "Size: Large" pick writes `lg` to the SHIPPED pill
            instead: `{SHIPPED, c2, lg}`. 1 of 36 runs on desktop, alone (`--repeat-each=12`). An author on a slow
            phone would change the wrong word.
where     — docs/src/components/studio/InlineObjectEditor.tsx (`onEdit` reads `openRef.current.pos`, set on render),
            docs/src/lib/compose/inline-objects.ts (`editObject` accepts any object node at that position; the plugin
            maps `open.pos` with `tr.mapping.map(pos, 1)`).
done when — a pick only ever edits the node its editor opened on: `editObject` refuses a node whose source is not the
            open one (`open.src`), and the race that moves the position is found and fixed; the spec passes 48 of 48.
evidence  — the spec's failure diff (`{SHIPPED, c2, lg}`) and its `sheet-dark.png` attachment.
verify    — tier 1 checker, plus a unit test that moves the doc between open and pick.
