---
origin: 2242
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2242#issuecomment-5752664431
backfill: true
---

# Decide whether `cancelled:` is reachable at all

Backfilled verbatim from the continuation brief on #2242 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Decide whether `cancelled:` is reachable at all
       why now   — the beacon has a `cancelled:` branch that may be dead code. The
                   hinge: does `if: always()` on the ci job survive a
                   concurrency cancel-in-progress cancellation? The checker could not
                   settle it without a real runner.
       where     — ci.yml:22-23 (concurrency), ci.yml:732 (`if: always()`)
       done when — either a real force-push-against-a-live-run shows the branch
                   firing, or the branch is removed as unreachable
       verify    — tier 0
       NOTE      — pre-existing framing inherited from the Verify gate, off-path under
                   #18. The label is honest either way (it asserts no cause), so this
                   is cleanup, not a defect.
```
