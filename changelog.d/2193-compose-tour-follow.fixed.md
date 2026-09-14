- **Fixed: a Studio tour started in Compose mode follows its own typing.** `ComposeHandle` gained a
  `revealTail` and the shell drives both editors' handles, the way it already drives both
  `revealSlide`s — only one is mounted per edit mode, so the other call is a free no-op.
- **Fixed: a tour's typing beats no longer stall in Compose mode.** The readiness gate looked for
  CodeMirror's content node, which Compose does not render, so every typing beat of a phone tour
  spun to its ~15s timeout before advancing. It now accepts either editor.
