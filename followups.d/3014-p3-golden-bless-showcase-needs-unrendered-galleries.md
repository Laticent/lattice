---
origin: 3014
priority: P3
recorded: 2026-11-03
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: off-path — the golden-bless workflow and the showcase sources; this PR's diff touches neither
source: https://github.com/Laticent/lattice/actions/runs/41598996188
---

# The nightly bless fails when the showcase reads a gallery that has no golden yet

what      — Golden bless run 41598996188 (2026-11-03, on `main@117ddbd`, the first after R3) exited 3 on
            one failed bless: `rasterize-showcase.mjs exited 1: missing source gallery:
            lib/plugins/chart-family/kinds/bar/bar.gallery.light.pdf`. The chart kinds moved into the chart
            plugin, so their galleries are new paths with no golden yet (`NO_GOLDEN`). The bless renders at most
            40 new goldens a night ("48 more golden(s) have no PDF yet"), but the showcase step reads its sources
            (`docs/scripts/showcase-sources.json`) on the same night, before the cap has reached them.
why now   — Until it is fixed, every night fails the bless while a showcase source is among the unrendered
            goldens, and the bless PR (#2987) gets no fresh verdict.
not R3    — Every deck that names no web image comes out of `blockWebImages` byte for byte, whichever scanner
            reads it: no edit, so the output is the input. R3's corpus check showed the same bytes on all 860
            texts. The run's drift (235 goldens changed, 179 pages over 1%) is outside what R3 can move.
            The 2026-11-02 run (41407437764, before R3) changed 68.
done when — the showcase step renders a missing source gallery first (or skips it and says so in the
            verdict), and a bless night passes with a showcase source among the new goldens.
evidence  — the run's verdict (exit 3, the "Problems" line) and a later night's verdict passing.
verify    — tier 0: it reads runs and changes a nightly script.
