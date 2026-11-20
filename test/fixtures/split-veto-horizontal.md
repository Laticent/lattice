---
size: square
theme: indaco
paginate: true
footer: "split veto — a horizontally overflowing collection"
---

<!-- _class: list-steps -->

## How the migration runs.

1. Freeze the schema
   - No new columns until the cutover window closes.
2. Backfill the shadow table
   - Replay six months of history and reconcile.
3. Dual-write both paths
   - Every write lands in old and new, verified nightly.
4. Flip the readers
   - Move traffic a service at a time, watching error rates.
5. Retire the old path
   - Drop the writes once a full week reads clean.
6. Archive the runbook
   - File the sign-off records with the control owners.
