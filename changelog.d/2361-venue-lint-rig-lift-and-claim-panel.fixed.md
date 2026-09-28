- **Fixed: the venue budgets are measured at the venue.** `calibrate-capacity --scale` rendered
  its probe at `class: scale-*`, which omits the venue's label lift (×1.15 at conference, ×1.3
  at hall), so conference and hall rows were measured on a smaller slide than the room gets. It
  now renders at `venue:`. 21 stored rows are lower at conference or hall (for example
  `timeline-list` with 16-word items: hall 4 → 0; `roadmap`: hall 9 → 6), so `lint:deck` warns
  on more of the slides that really clip.
