---
origin: 2997
priority: P3
recorded: 2026-11-02
area: chart
severity: low
swimlane: lib/core/render-ids.js (the anti-squat probe)
deferred: off-path — found by the slide-facts design review; #2997 changes no id and touches neither file's logic
source: https://github.com/Laticent/lattice/pull/2997
---

# Add `risk-band` to the render-id anti-squat families

why now   — risk-matrix mints `risk-band-…` ids through `nextRenderSeq`, but the anti-squat probe's `FAMILIES`
            pattern does not list `risk-band`, so a deck that writes only `risk-band-1` in its own HTML gets no
            prefix and its ids can be squatted
where     — lib/core/render-ids.js `FAMILIES`; lib/plugins/chart-family/kinds/risk-matrix/risk-matrix.transform.js:126
done when — `risk-band` is in `FAMILIES`, with a test that a deck mentioning only `risk-band-1` gets the prefix
evidence  — the test, failing before and passing after
verify    — node --test test/unit/core/render-ids*.test.js
