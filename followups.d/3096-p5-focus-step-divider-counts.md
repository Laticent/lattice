---
origin: 3096
priority: P5
recorded: 2026-11-09
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-08-dynamic-components.md §The measurement
deferred: blocked — the owner picks the route first (D3 in the note: patch four counts, or build the shared counter)
source: https://github.com/Laticent/lattice/pull/3096#issuecomment-6730760918
---

# A divider with focus steps counts as several sections

why now   — `_focusSteps: item 1 | item 2` on a divider expands it into copies that carry nothing saying they are one
            slide. In a two-section deck the marker reads 1/3, 2/3, 3/3, the numerals read 01-03, the rail draws three
            dots and the next topic's eyebrow reads 03. The agenda lists two sections and drops its page numbers.
where     — lib/integrations/markdown-it/plugins.js (the focus-steps expander must stamp its copies, as a heading split
            stamps data-split-run), then the four counts: progress.transform.js (marker and rail), section-index.js
            (numeral) and topic-track.js (eyebrow), each on both render paths. Or one shared counter, per D3.
done when — every mark counts an expanded copy once; the agenda keeps its page numbers (the first copy's page).
evidence  — fixture focus-divider in the #3096 measurement comment.
verify    — the fixture renders 1/2 and 2/2 with matching numeral, rail and eyebrow on both arms; a demo deck (#9).
