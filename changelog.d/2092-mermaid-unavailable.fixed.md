- **Fixed: a diagram that fails to render now exports its source instead of an
  empty slot.** The runtime tags every ```mermaid fence `pending` at boot so raw
  Mermaid never flashes while the library loads, and CSS hides a tagged fence.
  Nothing un-tagged it when Mermaid never arrived — a 404 on the script, a CSP
  block, a host with only a stub — so the author's diagram became a blank area,
  permanently, in a file they had already downloaded. The runtime now hands those
  fences back as `data-mermaid-state="unavailable"`, which the stylesheet shows
  exactly as it shows a rejected diagram. Driven on the Studio's webpage export
  and its desktop print document with Mermaid cut off at the network.
- **Fixed: the empty diagram slot no longer takes half the stage from a failed
  diagram's source.** `section.diagram > .cell-stage > .mermaid` out-specified
  the rule meant to collapse it, so on every Form-wrapped diagram slide the
  spent, empty SVG box kept `flex:1` beside the source it was supposed to make
  room for. Both failure states collapse it now.
