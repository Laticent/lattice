- **Changed: every slide now carries the `form` class, including a sovereign one.**
  Sovereignty was spelled as an ABSENT class — a slide with no chrome got no `form`,
  so "which Frame composes this slide" read as "is this Form at all". It is now
  stated positively: every slide gets `form`, and the nine sovereign Frames (title,
  divider, closing, image, premise, scene, split-panel, split-compare, compare-code)
  also get `frame-sovereign`, meaning one `stage` Cell and no chrome Cells.
- **Changed: the chrome injectors gate on the FRAME, not on `form`.** The masthead
  band, the footer Cell, the progress rail and the watermark ask
  `hostsChromeCells()` — both the HTML-string path and its DOM twin. Two universal
  CSS rules (`section.form`'s chrome geometry, `section.form::after`'s page number)
  carry the same guard. Verified pixel-neutral across all 84 component galleries in
  both moods.
