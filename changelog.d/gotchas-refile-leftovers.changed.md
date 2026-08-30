- **The two adjacent blurred-`box-shadow` PDF entries in `engineering/gotchas/export.md` are
  merged into one.** They were one finding reported twice — Chromium exports a blurred shadow
  as a transparency group, and Apple PDFKit / Quartz viewers paint its bounds opaque — found
  once on small state discs and once on a whole focused card. The merged entry keeps both
  discovery contexts, both mitigations (zero-blur spread ring, zero-blur opaque offset) and the
  warning that every local rasterizer composites it correctly and so hides the bug.
- **The two 4K-geometry entries are now findable from the topic each was observed on.** They
  stay together in `lattice-internals.md` — one cause, and the trap catalog cites them as a
  pair — but `vscode.md` and `studio-playground.md` each gain a pointer stub, so the symptom
  index names them under those topics. That was the one thing the 2026-08-17 refile gave up
  when it chose not to split them.
