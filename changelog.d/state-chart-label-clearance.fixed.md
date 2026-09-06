- An edge label on a re-ranked state chart no longer sits on a state box. The
  clearance the layout reserves is axis-aligned, so a label on a diagonal run was
  bounded by nothing — measured across the four state-chart demo decks, 3 of 118
  labels overlapped, and one pair rendered as the single garbled token
  `reject›lock`. A label whose box collides now slides along its own edge, and
  mirrors to the far side of the line if nothing on the home side is clear.
- On a machine where nothing fits — every edge carrying a long event name — some
  overlap is unavoidable, and what it gives up is ordered: never off the canvas
  (the text would be cut), never onto a state box (the state's name goes with it),
  so at worst two labels touch and both stay readable.
- The arc-length midpoint is tried first and kept whenever it is clear, so only
  labels that actually collided move: 2 of 38 pages changed across the four decks.
