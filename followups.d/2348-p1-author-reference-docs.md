---
origin: 2348
priority: P1
recorded: 2026-09-24
---

# Document the author features the site never mentions

why now   — A docs audit on #2348 found whole groups of shipped features that no site page teaches, so authors never find them. Worst: speaker notes ship inside every PDF by default and nothing on the site mentions `--strip-notes`.
where     — The audit's groups, each a page in the Guides or Reference group (`docs/astro.config.mjs`):
            1. Reference → Slide directives: `_focus`/`_focusStyle`/`_focusSteps`, `_build`, `<!-- describe: -->`, `<!-- caption: -->`, `<!-- stress-slide -->`, mid-deck `<!-- class: -->` (lib/engine/directives.js:38-76, lib/authoring/notes-core.js:249-279, lib/base/base.docs.md:1188-1300).
            2. Reference → Modifiers, generated from the lint vocab's universal groups (66 tokens; zero site hits today for `light`, `numbered`, `scale-*`, `tone-*`, `insight-*`, `row-label`, `table-*`, stamps, `tint-*`/`mark-*`).
            3. Guides → Exporting & sharing: `--player`/`--read`/`--fluid`, image sets, `--print`/`--paper`, `--present`, `--embed-source`, `--overflow-marker`, the Marp bundle, `lattice packages` (lattice-emulator.js:376, 400-461), plus the Studio Share panels.
            4. Guides → Presenting, notes & narration: speaker notes and `--notes`/`--strip-notes`, captions and `--captions`, Present mode (overview, Stage, notes, clock, voice), lexicon/acronyms/pace (docs/src/components/studio/PresentOverlay.tsx:1787-2065, design/skills/speaker-notes.md).
            5. Guides → When a slide is too full: auto-split and the "Content clipped" marker (lib/core/auto-split.js:1-15).
            6. Guides → Checking a deck: `lint:deck` flags `--strict`/`--json`/`--no-review`/`--all` and the suggestion tier (tools/lint-deck.js:8-19).
            7. Themes guide: the five `a11y-*` color-vision themes, "every" palette has a dark pair (not "most"), palette precedence.
            8. features.astro: drop "the full capability catalog" or make it one; its treatment counts are stale (10 tint families, not 12).
            A Studio user guide (editing, Coach, Present, Share) is a separate PR after this one.
done when — Items 1-8 are on the site, each lab or example rendered on the dev server at 390/820/1440, and each page linked from the page that should lead to it.
evidence  — The #2348 audit: a grep of docs/src/content and docs/src/pages for every CLI flag above returned zero hits.
verify    — `grep -rn -- "--strip-notes\|_focus\|_build" docs/src/content/docs` finds each on a guide page.
