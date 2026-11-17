studio: +800
playground: +10
An empty deck's start grid in Compose (`EmptyDeckStart`, which reuses the add-slide picker's `Tile` and `PreviewPool`), the empty-state wiring in the shell, and `isBlankDeck` in the shared front-matter module (the playground's +5). Measured +767 and +5 against main; the numbers carry a few bytes of slack.
Given back first, and it cost more: lazy-loading the grid split the picker into its own chunk and measured +1677, so the grid stays eager.
