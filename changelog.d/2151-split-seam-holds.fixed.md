- Splitting a `split-panel` slide no longer repaints it. The band reserved for the forward pointer
  was applied to both panels, and `.panel-left` in a stacked layout is sized by its content, so the
  reserve grew the dark panel instead of shrinking a content box: the dark/light seam moved from
  49.3% to 55.0% of the slide at portrait, 35.9% to 39.4% at story and 29.9% to 32.6% at mobile —
  on `pullquote`, whose premise is that the quote gets half the slide. The reserve now goes to the
  panel the pointer can actually reach: `.panel-right` normally, and `.panel-left` only under
  `mirror`, where the row reverses and the pointer lands there instead.
