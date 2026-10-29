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

why now   — the fit-harness montage (§12) shows lib/components/comparison/redline/redline.gallery.md slide 4 at story/hall split into three pages, today and under the decided policy alike, with the NEW column's strike-through and inserted runs drawn on top of one another ("Sellers or Share decline…" over "personal information shall"). It reads as garbage. The harness counts it: the export's overflow probe cuts pages 2 and 3 (`overflow`), and the readability probe's overlap check (added in #2962) fails text drawn over text. A deck author sees no warning.
where     — lib/components/comparison/redline/ (the split pages' NEW column layout at a narrow box and large venue).
done when — the slide renders without overlapping text at story/hall, and the fit ratchet's clip count for redline at story@hall falls, banked with `--bless`.
evidence  — the montage row before and after, and the ratchet diff in test/fit/baseline.json.
verify    — npm run fit:harness -- --only redline --sizes story --venues hall --packs none --ratchet test/fit/baseline.json
