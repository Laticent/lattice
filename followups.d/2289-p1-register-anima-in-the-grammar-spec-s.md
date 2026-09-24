---
origin: 2289
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2289#issuecomment-5767837535
---

# Register `anima` in the grammar spec's `fences` map

Backfilled verbatim from the continuation brief on #2289 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P1 · [no ticket] Register `anima` in the grammar spec's `fences` map
       why now   — Compose's highlightLanguageFor() is pinned against that map, and
                   the pin only iterates entries the map carries. `anima` is absent,
                   so "a fourth engine fence cannot arrive uncolored" has a hole at
                   exactly the newest engine DSL. The decision doc (~line 312) also
                   claims the map matches the registry for all three fences; for
                   anima there is nothing to match.
       where     — tools/build-docs-portal.js:1048 (the hand-maintained FENCES
                   literal — today functionplot + mermaid only);
                   docs/src/lib/compose/fence-catalog.ts highlightLanguageFor();
                   docs/src/lib/compose/fence-catalog.test.ts:61 (the pin).
       done when — dist/docs/grammar.json `fences` carries anima with body "json" and
                   usedBy ["scene"]; the pin asserts a COUNT as well as a match, so it
                   cannot pass vacuously again; npm run build:check green.
       evidence  — the regenerated dist/docs/grammar.json diff, plus the pinning test
                   failing on 67e614e and passing on the branch (paste both runs).
       verify    — tier 1 checker, because grammar.json is a canonical machine spec
                   with consumers beyond Compose (agent kit, capabilities, portal).
       decide?   — the ENTRY is a change to a canonical spec's meaning (CLAUDE.md
                   § "is this decision mine to make"). Safe default: describe what the
                   engine already does, change no behavior, say so in one line in the
                   PR body. Do not re-shape the registry.
```
