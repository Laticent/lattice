---
status: in-progress
summary: >
  The Studio keeps the markdown editor, Compose, the preview and the slide rail in step
  through StudioShell's React state, three different caret-to-slide mappings and about
  eight hand-rolled echo guards. Measured on a 123-slide deck, a bare arrow-key press costs
  24 ms (median Event Timing) and a Compose keystroke 88 ms, mostly StudioShell
  re-rendering and the rail re-parsing every slide through a 6-entry cache. The git
  history shows six recurring failure classes. Proposed: Fuoco, a small framework-free
  focus hub with one incremental slide index, stable slide ids, origin-stamped and
  revision-stamped events, per-frame delivery lanes, and a source-span address for preview
  elements so a click in the preview can later select and restyle what it hit.
  Owner-approved 2026-10-15 (section 10). Phases 1 and 2 ship in the first PR.
---

# Fuoco: one focus hub for the Studio's panes

*Fuoco* is Italian for "focus". It is a small library that holds where the author's
focus is (which slide, which page, which source range, which preview element) and tells
every pane that cares when it moves.

## 1. The symptom

The owner: "sick and tired of syncing between editors (markdown editor and Compose) and
the preview, and the slide selector." Things that worked stop working after an unrelated
change. Section 3 shows why that keeps happening; section 4 shows that the current wiring
is also slow enough to feel on a real deck.

## 2. What the code does today

There is no store and no event bus for "where am I". `StudioShell.tsx` is the hub.

- **Current slide has about nine copies.** `activeSlide` (React state, an index into the
  lens-filtered set), `slideNoRef`, `activeFullIndex`, each editor's `lastSlideRef`,
  DeckPreview's `issuedRef`, the rail's `aria-current` (read back by `centerRail`), the
  persisted boot slide, Live awareness, and Present's own `idx`.
- **Split page has about six copies**: `pageRequest`/`pageRequestRef`, `shownSplit`/
  `shownSplitRef`, `reportedRef`, `editorPanePage`, DeckPreview's `splitPage`, and the
  module-level `splitPageByHost` WeakMap in `single-slide-render.ts`.
- **The caret never leaves an editor as an offset.** The shell receives `caretText`, the
  caret line's text, and the preview re-finds the caret by matching that text
  (`caretProbe`, `pickSplitPage`, `panePageOfCaret`).
- **Three caret-to-slide mappings.** The markdown pane calls `slideIndexAt(doc.toString(),
  head)` on every selection change. Compose takes the index of the top-level ProseMirror
  node. The Playground runs its own regex scanner (`caretSlideIndex`), which
  `engineering/gotchas/studio-playground.md` says not to write.
- **Lens mapping matches slides by their text**: `slides.indexOf(viewSlides[i])`. Two
  identical slides (after Duplicate) always resolve to the first.
- **About eight loop guards.** Each editor pre-seeds `lastSlideRef` before its own
  programmatic moves; the shell brackets navigation in `navigatingRef` and relies on the
  editor's echo arriving *synchronously*; `waitingStepRef` holds one step for up to
  1500 ms; Compose skips its own echo by string compare and parks external edits while it
  has focus. Four call sites wait one `requestAnimationFrame` before `revealSlide` "after
  the value-sync pushes the doc."
- **Asymmetric reveals.** `applyDeckOp`, checkpoint restore, AI-apply and the Coach jump
  reveal only the markdown pane, never Compose. `MotionTargets` sets `activeSlide` without
  revealing either editor. A Live "follow" jump moves your caret and takes focus.
- **No source positions in the preview.** No rendered element carries a source offset or
  line. Sparks carry their source *text* (`data-src`), pills carry nothing. The only
  identities are `data-lattice-slide`, chart `data-mark`/`data-label`, and spark
  `data-src`.

## 3. Why it keeps breaking: six failure classes

From the commit bodies (about 25 read in depth out of 88 subject hits and 32 symbol hits):

| Class | Commits read | Examples |
|---|---|---|
| 1. Several answers to "which slide is this" disagree | about 9 | `f9f185e3d` a `---` in a fence shifted every later slide; `2d44d1569` front matter's closing `---` counted as a separator; `fc75546bc` six `hr` spellings split for the engine but not the Studio; `backlog.d/1570.md` (open) heading splits are invisible to the Studio |
| 2. Echo-guard refs go stale | about 6 | `ae795b110` `loadDeck` reset `activeSlide` but not `lastSlideRef`, so a caret move was swallowed; `d1dbb30ea` a fold restore fired `onCursorSlide(0)`; deleting the edited slide threw the caret to the last slide |
| 3. Async render races | about 5 | `e7af3c7e8` a fast second swipe crossed a split slide before its render landed; `21ec0edf5` a ResizeObserver re-land undid the reader's scroll |
| 4. Navigation tangled with focus and caret | about 4 | `9ccd5d26a` an arrow key that navigated also focused CodeMirror, so navigation worked once; `c4083e04a` picking a slide raised the tablet keyboard |
| 5. Scroll and reveal geometry | about 4 | `c4083e04a` Compose's `scrollIntoView` did not move `.cs-host`; `fe4a448b` `centerRail` scrolled a zero-width rail |
| 6. Identity by content or index | latent | lens `indexOf` above; Compose folds by source chunk, so duplicates fold the wrong slide |

Classes 1, 2 and 6 share one cause: every consumer derives its own answer and keeps its
own memory of the last answer. Class 3 shares another: an event carries no stamp saying
which version of the deck it was computed against, so a late one is indistinguishable from
a current one. Every past fix patched one call site, so the next feature that touched the
seam brought the class back.

A seventh pattern makes the breaks feel sudden: at least six tests were recorded as green
while measuring nothing (`2d44d1569`, `c4083e04a`, `91dcec4d`, `ae795b110`, the two fuzz
notes). A defect sits behind a dead oracle until a nearby change exposes it.

## 4. What it costs today

Measured on 2026-10-15 against the production build (`npm run build:e2e`, `astro
preview`) in headless Chromium at 1440 × 900, using the gallery deck. "Event Timing" is
the browser's own per-interaction duration (input to the next paint), the number INP is
built from. Harness: `.scratch/sync/studio-sync-bench.mjs` (to be committed as
`tools/studio-sync-bench.mjs` with phase 1).

| Interaction | 20 slides, markdown | 123 slides, markdown | 123 slides, Compose |
|---|---|---|---|
| Arrow key, held-key pace (Event Timing median / p90) | 16 / 32 ms | 24 / 40 ms | 32 / 72 ms |
| Slide change → rail highlight (median) | 14 ms | 26 ms | 38 ms |
| Slide change → preview shows it (median / p90) | 33 / 37 ms | 47 / 67 ms | 67 / 98 ms |
| Typing in a slide (Event Timing median / p90) | 40 / 56 ms | 56 / 72 ms | **88 / 112 ms** |
| Rail click → slide (Event Timing median) | 48 ms | 64 ms | — |
| Long tasks while typing 35 characters | — | 3 | **32 (1967 ms)** |

The sync is *correct* in these runs: the preview followed every slide change. It is slow,
and it gets slower with deck size even when the slide does not change. Event Timing
includes the wait for the next paint, so about 16 ms is the floor for any key press; the
20-slide deck sits at that floor and the 123-slide deck does not.

**Where the time goes.** A CPU profile of 36 arrow presses that never left their slide
(123 slides, markdown pane) spent 497 ms in React, 301 ms of it rendering `StudioShell`,
and 193 ms inside `slide-boundaries.mjs` running markdown-it. A pure caret move should
parse nothing. Two causes:

1. **The caret line is shell state.** `onCursorText` sets `caretText` on every line
   change, so every arrow press re-renders the 7,000-line `StudioShell` and the whole rail.
2. **The rail re-parses every slide on every render, through a cache sized for six
   decks.** The rail calls `slideClass(s)` for every slide; `slideClass` reaches
   `chunkBoundaryLines`, which runs a markdown-it block parse memoized in a 6-entry LRU
   keyed on the text. 120 per-slide strings through 6 slots is a 100% miss rate. Measured
   in isolation: 120 `slideClass` calls take 9.1 ms warm, against 0.28 ms for 20 memo
   hits. The cache was sized for whole decks (its own comment enumerates five preview
   call sites), then a per-slide caller arrived.

For Compose typing, 35 keystrokes spent 1.8 s in React and 808 ms in `slide-boundaries`:
about 23 ms of whole-deck and per-slide parsing per keystroke, before the preview renders
anything.

Kernel cost of the markdown pane's own mapping (`slideIndexAt`, Node, same deck
replicated): a caret move is 0.31 ms at 123 slides and 1.79 ms at 978; a keystroke
re-parses the whole body, 2.3 ms at 123 slides and 14.7 ms at 978. Both are O(deck)
for an O(1) question.

## 5. The design

### 5.1 Principles

- **One derivation.** One `DeckIndex` answers "which slide, which page" for every pane,
  built from the engine's own boundary kernel (HARD RULE #1). Nobody else splits slides.
- **Facts carry provenance.** Every event names its origin pane, the source revision it was
  computed against, and a sequence number. The hub, not each pane, drops echoes and
  stale events. No pane holds a `lastSlideRef`.
- **Intent is separate from fact.** "Go to slide 7" (from the rail, a key, Live) is an
  *intent*. The hub resolves it against the index and publishes the resulting *focus fact*.
  Panes move their own caret when they see a fact from another origin; nobody calls into
  another pane's imperative handle.
- **Subscribers read only what they need.** A selector per subscriber, compared by value,
  so the rail re-renders when the slide changes and not when the caret line does.
- **Delivery is scheduled, not synchronous.** The hub updates its state synchronously and
  delivers on lanes (5.4). No correctness depends on an echo arriving inside a call stack.
- **Small state.** One focus record, an LRU of recent indexes keyed by source revision,
  and an LRU of each slide's last caret so returning to a slide restores where you were.

### 5.2 The index: incremental, with stable slide ids

`DeckIndex` holds, per slide: a **stable id**, its start and end offsets, its pages (for
auto-split and panes), and memoized derived labels (class, title). Callers ask
`slideAt(offset)` (binary search, O(log n)), `rangeOf(id)`, `pageAt(offset)`.

- **Incremental.** An edit arrives as the editor's own change description (CodeMirror's
  `ChangeSet`, ProseMirror's step map, or a plain `{from, to, insert}` list). The index
  shifts every boundary after the edit and re-parses only the affected region: from the
  boundary before the edit to the next boundary the parse confirms. An edit that opens a
  fence or touches front matter falls back to a full parse, which is still correct, only
  slower. A keystroke inside a slide then costs one slide's parse, not the deck's.
- **Stable ids.** Each slide gets an id when the index first sees it, and the id travels
  through edits by position mapping. Duplicating a slide makes a new id. The lens, the
  rail keys, Compose folds, the persisted boot slide and Live awareness all use ids, which
  removes class 6.
- **The engine's count.** The index uses the engine's split, including heading splits, so
  `backlog.d/1570.md` closes as a side effect. That changes the rail's count on decks
  that rely on `split: headings` (it becomes correct).

### 5.3 The hub

```ts
type Origin = 'markdown' | 'compose' | 'preview' | 'rail' | 'keys' | 'present' | 'live' | string;

interface Focus {
  rev: number;            // source revision this was computed against
  seq: number;            // monotonic per hub
  origin: Origin;
  slide: SlideId;
  page: number;           // 0 unless the slide auto-splits or has panes
  range?: { anchor: number; head: number };   // source offsets, when an editor has one
  element?: ElementAddr;  // set by a preview pick (5.5)
}

const hub = createFocusHub({ index });
hub.report('markdown', { offset, anchor?, head?, rev });   // an editor's caret or selection moved
hub.request('rail', { slide: id });                          // intent: go there
hub.request('keys', { step: +1 });                           // intent: next page or slide
hub.pick('preview', { element });                            // intent: the author clicked this element
const off = hub.subscribe(selector, onChange, { lane: 'frame', ignoreOrigin: 'markdown' });
```

- `report` from an editor is a fact about that editor. The hub maps it through the index
  to `{slide, page}` and publishes a new `Focus` only if a selected field changed.
- `request` and `pick` are intents. The hub resolves them and publishes a `Focus` whose
  origin is the requester. The editors, subscribed with `ignoreOrigin` set to themselves,
  move their caret; the requester does not hear its own echo.
- A `report` stamped with a `rev` older than the index's current revision is mapped
  forward through the edits since (the index keeps a short change log) or dropped. That
  removes the 1500 ms `waitingStepRef` window and the single-rAF waits.
- No subscriber can publish synchronously inside a delivery. A publish during delivery is
  queued for the next turn of the lane, so a misbehaving subscriber cannot start a loop.
  A dev-only counter fails a test if one focus change causes more than one re-publication.

### 5.4 Delivery lanes

| Lane | When it runs | Who uses it |
|---|---|---|
| `sync` | Before the call returns. Reserved for the hub's own index update. | the index |
| `frame` | Once per animation frame, latest value only | rail highlight, preview slide and page, editor caret reveal |
| `idle` | `requestIdleCallback`, with a 500 ms ceiling | boot-slide persistence, Live awareness, analytics |

Coalescing is per subscriber: a held arrow key that crosses three slides in one frame
delivers one change, the last. The preview already coalesces through
`createFrameScheduler`; the hub feeds it rather than replacing it.

### 5.5 Preview element addresses (for click-to-restyle)

A future feature lets the author click an element in the preview and change its look the
way Compose pills do. That needs a way back from a rendered element to its source. The
proposal:

- In **preview mode only**, the engine stamps `data-lsrc="<start>-<end>"` on the elements
  it renders from source, as offsets relative to the slide's start, taken from markdown-it
  token maps (block level) and inline token positions (pills, sparks, emphasis). Export
  does not stamp them, so exported bytes are unchanged.
- An `ElementAddr` is `{ slide: SlideId, start, end, kind }`. A preview click hit-tests
  through the existing `frameGeom` bridge, walks up to the nearest `data-lsrc`, and calls
  `hub.pick`. The editors select that source range; a later restyle panel subscribes to
  `element` and edits the source range through the same path Compose pills use.
- The reverse works too: a caret inside a pill's source can highlight the rendered pill.

This replaces the text matching in `caretProbe`, `pickSplitPage` and the spark findings,
which are the fragile half of today's preview-side mapping.

### 5.6 React adapter

`useFocus(selector)` wraps `useSyncExternalStore`. StudioShell stops holding
`activeSlide`, `caretText`, `pageRequest`, `shownSplit` and their refs. The rail becomes
its own component keyed by slide id, with `aria-current` toggled on two buttons instead of
re-rendering all of them. Rail labels come from the index's memoized per-slide labels.

### 5.7 Where it lives

`docs/src/lib/fuoco/`, framework-free TypeScript like Vetrina, with the React adapter at
`docs/src/lib/fuoco/react.ts`. The index wraps `lib/core/slide-boundaries.mjs`; the source
stamping (5.5) lives in the shared engine kernel. The Playground and the future desktop
app reuse the same hub.

## 6. How we keep it from rotting

- **A model-based fuzz test.** It drives random sequences (edit, caret move, rail pick,
  step, undo, delete slide, duplicate slide, lens change, late render report) across fake
  panes and checks invariants after each settle: every pane agrees on the slide id; the
  index's count equals the engine's; no event is delivered to its own origin; one focus
  change causes at most one publication per subscriber.
- **Every oracle has a failing arm.** Each invariant test runs once against a deliberately
  broken hub (echo filter off, stale check off, index not shifted) and must go red. This
  is the direct answer to the "guards that cannot fail" pattern in section 3.
- **A committed browser benchmark** (`tools/studio-sync-bench.mjs`) with the table in
  section 4 as the "before" row.

## 7. Targets

On the 123-slide deck, production build, same machine:

| Interaction | Today | Target |
|---|---|---|
| Arrow key inside a slide | 24 ms Event Timing, StudioShell re-renders | The 16 ms frame floor at any deck size. No React render outside the editor. Zero markdown parses |
| Slide change → rail | 26 ms | The next frame |
| Slide change → preview, cached slide | 47 ms | Within two frames |
| Keystroke, sync share of the cost | about 23 ms of parsing (Compose) | Under 1 ms, and flat from 20 to 1,000 slides |
| Echo guards in the panes | about 8 | 0 |

## 8. Phases

One branch and one PR for the line of work (HARD RULE #17), one commit per phase.

1. **Kernel.** `DeckIndex` (incremental, stable ids, engine count), the hub, lanes, the
   React adapter, the fuzz test with failing arms, and the committed benchmark.
2. **Markdown pane, rail, preview.** Move them onto the hub; delete `lastSlideRef`,
   `navigatingRef`, `waitingStepRef`, the rAF waits and the `caretText` text matching for
   those paths. Re-measure.
3. **Compose, Present, Live, MotionTargets.** Same move; fix the asymmetric reveals as a
   consequence rather than one by one.
4. **Preview element addresses.** Engine stamping in preview mode, `hub.pick`, and the
   editor selection on click. The restyle panel itself is a separate feature that builds
   on this.

## 9. Not done here

- The restyle panel UI for preview clicks (5.5 only provides the address and the event).
- The Playground's separate scanner moves onto the index in phase 3 only if it shares the
  Studio's surfaces; otherwise it gets its own follow-up.

## 10. Decisions (2026-10-15)

The owner answered the four open questions in one round:

| Question | Answer |
|---|---|
| Scope of the first PR | Phases 1 and 2: the kernel, then the markdown pane, rail and preview |
| Slide count | Match the engine, heading splits included; `backlog.d/1570.md` closes |
| How a preview element finds its source | Source spans stamped in preview mode only (5.5), built in phase 4 |
| Name | Fuoco |

**How heading sections reach the panes.** The editors keep editing chunks (the text between
separators) and every chunk-indexed caller keeps its meaning: chunk `i` in the index is
`splitSlides(body)[i]`. A chunk carries its heading sections as offsets. The rail lists
sections, one pill per rendered slide, so its numbers are the PDF's. The preview receives a
heading-split chunk the way it already receives a split panes slide: the per-slide render
count map (`paneCounts`) says how many rendered slides the chunk becomes, and the page asked
for (`panePage`) says which one to show. That route already narrows a whole-deck render to
the right section, so a heading-split deck stops falling back to "first section only".

**One forward-scanning rule.** The incremental index re-parses only the region an edit
touched, which is exact for every CommonMark block rule because none of them declines for
want of a closer further down. The math plugin's `$$` block does: it opens only if a later
line ends with `$$`, which can sit slides away. The random-edit test found this within its
first few thousand runs. The index now rebuilds fully when either version of the region
holds a `$$` line, and a test fails on any plugin block rule that is not classified as
forward-scanning or not, so the next plugin cannot slip past it.


## 11. Phases 1 and 2 as shipped

**What moved onto the hub.** The markdown editor reports every caret move and the text with
its own change span; it reveals a slide when any other pane navigates. The shell holds no
slide state of its own: it reads the focused chunk, heading section and page run back from the
hub with `useFocus`. The rail is its own component, one pill per rendered slide, keyed by
stable chunk id. The preview takes its slide and page from the hub through `FocusedPreview`.
Slide operations, restores, AI edits, deck switches and lesson appends navigate with
`go(…, { after })`, which waits for the hub to hold the new text; no `requestAnimationFrame`
is left in front of a reveal.

**Guards removed.** `lastSlideRef` and its mount-seeding rules (`builtForRef`), the
value-sync's pre-seeding, `navigatingRef`, `waitingStepRef` and its 1.5 s window,
`pageRequest`, `shownSplit`, `reportedRef`, `paneDeckRef`, `caretText` as shell state, and
`slides.indexOf(text)` lens lookups. The editor's `revealSlide` handle is gone; so are
`slideIndexAt`, `slideStartOffset` and `slideEditableOffset` (their test cases run against the
index now).

**Two things the design note did not foresee.**

- A store notification inside a React render is an update React refuses, and the shell feeds
  the hub from its render (so everything that render reads is the index of its own text). The
  hub's `source(…, { duringRender: true })` delivers a focus that edit moved on a microtask.
- The editor's reveal produces a caret move of its own. Reporting it as the author's undid the
  page navigation had chosen ("previous" enters a split slide on its last page, and the reveal
  then asked for the caret's page). The editor reports a move with no user event as `quiet`:
  inside the focused slide it refreshes the caret without changing the page.

**Measured, same machine, same time, `main` (7f36cab) against this branch**, production builds
side by side, `tools/studio-sync-bench.mjs`, 123-slide gallery deck, two runs each, averaged:

| Scenario | `main` | Fuoco |
|---|---|---|
| Arrow key at held-key pace, Event Timing median / p90 | 24 / 40 ms | **16** / 40 ms |
| Arrow key, slow, Event Timing median / p90 | 24 / 36 ms | **16 / 24** ms |
| Slide change → rail, median | 25 ms | **15** ms |
| Slide change → preview, median / p90 | 49 / 64 ms | **36 / 44** ms |
| Typing in a slide, Event Timing median / p90 | 72 / 92 ms | **60 / 80** ms |
| Long-task time over those 35 keys | 966 ms | **405** ms |
| Rail click, Event Timing median / p90 | 76 / 96 ms | **48 / 64** ms |
| Rail click → preview, median | 62 ms | **37** ms |

The slide index alone, in Node, per keystroke with the editor's span: 0.12 ms at 120 slides,
0.14 ms at 360, 0.29 ms at 960, against 2.3 ms and 14.7 ms for the per-keystroke whole-deck
parse it replaced. A caret lookup is under a microsecond at any size. That is under the 1 ms
target in section 7, and nearly flat; the remaining growth is two native string compares over
the deck and shifting the chunk records after the edit.

**What still costs.** Typing is still 60 ms because the shell keeps the deck text in React
state and re-renders on every keystroke; the profile shows `unknownComponents` /
`usedComponents` re-parsing the deck three times per key and the preview's own deck-context
scan. Neither is sync, and both are recorded as follow-ups rather than widened into this change.

**Verified on the real Studio** (production build, headless Chromium) at 1440, 820 and 390 px:
an outline deck (`# Quarterly review`, two `##`, then a `big-number` slide) shows four rail
pills and "Slide 3 / 4" with the caret under the second `##`; the preview shows that section;
a click on pill 2 shows "Revenue grew" and parks the editor's caret on `## Revenue grew`.

**The checker round** (an independent agent drove the built Studio against the diff) found
three regressions and three smaller holes, all fixed in this change with a test that fails
without the fix:

- After a deck switch, caret moves stopped reaching the rail until the next keystroke. The
  rebuilt view kept the previous deck's revision and the hub dropped its reports as stale. A
  new view now restates its revision, and an index re-split under new parser rules keeps the
  revision of the same text.
- Boot restored slide 1, not the slide you left on: the save effect wrote 0 before the boot
  navigation ran. The boot slide is read on the first render and saving waits for a focus.
- In Compose, a navigation was undone by Compose's own echo: its caret report carried no
  section and reset the section and page navigation had chosen. A `reportChunk` without a
  section now keeps them inside the focused chunk, the way a quiet editor report does.
- A step waited forever when the focus sat on a slide a reader lens hides; a waiting step now
  needs a viewed slide, and the shell drops it when the preview hides, Present opens or the
  deck or lens changes. A page step publishes cause `page`, so it no longer moves the caret.
  The resolver's `scansAhead` tests used `it` in a `test` file and never ran.
- `splitSlides` stripped front matter a second time, so a body that opens with `---` read as
  one slide to every slide operation and two to the engine and the index. Every caller passes
  a stripped body; the second strip is gone.

**The corpus pass #1570 asked for.** Every committed Markdown file with front matter or a `---`
(examples, the baseline decks, the docs site's content), counted by the deck outliner as
authored slides and as rendered slides: 314 files, 24 change, 2,776 slides become 2,933. One of
the 24 is a deck, `examples/split-headings.md`, 1 → 7, the very shape #1570 describes. The other
23 are docs-site prose pages (`docs/src/content/docs/**`); they change only if opened in the
Studio, where they now count the slides the engine renders. `splitSlides` itself stays
separator-only on purpose: it feeds slide operations (move, duplicate, delete), which act on
authored slides; the rendered count lives in the outliner, which every count consumer reads.

**Left for phases 3 and 4** (`followups.d/2704-p1` to `p6`): Compose reports a chunk, not a
section, so a Compose caret under a heading shows the chunk's first section; Compose keeps its
internal `lastSlideRef`; Present seeds from a chunk index and does not follow; Live awareness
and the persisted boot slide are chunk indices, not ids; the Playground keeps its own scanner;
preview element addresses (5.5) are not built.

## 12. A generic core, and Lattice as one adapter

The owner asked for a library that is not Lattice-specific, so the hub was split from the deck
before the first merge rather than after.

**The seam.** The core (`docs/src/lib/fuoco`, published as `@laticent/fuoco`) knows a document
only as an `Outline`: text cut into UNITS with stable ids, each unit into PARTS, offsets
absolute. An `Outliner` builds and maintains it (`update(prev, text, { span })`, returning
`prev` for equal text). The hub speaks only that interface. Renames that followed: chunk →
unit, section → part, `hub.source()` → `hub.update()`, `{ chunk, section }` → `{ unit, part }`
in `pages()` and `go()`.

**What stayed shared.** The id and revision counters (`nextUnitId`, `nextRevision`), the change
span (`diffSpan`, `spanHolds`, `mapOffset`) and every lookup (`unitAt`, `partAt`, `partOfFlat`,
…) live in `outline.ts`, so an id or a revision is unique whichever outliner produced it. Id
CARRYING is not shared yet: `carryIds` serves `createTextOutliner` and any custom outliner, while
the deck outliner keeps the region matching it shipped with in §11, because it matches only
inside the re-parsed region. Moving it onto `carryIds` is logged as a follow-up.

**The Lattice adapter** moved to `docs/src/lib/deck-outline`: `deckOutliner` is the
incremental slide index of §11, now an `Outliner`, with `deckEditableOffset` beside it. Its
tests are unchanged apart from the names.

**The general outliner.** `createTextOutliner({ units, parts?, dropEmpty? })` re-runs a splitter
over the whole text on each change, which is linear and fine into the hundreds of kilobytes;
`byPattern`, `byHeadings` (ATX, fenced code skipped, a fence closes on a run of the same
character at least as long as its opener, with nothing after it) and `byBlankLines` cover the
common shapes. A
document too large to rescan writes its own outliner, as Lattice did.

**The boundary is gated.** `checkFuocoBoundary` in `tools/check-ownership.js` fails a core file
that imports outside the folder, a file other than `react.ts` that imports React, or any
`node:` import. `docs/tsconfig.fuoco.json` typechecks the core alone, so an implicit
dependency on the docs app's types fails there. The package builds with the shared library
builder (`tools/build-fuoco-lib.js`, `npm run fuoco-lib:build`) like its siblings.

**Brand and demo.** The mark is a viewfinder: four focus brackets around the family's ringed
hub, the focused line either side in a warm accent (`2026-07-18-sibling-brand-system.md`, the
Fuoco section). The demo page `/fuoco` runs the real library over three document types, a
Markdown document, a timed transcript and a code file, through `createTextOutliner` alone, with
the same four views and no change to them between domains. That is the test of the claim in
this section: if the views had to change per domain, the core would still be deck-shaped.

**Found by driving the demo.** A textarea fires `select` and `focus` after a programmatic
`setSelectionRange`, so an adapter that clears its "this caret came from my reveal" mark on the
first report sends the second one un-quiet, and the hub drops the page navigation chose. The
demo's adapter keeps the mark until the selection moves away. The Studio's CodeMirror adapter
is not affected: it marks a report quiet from the transaction itself (no `userEvent`
annotation means no author did it), so it keeps no mark that a second event could clear.
