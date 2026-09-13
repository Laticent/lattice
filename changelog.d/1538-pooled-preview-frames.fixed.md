- **Fixed: browsing the add-slide gallery grew the tab until iOS discarded it.** The gallery gave
  every catalog tile its own engine document and tore it down on recycle — and a torn-down preview
  document is not reclaimed by WebKit. Measured in isolation (five cycles of create-16-frames,
  destroy, idle, with zero frames alive at each reading): Chromium 170 → 86 → 87 → 79 → 78MB, and
  WebKit 149 → 230 → 282 → 401 → 442MB, a monotone ratchet. So no retention budget could fix it —
  recycling was itself the cost. The gallery now holds a small fixed POOL of frames in one layer
  and re-points them over the tiles worth showing, which keeps the same iframe and the same realm
  and takes `single-slide-render`'s patch path instead of writing a fresh `srcdoc`. Browsing the
  whole 69-tile catalog four times at 390×844 now mints **11 iframes and 15 preview documents**
  instead of one of each per tile, and retained memory after that browse fell from **+648MB to a
  ~365MB median on WebKit** (three runs: 353/365/397) and from ~105MB to ~82–91MB on Chromium. The
  instrument's own spread is ±200MB, so the run counts are the near-deterministic half of this.
- **Fixed: a patched-in slide lost the specimen flag's overflow suppression.** A catalog tile is a
  SPECIMEN — a sample the author did not write and cannot fix — so its overflow watcher resolves to
  `off`, and at `off` the runtime deliberately installs "no probe, no observer, no resize handler".
  Nothing was left to stamp `data-lattice-overflow-marker` on a section that arrived by patch
  rather than by boot, and that attribute is what the CSS keys the suppression on: measured on the
  pooled gallery, 6 of 10 frames carried no marker after a scroll and never recovered, so an
  overflowing sample painted the loud red authoring ring. The patch site now carries the level
  across the swap. It stamps the article's own `<section>` children rather than
  `section[data-lattice-slide]`, because that attribute is written by the runtime and is not yet on
  the sections a patch inserts — keyed on it, the stamp matched nothing at all.
