---
origin: 3159
priority: P4
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §4
deferred: off-path — the export capture and player prune frames, on the export path
source: https://github.com/Laticent/lattice/pull/3159
---

# Offline Firefox export: the capture and prune frames append empty, then write

why now   — by #3159's measurement such a frame is not a worker client on Firefox, so an offline export there would miss its runtime and fonts
where     — docs/src/components/studio/export/deck-export.js createCaptureFrame; docs/src/components/studio/player-prune-browser.ts
done when — both write through writeSrcdoc (set srcdoc, then append); an offline Firefox export renders the same as online; export sign-off in dark and light
evidence  — none yet: not measured end to end
verify    — an offline gecko export of a deck with a diagram
