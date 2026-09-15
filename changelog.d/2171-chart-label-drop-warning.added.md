- Rendering a deck now says which chart labels it could not paint. The family drops a
  name on purpose where the geometry cannot hold it — a name printed through its
  neighbor loses both — but it did so in silence, so an author could publish a chart
  missing a row and never learn it: nothing is lost from the artifact, only from the
  picture. Both mechanisms now report through one channel. The CLI prints
  `⚠ CHART LABELS DROPPED` with each lost name and its slide, and the chart carries
  `data-label-drops` for any surface that wants to read it. No placement decision
  changed, and a chart that drops nothing carries no attribute and prints nothing.
