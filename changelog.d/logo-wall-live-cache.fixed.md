- **Fixed: a logo wall in the live preview no longer blanks, then jumps, on every visit.** The
  preview measures each mark's shape to size the wall evenly, and it used to fetch every mark again
  each time the slide came back into view, drawing the wall as a grid until the fetches landed. It
  now remembers each mark's shape for the session, so a wall seen before draws packed on its first
  frame with no network request, and a first visit holds the wall hidden while it measures (as a
  collage does) instead of drawing it twice. PR previews also cache the playground's
  content-hashed assets for good, where they were revalidated on every request.
