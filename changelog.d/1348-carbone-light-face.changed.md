- **Breaking:** `theme: carbone` now resolves **light**. Carbone was curated a real light
  face and takes the house two-file shape, so a deck that wants the graphite canvas asks
  for `theme: carbone-dark`. Every dark value is byte-identical to what carbone shipped
  before; only which face is the default moved.
- Carbone gained a curated light face. The electric lime `#7DE38A` measures 1.48:1 on an
  off-white canvas and cannot carry text, so `--accent`'s light arm is `#037829` — the same
  hue at 95% of the same chroma, two-thirds the lightness, reading 5.22:1. The bright value
  stays the brand axis and the spectrum ribbon, and the code block keeps its graphite ground
  on both faces, so the terminal register survives the flip.
- The last `KNOWN_BELOW_AA` diagram-ink sanction (`errorTextColor`, 2.34:1) is **retired**.
  It was never a diagram defect: carbone's status trio declared light arms tuned for an
  off-white canvas the palette did not have. Giving it that canvas resolved the pair without
  the CVD trade the recorded alternative required.
