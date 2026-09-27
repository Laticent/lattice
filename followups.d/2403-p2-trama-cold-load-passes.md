---
origin: 2403
priority: P2
recorded: 2026-09-27
---

# Trama: draw a page once, in its own fonts, instead of three times

why now   — On a cold page load every graph chart is laid out in three passes, and the
            first two are measured in fallback fonts, so their work is thrown away. Measured
            in Chromium on 74fdd0c, 8 loads each, 7 flowcharts per deck:
              - the typing deck (a 14-shape chart plus six more): 32 layouts and 21 paints,
                721 ms of layout, last chart drawn ~1,100 ms after navigation;
              - the same page with the pass started on `document.fonts.ready`: 13 layouts,
                7 paints, 401 ms of layout, last chart drawn ~650 ms after navigation;
              - the demo deck: 466 ms → 237 ms of layout, ~810 → ~470 ms to the last chart.
            A CLI export of the typing deck takes 2.64 s against 1.61 s for the same text
            without flowcharts, so most of that 1 s is this. The Studio is not affected:
            the live worker and the per-position fit memory already skip the extra passes
            (13–27 ms from the last key to a drawn chart).
where     — docs/src/lib/trama/pipeline.ts: the tail of `installGraphPass` (a draw at
            install, on DOMContentLoaded and on `fonts.ready`) and the fit/type-floor loop
            in `draw` (up to 3 full layouts per chart, each a cache miss, because every
            round changes the measured sizes).
done when — On a cold load no chart is laid out while `document.fonts.status` is
            `loading` (the harness tiles show meanwhile, and a font that never loads still
            gets a draw within a deadline). The fixed point starts from a better guess on
            the first draw of a chart, and the extra rounds are counted in the bench's
            flowchart tier. Output is byte-identical once fonts have loaded.
evidence  — The instrumented-page timing (scratch harness: swap the page's bootstrap for
            one that times every adapter and kernel call) before and after, and the CLI
            export wall time of the typing deck, same machine.
verify    — tier 1 checker, because it changes when the shared pipeline draws on every
            surface, and a font that never loads must not strand a chart.
