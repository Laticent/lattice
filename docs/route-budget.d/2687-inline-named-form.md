studio: +297
playground: +15
home: +8
The Studio's live lint and the shared inline-code dispatcher grew. lint-core gained the
`journey-actor-shortcut` rule and the `componentReads` check that keeps a component's own record
from reading as a broken pill. The dispatcher gained the `@kind{…}` row, which every surface that
draws inline code ships (engineering/decisions/2026-10-14-plugin-inline-door.md). Nothing to give
back: each piece is a rule or a table row that the surface runs on every keystroke.
