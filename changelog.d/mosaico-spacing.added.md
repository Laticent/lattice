- **Added: Mosaico takes padding, separate column and row gaps, alignment, and pixel sizes.**
  `pack()` accepts `padding` (one length or one per side), `columnGap` and `rowGap` for both
  strategies, and `align` (`start`, `center`, `end`; `rows` also `justify`, with `lastRow`). Give
  the container a `width` and `height` and every length is read in that unit, so a 16 px gutter
  is `gap: 16` whatever the strategy. Each result now carries `frame`, where the layout sits in the
  container, and `placed`, one box per item ready to draw; a `tree` layout that is too wide for its
  box keeps every gutter exact as it shrinks. Existing calls lay out exactly as before. The demo
  page gains sliders for gap and padding and a control for alignment.
