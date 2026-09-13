- **Fixed: the Studio's add-slide gallery no longer makes a phone hold a workstation's
  working set.** Every tile in the gallery is a real engine render in its own document, and
  the ceiling on how many stayed mounted was a fixed 32 — one desktop measurement applied to
  every device. A phone showing three slides was paying for thirty-one of them. The ceiling
  now follows the in-band set instead of a constant, so it self-tunes to the viewport, the
  rotation and the column count without reading any of them. Measured as peak resident set
  while browsing the gallery once: **390×844 +1237MB → +636MB, 820×1180 +1251MB → +787MB,
  1440×900 +984MB → +863MB**, with the number of tiles an author can actually see unchanged
  at every width (3 / 6 / 7). Peak is the meter because iOS discards a tab on footprint under
  memory pressure, and that discard is what a user sees as the page reloading.
- **Added: metamorphic oracles for the gallery's preview window.** Six relations that hold
  whatever the ceiling is set to — retention saturates, the visible set is path-independent,
  open/close is idempotent, a filter round-trip is a no-op, a recycled tile comes back
  painted, and a looks panel gives its previews back. They run at desktop and phone widths in
  Chromium and on real WebKit at the iPhone 15 Pro profile.
