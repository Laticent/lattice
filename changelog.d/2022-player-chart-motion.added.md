- **Charts now animate in an exported `--player` file.** A deck with `motion: on`
  used to animate on the Playground and in Present, then ship a still to anyone
  you forwarded the HTML to — the export carried the chart's marks but none of
  the code that moves them. It now carries both.
- **`player-motion: off` keeps the exported file still.** Whether a forwarded
  file animates is a separate question from whether the deck animates: it costs
  bytes and it changes what a recipient sees. The default inherits `motion:`, so
  nothing new is needed for the common case; set `player-motion: off` in front
  matter to present with motion and send the still.
- **A chart export carries a much smaller player than a scene export.** Charts
  reveal and slide their marks — they never stroke a drawing — so a chart deck
  now ships a 22 KB player instead of the ~81 KB one, and neither the 3D
  backend nor the drawing library is bundled into a file that cannot reach them.
  A deck with no chart and no scene is byte-identical to before.
