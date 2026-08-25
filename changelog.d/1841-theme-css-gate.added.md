- **A deterministic gate for hand-edited theme CSS.** `gateThemeCss`
  (`lib/theme/gate.js`) validates a theme the way a theme has to be validated —
  composed from the individual `find*` primitives, never from the component
  gate, which rejects all 32 shipped themes (a palette *is* hex literals at
  `:root`, and it is unscoped on purpose). It keeps the exfiltration scan, adds
  a contract-conformance rung that runs only on a self-contained theme, and
  reports a theme's non-root rules. `ok` and `blocked` are separate: only the
  safety rung pauses the CSS out of the preview frame.
- **`@import` in a theme is an allowlist, not a relaxation.** A bare quoted
  import of a **registered** theme name, spelled literally, passes; `url(…)`, a
  quoted path or URL, an unregistered name, an unquoted target, a self-import, an
  escaped spelling (`'\61 rdesia'`), an uppercase `@IMPORT`, and any
  `layer()`/`supports()`/media tail are rejected. None of those is inert: the
  engine leaves what it cannot resolve in place and `hoistImports` lifts it to the
  top of the composed sheet, where CSS fetches it. The gate **detects** with
  browser semantics (escapes decoded, case-insensitive) and **judges** with the
  engine resolver's (raw bytes, exact) — those are different parsers, and a gate
  that uses one reading for both is wrong in one direction or the other. The
  registry is an argument and defaults to `['lattice']` — a caller that forgets to
  pass one gets the strictest behavior, not the loosest.
