- **Fixed: the Mermaid sequence autonumber badge was invisible.** `sequenceNumberColor` drew
  the badge number in `--cat-on-fill` on a badge filled from `--diagram-line`, and most
  palettes derive both from the same end of the ramp — so the number was painted in the
  disc's own color on 47 of 64 palette x scheme combos, and below AA on 57. It now uses the
  canvas ink, the same inversion the parse-error box already used.
- **Fixed: sequence note text no longer sits at 3.83:1 on the five a11y palettes in dark.**
  `noteTextColor` moves from `--cat-on-fill`, which is curated for the pale categorical band,
  to `--text-heading`, which is curated for the surface it actually lands on.
- **Changed: cuoio's dark `--diagram-line` lifted `#786A5B` → `#8C7C6B`.** The line tier now
  carries the autonumber badge's text, and this was the only palette of 32 short of AA. Every
  cuoio-dark diagram edge and arrow also goes from 3.59:1 to 4.66:1 against the canvas.
