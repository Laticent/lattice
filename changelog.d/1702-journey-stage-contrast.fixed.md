- **Fixed: `journey` stage labels are legible on a light canvas.** The stage ribbon
  fills `--bg-alt` deepened toward `--surface-inverse` — a surface that tracks whatever
  canvas it is on — but its ink was pinned to the always-light `--on-dark-primary`. On
  a light deck that put 92%-white labels on a mid slate at 1.87:1 against a 3:1 floor,
  in every palette Lattice ships (31 of 64 palette x scheme pairs). The ink is now
  `--text-heading`, which follows the fill: 0 of 64 pairs below AA 4.5:1, worst 5.63:1.
  The print band renders byte-identically (`section.print` already remapped the old
  token to the same value). Dark mode was never the defect and stays far clear of the
  floor, but it does shift: 17 palettes now ink the label with their own tinted heading
  color instead of neutral 92% white, and 10 of 64 rows lose a little contrast at a
  height where it does not matter (worst 15.26:1 → 14.09:1; lowest dark row 11.30:1).
- **Added: slide contrast is now a per-PR gate.** `tools/check-slide-contrast.js` has
  measured the rendered DOM since #1207 and found every contrast defect this repo has
  shipped, but it only ran when someone asked. It now runs in the integration
  invariants tier over three rendered galleries (the component catalog on both
  canvases, plus an editorial deck). Exemptions are an explicit, individually justified
  allowlist that fails both ways — an un-exempt failure errors, and an exemption that
  stops matching errors as stale.
- **Fixed: the contrast prober no longer reports legible running headers as
  white-on-white.** It approximated paint order by DOM order, so a split layout's rail
  — a later, in-flow sibling — was discarded as the backdrop for out-of-flow chrome
  emitted before it, scoring four headers at 1.00:1 that render in white on a dark rail.
  Paint order is now ranked by CSS painting layer first, DOM order within a layer. Runs
  sitting over a `url()` raster backdrop are flagged rather than silently scored against
  the paint behind the picture — gradients are deliberately not flagged, because this
  engine draws rules with them and a gradient-inclusive net was wide enough to hide a
  real regression.
- **Changed: two pre-existing contrast defects are now tracked instead of invisible.**
  #1704 taught the prober to read element `opacity` but never re-measured the rendered
  galleries, so `agenda progress-*` and `kanban` de-emphasis washes have been putting
  real text below AA on `main` unseen. They are a design call on those components
  rather than part of this change, so the new gate carries them as an itemized ratchet
  with per-surface, per-tag ceilings: growth fails the build, progress prints and invites
  lowering the number, and an entry that reaches zero must be deleted. Tracked as #1717.
- **Fixed: the contrast prober applied WCAG's large-text line in DECK pixels.** A slide
  lays out at 3840px and exports to a 960pt page — 4 deck-px per point — so the 24px
  cutoff was really 6pt, and 68.6% of runs were held to 3:1 where WCAG requires 4.5:1.
  It now converts 18pt/14pt-bold into deck units. That surfaced a real `journey` defect
  (the mood legend's PAIN/DELIGHT labels at 3.78:1, fixed by dropping an opacity wash)
  and three pre-existing ones now tracked on #1717. The prober also stopped dropping
  pseudo-element glyphs with no ASCII alphanumerics, which had hidden 24 painted marks
  per gallery.
- **Added: the WCAG-exempt decorative ink tier is no longer invisible.** Runs inked with
  `--text-muted` / `--border` are skipped before every contrast assertion — 21.6% of all
  runs, and an adversarial review softened that token by one line to put 297 runs at
  1.17:1 with every gate still green. The tier is now held to the 3:1 graphical floor,
  and its size is pinned, so re-pointing real text into it fails the build.
