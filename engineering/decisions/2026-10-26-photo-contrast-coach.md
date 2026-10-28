---
status: shipped
summary: >
  The Studio Coach now warns when the text on a photo slide falls below 4.5:1, measured from the live preview, and offers a
  one-click "Pin this slide dark" (or light) only when that pin clears the floor, or, when no pin does, "Set card ink
  light" (or dark) if that ink clears it. It never flips a slide on its own. The
  contrast arithmetic, the photo sampler and the Coach finding list are all reused; the new code is a 90-line kernel
  (`lib/core/photo-contrast.mjs`), a reader that asks the preview what it painted, and a hook that keeps one finding for the
  slide on screen.
---

# Photo contrast in the Coach (2026-10-26)

## The problem

Light-mode text vanishes on a dark photo. `tools/check-slide-contrast.js` cannot see it: it reads each run's
`backgroundColor`, and a photo is a `background-image`, so text on a picture resolves to whatever paint sits behind the
picture. Its header lists raster backdrops as a known limit. The only photo-contrast check before this was lint's
`thin-card-no-ink`, which asks whether a thin spotlight card names an ink at all. It cannot say whether the ink it names
reads on this photo.

## Decision

1. **Warn, and offer the fix; never auto-flip.** The Coach shows a `photo-contrast` finding with the ratio and, when it
   helps, a **Pin this slide dark** / **light** button (or, when no pin clears, **Set card ink light** / **dark**; see the
   2026-10-27 section below). The author clicks it. A fix is offered only if it takes the text to 4.5:1 or better, because a button that changes the slide and still leaves the words unreadable is worse than none.
2. **Measure the painted page.** The reader asks the preview frame for the three things the browser decided: the mean photo
   color under the card (the `card-ink-sampler.ts` code, now shared), the card's computed fill, and the computed ink of
   the heading, first paragraph and first list row. The pin is simulated by toggling the class inside one task with
   transitions off, reading the same styles, and putting the classes back.
3. **One slide, the one on screen.** The preview frame holds one slide at a time, so the finding is for the slide in view
   and follows the author. It is not a deck-wide sweep. The deck-wide read stays with `lint` and the scorecard.
   The owner confirmed this on 2026-10-28 (PR #2942, D1 A): a Studio pass over every photo slide and a CLI check at
   export time were both offered and declined, so the on-screen check is the whole of it.
4. **Outside the grade.** The scorecard is the engine's `scorecard.scoreDeck`; this finding reads pixels in one browser, so
   it does not move Craft or Style.
5. **Silence means "could not measure".** No preview, a preview still showing another slide, a photo the browser cannot read
   (cross-origin), or an unparseable color all return no finding.

## Scope and what it does not do

- Spotlight and statement compositions only. `clean`, `split` and `gallery` put the text beside the photo. A statement is
  judged against its scrim at its strongest (2026-10-28 section below).
- Text over a photo outside the `image` component does not exist in Lattice: `![bg]` photos are painted by the `image`
  layout's own `.lattice-bg` panel.
- Mean color, not a per-pixel worst case. A busy photo can pass the mean and still lose a word. The 24 by 24 sample is
  the existing card sampler's, kept so the two features agree.
- Large text is not given 3:1, the stance `check-slide-contrast.js` already takes.
- **A statement was not measured at first** (measured since 2026-10-28, below). Its backing is the `.image-scrim` gradient (up to 0.86 alpha dark, two layers), not a fill on the text box, and the reader does not model it. The first cut read a statement as "no backing" and, over a bright photo, reported 1.2:1 for text that reads fine on the real scrim; an independent check found it and a probe reproduced it. Measuring a statement with the scrim off (`card-clear`) would need the gradient modelled.

## Reuse (HARD RULE #15)

`contrast` and `luminance` come from `lib/core/card-ink.mjs`; a test pins the new ratio to that function. The sampler's
photo reading moved into exported `meanUnderBox` and `boxInSection` in `card-ink-sampler.ts` rather than being copied.
The finding rides the Coach's existing `FindingCard` and `settingsWrite` funnel, so the pin is one Undo step.

## Added after a device test: a fix button on `thin-card-no-ink`

Testing on an iPhone, the owner hovered the editor's `thin-card-no-ink` tooltip and found no button, while other lint rules have one.
Those rules are `autofixable` in lint-core. This one is not, on purpose: which ink reads depends on the photo's pixels, which lint-core
(pure, no DOM) cannot see. The first cut attached two buttons, **Add ink-light** and **Add ink-dark**, and the owner objected that a tool that
detects the photo's color should offer the right one.

The Studio now reads the photo itself: `pickedInk` in `thin-card-fix.ts` runs the Card backing slider's sampler and kernel
(`readBehindCard`, `applyLateRead`) and the tooltip offers the one ink that reads. A probe showed the preview frame is mounted and laid out
even on the phone's Source tab, so the read works there. It falls back to both buttons only when it cannot read: the preview shows another slide
(it holds one at a time), or the photo is cross-origin. The edit is `addCardInk`; the slide is read from the position when a button is pressed.

## Found by the independent check (2026-10-26)

One checker read the diff cold. Four findings were real and are fixed in this PR, each with a test that fails on the bug:

- **A statement was flagged although its scrim made it read** (above). The e2e puts a statement over a bright photo and expects
  no finding. It still does, now that statements are measured against the scrim.
- **The finding went stale** when the theme, mode or front matter changed, because the hook keyed on the slide's own text only. It now re-reads on a `context` (mode, palette, source). The e2e edits the front matter in place and expects the finding to clear.
- **"Fix all" and the panel disagreed** when the photo finding displaced the sixth lint finding. The photo finding now rides alongside the lint top six instead of competing for a slot.
- **One failed chunk load emptied the editor's diagnostics**, and a slow photo host could hold a lint pass for 4 s. The tooltip's import is caught and the photo read is capped at 1.2 s, after which both inks are offered. The tooltip also drops lint's "Fix:" prose now that buttons carry the fix.

My first negative tests were vacuous: `typeDeck` clears the editor, and the empty deck briefly shows no finding, so "count is 0" passed before the read ran. They now wait on `data-photo-read="done"` (derived in render, so it flips the moment the slide changes) and each was shown to fail with its bug put back.
Not fixed, by decision: each read toggles two classes on the preview section, which wakes the runtime's mutation observer for one idempotent pass.

## Found on the owner's phone: the ink pick needs the preview on the caret's slide

The single-ink tooltip still offered both buttons on an iPhone. A probe showed why: at 390 px on the Source tab, moving the caret did not
change the slide the preview holds. Fuoco was in sync (the editor reports the caret, the hub works out the slide, `FocusedPreview` hands
`DeckPreview` the new `slideIndex`); the render was dropped at the last step, because the shell parks the preview (`active` false) on the
phone's Source tab and `DeckPreview.render` returns early while parked. That parking is deliberate (it defers per-keystroke renders) and has
no written reason.

Two changes, the owner choosing that the preview follow the cursor:

- `DeckPreview` gets `followWhenParked` (off by default): while parked it draws ONCE when the shown slide or deck changes, never for an edit.
  The Studio turns it on for its editor preview. Cost: one render per slide crossing on the phone's Source tab, not one per keystroke.
- The tooltip body fills its buttons in place. A diagnostic's `actions` are fixed when the lint pass runs, so changing them means a new
  pass, and CodeMirror closes the open tooltip: on the owner's phone the tooltip opened with both inks, closed, and reopened with one.
  `inkFixNode` (`thin-card-fix.ts`) is the tooltip's `renderMessage`: it adds the buttons into the same node once the photo has been read.
  A slide that is not on screen gets both inks at once (the preview cannot show its photo); the slide on screen gets nothing until the
  read, then the one ink, or both after a 3 s wait with no read (a cross-origin photo). A mutation observer in the e2e proves "Add ink-dark"
  never appears first and the open tooltip is never removed; it fails when the both-then-one behavior is put back.
- Two earlier attempts are gone: a re-lint when the preview drew a new slide (first a fixed delay, which lost a race with the render, then a
  `needsRefresh` effect fed by a preview-render event), and `forceLinting`, which in @codemirror/lint 6.9 only hurries a pass already scheduled.
  Reading at tooltip time made all of it unnecessary.

## Found on the owner's phone again: a slow read fell back to both inks

On a real iPhone, slide 2's tooltip still offered both inks after slide 1's single button had worked. Playwright's iPhone WebKit profile ran the
same tap flow and got the single ink, so the device differs. Two causes fit, and both are fixed:

- **A per-read cap of 1.2 s.** `pickedInk` raced each read against 1.2 s, a leftover from when the read ran inside the lint pass. On a device where
  loading or decoding the photo takes longer, every attempt timed out and the tooltip ended on both. The read now runs inside the tooltip, so the
  cap protects nothing and is gone; the sampler keeps its own 4 s load timeout. An e2e slows every image `onload` by 3.5 s (a network delay would
  not work: the preview already loaded the photo, so the read is a memory-cache hit) and fails with the cap put back.
- **A tap that opens the tooltip before its caret move lands.** A slide judged "not on screen" now keeps checking for 1.2 s before offering both,
  and the slide on screen waits up to 6 s, showing "Reading the photo…" once the read takes longer than 0.4 s. Not reproduced in emulation.

Neither is verified on the device itself.

## Jank, measured (2026-10-27)

The owner reported jank on the phone. A per-frame trace of the tooltip's box on WebKit's iPhone profile found it: the tooltip opened at
117 px with no buttons, grew to 161 px when the ink arrived, then CodeMirror moved it up 44 px to fit, two visible jumps in half a second.

- **Fixed: the tooltip opens at its final size.** The button row holds a disabled "Reading the photo…" pill of the buttons' own class from
  the first frame; the real button replaces it in place. An e2e traces the box every frame from open until the button arrives and requires
  one box; it failed with three boxes (open, grow, move) on Chromium and WebKit before the fix.
- **Fixed: an unchanged lint pass no longer closes the open ink tooltip.** By default CodeMirror hides a lint tooltip on any
  `setDiagnostics`, even one that changes nothing; on a phone lint runs again just after the Source tab opens. The editor's linter now
  passes `hideOn` (`keepTooltipOnSameDiagnostics`, `lint-tooltip-keep.ts`), narrowed after a second independent check (below).
- **Not ours, and held out of one assertion:** in Chromium with a mouse parked over the line at phone width, the parked preview's redraw
  makes the browser fire a synthetic mousemove and CodeMirror's hover closes the tooltip and reopens it 300 ms later (traced: an effects-only
  hover transaction). A finger cannot cause it, and WebKit's iPhone profile never showed it in 12 runs, so the "tooltip never removed" check
  is held on WebKit and at desktop width, not in Chromium at 390.

## Second independent check (2026-10-27)

A second checker read only what changed after the first one. Two real defects, both in this round's code, fixed:

- **Dead fix buttons on every other warning.** The first `hideOn` kept ANY open lint tooltip through an unchanged pass. CodeMirror's own
  action buttons run only if `findDiagnostic` finds the exact diagnostic object they were built from, and each pass builds new objects, so
  a kept tooltip held buttons that did nothing (and stayed dead). `hideOn` now keeps a tooltip only when every diagnostic under it is a
  `thin-card-no-ink` one, whose buttons are ours and do not look anything up; every other rule falls back to CodeMirror. A unit test fails
  with the narrowing taken out.
- **The ink button could edit the wrong slide.** It remembered a raw offset from lint time, and CodeMirror keeps a tooltip through edits on
  other lines, so typing earlier in the deck moved the offset into another slide. The thin-card tooltip now closes on any edit.
- Nits, fixed: the wait now stops at 6 s in total (a read that starts late gets only what is left), and the button row is an `aria-live`
  region with `Action: …` labels, as CodeMirror's own buttons have.
- Checked clean: `followWhenParked` (effect order, initial mount, rising edge, deck switch, no double render, no other host affected) and
  HARD RULE #29 (the ellipsis is punctuation in `shape-glyphs.js`).

## The warning and the photo read are two steps (2026-10-27)

The owner still saw two ink buttons on a phone. The cause was structural, not a timing bug: the tooltip asked the live
preview which ink reads, and whenever the preview was showing another slide, or had not drawn yet, there was no answer
and the tooltip fell back to offering both. Each earlier fix shortened that window. None closed it.

The read is now its own step, in `docs/src/components/studio/photo-ink-read.ts`:

1. **The warning is immediate.** `thin-card-no-ink` is a lint rule. It knows the card is thin and has no ink, and it
   knows nothing about the photo, so it costs nothing.
2. **The read starts when the tooltip opens.** The tooltip shows a disabled **Checking the photo…** pill in the row the
   button will take, so the tooltip opens at its final size. `readPhotoInk` tries the answer kept from before, then the
   live preview (the exact card box, as before) when it shows this slide, then **the photo file itself**, averaged over
   the part of a 16:9 frame the card's placement class covers (`at-bl` when none is set). The third source does not
   need the preview, so the "another slide is on screen" case now gets a real answer.
3. **One fix, always.** It offers the ink that clears 4.5:1. When neither does, or nothing could be read, it offers
   **Use a solid card** (`card-solid`, which sets the card's backing to 100%), with a one-line note saying which case
   applies. A solid card is the image component's own answer to a photo that fights its text, and it always reads.
4. **The answer is kept** in `localStorage` (`lattice-photo-ink:v2`), keyed by a hash of the photo reference, the
   placement, the backing and the classes that change the card's box (`card-sm`, `card-lg`, `band`, `compact`), capped at
   200 entries with the oldest dropped first, and trusted for a week. A reload shows the fix on the tooltip's first
   frame. "Could not read" is not kept, so the next open tries again. "No ink reads" is kept, because it is an answer.
   Each entry records whether it came from the live preview or from the estimate: a kept estimate is replaced by the
   exact read the first time the preview shows that slide, and a kept live read is final.

The independent check on this step found three cache faults, all fixed before merge: an estimate could block the exact
read forever; a `data:` photo was stored a second time as its own key, in the same storage the deck autosave uses (so a
few large embedded photos could make saves fail silently); and an answer for an `asset:` name or a web URL never went
stale. The hash, the source flag and the week's limit are those three fixes. `blob:` photos are not kept, because their
URLs change on every load.

**No service worker or Web Worker.** The read draws the photo into a 24×24 canvas on the main thread, which takes well
under a frame. A worker would add a second bundle and a message round trip to save no measurable time. The photo-file
estimate is coarser than the preview read: it assumes the card's placement box rather than measuring it. The preview read
still wins when it is available, and the floor decides either way, so an estimate near 4.5:1 can tip to "no ink reads".
That is the safe direction, because the fallback is a solid card.

Tests: `photo-ink-read.test.ts` covers the placement, the decision (including a 121-gray photo where neither ink reads),
the cache's keys, persistence and broken-storage paths, and how references resolve. The e2e spec adds an off-screen slide
that now gets one ink, the reload (proven to fail with the cache off), and the no-ink and unreadable-photo cases. The
frame-trace jank guard now skips CodeMirror's unmeasured `top: -10000px` placement. That frame is invisible, and under
load the trace caught it about one run in four.

## When no pin clears, the finding offers the card ink (2026-10-27)

On `photo-wide` with `card-clear` and a body paragraph, pinning dark lifts the heading but leaves the theme's muted body
ink under 4.5:1, so the finding offered no button and only named the options. In the e2e run that slide reads at 1.6:1 as
written and at 7.1:1 with `ink-light` (Chromium, light mode, 1440 px). A spotlight card has a second fix that
does not depend on the theme: `ink-light` / `ink-dark` set the card's fill and both inks to fixed values (the thin-card
classes). The finding now offers **Set card ink light** (or **dark**) when, and only when, no pin clears and that ink does.

- **A pin still comes first.** The agreed design was the pin, and a pin keeps the theme's own palette while an ink
  overrides it. `judge` in `lib/core/photo-contrast.mjs` tries `PINS`, and moves on to `INKS` only when no pin clears. Inside
  each group the higher ratio wins, as before. A pin that clears beats an ink that clears higher.
- **The ink is measured, not assumed.** `readPinned` simulates an ink the way it simulates a pin: it sets the class on the
  preview section (and clears the other ink) inside one task with transitions off, reads the computed fill and inks, and puts
  the classes back. `pickCardInk` in `card-ink.mjs` was not reused for the decision because it models only the heading ink,
  and this finding judges the worst of heading, paragraph and list row.
- **The edit is the Image tab's.** The button writes the class through `setImageCard(chunk, 'ink', …)`, the same
  function the slide's Image tab and the tooltip's `addCardInk` use, so the slide never carries both inks.
- **Whose call.** The follow-up parked this as the owner's decision. The continuation brief for this work said "decide and
  proceed", so it was built, kept small and reversible, and put to the owner at the merge gate. The owner kept it
  (2026-10-27, PR #2932).
- **When nothing clears**, the message now reads "No pin and no card ink clears it: raise the card backing or choose
  another photo." It used to suggest the card ink, which the finding has now tried.

The unit tests add the ink fallback, the pin-wins order, the higher of two clearing inks, and an ink that does not clear. The e2e "no pin" case now expects
**Set card ink light**, no pin button and no **Set card ink dark**, clicks it, and expects the source to read
`card-clear ink-light` and the finding to clear. It runs at 1440 and 390 in Chromium and in WebKit's tablet and phone
projects.

## Checked on a real iPhone (2026-10-27)

The owner ran the tap script on the PR #2932 preview in Safari on an iPhone, in light mode:

- The `thin-card-no-ink` tooltip offered the single ink that reads (**Add ink-light**) in both light and dark mode.
- The Coach flagged the heading-only slide at 1.8:1 and offered **Pin this slide dark** (8.8:1). The tap wrote `dark` and the
  finding cleared.
- With a body paragraph, the card-ink fix applied `ink-light`; heading and body then read as white on the photo, and the
  owner confirmed the Coach path works.

So WebKit on the device parses the computed colors and decodes the photo the way the canvas probe expects, which closes the
iOS follow-up from #2915.

## A statement is measured against its scrim at its strongest (2026-10-28)

A statement's words are fixed white (`--_card-heading-ink`) on the `.image-scrim` gradient. With `card-clear` the scrim's
alpha is 0 (`--_card-alpha: 0`), so the white sits straight on the photo, and over a bright photo it vanishes. The reader
skipped statements, so this went unwarned (follow-up from #2915).

The reader cannot know the scrim's alpha under the words without modelling the angle, the `at-*` placement and the band
variant, all of which move the dense end. So it does not model the point; it bounds it:

- **The verdict uses the scrim at its strongest.** `scrimBacking` in `photo-contrast-read.ts` reads the scrim's computed
  `background-image`, and `strongestScrim` in `lib/core/photo-contrast.mjs` takes each gradient layer at its densest stop
  and stacks the layers into one color (for the default scrim, `rgb(8 14 24)` at 0.96 alpha). If the text fails even against
  that, it fails under the real scrim on the mean photo. A statement whose scrim rescues it is never flagged, which keeps the
  first cut's false 1.2:1 out. With `card-clear` every stop is transparent, the bound is exact, and the ratio is the real one.
- **A partial scrim reads "at most".** For `card-o5` to `card-sheer` the ratio is a ceiling, and the message says so ("reads
  at most 2.4:1"). `describe` takes an `atMost` flag for it.
- **A fix is judged with the scrim off.** The scrim may be thin where the words are, so `readPinned` drops it for a statement
  and offers a fix only when it clears with no help. In practice a pin does not move a statement's fixed white ink, so the
  offer is **Set card ink dark**, which turns the ink near-black and the scrim light together.
- **What it does not catch.** A statement whose scrim is partly on and whose words still fail at the scrim's thin end is not
  flagged: the bound gives the scrim its best case. The bound also assumes the scrim backs the ink (dark under light ink,
  light under `ink-dark`), which the ink classes guarantee by setting `--_scrim-rgb` with the ink. That pairing covers
  only the heading and paragraph, which take `--_card-heading-ink` / `--_card-body-ink`. A statement's list row keeps the
  theme's ink, so the reader leaves `li` out for statements; the independent check found that judging a dark row against
  the strongest dark scrim is a floor, not a ceiling. Whether that row reads at all is
  `followups.d/2932-p3-statement-list-row-ink.md`.

The unit tests pin `strongestScrim` (the stacked alpha of the default scrim, `null` for `card-clear`, the browser's layer
order) and the "at most" wording. The e2e puts a `card-clear` statement over the bright photo, expects **Set card ink dark**,
no pin button and no "at most", clicks it, and expects `card-clear ink-dark` and the finding gone. A second case puts
`card-o10` (a thin scrim) on the same slide and expects "reads at most" and the dark ink. It runs at 1440 and 390 in
Chromium and in WebKit's tablet and phone projects. The existing "statement over a bright photo is not flagged" case still
passes.
