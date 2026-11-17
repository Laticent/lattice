studio: +800
playground: +10
home: +10
An empty deck's start grid in Compose (`EmptyDeckStart`, which reuses the add-slide picker's `Tile` and `PreviewPool`), the empty-state wiring in the shell, and `isBlankDeck` in the shared front-matter module (+5 on the playground and on home, which load that module; CI's log named home, which the local check had not listed). Measured +767 and +5 against main; the numbers carry a few bytes of slack.
Given back first, and it cost more: lazy-loading the grid split the picker into its own chunk and measured +1677, so the grid stays eager.
