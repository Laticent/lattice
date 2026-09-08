- **The overflow and "text too small" markers moved out of the slide's top-right corner.**
  Both now sit **centered under the spectrum bar, flush against its underside** — the
  authoring tabs and the reader-mode "Content clipped" pill alike. The corner is where the
  status stamp (`confidential`, `wip`, `draft`, …) and the author's `logo:` mark live, and
  a marker landing on either of them is the thing this register exists to prevent.
  Nothing about the markers' wording, detection, or the `overflow-marker` levels changes.
- **A status stamp no longer displaces the marker.** Ten of the thirteen `stamp-*` shapes
  are anchored to the right edge, so they share no band with a centered berth and reserve
  nothing. `stamp-notch`, the full-width band across the top edge, still pushes both
  markers down one row; the two full-bleed washes, `stamp-mark` and `stamp-veil`, cover the
  marker from the plane above, as they always have and deliberately.
- **Removed:** the `--corner-logo-reserve` / `data-logo-corner` machinery that used to
  stack the markers to the *left* of the deck logo, and the `--slide-radius` corner inset
  on those two berths. A centered marker clears a corner-anchored mark outright, and the
  middle of an edge is never inside a rounded deck's arc. The Fix-Me marker is unaffected —
  it keeps its bottom-right corner and its inset.
- **Known limitation:** a long running `header:` spans the same band. The marker's first
  row — including the "Content clipped" pill a reader receives — clears it; the second row
  (the author-only "text too small" tag, and the clip tag when `stamp-notch` pushes it
  down) can sit on the header's middle. This predates the move; centering shifted the
  overlap from the header's tail to its middle. Costed alternatives are in
  `engineering/decisions/2026-09-08-marker-berth-top-center.md` §5.
