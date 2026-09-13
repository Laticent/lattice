- **Fixed: the Studio's add-slide gallery no longer makes a phone hold a workstation's working
  set.** Every tile in the gallery is a real engine render in its own document, and the ceiling
  on how many stayed mounted was a fixed 32 — one desktop measurement applied to every device, so
  a phone showing THREE slides was paying for THIRTY-ONE. The knob now counts the tiles kept warm
  BEHIND the band (`PREVIEW_RETAIN`, 4) instead of capping the mounted total, which separates the
  tiles on screen — not negotiable, and decided by the viewport — from the retention that is the
  whole memory question. Mounted engine documents while browsing the gallery: **33 → 14-15**,
  with the number of tiles an author can see unchanged at every width (3 / 6 / 7). Peak resident
  set falls with it, though peak is a noisy meter: five identical runs at 390×844 span
  730..991MB against 1237..1327MB for the old fixed 32 — non-overlapping, but quote the document
  count rather than a single MB figure.
- **Fixed: a thumbnail could be stranded as "on screen" forever and never recycled.** The
  observer's leave branch was guarded on React state (`visibleRef.current`) that is not yet
  committed when a flick delivers the matching leave, so the leave was dropped and the tile kept
  an in-band flag while off screen. Stranded tiles are never evictable, so the mounted total
  drifted with however many the last scroll happened to strand — measured at 15 then 30 documents
  across two identical traversals on WebKit, and 24 vs 11 across three identical opens at
  390×844. The count is now deterministic to ±1.
- **Added: metamorphic oracles for the gallery's preview window.** Six relations that hold
  whatever the retention knob is set to — retention saturates, the visible set is
  path-independent, open/close is idempotent, a filter round-trip is a no-op, a recycled tile
  comes back painted, and a looks panel gives its previews back. They run at desktop and phone
  widths in Chromium and on real WebKit at the iPhone 15 Pro profile.
