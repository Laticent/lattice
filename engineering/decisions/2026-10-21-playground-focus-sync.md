---
status: shipped
summary: >
  The Playground's editor, preview and slide map now share one Fuoco hub (lib/playground-sync.ts).
  Scrolling the preview marks and shows that slide in the editor and leaves the caret parked; the next key
  brings the preview back to it. A click on a slide puts the caret at the end of its title and frames the
  slide, `---` fences included. Fuoco gains lines, columns and the host's section words (place.ts). The
  regex scanner `caretSlideIndex` and its 140 ms timer are deleted; the preview iframe and the editor
  scroller get the thin, palette-quiet scrollbar the page already had.
---

# The Playground's one focus (2026-10-21)

## 1. The symptom

The owner, on the Playground: the preview scrollbar is unstyled; scrolling the preview does not
highlight the slide in the editor; the caret should keep its line and column, or be remembered, so an
arrow key returns to it; a click on the highlighted slide should land where it was clicked; a click on a
slide in the preview should put the caret at the end of its title with the slide, `---` included, in
full view; and Fuoco should know lines and sections, not only offsets.

## 2. Cause

The Playground answered "which slide is the reader on" twice, and the answers never met.

- **Caret to preview** ran through `onCaret`, a 140 ms timer and `caretSlideIndex`
  (`playground-controller.ts`), a regex scanner that matched the caret line's words against the
  preview's own text. `engineering/gotchas/studio-playground.md` says not to write one; the Studio
  dropped its copy in #2704 and `followups.d/2704-p4-playground-scanner.md` recorded this one.
- **Preview to map** ran through a Fuoco hub that lived inside `PlaygroundMap.tsx`, was fed the
  rendered text, and only existed once the map was opened. The editor never heard it.

So a scroll moved the map and nothing else, and with the map closed it moved nothing. The scrollbar
was a separate defect: the page's thin tinted scrollbar (`native-widgets.css`) sits on `:root`, and the
preview is its own document and the editor its own scroller, so both painted the browser default.

## 3. Decisions

Chosen with the owner on 2026-10-21, each against the alternative it beat.

| Question | Chosen | Beaten by it |
|---|---|---|
| What does a preview scroll do to the caret? | **Park it.** The editor shows and marks the viewed slide; caret and selection stay. | Move the caret and remember the old one: loses the selection on every scroll, adds a stored position to keep consistent, and each programmatic caret move can echo into the preview. |
| How far does the wiring go? | **One shared hub; delete the scanner.** | Subscribe the editor to the map's hub and keep the scanner: two paths that can still disagree. |
| What marks the slide? | **A wash over its lines plus a bar in the gutter**, `---` fences included. | A gutter bar alone: it does not show where the slide's text ends, which is what must be on screen. |

**Why parking needs no stored caret.** CodeMirror already holds the caret and selection. The hub
learns of them again on the next caret report. If that report names a different slide than the one
the preview is on, the hub publishes it and the preview and band follow. An arrow key does exactly
that, and CodeMirror scrolls its own caret into view on the key, so "go back to where I was" costs no
state and no extra scroll code.

## 4. What shipped

`docs/src/lib/playground-sync.ts` holds the rules; `PlaygroundApp.tsx` wires its ports. Origins say
who moved, and the editor never reacts to itself nor the preview to itself:

| Event | Hub call | Editor | Preview |
|---|---|---|---|
| Caret moves or text is typed | `report('editor')` | band follows | follows the slide, gently (a slide already 60% in view stays) |
| Preview scrolls | `reportUnit('preview')` | scrolls to and marks the slide, **caret untouched** | none |
| Click on a slide in the preview | `go('preview-pick')` | caret to the end of the title, slide framed, keyboard focus on a mouse pick | none |
| Click on a map tile | `go('rail')` | as a preview click | scrolls to the slide |

- **The frame the editor shows** is `deckFrame` (`deck-outline.ts`): the part's lines plus the `---`
  that opens and closes it (slide 1 opens on the front matter's closing fence). A page inside a
  heading-split slide has no separator of its own, so its frame is its text. When the frame fits the
  editor it is centered (a pick) or nudged into view (a scroll); when it does not, its start is put at
  the top so the opening `---` and the title are what is on screen.
- **The caret lands** at `deckTitleEnd`: the end of the first content line, past any directive comment.
- **Click in the band** needs no code: the band is line decorations, which are paint and never a hit
  target, so a click lands where it was made.
- **Touch** picks do not take keyboard focus (it raises the software keyboard), and a pick does
  nothing where the editor is not on screen (a phone shows one pane at a time).
- **Scrollbars:** `.cm-scroller` and the frame's `html` carry `scrollbar-width: thin` and a
  `scrollbar-color` wash. The frame's is opt-in (`scrollbar` in `docStyleText`), switched on only by
  `renderDeck`, so a frame built for export is byte-identical to before. `::-webkit-scrollbar` stays
  unused, for the reason `native-widgets.css` gives.

## 4b. Follow-up (2026-10-21): the panes scroll together

The owner found two gaps: scrolling the editor did not mark or show the slide in the preview, and the
slide's text was not level with its picture. Chosen against the alternatives: **a continuous section map in
Fuoco** (over a jump per slide boundary, and over a whole-document ratio) and **a generic Fuoco module** (over
Playground-only maths).

- **The rule is one rule.** `docs/src/lib/fuoco/align.ts`: a section's centered scroll position, clamped into
  the pane's scroll range. The first and last sections cannot be centered, so they land at the top and the
  bottom; the ones between are centered in both panes. The pairs are anchors joined by straight lines:
  continuous (no jump at a boundary), monotone and exact at both ends. A property test holds those, and a
  mutation of the end anchor fails it.
- **Either pane drives the other** (`playground-sync.ts`). A scroll in the preview moves the editor through the
  map and the slide it is on becomes the focus; a scroll in the editor does the same the other way, under the
  origin `editor-view`. The slide in focus is marked in **both**: the editor's band, and the preview's
  `db-active` mark (the Drawing Board's existing class), drawn as an accent bar down the slide's left edge. It
  was an outline first; slides are scaled to the frame's width, so the outline's left and right sides fell outside
  the frame and only the top and bottom showed. An inset `box-shadow` on the section fixed the clipping but
  replaced the shadow the engine already puts on a section (the overflow ring, the tone rails, the finish frame), so
  the slide being edited lost its warning. The bar is now its own element, `.db-bar`, which `markPreviewPages` places
  over the marked pages and re-places when the frame resizes, so it takes nothing from the slide. The Drawing Board keeps its outline (`activeOutline`); this is the
  separate `activeBar` option.
- **What "current slide" means** is the section centered nearest (`sectionAt`), so a slide centered in one pane is
  current in both. An earlier cut used a focal line that slid from the top of the window to the bottom; it named
  the next slide when a slide near the end was centered, and the e2e spec caught it.
- **The caret still parks.** A scroll names the slide in focus and never moves the caret. An editor scroll
  within 400 ms of a caret move is CodeMirror bringing the caret into view, so it moves the preview but does not
  take the focus from the caret.
- **Echoes.** Each move records where it landed; the scroll event that arrives there within 250 ms is its own
  and is dropped (`ECHO_PX`, `ECHO_MS`).
- **Gone with it:** the 60%-visible follow, `slideTop`/`alignY`/`alignTop`, `showRange`, and the focal-line
  reading of the preview. After a full srcdoc write the new document opens at the top, so it is realigned to the
  editor once it has loaded.
- **Space after the last line.** The Playground editor now has CodeMirror's `scrollPastEnd()`, as the Studio
  editor does.
- **Limits:** the editor's layout comes from CodeMirror's line positions, which are estimates for lines not
  drawn yet; the map is rebuilt on every scroll frame, so it corrects as CodeMirror measures. The preview's
  pages are assumed one size and one pitch apart, as `readingPage` already assumes.

### Cost (measured 2026-10-21, 120-slide deck, dev build, headless Chromium, same machine)

| Per 60 wheel events | `main` script | this branch |
|---|---|---|
| preview scroll | 63-72 ms | 161-172 ms |
| editor scroll | 68-77 ms | 175-187 ms |
| typing, 40 keys | 221-227 ms | 236-251 ms |

No frame is dropped on either branch (every frame 16.7 ms). **This table counted script time only, and the claims
around it were too strong; see "Performance review" below for the measured correction.** Typing is within noise of
`main` unthrottled, and about 9% higher in script at 4x CPU.

## 5. Fuoco: lines, columns and sections

`docs/src/lib/fuoco/place.ts` (generic, zero imports beyond the outline):

- `lineAt(outline, offset)`, `offsetAt(outline, line, col)`, `lineEnd`, `lineCount`: 1-based lines,
  0-based columns, over a line table built lazily once per outline snapshot.
- `placeAt(outline, offset)`: line, column, unit, part, flat and the host's section words.
- `extentOf` and `rangeOf(outline, unit, part)`: offsets and lines, with `toLine` the last line that
  holds text.
- `Outline.kinds` names the two levels. A deck says `{ unit: 'slide', part: 'page' }`
  (`DECK_KINDS`); `createTextOutliner({ kinds })` takes the host's own ("chapter", "paragraph").
- `focusPlace(hub)` answers "where is the focus" in those words. It is a function, not a hub method, so the Studio's eager bundle does not carry the line table.

## 6. Two texts, one rule

The hub holds the editor's live text; the rendered index describes the text last rendered, which trails
typing by a debounce. **A flat slide number means the same in both only when the two texts are equal**, so
the sync uses the index only when `index source === hub text`; otherwise the move waits and the render
that lands asks again. A full srcdoc write waits for `onFrameLoad` before anything scrolls, because until
then the frame still holds the outgoing document.

**Outside Edit the render is the text of record.** Explore can show a component's gallery or a plan step,
which the editor does not hold. There the sync feeds the hub the rendered source, ignores editor edits, and
does not touch the editor at all: its offsets would be the gallery's, not the editor's. Returning to Edit
feeds the editor's text back. An early version revealed into the hidden editor from Explore and took
keyboard focus off the map rail (`playground-map.spec.ts`, Home and End on the rail); the guard is the fix
and `playground-sync.test.ts` pins it.

## 7. Evidence

- `docs/e2e/playground-focus-sync.spec.ts` drives the real Playground: scroll marks and shows the slide
  with the caret unchanged; an arrow key returns the band and the preview; a click on a slide puts the
  caret at the end of `# Slide 6 title` with the band on screen and typing lands there; a click in the
  band lands at the click; both scrollers carry a non-default scrollbar. Run on Chromium, Firefox and
  WebKit (iPad-landscape), five of five on each.
- `playground-sync.test.ts` (12 cases) runs the rules against fake ports; `place.test.ts` and
  `deck-frame.test.ts` cover the Fuoco additions.
- `caretSlideIndex` had 70 lines of tests; the cases it covered (fences, setext headings, heading
  splits) are the deck outliner's, which `deck-outline.test.ts` holds to the engine on every committed deck.

## 8. Not done here

- **Preview element addresses** (click a rendered element to select its source span): still
  `followups.d/2704-p5-preview-element-addresses.md`. A click selects the slide's title, not an element.
- **Touch picks** reach the editor but are not exercised by a touch e2e.
- **Compose** (the Studio's second editor) is untouched; this note is the Playground only.

## Review fixes (checker on the final diff)

An independent checker reviewed the later commits and found five defects, all fixed with a test that fails on the old code:

- Scrolling the preview to its very bottom threw the editor to the end of its padding. The preview's end is a flat
  run in the map (its last slide clamps while the editor scrolls through `scrollPastEnd`), and the end resolved to the
  run's far side. It now resolves to the run's start, so the map is continuous there (`align.ts`).
- A paste or typing that scrolled the editor left the preview behind when the render landed; the editor scroll now
  marks the alignment as owed.
- The focus bar blinked off on every keystroke while the index trailed the text; the mark now stays until the render.
- The focus bar hid the section's own `box-shadow` (see above).
- `SETTLE_MS` never ran, so for 1.5 s after a map tile pick the reader's own preview scroll could not change the
  focus. A settle loop now names the slide the preview stopped on.

Also: a failed load of the focus chunk is caught and logged, and the Playground works without the sync.
Not changed: CodeMirror re-measuring line heights after `setScroll` could defeat the echo guard on long decks
(plausible, not reproduced).

## Clicks center the preview

Owner decision after the review: a click puts its slide in the middle of the preview, by the same rule as the scroll
alignment (first slide at the top, last at the bottom, every one between centered).

- A click on a preview slide centers it in the preview, then brings the editor level with it (`centerPreview`,
  then `alignEditor`). Both moves are instant, and each records its echo so neither drives the other back.
- A caret move into another slide (a click or a key) centers that slide in the preview and leaves the editor alone:
  re-centering the pane the reader just clicked in would move the text under the pointer. Moves inside the slide in
  focus, and anything within `CARET_SCROLL_MS` of typing, scroll nothing.
- For `CARET_SCROLL_MS` after the caret centered the preview, the editor's own scroll (CodeMirror following the same
  caret) does not drive the preview, or the two moves would fight and land the preview on the wrong slide.

## Performance review (adversarial trio, 2026-10-21)

The owner sensed delays and jank, so the red team, the inversion and an independent checker measured the branch on
the real Playground (headless Chromium at 1x and 4x CPU throttle, and WebKit; 200-slide decks, plus wrapped-prose
and 10,000-line cases), against the merge-base. What they found, and what changed:

- **The cost claim was understated.** Script, layout and style together, per 60 wheel events, merge-base to branch:
  preview 112 to 269 ms, editor 109 to 385 ms (2-3x, +2.6 and +4.6 ms per frame). No frame dropped at 1x, but at 4x
  CPU and in WebKit the branch dropped frames the merge-base did not.
- **The marks were most of the avoidable part.** The editor band was a CodeMirror line decoration: a transaction, a
  redraw of every line of the slide, and a forced style recalc (CodeMirror reads the DOM selection after any DOM
  change) at every slide boundary. The preview bar read a rect per page right after toggling a class, forcing the
  frame to lay out. Now the band is two drawn boxes placed from CodeMirror's line heights (`bandPlugin`,
  `editor.js`) and the bar is placed from the geometry `previewLayout` already caches (`placeBar`,
  `reading-page.ts`); neither reads the DOM. Turning the marks off entirely now changes nothing measurable at 4x.
- **The echo guard had holes.** Position matching broke when CodeMirror re-anchored after our write, and consuming
  an echo on the first event let a stale event eat a newer move's. Measured on a deck with wrapped prose: map picks
  landed on the wrong slide 7 times in 8; wheeling the editor stepped backward 6-7 times; a large preview move
  was yanked 4 of 80 (a 1500 px notch: 39 of 40). Echoes are now attributed by time and kept for their whole window,
  and a pick's smooth scroll is not cancelled by the editor re-anchoring. After the fix: 8 of 8 picks land,
  0 reversals, 0 yanks.
- **The follow is the rest, and it is the feature.** Moving the other pane each frame costs the follower's own
  redraw (CodeMirror lines, the filmstrip's virtualization; one editor wheel moves the preview about 2.7 times as far).
  A page that is already dropping frames now moves the follower at most every 33 ms, and always catches up on the
  frame where the reader stops (`followNow`). Following only when the scroll settles would remove most of the rest
  but contradicts the owner's choice of a continuous map; that is the owner's call and was not made here.
- Eager JS: the drawn band (`editor-band.js`) and the preview-frame helpers (`reading-page.ts`) load with the focus
  chunk, not with the route; the first cut of the band cost the Playground +2,259 B gz of eager JS, over the 2,048 B a PR may add.
- `rangesOf` was quadratic in slide count (`seps.find` per page: 16 ms per edit at 3,000 slides); it is a binary
  search now.

Measured after (4x CPU throttle, 200 slides, per 60 wheel events; two runs each): preview wheel 6-7 frames over
34 ms (the branch before: 5-16; merge-base 0-2), editor wheel 10-12 (before 8-11; merge-base 0-3), style
655-676 ms (before 717-763). WebKit (Linux, software rendering): editor wheel 23 frames over 34 ms (before 53-96;
merge-base 11-13), preview wheel p50 24 ms (before 32-40; merge-base 22-30). Real Safari, an iPad and touch are
UNVERIFIED.

Not changed, and why: per-key cost grows with the size of the slide being typed in (+15 ms per key at 10,000
lines; the hub re-parses the slide between two separators), the second parse of the deck per render, and the
map's own index on every render. All three are small below a thousand lines; the typing delay the owner may
feel is the render pipeline and `remoteCssRefs` (followup `2840-p3`), which are level with the merge-base.

## Edit and Explore keep your place (owner decisions, 2026-10-21)

On a phone Edit and Explore are two tabs of one pane, not two panes. Nothing unmounts on a switch (the inactive pane is
`display:none`, and veduta only windows slide mounting inside the preview frame). Measured on a 390 px viewport, two
things lost the reader's place:

- Edit to Explore rendered the deck fresh and opened it at slide 1, whatever slide the caret was in.
- Explore to Edit copied the Explore source over the editor even when it was the same text, which replaced the whole
  document: the caret and the scroll went to the top, and a backup of an unchanged deck was pushed.

The rules the owner chose:

- **Edit to Explore:** the caret stays; Explore opens on the caret's slide (`enterExplore`, then the walk lands on the
  page the render's index gives for that slide).
- **Explore to Edit:** the editor is left alone when the text is the same. A click in Explore on a slide other than the
  caret's puts the caret at the end of that slide's title (`exploreClicked`, `leaveExplore`); scrolling in Explore
  without a click moves nothing.
- **Reload:** the caret is saved on Fuoco's idle lane (`playground-focus.ts`), keyed by a fingerprint of the deck text,
  and restored only when the text is the same. Fuoco itself still persists nothing; the Playground owns the key
  (`lattice-docs-pg-caret`). The first cut reused `lattice-docs-pg-focus`, which is the Focus-mode toggle's key: the
  e2e spec caught it reading back `0`, and a saved caret would have broken Focus mode on the next load.

Verified on Chromium and WebKit at phone width (emulation: `e2e/playground-tab-switch.spec.ts`); a real iPhone is UNVERIFIED.

## Review of the later rewrites (independent checker, 2026-10-21)

A checker reviewed everything after the trio (`fddab54..a84c42e`). The drawn band, the focus bar's geometry, the
`deckFrame` binary searches and the caret restore held. It found five defects, all fixed with a test that fails on the old code:

- **Explore to Edit at a wide width scrolled both panes to the end of the deck.** The outgoing document, still Explore's
  at the new narrower split width, scrolled before the fresh one loaded, and its stale `scrollY` drove the editor.
  `leaveExplore` now holds the preview (`loading()`) until the fresh write loads, and the editor leads (`owed`).
  A real-browser case at 1440 px is in `e2e/playground-tab-switch.spec.ts` (the editor moved 821 px without the fix).
- **A stale Explore target made a later gallery open on the wrong slide.** The target is spent by the first Explore
  render whatever the walk kind (it was spent only for a deck walk), and a plan walk now opens on the caret's slide too.
- **`enterExplore` returned the hub's focus, not the caret's slide.** Any scroll moves the focus without moving the
  caret. It now returns the slide of the last caret move, which is also what `leaveExplore` compares a click against.
  A click recorded on one Explore deck is forgotten when the deck changes.
- **A reader switching panes within the echo window was ignored.** The window is 120 ms now (it was 250), which
  covers the follower's echo events and leaves a human pane switch outside it. The checker suggested re-checking the
  dropped frame once the window ended; measured on the real Playground that was worse: when the follower had not
  converged, the re-check took the lagging pane for the leader and dragged the preview back. It was removed.
- **The adaptive follow rate barely engaged**, because the follower's own scroll event fed the frame-gap clock. Only
  scrolls that are not the sync's echo count now.

Also: each editor holds its own band slot, and the latest requested range is what is drawn when the module arrives.

## The switch no longer flickers (2026-10-21, its own PR after #2840)

Measured with a probe that samples every animation frame (pane, document readiness, scroll, slide shown, whether the
frame is on screen), Chromium, 390 px viewport, a deck edited on slide 7 (42 of 60 at 4x CPU):

| | Before | After |
|---|---|---|
| Frames showing the wrong slide | four states: the old preview at scroll 0, a blank, the new document at slide 1, then a hard jump | none: the frame is hidden until the deck is on its slide |
| Document | rewritten (`srcdoc`, a full load) | patched (the same document) |
| Pane flip to the right slide on screen, 10 slides, 1x | about 217 ms | about 129 ms |
| Same, 60 slides, 4x CPU | about 905 ms | about 384 ms |
| Desktop, 10 slides, 1x | about 178 ms (with a reflow of the old preview first) | about 119 ms |

What changed (`PlaygroundApp.tsx`):

- **A cover for the switch.** `coverPreview` takes `is-live` off the preview wrap (the class that shows the frame,
  `playground.css`), and the existing `markLiveWhenSlidesVisible` puts it back once the deck is fitted and the walk has
  landed. The reveal also waits for the Explore target (`openOnPendingRef`): the slide index it needs resolves after
  the render, and a reveal that did not wait showed slide 1 for a moment on the heavy case (found by the probe). A 5 s
  backstop and the render's error path lift a cover that has nothing coming to lift it.
- **No rewrite when nothing changed.** `reusableFrame` is true when the frame already holds the text Explore (or Edit)
  is about to show, and the switch calls `render(false)`, which the engine turns into a patch (its signature depends on
  the deck size, theme and mode, not the pane width). A different text, or a plan walk (a component gallery), still
  takes the forced rewrite, behind the same cover.
- **The sync holds the preview until it has re-fitted.** The reused document has no load event to say it has settled at
  Edit's width, and its own reflow scroll used to drive the editor (the 821 px bug again, found by the wide-screen spec).
  `leaveExplore` sets a hold, `loaded()` clears it, and the switch calls `loaded()` after the re-fit.

Verified in `e2e/playground-tab-switch.spec.ts`: every frame the reader can see across the switch shows the caret's
slide, and the document is the same one (a marker set on its window survives); the case fails on the old code. Chromium,
Firefox and WebKit at wide width; Chromium and WebKit at phone width. A real iPhone is UNVERIFIED.

The checker on that PR found three defects. Be exact about what proves each fix:

- **Explore to Edit still showed the wrong slide for a frame or two** on a wide screen: nothing made the reveal wait for the
  editor-slide realign, so the preview became visible at Explore's scroll and snapped a frame later. The reveal now waits
  for `realignPendingRef`, set at the switch and cleared once the sync has actually realigned (`settleRealign` asks again
  for up to 60 frames until the sync has nothing owed). The e2e case catches it on Chromium and Firefox, but not on every
  run, and not on WebKit; it samples past the reveal and asserts the slide the reader started on.
- **A second switch before the first render landed left the cover on for the backstop.** The flag that holds the reveal
  for Explore's target (`openOnPendingRef`) was cleared only when a render landed in Explore. It is cleared when the render
  lands anywhere else, on the error path, and at the switch back to Edit. **This one is fixed by reading the code, not by
  a failing test:** neither the checker nor I could make Playwright reproduce the race (timed in-page switches at 0 to 250
  ms with the fixes reverted all lifted the cover). The quick-switch cases in `playground-tab-switch.spec.ts` guard
  against a regression, they do not prove the fix.
- **The backstop was shorter than the landing budget it backs up.** It is `REVEAL_CAP_MS + 1000` now, and a switch that
  finds the frame covered by an earlier one re-arms it. A frame that was never live is NOT covered: an early version armed the
  backstop on any switch, and on a slow cold load it lifted the cover before the first render had landed, showing the
  unfitted document (found by the second checker; `coverPreview` now returns for a frame that is neither live nor covered).

A second checker, on those fixes, found one more path: a switch to Explore and back, a couple of hundred milliseconds
after typing, took the reuse path while the full write was still loading, patched a document about to be replaced, and
left the preview at an end of the deck. `reusableFrame` now also requires that the frame's document is the latest write
and fully loaded. Measured on 200 slides, caret on 140: the preview ends at 70% of the deck beside the caret (before, it
was pinned at the last slide).

## Typing no longer rescans the theme CSS (2026-10-22, followup `2840-p3`)

`renderDeck` asks `webRefsInCss(css)` which web hosts the engine sheet reaches, on every render, to decide whether a restyle
needs a new document. The sheet is the same theme and engine CSS between keystrokes, but it arrives as a new string each
render, and the tokenizer behind the answer (`remoteCssRefs`) read all of it every time.

`webRefsInCss` (`lib/core/remote-ref.js`) now remembers its last answer and returns it when the sheets compare equal by
content. Every caller gets it: the preview write (`deck-preview.js`), the stage window and the single-slide render. One slot
is enough, since a session shows one theme at a time. It hands out a copy of the answer, so a caller that edits the result
cannot change the memo, and any change to either sheet (or a different number of sheets) rescans. The scan's result is
unchanged for every input; only the repeat is skipped.

Measured with `npm run bench`, same machine, median over 10 keystrokes on each bench deck (the edit tier's new `scan ms/key`
column, which times `webRefsInCss` on the sheet `api.render` returns, as the Playground does):

| deck | scan ms/key before | after |
|---|---|---|
| normal (jargon) | 35.30 | 0.01 |
| charts | 34.09 | 0.01 |
| math | 33.48 | 0.00 |
| hub-spoke | 34.14 | 0.01 |

The scan was larger than the engine's own render of the same key (12 to 31 ms). The first key after a theme or plugin
change still pays one scan. The blessed baseline carries the column as commentary (`scanMs`), not a gate, for the reason the
edit tier's `ms` is not one: a wall clock would be flaky in the merge train.

## Collapsing the preview keeps your slide (2026-10-22, followup `2851-p3`)

Collapsing the preview squeezes its frame to a 28 px rail, and that scrolls the frame to the top (measured: `scrollY` 3160 to
0, with no document write). The old expand then ran `freshRender()` whenever any render had been held back, which opens a
new document at slide 1, and otherwise left the frame at the top. Either way the reader came back to slide 1.

- **A held patch is not a deck swap.** `render` now records only a held `fresh` render (`freshWhileCollapsedRef`); the old
  flag that any held render set (`pendingWhileCollapsedRef`) is gone. Expanding after a deck swap still writes a fresh
  document at the top, as before; expanding after typing patches the live one.
- **The sync keeps the reader's place.** `collapsed()` (called from `onCollapse`) keeps the preview's scroll as the reader last
  had it and the focus slide; `expanded()` owes the preview that slide in Edit. On the next `loaded()` the preview goes back to
  the pixel when the focus slide is the same one and the kept scroll still names it, and otherwise centers the focus slide
  (the caret's, after typing while collapsed). Centering everything was the first cut: it scrolled a first slide by the
  frame's 18 px padding and broke `playground-first-paint`'s collapsed-capture case in 4 of 8 runs; baseline 0 of 8.
- **No wrong-slide frame.** `onPreviewExpand` covers the frame (`coverPreview`) and holds the reveal (`realignPendingRef`)
  until the sync has paid, the way the Edit/Explore switch does. Only Edit: Explore's forced expand is a deck swap or shows
  one slide, and keeps its path.

Evidence, the real Playground (`docs/e2e/playground-preview-collapse.spec.ts`; a per-frame probe records the slide on
screen from the expand click, skipping frames that are covered or still a rail). Before, with the same spec on the
unchanged code: both cases end on slide 1 (expected 9 and 3). After: the frames show `[9]` and end on slide 3, on desktop
(Chromium), `gecko` and `webkit-tablet`. The phone layout has no collapse (tabs own visibility), so `webkit-phone` does
not apply. Real Safari and touch are UNVERIFIED. Not done: a collapse by dragging the divider has no e2e; the
`sectionAt` check on the kept scroll is the guard for it.

## A late scroll event is still the move's echo (2026-10-28, followup `2937-p2`)

**Symptom.** The spec "a click on a line in the editor centers its slide in the preview and leaves the editor alone"
failed on `webkit-tablet`: the editor's `scrollTop` moved 136 px after the click. It is a load flake, not a WebKit
quirk: on this 4-core sandbox it passed 20 of 20 with one worker and failed **9 of 24** with six workers.

**Cause.** `isEcho` measured the 120 ms window from the moment the sync WROTE the preview's scroll. A scroll event is
delivered on a later frame. A busy page delivers that frame late, and the event reached `drivenByPreview` after the
window had closed, so the sync read its own move as the reader scrolling the preview and moved the editor to follow.
Timestamps from the 24-run probe (write → event): every failing run was 139–362 ms; every passing run was ≤ 119 ms.
Nothing else separated them.

**Fix.** `landEcho` (`playground-sync.ts`) restarts the window when the FIRST scroll event after a move arrives, on
`previewScrolled` and `editorScrolled`. Only that first event counts, so a later scroll by the reader is never taken
for the echo, and the events that follow it (CodeMirror re-anchoring) fall inside the new window. An event more than
`ECHO_LATE_MS` (600) late counts only if it arrives at the position the move set (`ECHO_LATE_AT_POSITION_MS`, 3 s),
because a reader's scroll lands elsewhere. That second arm exists because one run in 48 had the event 607 ms late.

**Evidence** (`webkit-tablet`, `build:e2e`, same sandbox):

| Run | Before | After the first cut (600 ms cap) | After |
|---|---|---|---|
| 6 workers, `--retries=0` | 9 of 24 failed | 1 of 24, 1 of 48 failed (event 607 ms late) | 48 of 48 passed |
| 1 worker | 20 of 20 passed | — | 20 of 20 passed |

The whole spec file passes on `desktop`, `webkit-tablet` and `gecko`: 33 of 33. The unit rig now delivers the scroll
event of the sync's own move on the next frame, as a browser does; before, it never delivered one, which is why no
unit test could see this. The new unit test "the preview's late echo does not move the editor" fails on the old code.

**Independent check (2026-10-28).** A checker agent read the diff and found no blocking bug; it confirmed that only the
new late-echo test fails on the old code. It named one trade-off, now stated here: the first scroll event after a move
lands the echo whoever caused it. If the move's own event is late (or never comes) and the reader scrolls that pane
within 600 ms, the reader's event lands the echo and the other pane skips about 120 ms of their scroll; a continuous
wheel recovers, a single-event scroll (a PageDown) is not followed until the next one. Two changes follow from it.
A write the pane clamped to its current position fires no event, so `written()` records it as already landed and it
can swallow nothing; the unit rig likewise delivers no event for such a write. The late-event case stays: it is the
price of the fix, and 600 ms is the longest delay measured to date outside the position arm. Not reproduced in a
browser. The e2e results after this change: 48 of 48 at six workers, 33 of 33 across the whole spec.

**On real iPad Safari (macOS CI, 2026-10-28).** The `ios-safari-focus-sync` platform suite (`docs/scripts/ios-safari/`) taps editor
lines through safaridriver in Mobile Safari 26.5 on an iPad Pro 13-inch simulator (1032 px, two panes) while the page works 150 ms
and rests 75 ms. Same probe, same device, two builds:

| Sync code | Quiet page (4 taps) | Under the burner (40 taps) |
|---|---|---|
| Before 2937-p2 (`origin/main`) | 0 moved the editor | **29 moved it, worst 224 px** |
| With the fix | 0 moved it, 0 uncentered | **0 moved it, 0 uncentered** |

So the bug is not a Linux-WebKit artifact: iPad Safari delivers the preview's scroll event late under load and the old window read
it as the reader's. Four traps in the harness, each found on the runner and each fixed in the probe, are worth keeping:
a pane taller than the slide's offset cannot center slide 2 (that needs a negative scroll), so the probe picks a slide it can
center; a burner that never rests stalls iOS taps (`touchstart` without `touchend`); safaridriver sometimes cannot reach a fresh
simulator (the runner retries the session three times, and the other iOS suites fail the same way on `main`'s nightly); and the
first `Element Click` is enough, with no touch-action fallback needed (it is still tried if the click fails to place the caret).
Not covered: a physical iPad or iPhone, and the iPhone layout (one pane at a time, so the bug cannot occur there).

**The iOS suites restart a stuck start (2026-10-28, followup `2950-p3`).** `main`'s nightly failed on the iOS suites on each of
its first three days with them (runs 40307494617, 40485085426, 40674748940). All three were the same failure: safaridriver
answered `POST /session` with "session not created" after the device had booted and Safari had launched, so no probe ran. Each
made one attempt, because the three-attempt retry landed with #2950 after them. PR runs on 2026-10-28 that did have the retry
still failed on attempts 2 and 3 (40748220516, 40764835364), and in one safaridriver itself was gone by attempt 2
(`ECONNREFUSED` on :4444, 40744674119): retrying against the same device and the same driver does not clear either. So
`run.mjs` now exits 3 for "no session", and `run.sh` answers that, a boot failure or a silent safaridriver with ONE second
start: reboot the device, relaunch Safari, restart safaridriver. A probe failure is never retried. A failed start costs about
7 minutes against a 30-minute job, so the first start makes 2 session attempts and the second start is skipped after
`START_BUDGET` (840 s). Proved locally with stub `xcrun`, `safaridriver` and `node` (recover on the second start, give up
after two, a probe failure not retried, a dead driver restarted for the next device, no second start past the budget); the
real-runner evidence is the branch dispatch named in the PR, and whether the nightly holds for 10 runs is the follow-up's.
Three probe assertions also failed in PR runs that day (a 90 s wait for the Studio editor, a 15 s wait for the Coach button,
two quiet focus-sync taps uncentered); those are not start failures and are recorded in the follow-up.
