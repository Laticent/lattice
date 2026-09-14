- Splitting a `split-panel` slide no longer repaints it, and the band the forward pill occupies is
  reserved on every panel the pill can reach. Two things were wrong. The reserve went to BOTH
  panels at every size, and `.panel-left` in a stacked layout is sized by its content, so it grew
  the dark panel instead of shrinking a content box: the dark/light seam moved from 49.3% to 55.0%
  of the slide at portrait, 35.9% to 39.4% at story and 29.9% to 32.6% at mobile — on `pullquote`,
  whose premise is that the quote gets half the slide. Then the correction over-shot, gating the
  reserve to ONE named panel on the strength of a measurement that was really a property of the
  test fixture's short labels: the pill's label is the next page's member title, clipped at 42
  characters, so at the cap it is 496px wide at square instead of 305px and **crosses the seam** —
  measured, it overlaps `.panel-left` by 112.3px unmirrored and `.panel-right` by 149.1px on
  `steps mirror`, both of which the gated rule left unreserved. The reserve now follows the
  layout rather than a panel name: in a ROW both panels give up the band, because the pill can
  cross into either and a row's panels are full height so the padding costs nothing; in a COLUMN
  only the bottom one, because the top panel is out of the pill's reach at any label width and
  reserving it is what moved the seam.
