---
"@laticent/lattice": minor
---

A deck can say which LFM version it was written for with `lfm: 1.0`, and a deck written for a major version this Lattice does not read is refused instead of rendered wrong.

The command line stops with a message that a newer Lattice is needed. `lint:deck` reports the same line as `lfm-version`: an error for an unknown major version, a warning for a line that is not a version. A deck with no `lfm:` line reads as LFM 1.0, as before. Spec: `spec/LFM-1.0.md` §2.1.
