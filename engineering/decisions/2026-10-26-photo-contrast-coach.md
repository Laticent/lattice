---
status: shipped
summary: >
  The Studio Coach now warns when the text on a photo slide falls below 4.5:1, measured from the live preview, and offers a
  one-click "Pin this slide dark" (or light) only when that pin clears the floor. It never flips a slide on its own. The
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
   helps, a **Pin this slide dark** / **light** button. The author clicks it. A pin is offered only if it takes the text to
   4.5:1 or better, because a button that changes the slide and still leaves the words unreadable is worse than none.
2. **Measure the painted page.** The reader asks the preview frame for the three things the browser decided: the mean photo
   colour under the card (the `card-ink-sampler.ts` code, now shared), the card's computed fill, and the computed ink of
   the heading, first paragraph and first list row. The pin is simulated by toggling the class inside one task with
   transitions off, reading the same styles, and putting the classes back.
3. **One slide, the one on screen.** The preview frame holds one slide at a time, so the finding is for the slide in view
   and follows the author. It is not a deck-wide sweep. The deck-wide read stays with `lint` and the scorecard.
4. **Outside the grade.** The scorecard is the engine's `scorecard.scoreDeck`; this finding reads pixels in one browser, so
   it does not move Craft or Style.
5. **Silence means "could not measure".** No preview, a preview still showing another slide, a photo the browser cannot read
   (cross-origin), or an unparseable color all return no finding.

## Scope and what it does not do

- Spotlight compositions only. `clean`, `split` and `gallery` put the text beside the photo, and a statement's ink is fixed white on a scrim.
- Text over a photo outside the `image` component does not exist in Lattice: `![bg]` photos are painted by the `image`
  layout's own `.lattice-bg` panel.
- Mean colour, not a per-pixel worst case. A busy photo can pass the mean and still lose a word. The 24 by 24 sample is
  the existing card sampler's, kept so the two features agree.
- Large text is not given 3:1, the stance `check-slide-contrast.js` already takes.
- **A statement is not measured.** Its backing is the `.image-scrim` gradient (up to 0.86 alpha dark, two layers), not a fill on the text box, and the reader does not model it. The first cut read a statement as "no backing" and, over a bright photo, reported 1.2:1 for text that reads fine on the real scrim; an independent check found it and a probe reproduced it. Measuring a statement with the scrim off (`card-clear`) would need the gradient modelled.

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

- **A statement was flagged although its scrim made it read** (above). The e2e puts a statement over a bright photo and expects no finding.
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
- **Fixed: an unchanged lint pass no longer closes the open tooltip.** By default CodeMirror hides a lint tooltip on any `setDiagnostics`,
  even one that changes nothing; on a phone lint runs again just after the Source tab opens. The editor's linter now passes `hideOn`
  (`keepTooltipOnSameDiagnostics`): keep the tooltip when the text did not change and the diagnostics under it are the same.
- **Not ours, and held out of one assertion:** in Chromium with a mouse parked over the line at phone width, the parked preview's redraw
  makes the browser fire a synthetic mousemove and CodeMirror's hover closes the tooltip and reopens it 300 ms later (traced: an effects-only
  hover transaction). A finger cannot cause it, and WebKit's iPhone profile never showed it in 12 runs, so the "tooltip never removed" check
  is held on WebKit and at desktop width, not in Chromium at 390.
