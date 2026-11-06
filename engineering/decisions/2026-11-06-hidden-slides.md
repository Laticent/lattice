---
status: shipped
summary: Hidden slides. An authoring feature, the `hide` slide directive, not a CSS accident. A hidden slide stays in the source, the editor, the strip and the slide map (marked with an eye-off), and leaves Present and every export in both hosts. Page numbers count only shown slides (renumber, no gaps), and a hidden divider opens no section. One mark, `data-lattice-hidden`, written by the engine; every consumer filters on it or on the source-side reader that agrees with it. Answers followups.d/2936-p2.
---

# Hidden slides (2026-11-06)

Status: shipped in the same PR. The owner made the three calls in §2 on 2026-11-06.

## 1. The problem

Lattice had no way to keep a slide in a deck without showing it. The only "hidden" slide was one an author's CSS
happened to hide (`display: none`), and PR 2936 measured what that did: the Studio exported it as a blank slide (a
1 x 1 picture in PowerPoint, a blank PDF page), and the CLI did the same for every format except its PDF writer. The
owner ruled on 2026-10-28 that hidden slides are skipped in every export, and left three questions open
(`followups.d/2936-p2-hidden-slides-skip-in-every-export.md`, now deleted):

1. Is hiding a CSS accident or an authoring feature?
2. Does a slide after a skipped one keep its page number?
3. Does the section rail count a skipped slide?

## 2. The owner's calls (2026-11-06)

| Question | Call | Why |
|---|---|---|
| How is a slide hidden? | **A `hide` slide directive**: `<!-- hide -->`, `<!-- _hide -->`, `<!-- _hide: true -->`. `_hide: false` shows it. The slide menu says **Hide Slide** / **Show Slide** (Title Case, as that menu is); the palette says Hide slide / Show slide. | The owner's word and PowerPoint's. `skip` already means something else in Marp's `paginate: skip`, which our lint warns about. |
| Page numbers | **Renumber everywhere.** Shown slides read 1..N; the total is N. | The PDF reads 1, 2, 3 of 3, and the Studio's numbers on a shown slide match the PDF's. |
| Section rail | **Counts shown dividers only.** A hidden divider opens no section; slides after it stay in the section before. | Same rule as the numbers: the audience's view decides. |

**The cost that decided "renumber", measured before the call.** On the 120-slide gallery deck (102 slides numbered),
a whole-deck engine render takes about 130 ms either way, about 1 ms per slide. Renumbering changes the HTML of up to 102
slides on a hide toggle, since every numbered slide carries the total and the later ones a new number. Keeping gaps changes 1. A hide
toggle therefore costs what Delete and Move already cost: both renumber every later slide today. The Studio preview
renders the slide in view alone (the slice path, §4), so the toggle's render cost is one slide; the 102 is how many
strip thumbnails go stale. Script: the session's `hide-cost.cjs`, against `test/integration/baseline-decks/gallery.md`.

## 3. The model

**One mark, written by the engine.** `lib/engine/slides.js` reads `hide` off each slide's directives with `hideOn`
(`lib/core/meta-keys.mjs`, the one value rule: presence hides, `false`/`no`/`off`/`0` shows) and writes
`data-lattice-hidden="true"` on the section. A hidden slide **stays in the rendered document**, because the editor
shows it; it takes no page number and is not in the total. `hide` is a slide-scope key in the `meta` manifest, so an
un-underscored `<!-- hide -->` sets that slide only, never the slides after it (the rule `header`/`footer` follow).

**Every consumer asks one question, two ways.**

| Where the consumer stands | Asks | Code |
|---|---|---|
| Rendered HTML or DOM | is the section marked? | `lib/core/hidden-slides.js` `isHiddenSection` / `isHiddenElement` / `withoutHiddenSlides` / `shownOnly` |
| Slide markdown (Present, the strip, deck ops) | does the source hide it? | `lib/diagnostics/slice-equivalence-core.mjs` `slideSourceHidden` |

The source reader parses with the engine's own comment grammar and value rule, and blanks code first, so a
`<!-- hide -->` shown in a fence does not hide (the engine agrees: a fence's contents are not directives).

## 4. Every surface

| Surface | What it does with a hidden slide | Where |
|---|---|---|
| Engine | Marks it, skips it in the page count and total | `lib/engine/slides.js` |
| Progress rail, watermark glyph | A hidden divider opens no section | `lib/forms/tile/{progress,watermark}/*.transform.js` |
| Studio slice path | Supplies offset/total and section counting shown slides only; refuses (whole-deck render) when the raw and code-blanked readings disagree, as it does for dividers | `supplyablePosition`, `dividerDerivation` |
| CLI exports (PDF, PPTX, ODP, PNG, image sets, HTML player) | Dropped from the one slide list every format reads, so notes and alt text (read off that list) stay aligned | `lattice.js` `engineSlides` |
| Studio exports, print panel, Article, narration | `buildDeckRender` drops hidden sections and reports their positions in `render.hidden`; PDF review comments and the print panel's preview cells drop the same positions | `share-export.ts`, `PrintOptionsPanel.tsx` |
| Present | Never presented under any lens; opening on a hidden slide lands on the next shown one | `deck-lint.ts` `presentationPairs`, `PresentOverlay.tsx` |
| Studio strip, slide map | Keeps its place; an eye-off mark stands where its number was; the accessible name says "hidden" | `SlideRail.tsx`, `StudioMap.tsx` |
| Studio preview bar | A **Hidden** chip that is also Show slide | `StudioShell.tsx` |
| Slide menu, command palette | **Hide slide** / **Show slide** (one Undo step) | `strip-actions/model.ts`, `deck-ops.ts` `setHiddenAt` |

**What the Studio writes.** Hide slide puts `<!-- hide -->` as the slide's first line and touches no other byte. Show
slide removes every line that is only a `hide` directive; if a hide survives (written inside a longer line), it appends
`<!-- _hide: false -->`, which wins because the last `hide` wins. Pinned by `deck-ops.hide.test.ts`.

## 5. Verification

- `test/unit/engine/hidden-slides.test.js`: the value rule, the four spellings, slide scope, the rail and glyph, and an
  oracle that every slide rendered alone with the slice path's supplied position matches the whole-deck render.
- CLI probe (3 slides, slide 2 hidden): PDF 2 pages numbered 1 and 2; PPTX 2 slides carrying the notes of slides 1
  and 3; PNG 2 files.
- `docs/e2e/strip-hide.spec.ts`: the menu, the strip mark, the chip and Undo, in a real browser.

## 6. Not done here

- **Numbering in the strip.** The strip numbers slides by their place in the editor (every slide), which is also what
  the pager's "3 / 6" counts. A shown slide's strip number can therefore differ from its exported page number when a
  hidden slide comes before it. The eye-off mark on the hidden pill is what explains the gap.
- **Export to Marp keeps hidden slides, and Marp shows them.** The bundle is a source the recipient re-edits, so dropping
  a slide there loses content, while keeping it means Marp, which ignores directives it does not know, presents it. Left
  for the owner (the PR's decision card); `lib/export/marp-bundle.js` is unchanged.
- **A keyboard shortcut.** None, as in Keynote and PowerPoint; the menu and the palette are the doors.
