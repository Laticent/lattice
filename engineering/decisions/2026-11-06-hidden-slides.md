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
(`lib/core/meta-keys.mjs`, the one value rule: a bare `hide` or `true`/`yes`/`on`/`1` hides, anything else shows, so a
note such as `<!-- hide: if short on time -->` never hides a slide by accident) and writes
`data-lattice-hidden="true"` on the section. A hidden slide **stays in the rendered document**, because the editor
shows it; it takes no page number and is not in the total. `hide` is a slide-scope key in the `meta` manifest, so an
un-underscored `<!-- hide -->` sets that slide only, never the slides after it (the rule `header`/`footer` follow).
A front-matter `hide:` is ignored: hiding a whole deck would make every export empty.

**A hidden slide is a `---` block, whatever the engine cuts it into.** Under `split: headings` one block renders as
several slides, and a pane slide as several pages. Present, the Studio's slide list, review comments and the print panel
all count blocks, so a `hide` anywhere in a block hides every page the block becomes: the heading split
(`lib/integrations/markdown-it/plugins.js`) and the pane split (`lib/core/panes.js`) open each new page of a hidden
block with its own `<!-- _hide -->`. The Studio's Hide Slide on a heading-split part therefore hides the whole block,
and writes `<!-- hide -->` at the block's top without cutting it. Not the owner's call; taken as the reversible default
that makes every surface agree, and listed on the PR's decision card.

**One reader for the directive** (`lib/core/hide-directive.mjs`), used by the engine, both splits, the source reader
and the Marp bake. VALUE: a bare `hide`, or `true`/`yes`/`on`/`1`, is on; `false`/`no`/`off`/`0` is off; anything
else is no directive at all, so `<!-- hide: if short on time -->` stays a speaker note. PLACE: only a top-level comment
block counts; `> <!-- hide -->`, a comment in a list item or inside a line of text is not a directive. The source
reader PARSES each slide with the shared boundary parser rather than matching lines, so it sees exactly the blocks the
engine sees (a line-regex reader disagreed with the engine on the blockquote case). Within a slide the last hide wins.

**A block is shown or hidden whole.** Each page the heading split or the pane split cuts from a block that mentions
`hide` ends with the block's resolved state (`<!-- _hide: true|false -->`), so a part's own comment can never outvote
its block: a `hide` in the first part and a `_hide: false` in the second show the whole block, as the source reader
says. **An all-hidden deck is an error**: the CLI exits 1 rather than write an empty file.

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
| CLI exports (PDF, PPTX, ODP, PNG, image sets, HTML player, captions) | Dropped from the one slide list every format reads, so notes and alt text (read off that list) stay aligned. The hidden sections ride beside the list (`hiddenSections`) so `--strip-notes` also removes their notes from the shipped source, and `sectionIndex` maps each exported page back to its authored number for front-matter `say:` and chart narration | `lattice.js` `engineSlides` |
| Studio PDF, PowerPoint, LibreOffice, images, print, Article | `buildDeckRender` drops hidden sections. PDF review comments and the print panel's preview cells are keyed by `---` block, so they drop the blocks the source hides (`hiddenAuthoredSlides`), keeping a sparse list's gaps | `share-export.ts`, `PrintOptionsPanel.tsx` |
| Studio Webpage and Captions | Filter the render themselves (they do not use `buildDeckRender`); hidden slides' note bodies join the strip-notes scrub; captions re-key front-matter `say:` to the shown slides | `share-export.ts` `shareHtmlPlayer`, `shareCaptions` |
| Narration bake | Resolves the shown slides only, `say:` by authored number, as Present does | `narration-bake.ts` `resolveDeck` |
| Export to Marp (both hosts) | Marp has no hide of its own (only `paginate: skip`/`hold`), so the bundle carries one. `bakeHidden` rewrites every hide Lattice reads as `<!-- _hide: true|false -->`, and the split bake stamps each part of a block with its state. The bundle's engine is deliberately NOT a Marp custom directive (the pattern Marpit's maintainer publishes): Marpit reads directives in blockquotes, list items, inline text and multi-key comments, where a plain `hide:` would carry onto every later slide (a checker measured whole decks vanishing). It reads exactly what Lattice reads, a top-level comment that is only `_hide: <value>`, last one winning, marks it handled so it is no presenter note, and drops the slide before `marpit_inline_svg` (after it, an empty `<svg>` printed as a blank PDF page) and before `marpit_directives_apply`, which then numbers the shown slides 1..N. Any other `hide` comment stays a note in both. Measured with marp-cli 4.5.1 on `examples/hidden-slides.md`: 6 pages of 8 slides, numbered 3, 4, 5 of 6 like Lattice's own PDF, light and dark. **Marp for VS Code shows hidden slides, in its preview and its own Export Slide Deck… command**: the extension never reads `marp.config.cjs`. Its export writes a temporary JSON config of its own (theme set, HTML, PDF notes) and runs its bundled marp-cli with `-c` on that (read in marp-vscode 3.6.1's `lib/extension.js`, `createConfigFile`), and its preview renders with its built-in marp-core. Reproduced with marp-cli 4.5.0, the version marp-vscode 3.6.1 bundles: a config shaped like the extension's gives 8 pages with the hidden text; the bundle's `marp.config.cjs` gives 6. The bundle's README says so and points to the *Marp:* tasks | `lib/core/bake-splits.js`, `lib/export/marp-bundle-html.js` |
| File names | The CLI's `<title>` and PDF/PPTX metadata title come from the first SHOWN slide's heading; the Marp bake writes a `title:` when a hidden first slide would otherwise name marp-cli's file | `lattice.js` `deckTitle`, `bake-splits.js` `withShownTitle` |
| Present | Never presented under any lens; opening on a hidden slide lands on the next shown one | `deck-lint.ts` `presentationPairs`, `PresentOverlay.tsx` |
| Studio strip, slide map | Keeps its place; an eye-off mark stands where its number was; the accessible name says "hidden" | `SlideRail.tsx`, `StudioMap.tsx` |
| Studio preview bar | A **Hidden** chip that is also Show slide | `StudioShell.tsx` |
| Slide menu, command palette | **Hide slide** / **Show slide** (one Undo step) | `strip-actions/model.ts`, `hide-ops.ts` `setHiddenAt` (loaded on the click; `deck-ops.ts` `isHiddenAt` is the read) |

**What the Studio writes.** Hide Slide and Show Slide first remove every hide DIRECTIVE line of the block: a top-level
comment block, found by the shared boundary parser, that the one reader reads as on or off (a `hide:` note, a sample in
code, and a comment in a list item, blockquote or HTML block are the author's and stay), each taking one adjacent blank
line with it. Hide then writes `<!-- hide -->` as the block's first line; Show is done. Hide then Show therefore gives
the block back byte for byte unless it held hide lines of its own, which are gone. A hide the removal cannot see is
outvoted at the end, `<!-- hide -->` or `<!-- _hide: false -->`, the last hide winning. Pinned by
`deck-ops.hide.test.ts`. This write code lives in `hide-ops.ts`, which the Studio imports on the Hide or Show click:
it parses the slide, and the Studio route's startup JavaScript sits at its ceiling. The idle warm-up
(`studio-warm.ts`) fetches it early, even under Save-Data, so the click works offline; if it still cannot load, the
click says so. The click reads the deck when it happens, and if the deck changes before the code arrives (a keystroke,
a Live peer), it asks for another click rather than hide the wrong block. Show keeps the block's first line as written,
so an indented code block that followed the hide stays code.

## 5. Verification

- `test/unit/engine/hidden-slides.test.js`: the value rule, the four spellings, slide scope, the rail and glyph, and an
  oracle that every slide rendered alone with the slice path's supplied position matches the whole-deck render.
- CLI probe (3 slides, slide 2 hidden): PDF 2 pages numbered 1 and 2; PPTX 2 slides carrying the notes of slides 1
  and 3; PNG 2 files.
- `docs/e2e/strip-hide.spec.ts`: the menu, the strip mark, the chip and Undo, in a real browser.

**The checker's pass** (maker-checker, before the PR) found twelve defects in the first cut, every one fixed and pinned
by a test: `--strip-notes` leaking a hidden slide's note; a hidden pane slide hiding one page of two; CLI captions keyed
one slide off; the Studio Webpage and Captions exports skipping the filter; front-matter `hide:` emptying the deck;
an inline `<!-- hide -->` read differently by the engine and the Studio; heading parts hidden per part by the engine and
per block by Present; review comments moving pages; the print panel pooling the wrong cells; the narration bake losing
alignment; the strip reading a stale index; and a note starting with "hide" hiding its slide. A second checker, on
those fixes and the Marp bridge, found seven more, also fixed and pinned: the captions remap missing a deck where a
split and hidden slides cancel out; the Marp bake dropping `_hide: false`; a hidden first slide naming the exported
file; `> <!-- hide -->` read differently by the engine and the source reader; a block's parts disagreeing when one part
says hide and another says show; a `hide:` note swallowed; and the Studio's narration projection counting hidden
slides. A third, on those fixes, found four more, fixed and pinned: Marp's own directive parser hiding slides Lattice
shows (the bundle no longer registers a Marp directive); the Studio's Show deleting a `hide:` note and Hide losing to an
older `_hide: false` (both now remove only real hide lines first); the notes leak audit reading a `hide:` note as a
directive; and the Marp title for a deck with no front matter. A fourth, on that commit, found nine more, all fixed and
pinned: the bundle's title written through a replacement string, so a `$` corrupted its front matter and let the hidden
slide name the file; the Marp rule reading `_hide: maybe` as off and swallowing its note (it now mirrors the on/off/none
rule, and the slide-only respotting leaves `hide` notes as written); a `_hide` comment with trailing text hiding in
Marp only (a comment counts only alone on its line); Hide and Show deleting a list-item comment and leaving blank lines
(both now parse); this paragraph out of date; and Export to Marp writing an empty bundle for an all-hidden deck (both
hosts now refuse, as the CLI does). The Marp rule is pinned in `test/unit/core/marp-bundle-html.test.js`, the title in
`test/unit/parsing/bake-hidden.test.js`.

## 6. Not done here

- **Numbering in the strip.** The strip numbers slides by their place in the editor (every slide), which is also what
  the pager's "3 / 6" counts. A shown slide's strip number can therefore differ from its exported page number when a
  hidden slide comes before it. The eye-off mark on the hidden pill is what explains the gap.
- **A spot hide nested in a blockquote or list** (`> <!-- _hide: true -->`). Neither host hides the slide, and the speaker
  notes classify the comment as a directive, so it is neither a hide nor a note. A misplaced directive, left as is.
- **A keyboard shortcut.** None, as in Keynote and PowerPoint; the menu and the palette are the doors.
