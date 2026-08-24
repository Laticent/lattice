- **Fixed: status pills were sub-AA in light mode on eight palettes.** The
  `.chart-status` pill paints `--text-heading` on a gradient of its own state
  hue mixed into the canvas. #1809 corrected the dark arm's stops; the light arm
  had the same defect running the other way — on a light canvas the label is
  DARK ink, so the more hue the mix carries the closer the ground sits to it.
  At the old 54% end the worst pair was `concrete` / on-track at **2.48:1**
  (nineteen frozen pairs). The light stops move `33%/54%` to `18%/30%`, swept
  against every palette and state: the light end clears at 31% and 30% is taken
  for the margin. Measured on rendered pixels, `concrete`'s on-track pill goes
  **3.43:1 to 5.65:1**; `cuoio`'s goes 5.42 to 9.72. Light-mode pills are
  correspondingly paler, and lean more on the vivid state border for their
  identity.
- **Fixed: the pill gradient's other stop was sub-AA and nothing measured it.**
  The surface catalog listed only the 100% stop, on the reasoning that the 0%
  stop is "quieter by construction" — true of the dark arm, where less hue means
  a darker ground under a light label, and meaningless on the light arm, where
  less hue means a lighter ground under a dark label. The light 0% stop was
  itself at 4.38:1 on `concrete` with every gate green. Both stops are now in
  `tools/composed-contrast.js`, so neither can drift unseen; the nineteen frozen
  `chart/status-pill-*` pairs are deleted rather than re-frozen, taking the
  baseline from 85 sub-threshold pairs of 2304 to 66 of 2624.
