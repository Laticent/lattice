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

# A Studio PDF export usually draws the overflow marker's pill with no "Content clipped" label

why now   — PR 3272's byte check exported one deck from the Studio nine times on Chromium (`desktop`) and three times on WebKit (`webkit-phone`). Its last slide overflows, so the export draws the reader marker, a pill labeled "Content clipped" (`lib/runtime/index.js` near the reader-tab note). Eight of the Chromium exports and all three WebKit ones drew a blank dark pill with no words: on Chromium, `main` ×1, one branch build ×1 and the final build ×6. One Chromium export from the final build carried its label. The same build gave both results, so this is a race, most likely between the label's face (JetBrains Mono) loading and the slide's capture. Its usual outcome ships a marker that says nothing.
where     — the Studio PDF lane (`docs/src/components/studio/export/deck-export.js`, `createCaptureFrame` → `sectionsOf` → `shootSection`), and how the runtime draws the marker label (`lib/runtime/index.js`, `resolve-overflow-marker`). Whether the label's face is in the export's font sheet and waited for before the shot is the first thing to check.
done when — every Chromium and WebKit PDF export of an overflowing slide draws the label, in 20 exports out of 20, and a test asserts on the label (not on time).
evidence  — PR 3272 Caveats, and the folder beside this file (the spec, the commits, the counts). How often: Chromium drew the label in 1 export of 7 from one build (`c9bfb6a`) and in 0 of 2 others, `main` (`f2a6dd7`) among them, so `main` is affected. WebKit drew it in 0 of 3. The slide's 2560×1440 JPEG differs only in a 258×49 px strip at the bottom centre; a blank pill is 114,524 B, a labeled one 118,225 B.
verify    — `cp followups.d/3272-p2-overflow-marker-label-race/overflow-marker-race.spec.ts docs/e2e/ && cd docs && BYTES_OUT=/tmp/omr npx playwright test e2e/overflow-marker-race.spec.ts --project=desktop --project=webkit-phone --repeat-each=10 --workers=2 --trace off`, then read the last page's bottom centre in each PDF (the folder's README says how); every one must carry the label.
