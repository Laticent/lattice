---
origin: 2376
priority: P3
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2407
---

# an empty-box `--fix` silently fails when the deck body opens with a separator

why now   — found by the checker on the lint heading-split change, and reproduced on main
            before it: `findMovedEmptyBoxes` numbers `rewriteSlide.lines` in the chunks
            `splitTopLevel` returns, while `applyFix` walks `separatorLines`. When the body
            opens with `---` or `***`, the leading empty group merges into the first slide
            differently in the two, the lines no longer match, and `applyFix` returns null.
            `applyAllFixes` then stops, so every later fix in the deck is skipped too.
            Repro: front matter, then `***`, `Setext`, `- Acme`, `  - [ ] ISO`, then
            `<!-- _class: verdict-grid -->` — `lint:deck --fix` leaves `[ ] ISO` as it is.
where     — lib/authoring/lint-core.js (`findMovedEmptyBoxes` chunk lines, `applyFix`
            rewriteSlide branch); lib/authoring/slide-split.js (`splitTopLevel` vs
            `separatorLines` on a leading separator).
done when — the repro rewrites `[ ] ISO` to `[!] ISO`, and a test pins every leading-
            separator shape (`---`, `***`, `___`, with and without front matter).
evidence  — `lint:deck --fix` output on the repro deck, before and after.
verify    — tier 0 gates, because it is one rule's line coordinates.
