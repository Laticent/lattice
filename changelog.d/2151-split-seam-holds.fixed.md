- Splitting a `split-panel` slide no longer repaints it, and the band is reserved on one panel
  rather than two. The reserve for the forward pointer went to both panels, and `.panel-left` in a
  stacked layout is sized by its content, so it grew the dark panel instead of shrinking a content
  box: the dark/light seam moved from 49.3% to 55.0% of the slide at portrait, 35.9% to 39.4% at
  story and 29.9% to 32.6% at mobile — on `pullquote`, whose premise is that the quote gets half
  the slide. The reserve now goes to the panel the pointer can actually reach: `.panel-right`
  unmirrored, `.panel-left` under `mirror`, and neither of them the other. Measured at square
  across 22 configurations, the pointer overlaps the corner panel by 347–390px of its 390px width
  and the other panel by 0–43px; reserving that other panel held ~89px of dead band and lifted its
  content 44.4px off where the unsplit slide puts it.
