- **Changed: a chart key and its callouts share one row style.** A key's swatch is now 1.45 times
  its label (was 1.04), so every SVG chart key (bar, stacked-bar, tower, piechart, map, quadrant,
  radar, heatmap and line) draws larger swatches in slightly taller rows. A callout's marker is the
  same size (was 1.84 times the label), with its digit at about four-fifths of the label, and a
  callout's words take the key's typeface, weight and size, so the two read as one family beside a
  chart. Beside a heatmap's band key a callout holds the key's size: a label too long for three
  lines ends in an ellipsis rather than shrinking below the key's words.
  (`engineering/decisions/2026-10-20-callout-placement.md` § 6.)
