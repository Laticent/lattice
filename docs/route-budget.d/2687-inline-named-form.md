studio: +1269
playground: +15
home: +8
The Studio's live lint and the shared inline-code dispatcher grew, in two parts. The journey
change and the `@kind{…}` row (lint-core's `journey-actor-shortcut` rule and `componentReads`
check, and the dispatcher's named row, engineering/decisions/2026-10-14-plugin-inline-door.md)
are 663 bytes, as CI measured them. The editor's `@` autocomplete, the `unknown-inline-kind` rule
and the named form in every inline lint check add 606, measured locally against the same build
without them. Nothing to give back: each piece is a rule or a menu the editor runs on every
keystroke, in the lint core the Studio already loads at startup.
