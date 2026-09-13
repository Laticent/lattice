- **Fixed: seven committed example PDFs showed a palette the engine no longer
  paints.** #2148 collapsed `funnel` and `timeline-list` from six hues to one and
  rebuilt the galleries and three decks; every other committed PDF rendering
  either component stayed on the old palette, so a reviewer opening one saw
  something the renderer cannot produce. Re-rendered. Two of the ten decks #2179
  listed turn out not to have been stale — the issue counted slides that USE the
  component, and a fresh render of both matches what is committed.
