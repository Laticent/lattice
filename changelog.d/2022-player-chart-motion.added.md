- **Charts now animate in an exported `--player` file.** A deck with `motion: on`
  used to animate on the Playground and in Present, then ship a still to anyone
  you forwarded the HTML to — the export carried the chart's marks but none of
  the code that moves them. It now carries both.
- **Three ways to send the still instead.** Whether a forwarded file animates is
  a separate question from whether the deck animates: it costs bytes and it moves
  for a recipient you are not there to frame it for. The default inherits
  `motion:`, so the common case needs nothing new — and when you do want the
  still, `player-motion: off` in front matter travels with the deck,
  `--no-player-motion` covers a scripted export, and the Studio's webpage-export
  panel has an **Animate charts** switch. All three suppress only: a deck that
  says `motion: off` can never be made to move by whoever exports it.
- **A chart export carries a much smaller player than a scene export.** Charts
  reveal and slide their marks — they never stroke a drawing — so a chart deck
  now ships a 22 KB player instead of the ~81 KB one, and neither the 3D
  backend nor the drawing library is bundled into a file that cannot reach them.
  A deck with no chart and no scene is byte-identical to before.
