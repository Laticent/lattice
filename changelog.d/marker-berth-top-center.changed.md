- **The overflow and "text too small" markers moved out of the slide's top-right corner.**
  Both now sit **centered under the spectrum bar, flush against its underside** — the
  authoring tabs and the reader-mode "Content clipped" pill alike. The corner is where the
  status stamp (`confidential`, `wip`, `draft`, …) and the author's `logo:` mark live, and
  a marker landing on either of them is the thing this register exists to prevent.
  Nothing about the markers' wording, detection, or the `overflow-marker` levels changes.
- **A status stamp no longer displaces the marker.** Thirteen of the fourteen `stamp-*`
  shapes are anchored to the right edge, so they share no band with a centered berth and
  reserve nothing. The exception is `stamp-notch`, the full-width band across the top edge:
  it still pushes both markers down one row.
- **Removed:** the `--corner-logo-reserve` / `data-logo-corner` machinery that used to
  stack the markers to the *left* of the deck logo, and the `--slide-radius` corner inset
  on those two berths. A centered marker clears a corner-anchored mark outright, and the
  middle of an edge is never inside a rounded deck's arc. The Fix-Me marker is unaffected —
  it keeps its bottom-right corner and its inset.
