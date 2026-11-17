studio: +1100
playground: +10
home: +10
An empty deck's start grid in Compose (`EmptyDeckStart`, which reuses the add-slide picker's `Tile` and `PreviewPool`), the empty-state wiring in the shell, and `isBlankDeck` in the shared front-matter module (+5 on the playground and on home, which load that module; CI's log named home, which the local check had not listed). Measured +767 and +5 against main, then +831 on the studio once Compose drew sample art (its folder reader, kept in a Studio-only module so home and the playground do not carry it); the numbers carry a few bytes of slack.
Given back first, and it cost more: lazy-loading the grid split the picker into its own chunk and measured +1677, so the grid stays eager.
Then +1059 on the studio once the grid moved from Compose (lazy) into the editor pane (eager), which the code review required: a grid inside Compose rebuilt its preview frames on every return to Compose. 3.5KB stays under the studio ceiling.
