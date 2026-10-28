---
origin: 2941
priority: P5
recorded: 2026-10-28
area: infra
severity: low
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2941
---

# The overflow baseline was blessed over 428 decks, and 480 are swept

why now   — decks added after the last bless read as clean until someone sweeps; #2941's sweep found three (`examples/panes.md`, `panes-sketch.md`, `styles-device-check.md`) that were not in the baseline.
where     — `test/integration/overflow-baseline.json` (`decksSwept`), `tools/check-overflow-corpus.js --bless`.
done when — the baseline records `decksSwept: 480` or more and the waterfall and styles-device-check pages are either fixed or listed with a reason.
evidence  — `node tools/check-overflow-corpus.js --jobs 4` on #2941's head: 480 swept, baseline 428.
verify    — `npm run overflow:check` exits 0.
