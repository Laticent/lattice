- **Record correction: the chart block-inset reclaim is worth ×1.20 (+19.8%) to a quadrant's label, not +27%.**
  `engineering/decisions/2026-08-11-stage-owns-the-outer-inset.md` §9 measured the gain off a painted
  glyph bounding box, which quantizes to whole pixels (11 → 14) and rounds a ×1.198 into a ×1.27. The
  SVG's own CTM is the unrounded measure: 0.929 → 1.113. #680 had published this exact correction
  before that document was written, and it was carried in anyway. No behavior changes — the arithmetic
  the number feeds does: costing "does this reach `--fs-meta`" with 1.27 gives 16.8px instead of 15.8px.
  The section also now records that **#680 is closed, superseded by #1605**, and that #1605 re-orders the
  levers so this change is a multiplier rather than the fix — the live defect there is `placeLabels`
  silently deleting a name, not the type size. (#1605)
