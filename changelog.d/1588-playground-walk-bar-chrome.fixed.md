- **The Playground's Explore walk bar took ~100px off the deck a second after the deck was
  already on screen.** It mounted only once the component's plan had been fetched, so the
  preview pane went 720px → 619px at 1194x834 and 680px → 571px at 390x844 — the whole deck
  moving up mid-read. The reserve built and withdrawn in #1581 is not rebuilt: the bar is now
  **Explore chrome rather than walk state**, present in the server-rendered markup from the
  first paint with only its CONTENTS waiting for the network (disabled steppers, no position —
  the `pending` shape). Its height is a constant by construction: the row no longer wraps
  (the cross-component label truncates instead), the position holds a fixed slot so the
  steppers do not slide when the numbers arrive, and the caption box is exactly two lines
  whatever it holds. **The caption is clamped to those two lines**, which also reclaims the
  worst case: the `math` plan's 289-character caption made the bar 184px on a phone — 22% of
  the viewport, for prose already printed on the slide above it — and is now 101px, with the
  full text on the element's `title`. A notice shares the caption's line-box rather than
  adding one. A plan fetch that 404s now leaves an inert bar rather than a permanent dead
  band, which is the failure that withdrew the old reserve. (#1588)
