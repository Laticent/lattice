---
size: square
theme: indaco
paginate: true
form: standard
footer: "split veto — a horizontally overflowing collection"
---

<!-- _class: list-steps -->

## How the migration runs.

1. Freeze the schema — no new columns until the cutover window closes.
2. Backfill the shadow table — replay six months of history and reconcile.
3. Dual-write both paths — every write lands in old and new, verified nightly.
4. Flip the readers — move traffic a service at a time, watching error rates.
5. Retire the old path — drop the writes once a full week reads clean.
6. Archive the runbook — file the sign-off records with the control owners.
