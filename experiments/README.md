# `experiments/`: work we keep but do not ship

Each folder here is a measured prototype that the owner chose to keep in reserve instead of deleting. Nothing in the
product imports from this folder, and no build step or CI job runs it. Each folder's README says what the experiment
is, where its numbers are, and which `followups.d/` item says when to pick it up.

| Folder | What it is | Pick it up |
|---|---|---|
| [`accordo/`](accordo/) | Accordo, a zero-dependency CRDT for an ordered list of records, with its correctness gate, mutants and a bake-off against Yjs | `followups.d/3147-p2-accordo-next-round.md` |
