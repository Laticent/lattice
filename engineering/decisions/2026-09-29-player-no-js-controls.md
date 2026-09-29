---
status: shipped
summary: >-
  The exported HTML player's toolbar did nothing in the iPhone file preview. iOS Quick Look
  (Mail, Files, Messages, most apps' attachment viewers) renders an HTML file with scripting
  off, so every onclick was dead and the reader got the stacked no-JS column. The player now
  ships hidden radios and a checkbox whose <label>s stand in for Present, Read·Slides and the
  moon when no script runs: Present becomes a swipe-per-slide strip fitted on both axes
  (closes #1602 for that view), and the moon flips the scheme through additive rules that
  match the scripted toggle element for element. Read·Article, Notes, Fullscreen and narration
  have no no-JS form and hide. The owner confirmed it on an iPhone and kept the flip's ~140 KB cost.
---

# The player's controls work with scripting off

## Symptom

On the owner's iPhone, an exported player opened from an app's file preview ("3 of 4",
with an **Open** button) showed every slide stacked in a scrolling column, and none of the
toolbar buttons did anything: not Present, not Read·Slides, not the moon.

## Root cause

That preview is Quick Look, and Quick Look renders HTML with JavaScript disabled. There is no
user setting for it; the Safari JavaScript switch does not reach it. The player's script never
ran, so it never added `.lp-js` to `<html>`, and the page fell to its no-JS floor (every
Present and Read rule is scoped under `.lp-js`). The floor hid Notes, the counter and
Fullscreen, but left the view buttons and the moon on screen. Their only wiring is `onclick`
in `playerJs()`, so they sat there dead.

`2026-09-25-one-slide-frame.md` had already met this preview ("the phone's preview blocks the
player's inline script"); this note names it and gives it controls.

## What ships

All in `lib/export/player-core.mjs`, all inert once the script runs (`:not(.lp-js)`).

- **Form controls in place of script.** `<body>` opens with two hidden radios
  (`#lp-nj-present`, `#lp-nj-slides`) and a checkbox (`#lp-nj-flip`). The toolbar carries a
  `<label>` twin for each: two in `.lp-seg`, one beside `#lp-mode`. A tap on a label checks its
  input natively, with no script, and CSS reads the state from the root with `:has()`. Every
  no-JS rule is gated on `html:has(.lp-nj)`, so an engine without `:has()` drops the rules and
  keeps the plain column instead of showing labels that do nothing.
- **No dead buttons.** With no script, the scripted `.lp-seg` buttons, `#lp-mode`, `#lp-play`
  and `#lp-guide` hide. So do Read·Article, Notes, Fullscreen and narration: they have no no-JS
  form.
- **Present, one slide at a time.** `#lp-stage` becomes a horizontal scroller with
  `scroll-snap-type:x mandatory` and `scroll-snap-stop:always`, so one swipe moves one slide.
  The fit takes the smaller of a width scale and a height scale, so a slide is always whole on
  screen. That is the fix #1602 asked for, applied to the view where a whole slide is the
  point. The Read·Slides column keeps its width-only ladder: a scrolling column is read by
  width, and #1602 left that choice open.
- **The fit is a media-query ladder, not a formula.** `scale()` needs a plain number, and CSS
  has one way to divide two lengths into one: `tan(atan2(a, b))`. It parses in Chrome 131, but
  Chrome evaluates `100vw` inside it as `100px` (measured: `calc(1000px * tan(atan2(100vw,
  1280px)))` came back 78.125px at a 390px viewport, where 304.688px is right) and rejects
  `100vw - 32px` inside `atan2()` outright. `presentFitCss()` emits rungs every 8% on each
  axis, each the largest scale that fits at the rung's smallest viewport, so a slide sits at
  most 8% under its ideal size and never over it.
- **The moon flips the scheme with no script.** The scheme rules are attribute selectors so
  pre-`:has` WebKit keeps dark mode, and folding `:has()` into them would drop the whole rule
  there. So the flip is ADDITIVE: `themeDualMode` and the two other dark emitters write extra
  rules under three roots (`NJ_DARK_ROOT`, `NJ_LIGHT_ROOT`, `NJ_SYSTEM_LIGHT_ROOT`). Each root
  has the same (0,2,0) specificity as `:root[data-lp-scheme=dark]` (the `:has()` sits inside
  `:where()`), so a flip rule wins or loses exactly as the rule it mirrors. A flip to light
  re-applies the light arms after the dark ones, carving out the bookends and the divider,
  which stay dark panels as they do in the scripted light scheme. A deck with a deck-wide
  `color-mode` gets no no-JS moon: its scripted toggle adds and removes a class on every
  section, which CSS cannot do.

## Evidence

- **A committed test, run in two engines.** `test/integration/export/player-no-js.test.js`
  exports `slide-class-forms` once and rewrites its `data-lp-scheme` to get the dark and
  system files (`--player-mode` changes nothing else a reader sees), then drives them with
  JavaScript off. It checks that the labels replace the dead buttons, that Present is one
  whole slide at 390×844, 844×390 and 1440×900, that one swipe moves one slide, that
  Read·Slides is the column, that a tap keeps the scroll position, that the flip matches the
  scripted toggle in all 12 cells, that print media lays out every slide, and that with the
  script on no no-JS control shows. It passes 7/7 in Chromium 131 and in WebKit 26.0
  (Playwright's build, pointed at by `LATTICE_PLAYWRIGHT`). That a deck-wide `color-mode`
  ships no moon is a unit test in `html-player.test.js`, since it needs no browser. CI runs
  the Chromium arm in `integration` and, on the owner's call, the WebKit arm in the blocking
  `player-webkit` job whenever `lib/export/**` or the test changes. Its first run took 3 min
  24 s, beside `integration`.
- **The test's first shape cost the integration tier 7 minutes.** It exported four decks,
  and each export launches Chromium while the tier's other files are running. The tier's test
  step went from 15 min 20 s (`f9dd027`) to 22 min 31 s (`62ae1e7`), and the next run passed
  its 25-minute cap and was cancelled. One export instead of four, plus the deck-mode check
  moved to a unit test, took the file alone from 66 s to 25 s.
- **The test can fail.** Three planted regressions each failed their test: the flip-to-light
  token rule removed, the Present strip applied to print media, and the hidden inputs put
  back to `position:absolute`.
- **It found one more gap.** With no flip, the no-JS page computed `color-scheme: light dark`
  where the scripted page stamps a concrete value. The no-JS page now states it the same way.
- **The WebKit here is not iOS.** Playwright's WebKit is the Linux port. It shares the engine
  with Safari and Quick Look, but not the iOS shell, touch handling or Quick Look's settings.
- **The flip matches the scripted toggle.** In Chromium, for six decks (`chart-legends`,
  `data-viz-gallery`, `finish-per-slide`, `slide-class-forms`, `deck-logo-canvas`,
  `deck-logo-dark-theme`), each baked `light`, `dark` and `system`, under an OS in light and in
  dark, flipped and not flipped (72 cells): the computed `color`, `background-color`,
  `background-image`, `fill`, `stroke`, `border-top-color`, `opacity`, `filter`,
  `box-shadow`, `text-shadow` and `outline-color` of every element in every slide are equal
  between the no-JS page and the scripted page. The one exception is three `box-shadow`s on
  `data-viz-gallery`'s kanban cards. Those differ in every cell, flipped or not, because the
  shadow length scales with the frame's on-screen width and the two views size the frame
  differently.
- **The fit.** Present with no script puts a 1280×720 slide at 348×196 on a 390×844 phone,
  533×300 on 844×390 landscape and 1372×772 on 1440×900. The whole slide is on screen in all
  three.
- **Print and focus.** The strip is `@media screen` only, so a no-JS print still gives the
  whole deck (9 pages for `chart-legends` on A4, the same as the column). The hidden inputs
  are `position:fixed`: a label tap focuses its input, and an input at the document's top
  scrolled a reader in the column back to slide 1.
- **What it costs.** Measured on three exports: the view controls and the Present strip add
  6.7 KB. The scheme flip adds 137 KB on `chart-legends` (13.8% of a 991 KB file), 160 KB on
  `data-viz-gallery` (12.1%) and 137 KB on `slide-class-forms` (10.7%). The flip is the cost
  because every dark token body ships in four more scopes. Attachments in mail are not
  compressed, so this is the size a recipient downloads.
- **The real surface, by the owner.** Quick Look cannot be driven from the sandbox. On
  2026-09-29 the owner opened a light and a dark `chart-legends` export in the same iPhone
  preview as the original report and reported that the swipe, the view switch and the flip
  all work. That report is the evidence; no recording was taken.
- **The size decision.** Put to the owner with the numbers above, and the owner kept the
  flip: a working moon is worth about 140 KB on a file of about 1 MB.
