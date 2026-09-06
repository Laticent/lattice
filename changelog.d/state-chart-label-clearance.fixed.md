- An edge label on a re-ranked state chart no longer overlaps a state box or
  another label. The clearance the layout reserves is axis-aligned, so a label on
  a diagonal run was bounded by nothing — measured across the four state-chart
  demo decks, 3 of 118 labels overlapped, and one pair rendered as the single
  garbled token `reject›lock`. A label whose box collides now slides along its own
  edge until it clears. The arc-length midpoint is tried first and kept whenever it
  is clear, so only the labels that actually collided move: 2 of 38 pages changed.
