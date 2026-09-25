---
origin: 2317
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/issues/2317
---

# kpi's gallery anti-patterns slide overruns its stage, and the overrun is hidden

The generated "When NOT to reach for kpi" slide (`cards-stack compact cards-stretch`, from
`kpi.manifest.json` `antiPatterns`) holds four cards whose text needs more height than the stage
has. Stretched, each card gets an equal 104px share and the second card's body needs 223px, so
**121px of its text is cut off with no "Content clipped" tag** — the overflow probe sees no box
leave the stage. Measured on `main` and unchanged by #2317's register work (the generator pins
these slides to `cards-stretch` so they render exactly as before).

The body of "A fifth metric — or a fourth that is not terse" is a paragraph of capacity
measurements; the gallery card wants one or two sentences (`cards-stack` density: "a stacked card
is a short paragraph at most").

done when — the kpi anti-patterns slide shows every line of every card (shorten the gallery
body, or give the generator a per-item short form), checked on the rendered gallery.
