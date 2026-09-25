- **Fixed: hovering a chart mark no longer skews the chart or moves the data.** The detail
  reveal on the Playground, Studio preview and Present used to tilt the whole chart with
  `rotateX(7deg)`, which turned bars into trapezoids and skewed every label. It also pushed
  the hovered mark 7 units away from the chart's center, off its baseline or coordinates.
  The chart now stays flat. The hovered mark stays at full opacity while the others dim,
  and it casts a soft elevation shadow. A pie slice steps out along its own bisector, and a
  dot grows about its own center. A small hold zone keeps the card from flickering at mark
  edges. The `ChartDetailLayer` prop `tilt` is renamed `lift`.
- **Fixed: a stacked-bar chart's hover details now open.** The chart never emitted the
  `stacked-bar-svg` class the reveal layer looks for, so authored per-bar detail was never
  shown on hover or tap. Its `<svg>` now carries `cart-svg stacked-bar-svg`, like every
  other chart's figure class.
- **Fixed: thin chart marks can be tapped.** A slope chart's marks are its lines, which
  draw under one screen pixel wide on a phone, so a tap almost never landed on one. When a
  tap or hover misses every mark, the reveal now takes the nearest mark whose outline is
  within reach: 22 screen px for touch, 6 for a mouse. A mark the pointer is actually on
  still wins.
- **Fixed: tapping a label that names a chart item opens that item's card.** On a slope
  chart, tapping "Northwind" or its "31%" now opens Northwind's detail, the same as its line.
  The same applies to a funnel stage's label and value, a waterfall's category and value
  labels, a quadrant dot's name, and every row of a pie or map legend. The labels carry a new
  `data-mark-for` attribute that only the reveal layer reads, so chart motion and the Present
  Guide are unchanged. The printed chart is unchanged.
- **Fixed: the detail card's color dot on gradient-filled marks.** Bars, waterfall steps and
  other gradient-filled marks showed an empty dot that pushed the title right. The dot now
  takes the mark's outline color.
