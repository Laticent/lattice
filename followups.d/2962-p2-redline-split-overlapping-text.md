---
origin: 2962
priority: P2
recorded: 2026-10-29
area: comparison
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §12
deferred: off-path — the redline component's split layout; this PR changes tooling and docs only
---

# Redline's split pages draw overlapping text in the NEW column at story/hall

why now   — the fit-harness montage (§12) shows lib/components/comparison/redline/redline.gallery.md slide 4 at story/hall split into three pages, today and under the decided policy alike, with the NEW column's strike-through and inserted runs drawn on top of one another ("Sellers or Share decline…" over "personal information shall"). It reads as garbage, and no gate catches it: the overflow probe sees nothing outside the frame, and the harness's readability probe checks line length and clipping, not overlap.
where     — lib/components/comparison/redline/ (the split pages' NEW column layout at a narrow box and large venue).
done when — the slide renders without overlapping text at story/hall, and the harness's readability probe (tools/lib/fit-harness/page.js `readable`) flags overlapping text runs, failing on this slide before the fix.
evidence  — the montage row before and after, and the probe's verdict on the slide before and after.
verify    — npm run fit:harness -- --only redline --sizes story --venues hall --packs none
