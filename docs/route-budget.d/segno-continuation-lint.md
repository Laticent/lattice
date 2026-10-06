playground: +4
The Playground ships lint-core for its live lint, and lint-core gained the `bracket-list-closed-early` rule (a stray `]` after a quoted name in an axis or key list): +1 B gz against main measured locally, +4 to cover gzip variation as earlier declarations here do. The Studio carries the same rule and came out 25 B smaller after compression.
