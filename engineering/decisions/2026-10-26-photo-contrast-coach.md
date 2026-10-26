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

- Spotlight and statement compositions only. `clean`, `split` and `gallery` put the text beside the photo.
- Text over a photo outside the `image` component does not exist in Lattice: `![bg]` photos are painted by the `image`
  layout's own `.lattice-bg` panel.
- Mean colour, not a per-pixel worst case. A busy photo can pass the mean and still lose a word. The 24 by 24 sample is
  the existing card sampler's, kept so the two features agree.
- Large text is not given 3:1, the stance `check-slide-contrast.js` already takes.
- A statement's scrim is fixed white ink on a dark scrim; with `card-clear` the scrim is gone and the warning applies, but a
  pin cannot fix it. The message then says to raise the backing or choose another photo.

## Reuse (HARD RULE #15)

`contrast` and `luminance` come from `lib/core/card-ink.mjs`; a test pins the new ratio to that function. The sampler's
photo reading moved into exported `meanUnderBox` and `boxInSection` in `card-ink-sampler.ts` rather than being copied.
The finding rides the Coach's existing `FindingCard` and `settingsWrite` funnel, so the pin is one Undo step.

## Added after a device test: fix buttons on `thin-card-no-ink`

Testing on an iPhone, the owner hovered the editor's `thin-card-no-ink` tooltip and found no button, while other lint rules have one.
Those rules are `autofixable` in lint-core. This one is not, on purpose: which ink reads depends on the photo's pixels, which lint-core
(pure, no DOM) cannot see. The Studio now attaches two buttons in `Editor.tsx`, **Add ink-light** and **Add ink-dark**, and the author
picks. The edit is `addCardInk` in `thin-card-fix.ts`, loaded when a button is pressed; the slide is read from the position at click time.
Not chosen: a single auto-picking button, because the preview may not show this slide (the phone's Source tab shows none), and a button that
sometimes does nothing is worse than two that always work.
