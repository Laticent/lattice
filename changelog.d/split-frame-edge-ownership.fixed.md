- **Fixed: split frames no longer draw a double line across their top edge.** A
  sovereign split frame (`split-panel`, `split-compare`) suppresses every chrome
  Cell it declares, but the deck spectrum is a `border-top` on the `section`
  rather than a Tile, so `suppresses` could not name it — the ribbon painted
  directly on top of the component's own 3px accent bar, giving a 7px two-tone
  stripe over the featured panel that stepped down to 4px at the panel seam. The
  section border is dropped on both components and the edge is rebuilt as one bar
  of the ribbon's weight in two segments that meet at the seam: the panel's own
  `--panel-mark` over the panel, the deck ribbon over the supporting zone. The
  `metric` and `steps` opt-outs that dodged the double locally are retired, and
  the `watermark` panel takes `--on-accent-watermark` so its mark stays visible on
  an accent fill.
- **Fixed: the split frames' panel edge is no longer invisible on the achromatic palettes.** The panel's top-edge mark defaults to `--accent`, which on onyx, ardesia, concrete, atelier (and the five `a11y-*` palettes that import onyx) is the panel fill itself — onyx measured 1.00:1. A new `--panel-edge-mark` token carries the color, defaulting to `--accent` everywhere it already reads and to the curated `--spectrum-end` on those four; a per-palette override rather than a new global default, because the endpoint measures worse than `--accent` on mustard. Gated by the `split-panel/edge-mark` composed-contrast surface.
