# lib/layout — the Component Studio deterministic core

"Model proposes, deterministic gates dispose": the pure machinery behind
AI-assisted, CSS-only local components in the Studio.

- `gate.js` — `gateComponent()` plus `findHexLiterals` /
  `findUnscopedSelectors` (token-only + scoping gates; also reused by
  `tools/check-ownership.js` for HARD RULE #3).
- `scaffold.js` — a validated draft → PR files / `.latticepack`.
- `starters.js` — gate-clean starter components.
- `ai.js` — pure prompt building + reply coercion (the model call lives in
  the caller).
- `bridge.js` — carries a Studio component into a real deck.

Rationale: `engineering/decisions/2026-06-29-ai-component-generation.md`.

**Gotchas:** bundled to the browser by `tools/build-layout-core.js` — keep
pure/fs-free. Scope is CSS-only components; anything needing a transform
or chart must decline and route to a first-party build.
