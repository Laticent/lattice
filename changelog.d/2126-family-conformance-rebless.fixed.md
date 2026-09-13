- **Fixed: `test/oracle/family-conformance.json` matches the tree again.** The record had
  drifted 22 cells across 8 components, so `npm run check:family-conformance` exited 1 on a
  clean `main`. It is a nightly gate, not a per-PR one, so it was red without blocking
  anything — which is how it got that far.
- **Not all of it was drift.** `team-profile` is genuinely new (#2102). `matrix-grid` was
  already rostered at the last commit that touched the record, and four more cells
  (`cards-grid @ square`, `stats` at square and tall, `timeline-list @ tall`) disagreed
  with the shipped CSS at that same commit. So the record was already wrong when it was
  last written, and the re-bless is the first time these cells have been derived rather
  than inherited.
- **No cell says `inert`** — the #1218 defect class this pass exists to catch — and the
  record before the change had none either, so nothing was banked as the new normal. The
  one cell that left `fires`, `cards-grid @ square`, is a deliberate removal the
  component's own CSS explains and measures.
