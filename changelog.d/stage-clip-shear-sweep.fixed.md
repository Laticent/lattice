- Eight components no longer have their card chrome sheared off by the slide's content
  clip on a dense slide. `compare-prose`, `decision`, `redline` (the plain clause),
  `matrix-2x2`, `statute-stack`, `policy-recommendation`, `citation-card` (`pull-quote`)
  and `cycle` each held a content-height floor against the bounded stage, so the stage
  cut their bottom border, radii and filled panels while every word still fitted. Each
  fix is inert while the content fits, and a body that genuinely cannot fit still spills
  where the "Content clipped" warning reports it.
- `statute-stack preemption`, `cycle` and `citation-card split` no longer lose text off
  the TOP of a slide with no warning. Each centered a box that could overflow, which
  threw content off the block-start edge where nothing in the engine can measure it —
  53.53px of real text on `statute-stack preemption`, 21.02px on `citation-card split`,
  16.75px on `cycle`. On `cycle` the return arc and the repeat mark were falling below
  the clip too, so a loop rendered as a plain row of cards.
- `examples/gallery-jargon.pdf` and the committed `compare-prose`, `cycle` and
  `statute-stack` gallery PDFs are regenerated. All four were stale against the engine
  that renders them, so a preview diff on those decks was comparing against a layout the
  engine no longer produces.
