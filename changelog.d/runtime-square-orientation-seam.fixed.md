- A deck whose slide aspect falls between 0.9 and 0.95 (a near-square custom size)
  now gets the same type scale in the browser runtime as in the export. The export
  already treated it as square (`--canvas-scale: 1.65`, `--stat-emphasis: 1.3`), but
  the runtime kept its own 0.95 split and gave it the portrait ramp instead (1.83 and
  1.45 at aspect 0.92), so the live preview and published HTML set type about 11%
  larger than the PDF. The runtime now asks the shared classifier,
  `lib/adaptive/families.js`, as the engine does.
