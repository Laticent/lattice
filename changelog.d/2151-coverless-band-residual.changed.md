- **Known limit, recorded rather than hidden:** a coverless `split-panel` split page places its
  forward pointer as an opaque pill in the bottom band, and a long enough member body still
  prints under it. The band reservation repositions content that FITS — which is what keeps a
  run's pages aligned and puts the reserve on the right column under `mirror` — but it cannot
  hold overflowing content out, because the panel clips at its padding box. Measured: a 48-word
  body overprints identically with and without the reserve. Those pages carry the engine's
  `overflow` flag. The root fix is in `dockInFooterCell`, which appends both wayfinding marks at
  section level on any page with no footer row, and belongs in its own change.
