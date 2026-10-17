- **Fixed: a logo wall in the live preview no longer blanks, then jumps, each time you come back
  to it.** The preview measures each mark's shape to size the wall evenly, and it fetched every mark
  again on every visit, drawing the wall as a grid until the fetches landed. It now remembers each
  mark's shape for the session, so a wall seen before draws packed on its first frame with no
  network request. PR previews also cache the playground's content-hashed marks, themes and engine
  modules for good, where they were revalidated on every request.
