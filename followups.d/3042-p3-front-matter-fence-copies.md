---
origin: 3042
priority: P3
recorded: 2026-11-15
area: engine
severity: low
swimlane: engineering/decisions/2026-11-13-squadra-replaces-lint-core.md §11 Step 3 landed
deferred: blocked — on two things outside one session: the render-path and Marp-export readers change export bytes on the edges they move, which needs the owner's dark and light sign-off, and three authoring readers count slide chunks in step with lint-core's own fence, which step 6 deletes (see "Corrected 2026-11-17" below). Also large: about 15 files in lib/ and about 30 in docs/src and tools/, each with a fence that differs from the island's at the door (a BOM or blanks accepted on the OPENER, which the engine refuses), so each move is its own behavior change to check, several on the Marp export path
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

## Corrected 2026-11-17 (the session that took P2 after the register family)

Measured on `main` at `5c4be2f`, rendering each deck with `createEngine().render` and reading each with the island:

| Deck opens with | The engine reads front matter | `frontMatterMatch(raw)` | `frontMatterMatch(normalizeSource(raw))` |
|---|---|---|---|
| a BOM, then `---` | yes (its door strips the BOM) | no | yes |
| `---   ` (blanks after the opener) | no, it renders a slide | no | no |
| a BOM, then `---   ` | no | no | no |

So the `why now` above is half wrong. A copy that accepts a BOM before the opener AGREES with the render; only a copy
that accepts `---   ` as the opener disagrees. Moving a BOM-accepting raw-bytes reader onto `frontMatterMatch(raw)`
would make it disagree, the reverse of the goal. The engine's answer for raw bytes is the island on the door's text:
`frontMatterMatch(normalizeSource(src))` (lib/core/boundary-parser.mjs `normalizeSource`: BOM stripped, every `\r\n`
and lone `\r` folded). A reader that WRITES back into the raw text (deck-profiles' `profile:` writer, the plugin
writer) cannot use the folded offsets directly; it maps them back, as `frontMatterFence` already does for CRLF, plus
one for a BOM.

Three readers move only together with lint-core: `splitTopLevel` (lib/authoring/slide-split.js), `firstSlideIndex`
(review-core.js) and `fmChunks` (fact-check-core.js) all count the front matter as two chunks of a `^---$` split, and
lint-core's own `fmChunks` (lint-core.js `FRONT_MATTER`) does the same against `splitTopLevel`'s chunks. Moving the
three alone would shift lint-core's slide numbers by two on a deck whose closer is `---x` or whose line ends are a lone
`\r`. They move in step 6, when lint-core goes, or with a matching edit to lint-core's fence in the same commit.

What can move first, with no export bytes and no interlock: lib/authoring/deck-profiles.js (reads `profile:`; its writer
needs the BOM map), lib/authoring/code-format/plan.mjs, lib/diagnostics/slice-equivalence-core.mjs, and the tools/ readers
that only report. Each owes a unit pin per edge it moves, before and after.

