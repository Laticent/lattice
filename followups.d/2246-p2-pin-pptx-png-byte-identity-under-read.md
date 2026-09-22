---
origin: 2246
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2246#issuecomment-5753518960
backfill: true
---

# Pin PPTX/PNG byte-identity under --read

Backfilled verbatim from the continuation brief on #2246 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Pin PPTX/PNG byte-identity under --read
       why now   — the shipped docs claim "PDF/PPTX/PNG bytes are unchanged" but only the PDF
                   arm is pinned; the claim is wider than the test, which is how a claim rots
       where     — test/integration/invariants/read-export.test.js, beside the PDF sha256 arm
       done when — the same deck rendered to .pptx and to .png with and without --read yields
                   identical bytes
       evidence  — the checksum comparison in the test itself, same shape as the PDF arm
       verify    — tier 0 gates
```
