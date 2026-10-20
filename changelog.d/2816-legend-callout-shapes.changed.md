- **Changed: a heatmap callout's marker is a shape and a color, and a chart draws at most six.**
  Callouts take six shapes in reading order, one each (circle, square, triangle, diamond, hexagon,
  star), and a color slot each, so a cell is matched to its label by shape as well as color. The
  callout's number rides inside the shape when the cell has room, and always in the lane, where it is
  as large as the label and centered on the digit's own height. On a grid whose values fill their
  cells, the shape now marks the cell on its own where the old numbered marker could not fit and left
  a bare ring. Every marker on a chart shares one size and one place: whole inside its cell's top-left
  corner, or a badge just outside it. A marker's size follows the cell's, and a cell's marker and its
  label's marker are the same solid color, and so is the ring around the cell. With a band key, a callout's words grow toward the key's
  label size as far as the lane holds them whole. The pill words still choose: `circle`, `tag` (the square) and
  `diamond` pick that shape, `c4` the color. A seventh callout and any after it are not drawn: the
  chart's description lists them, their `detail` still reaches the cell's hover card and the speaker
  note, narration stops at six, and `lint:deck` warns on each (`lib/plugins/legend/legend.docs.md`,
  `engineering/decisions/2026-10-19-universal-legend.md` § 18).
