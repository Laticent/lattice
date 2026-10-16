- Inline code renders faster. The dispatcher every backticked span passes through now spends about
  half the time on ordinary code, measured against the retired kernel on the bench fixture
  (6.71x to 2.75x on one runner in one session; the blessed baseline reads 5.72x to 2.75x across
  two runner classes). Brace records that are not pills, such as a chart's `{2, 82}`, no longer pay
  for an error message nobody reads. Segno record slots gain an experimental `refuses(text)`.
