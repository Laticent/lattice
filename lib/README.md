# lib/ — the engine source

Everything the Lattice engine is made of lives here, one concern per folder.
If you are new, read `engineering/architecture.md` first (how a deck flows
through the engine), then come back to this map.

The big picture: **three render paths must agree** — the CLI/PDF path
(`lattice-emulator.js` → `lib/engine`), the browser playground
(`lib/playground`), and the VS Code preview runtime (`lib/runtime`). Most of
the structure below exists so shared logic lives in exactly one place.

| Folder | One-liner |
|---|---|
| `adaptive/` | The four box families (structural breakpoints) components reflow across |
| `authoring/` | Deck lint / review / scorecard cores (pure, browser-safe) |
| `base/` | Foundational CSS: tokens, element defaults, universal variants, finishes |
| `components/` | The component catalog — one folder per component, in buckets |
| `concepts/` | The design-vocabulary ontology, drift-gated against live catalogs |
| `core/` | Pure transform kernels: splitting, resolvers, list/section walkers |
| `engine/` | The owned Markdown→slides engine (canonical render path) |
| `exemplars/` | Tier filter for worked example decks (short/standard/full) |
| `export/` | The owned PPTX writer |
| `fonts/` | Canonical manifest of self-hosted text fonts |
| `forms/` | The Form composition catalog (Frame + Cell + Tile) |
| `helpers/` | Authoring-time diagnostics (the `.overflow` warning-ring contract) |
| `integrations/` | Wrappers/docs for markdown-it, KaTeX, Mermaid, highlight.js |
| `layout/` | Layout/Component Studio deterministic core (gates, scaffold) |
| `playground/` | Browser entry: client-side render through the owned engine |
| `runtime/` | VS Code preview runtime entry (→ `dist/lattice-runtime.js`) |
| `shared/` | Semi-universal CSS modifiers (`compact`, `accent`) |
| `theme/` | Theme Studio color math + palette derivation (see its README) |
| `tokens/` | The old→new token-rename crosswalk |
| `transformers/` | The shared transformer registry all render paths iterate |
| `typography/` | The `--fs-*` type-scale source of truth |

The #1 gotcha repo-wide: several folders are **bundled into the browser** by
`tools/build-*-core.js` — anything reachable from those entries must be pure
(no `fs`, no Node-only APIs). Each folder README says whether that applies.
