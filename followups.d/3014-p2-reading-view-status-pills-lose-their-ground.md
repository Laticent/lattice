---
origin: 3014
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: off-path — the Reading view's article CSS and the chart plugin's status-pill styles; this PR's diff touches neither
source: https://github.com/Laticent/lattice/actions/runs/41634671212
---

# The Reading view drops the status pills' ground on chart slides

what      — `docs/e2e/studio-read-article-charts.spec.ts:53` ("every chart in the Reading view keeps its
            paint", light and dark, Chromium) went red in Studio E2E nightly run 41634671212
            (2026-11-03, `main@3555b79`, the first after R3). It passed in run 41448008525
            (`main@379917f`). It reproduces locally on this PR's head: `progress marks-pigment marks-muted:
            5 of 5 status pills lost their ground`, so a `.chart-status` pill computes
            `background-image: none` in the Reading view.
not R3    — R3 changed only the scanner behind `blockWebImages`, and `article-projection.ts` runs the
            rendered `lib/components/chart/chart.gallery.md` through `blockWebImages`. The output is byte
            for byte the input: 256,718 bytes, all 21 `chart-status` elements kept. The pill loses its
            ground in CSS, after the scan.
suspect   — #2997 (`22bbec6`, in the same range) moved the status marks into the charts plugin, so the
            pill rules now live in `lib/plugins/chart-family/**`. The Reading view's scoped sheet
            (`scopedArticleCss`) may no longer carry them. This is not confirmed.
done when — the spec passes in both schemes, and the fix names which sheet lost the rule.
evidence  — a nightly run with the spec green, and the line that restores the rule.
verify    — tier 1: the real Reading view in Chromium (this spec), with WebKit by its `@webkit-phone` arm.
