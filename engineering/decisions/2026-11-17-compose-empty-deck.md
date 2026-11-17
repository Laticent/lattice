---
status: shipped
summary: >
  An empty deck looks empty. Compose draws no slide bar for it: one line to write on and a grid of four starting slides
  (title, content, cards-grid, big-number) drawn with the add-slide picker's own tiles and live previews, plus "Browse all
  N layouts". Typing starts a content slide and one Undo empties the deck again. Preview says "No slides yet", the counter
  and deck menu say "No slides", and Present says "Add a slide to present." The default layout is named `content`
  everywhere. Design C of three, after an independent UI/UX review (C 8.0, A 7.0).
---

# An empty deck in Compose: no slide chrome, and the first slide one tap away

**Date:** 2026-11-17 · **Owner's direction:** "empty means empty" (2026-11-16) · **Owner's pick:** design C

## 1. The answer

While a deck is empty, Compose draws no slide. It shows one empty line to write on, as Source shows one empty line, and
under it **"Start your deck"**: a hint, four starting slides and **"Browse all N layouts"**, which opens the add-slide
picker. Nothing opens on its own.

- **Four starting slides**, in this order: `title` (a deck opens on its title slide), `content`, `cards-grid`,
  `big-number`. They are the picker's own `Tile`, with live previews of the deck's theme (HARD RULE #15: no second
  picker). No Blank tile: typing makes that slide.
- **Typing starts a `content` slide.** Only a key that writes text does: arrows, Escape, Shift, ⌘B and ⌘I leave the deck
  empty. One Undo takes back the slide and the text together, back to an empty file.
- **A tile makes slide 1** in its layout, with nothing blank before it, and one Undo empties the deck again.
- **A pasted Markdown deck arrives as its own slides.** That path existed (`markdown-clipboard.ts`, #3234: slide breaks
  become slides and front matter merges, one undo step); the empty slide it pastes into is replaced, not kept. The spec
  pins it.
- **One call to add a slide.** The floating "New slide" button stands down while Compose shows the grid, and returns with
  the first slide. On a wide window the strip's "+ Add your first slide" stands down too, because the grid sits beside it.
  On a phone the strip keeps it: Preview is a separate tab there, and that tile is its only way to add a slide.
- **Phone and keyboard.** The hint reads "Pick a first slide, or just start typing" with a keyboard and "…or tap here to
  start writing" on a touch screen, and the empty line's placeholder says the same. A phone has no keyboard until a tap,
  so a tap anywhere on the canvas the grid's controls do not cover puts the caret on the line and raises it.
- **Accessible.** The grid is a region named by its heading, "Start your deck", described by the hint. Its four tiles are
  a list named "Starting slides". Tab from the empty line reaches the first tile.

## 2. How it was chosen

The owner's iPhone screenshots of a new, blank deck showed Compose inventing a slide: a divider, collapse, delete, and a
layout button reading `text`, around one empty line. Delete offered to delete it, and the New slide button asked "Before
this slide / After this slide" when no slide existed. The cause is the schema: `doc → slide+` (`deck-doc.ts`), so an
empty deck is stored as one empty slide and `SlideView` drew a real slide's chrome around it. The model stays as it is.
Only what is drawn and how the first input behaves change.

Three designs were mocked at 390px and 1440px, next to the real Studio's screenshots of the empty deck:

| Design | Idea | Outcome |
|---|---|---|
| A | A centered "Add a slide" button that opens the picker | 7.0 in the review |
| B | The picker opens on its own | Rejected: it covers the page before the author decides, gets in the way of typing, and fills a phone screen on every new deck |
| C | The empty canvas shows four starting slides and a link to the whole picker | **8.0, picked** |

The owner asked whether an expert had been consulted on A against C. One independent UI/UX reviewer, given the mock and
the screenshots but not the maker's recommendation, set its own rubric: time to a first useful slide 25%, not blocking
typing 20%, showing what the product makes 15%, phone fit 15%, cost 10%, simplicity 15%. It scored C 8.0 and A 7.0
("A hides the product: on a phone the first screen is a button and gray space") and named C's risks as memory and the
typing path getting lost. Its fixes are in the build: title first, no Blank tile, the hint at body size, 44pt tiles, a
grid that scrolls rather than shrinks. One fix was declined by the owner: static thumbnails instead of live previews. A
static image cannot show the deck's own theme, and the frames are bounded and measured (§4).

## 3. What "empty" means

**Nothing after the front matter but spaces and line breaks** (`isBlankDeck`, `docs/src/lib/front-matter.ts`). It is the
rule the slide index already counts by, so Compose, the strip, Preview and the counters agree: `deck-empty.test.ts` holds
`isBlankDeck(src)` equal to "the index has no slide" over thirteen shapes. Front matter alone is still empty. A lone `---`
is one blank slide, as the engine renders it, and is not empty.

Compose reads the rule from the text it emits, so the first keystroke clears the grid in the same frame, and from the
`source` it is given, so an Undo or a Source edit brings it back.

## 4. What the build measured

- **Preview frames.** The grid has its own `PreviewPool`, capped at its four tiles. On the real Studio at an iPhone's size
  an empty deck holds 5 frames (the four tiles and the live preview) in Chromium and in WebKit, and two rounds of typing a
  letter and undoing it created **no** new frame. That is on purpose: once shown, the grid stays mounted and is only
  hidden, because WebKit never frees a destroyed frame's document (about 11 MB each, `preview-pool.tsx`), and mounting it
  afresh on every Undo back to empty would have stranded four frames each time. The pool is not shared with the picker:
  each `PreviewPool` owns its frames.
- **Nothing moves (owner, 2026-11-17: "make sure there is no jank").** Two moves were measured on the real Studio and
  fixed. (1) The first build hid the slide bar with `display:none`, so the first letter brought it back above the line and
  pushed the text down under the author's caret: **94px on a phone, 54px on a desktop**, and Undo pulled it back up. The
  bar is now `visibility:hidden` while the deck is empty: it keeps its height, and its buttons stay out of the tab order
  and the accessibility tree. Every descendant is hidden at a higher specificity, because the active pill sets
  `visibility:visible`, which beats a hidden ancestor (the trap the `.cs-paused` rule already notes). The grid's top is
  measured from the line, not a constant, so it follows the bar's height at every width. (2) After an Undo back to empty,
  the change mark (`change-flash.ts`) put a deletion gap in the empty line, which gave it a second row and pushed the
  grid **27px** down (desktop). A blank deck has no text to mark, so the gap and the wash are not drawn while it is empty.
  After both, the line and the grid sit at the same pixel through a tap, the first letter and Undo, at 390px and 1440px,
  and a pasted deck's first line lands where the empty line was. `compose-empty-deck.spec.ts` holds both.
- **It fits a phone, just.** At an iPhone's 390×664 the grid ends 421px into the 435px left under the reserved bar and the line (WebKit; Chromium 422 of 434), so 14px spare. At a larger text size it scrolls inside its own box (`overflow-y:auto`) rather than shrinking the tiles.
- **Preview and Present.** Preview drew a blank slide numbered 1 with the counter at "1 / 0", the deck menu said "1 slide"
  beside a status bar's "0 slides", and Present opened a blank slide. Preview now shows "No slides yet" over the live
  preview (kept warm, so the first slide paints at once), `SlideCount` reads "No slides", `slideCountLabel(0)` reads "No
  slides", and every door to Present says "Add a slide to present." (the toolbar button is `aria-disabled` and says so).
- **The picker's line.** It said "Adds it after this slide" with no slide; on an empty deck it says "Adds it as slide 1",
  and the door's notice after a pick says "Added title as slide 1".

## 5. The default layout's name: `content`

Compose named the default component `text` on the layout button, the layout menu, its Undo notice, the pane chip and the
pane notice. No component is named `text`; Source and the docs say `content`. The owner chose `content` everywhere (this
round's second decision), and the five aliases are gone. `compose-panes.spec.ts` finds the pane chip by its new name.

## 6. Verification

The real Studio, served by `npm run dev`, driven by `docs/e2e/compose-empty-deck.spec.ts`: seven tests on Chromium desktop
and the 390px phone project, and three of them (the empty state, typing and Undo, a tile and Undo) on WebKit phone and Gecko as well. They cover no slide chrome
and no second door; typing then one Undo back to an empty file; keys that write nothing; a tile making slide 1, then Undo;
a pasted deck arriving as two slides with nothing blank before them; the picker's "as slide 1"; and Preview and Present
saying the deck is empty. Each failing arm is in the PR body.

The spec's first draft emptied the deck with ⌘A and Delete in Source and waited for the saved source to read `''`. A deck
that was never saved also reads `''`, so on WebKit phone the wait passed with the welcome deck still in place. It now uses
the fixture's `setEditorContent`, which checks the editor itself; that helper now skips the insert for an empty deck,
which Firefox's driver refused.
