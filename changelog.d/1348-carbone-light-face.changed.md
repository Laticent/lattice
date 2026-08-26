- **Breaking:** `theme: carbone` now resolves **light**. Carbone was curated a real light
  face and takes the house two-file shape, so a deck that wants the graphite canvas asks
  for `theme: carbone-dark`. Every dark value is byte-identical to what carbone shipped
  before. One rendering DOES change on the dark face, and for the better: a
  `<!-- _class: light -->` slide used to keep a graphite canvas while its inks flipped
  light (the #1527 seam), and now the canvas genuinely goes light.
- Carbone gained a curated light face. The electric lime `#7DE38A` measures 1.47:1 on an
  off-white canvas and cannot carry text, so `--accent`'s light arm is `#037829` — the same
  hue at 95% of the same chroma, 60% of the lightness, reading 5.24:1. The bright value
  stays the brand axis and the spectrum ribbon, and the code block keeps its graphite ground
  on both faces, so the terminal register survives the flip.
- The last `KNOWN_BELOW_AA` diagram-ink sanction (`errorTextColor`, 2.34:1) is **retired**.
  It was never a diagram defect: carbone's status trio declared light arms tuned for an
  off-white canvas the palette did not have. Giving it that canvas resolved the pair without
  the CVD trade the recorded alternative required.
