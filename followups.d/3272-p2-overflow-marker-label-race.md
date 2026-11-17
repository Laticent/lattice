---
origin: 3272
priority: P2
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/gotchas/export.md
deferred: off-path — found while proving PR 3272's export bytes unchanged; the export path is not touched by that PR, and the race is on main
source: https://github.com/Laticent/lattice/pull/3272
---

# A Chromium PDF export usually draws the overflow marker's pill with no "Content clipped" label

why now   — PR 3272's byte check exported one deck nine times from the Studio (Chromium, `desktop` project). Its last slide overflows, so the export draws the reader marker, a pill labeled "Content clipped" (`lib/runtime/index.js` near the reader-tab note). In eight exports, the pill came out as a blank dark pill with no words: `main` ×1, one branch build ×1, the final build ×6. In one export from the final build, it carried its label. The same build gave both results, so this is a race, most likely between the label's face (JetBrains Mono) loading and the slide's capture. Its usual outcome ships a marker that says nothing.
where     — the Studio PDF lane (`docs/src/components/studio/export/deck-export.js`, `createCaptureFrame` → `sectionsOf` → `shootSection`), and how the runtime draws the marker label (`lib/runtime/index.js`, `resolve-overflow-marker`). Whether the label's face is in the export's font sheet and waited for before the shot is the first thing to check.
done when — every Chromium PDF export of an overflowing slide draws the label, in 20 exports out of 20, and a test asserts on the label (not on time).
evidence  — PR 3272 Caveats. Pictures: the slide's 2560×1440 JPEG differs only in a 258×49 px strip at the bottom centre. A blank pill is 114,524 B, a labeled one 118,225 B. WebKit exports of the same deck matched each other.
verify    — export the deck from PR 3272's byte check (finish `atrium`, last slide `## A second photo` + `![Wide](sample:photo-wide.svg)`) as a PDF from the Studio on `desktop`, `--repeat-each=10`, and look at the last page's bottom centre.
