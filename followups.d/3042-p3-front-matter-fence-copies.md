---
origin: 3042
priority: P3
recorded: 2026-11-15
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11 Step 3 landed
deferred: large — about 15 files in lib/ and about 30 in docs/src and tools/, each with a fence that differs from the island's at the door (a BOM or blanks accepted on the OPENER, which the engine refuses), so each move is its own behavior change to check, several on the Marp export path
source: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
---

# Front-matter fence copies the island has not replaced

why now   — step 3 moved the engine's own readers onto the front-matter island (lib/core/front-matter-island.mjs):
            `parseFrontMatter`, `slides.js`, the shared markdown-it kernel, the pane render, the register resolvers
            whose fence was the engine's. The copies left disagree with the engine at the door: they accept a BOM or
            `---   ` as an OPENER, which the engine renders as a slide, so a deck opening that way is read as having
            front matter by them and not by the render. Some of these sit on the render path.
where     — on the render path: lib/core/resolve-{preset,pace,motion,bookends,narration}.{js,mjs},
            lib/core/{settings-block-fold,deck-front-matter,delivery-names,renumber-say,glossary-auto}.{js,mjs},
            lib/core/resolve-color-mode.js `FRONT_MATTER_FENCE`; the Marp export: lib/export/{marp-bundle,
            marp-bleed-ink}.js; authoring: lib/authoring/{review-core,fact-check-core,deck-profiles,slide-split,
            code-format/plan}.{js,mjs}, lib/diagnostics/slice-equivalence-core.mjs; and docs/src (the Studio's
            docs/src/lib/front-matter.ts with nine writers is followups.d/3042-p3) and tools/. lint-core.js and
            squadra/bridge.js are out: steps 4 and 6 of the rewrite delete them.
            Find them: `grep -rnE "/\^(\\\\uFEFF\?|﻿\?)?---" lib docs/src tools`.
            Also: the boundary parser's `FRONT_MATTER` regex (the island's `FRONT_MATTER_FENCE`) can split a raw
            `\r\n` (`---\r\n---\r\n` matches an empty block); its raw-bytes regex callers (notes-core, agenda-autofill,
            bake-splits, slide-class-spans, plugin-fences, marp-slide-only, marp-directives) move to `frontMatterMatch`.
done when — each reads `frontMatterIsland` / `frontMatterMatch`, or keeps its own fence with a comment saying why the
            engine's answer is wrong for it; `npm run identity:check -- --strict` stays 0 differing.
evidence  — the identity check, and a unit case per edge a reader moves on, before and after.
verify    — tier 2, maker-checker per batch; a reader whose edge moves an export's bytes gets the owner's dark and
            light sign-off.
