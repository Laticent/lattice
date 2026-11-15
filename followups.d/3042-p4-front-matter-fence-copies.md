---
origin: 3042
priority: P4
recorded: 2026-11-15
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11 Step 3 landed
deferred: large — about 30 files, each with its own fence that differs from the island's on an edge (a required trailing line end, `---[ \t]*` closers, a tolerated BOM), so each move is its own small behavior change to check; none is on the engine's render path, which reads the island
source: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
---

# Front-matter fence copies outside the engine's path

why now   — step 3 of the Squadra rewrite moved the engine, the register key readers, the splitter, the deck model,
            the plugin admission and `lattice-deck` onto the front-matter island (lib/core/front-matter-island.mjs).
            Other modules still cut the block out with their own regex before calling the island-backed key readers,
            so a deck on an edge (a `---  ` closer, a BOM, a front-matter-only file) can still read two ways.
where     — `grep -rnE "/\^(\\\\uFEFF\?)?---" lib docs/src` less lib/authoring/lint-core.js (step 4/6 retires it):
            the lib/core/resolve-*.js register resolvers (`/^---\r?\n([\s\S]*?)\r?\n---\r?\n/`, a required line end),
            lib/core/glossary-auto.mjs, lib/core/resolve-color-mode.js `frontMatterBody`, lib/core/deck-front-matter.js,
            lib/export/marp-bleed-ink.js, lib/authoring/{review-core,fact-check-core,deck-profiles,slide-split,
            code-format/plan}.{js,mjs}, lib/authoring/squadra/bridge.js (goes in step 6), tools/check-jank.js, and the
            Studio's own readers (docs/src/lib/front-matter.ts with its nine writers is followups.d/3042-p3).
done when — each reads `frontMatterIsland` (or the boundary parser's `FRONT_MATTER`, which is the island's fence), and
            `npm run identity:check -- --strict` stays 0 differing.
evidence  — the identity check, and for each edge a reader moves on, a unit case before and after.
verify    — tier 1 per file (self-review with the gates); a reader whose edge moves an export's bytes gets the owner's
            dark and light sign-off.
