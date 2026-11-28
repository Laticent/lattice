---
"@laticent/lattice": minor
---

A deck can say which LFM version it was written for with `lfm: 1.0`, and a deck written for a major version this Lattice does not read is refused instead of rendered wrong.

The engine renders one notice slide in place of such a deck, with an `lfm/major` diagnostic, so the Studio, the docs preview and the command line all refuse it the same way; the command line also stops before it writes a file. A patch version (`lfm: 1.0.1`) is a version, and a value naming another major (`2.0.0`, `v2`) is refused rather than read as 1.0. `lint:deck` reports the same line as `lfm-version`: an error for an unknown major version, a warning for a line that is not a version. A deck with no `lfm:` line reads as LFM 1.0, as before. Spec: `spec/LFM-1.0.md` §2.1.
