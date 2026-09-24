- **Fixed: a long diagram stays readable on a phone in the reading article.** A Mermaid
  diagram re-hosted in Read · Article used to shrink to fit the column however narrow it got,
  so an eight-stage LR flowchart drew its labels at 3.4px on a 390px screen. A diagram at
  least twice as wide as it is tall (or twice as tall as it is wide) now stops at 12/14 of its
  natural size, which gives 12px labels, and its figure scrolls sideways instead. Near-square
  diagrams such as a pie still scale to the column, and printing still fits a diagram to the
  page. A diagram whose floor is wider than the 1100px article band (about 1280px natural or
  more) now pans at desktop widths too, where it used to shrink. This applies to the
  `--read` export, the `--player` article and the Studio's Read pane.
- **Fixed: a `--read` export lays out at the phone's width.** The reading article carried no
  viewport meta tag, so iOS Safari and Android Chrome laid it out at a 980px desktop width
  and zoomed the whole page out, text included. It now carries
  `width=device-width,initial-scale=1`, as the `--player` export always has.
