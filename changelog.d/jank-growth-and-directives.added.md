- **Added: `check-jank` measures an anchor's SIZE, and sweeps `topic` with its track.** Every
  anchored run prints a `GROWTH` line, and `--max-growth PX` fails a mark that must hold one
  size — DRIFT deliberately ignores a mark pinned at one edge that grows. The heading sweep
  now carries per-slide directives from the manifest sample (such as `_track`), so
  `node tools/check-jank.js topic --anchor 'ul.tile-track > li.on' --max-growth 2` measures
  the lit tab on every step instead of on none.
