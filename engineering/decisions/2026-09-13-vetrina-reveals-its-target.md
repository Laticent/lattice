---
status: shipped
summary: >
  "Vetrina no longer scrolls things into the viewport", reported on an iPhone, was two unrelated
  mechanisms wearing one symptom, and the first half of the report is wrong in a useful way: it
  never scrolled. `git log -S scrollIntoView` on stage.ts returns exactly one commit, and the one
  call it added is the DROP target of a drag — so `point()`, a drag's pick-up and every gesture
  aimed at something below the fold sent the cursor off-screen and played the beat to an empty
  viewport, for the library's whole life. Each verb now reveals its own target FIRST, and "first"
  is load-bearing: three things read the rect before `moveToEl` is even reached (the anticipation
  ping, `alreadyAimed`, and the glide's own duration), so a reveal placed inside `moveToEl` drew
  the ping at the target's old position and glided to its new one. The scroll is INSTANT on
  purpose — a smooth scroll makes the landing a race between two animations, since the glide's
  duration is fixed at kickoff and a browser's smooth scroll outlives the 300-820ms envelope —
  with a retry that drops `behavior` for engines older than Safari 15.4, where an unknown enum
  member throws from the dictionary conversion rather than being ignored. The SECOND half of the report did NOT
  reproduce, and that is the more useful finding: the Studio's phone editor does follow its typing.
  Measured across the whole phone tour, the old `scrollTop = scrollHeight` on a selector-found
  `.cm-scroller` and the new "ask CodeMirror" score the SAME worst gap between the document's end
  and the visible box — 0px on Chromium at 390px, 53px (~2 lines, never sustained) on real WebKit at
  an iPhone box. So that change removes a structural fragility (a guessed scroller, an extent
  CodeMirror may not have measured yet) and closes one real gap found by inspection — the desktop
  `set` path had no follow at all — but it is not a fix for what the report described, which stays
  open. Real iOS Safari remains UNVERIFIED throughout.
---

# Vetrina reveals its target, and the Studio's phone editor follows its own typing

**Symptom, as reported.** "Vetrina no longer scrolls things into the viewport." Seen on the
`/vetrina` demo page on an iPhone, and in the Studio editor while a tour was typing.

**It is two mechanisms, and only one of them is a regression.** Neither is #2175: `main` carried
the same two `scrollIntoView` occurrences before that PR and after it.

## 1. Vetrina never scrolled

`git log -S scrollIntoView -- docs/src/lib/vetrina/stage.ts` returns ONE commit on `main` — the file's own
arrival. The single call it contains is in `drag()`, on the DROP target, added with the live-aim
work (D4.1). Everything else aimed at whatever rect the target happened to have:

- `point()` measured the target three times (the anticipation streak + ping, the register beat's
  `alreadyAimed`, and the glide duration) and never asked it to come into view;
- a drag's PICK-UP target got nothing, while its drop target got the one call in the file;
- a gesture — the whole deictic set, plus `check` / `cross` — drew its ink wherever the target
  stood, including 2,000px below the window.

So a target below the fold produced a cursor parked off-screen and a beat played to an empty
viewport. On a desktop host most targets are in view and this is invisible; on a phone almost
nothing is, which is why the report came from an iPhone and why it reads as "the tour does
nothing".

### Where the reveal goes, and why not in `moveToEl`

`moveToEl` is the choke point every aimed move passes through, so it looks like the one place to
ask. It is the wrong place, measured: by the time a `point()` reaches it, the rect has already
been read twice. The anticipation ping is the visible half — it would flash where the target used
to be while the cursor glided to where it now is, which is a NEW defect in exchange for the old
one. So each verb reveals at the top of its own beat, which is also the only placement that is
exactly once per beat. FIVE call sites: `point`, a drag's pick-up, its drop (where the one
pre-existing call was), its SNAP-BACK, and `gesture`.

The snap-back is the one an independent checker found missing on the first pass, and it is the
clearest case for the whole change: the glide to `to` may have scrolled the page, so on a long list
the place the item came from is off-screen by then — and aiming live tracks it there faithfully,
which puts the shake that means "it didn't happen" where nobody can see it. Its REDUCED tier then
had to be put back explicitly (`place()`, the same instant landing `moveToEl` gives those tiers):
`legible` and `still` run no glide, so a scroll with no landing left the cursor on `to` and shook it
at y=2415 in a 768px window. That was a regression this work introduced on the a11y path, caught
before merge, and it is why the reveal is not simply "call it everywhere".

**Two kinds of gesture target are excluded, and both were defects in the first draft.** `wave` and
`shake` play at the cursor and never read the target they are handed, so revealing scrolled the page
out from under a cue that had not moved. And a cue SILENCED through `theme.cues` draws nothing at
all, so it scrolled the page for ink that never appeared — a page move with no visible cause, which
is worse than the off-screen cue this exists to fix. Both are now gated before the reveal fires,
where the per-kind guards inside the switch could not reach it.

`gesture` needs its own call for a second reason: a gesture-only beat (the shape `sayAt: 'gesture'`
exists for) never passes through `point` at all, and the call has to precede the `lastAim` record,
since a rect read across a scroll is off by exactly the scroll and `lastAim` is the box the
cursor-anchored caption keeps out of the way of.

`opts.rest` — a gesture's withdrawal target — deliberately gets no reveal. A withdrawal is where
the hand goes to stop being in the way, not something the viewer is being shown.

**A host-supplied `RectSource` opts in by HAVING a `scrollIntoView`, and that is what makes this
safe to add everywhere.** `Element` has one; a plain rect provider does not, and the reveal is a
no-op for it. The Present guide is the case that matters: `present-guide.ts` aims at regions
INSIDE the preview iframe through providers that answer only `getBoundingClientRect` (the
`frame-geom` bridge), so nothing in Present scrolls — which is correct, since the slide frame is
not a page the tour should be moving.

### Instant, not smooth

The prettier picture is a smooth scroll, and it is wrong here. The glide's duration is computed
ONCE, from the distance Fitts's law sees at kickoff, and the envelope is 300-820ms; a browser's
smooth scroll runs ~300-500ms and can outlive it. The cursor would then land where the target was
going to be while the target was still moving — the exact class of defect the live re-aim work
(#1400) exists to prevent, reintroduced from the other side.

`behavior: 'instant'` also takes the host's `scroll-behavior: smooth` out of the stage's hands
(the drag path was silently at its mercy), and it is the motion-safe answer, so the
`legible` / `still` tiers need no exception to it.

**The `behavior` retry is not defensive padding.** `behavior` is a WebIDL enum, and an enum member
an engine does not know throws `TypeError` from the dictionary conversion instead of being
ignored. `'instant'` shipped in Safari 15.4 — so on an older iOS the whole call throws and nothing
scrolls at all, on exactly the devices this fix is for. The retry without `behavior` leaves such
an engine where the drag path already left it: the host's own scroll behavior.

### The chrome is re-seated after the stage's own scroll

Under `bounds: 'host'` the dock is measured against the VISIBLE part of `root`, and a scroll changes
that box. What gets re-seated is what each style's `layout` owns — the whole bar for an edge dock,
and under `caption: 'cursor'` the Exit chip alone, since the balloon is placed per beat by `place`
and picks up the new geometry on its next show. Only `resize` was wired to `relayout`, which was correct while nothing
in the stage could move the page. `reveal` now calls `relayout()` unconditionally: it returns
immediately under the default bounds, and under `'host'` it is idempotent and costs about what
comparing the before/after rects would have cost anyway.

### Four limits this does not close

- **A scroll the VIEWER performs mid-run still leaves the `bounds: 'host'` chrome seated against
  the old intersection.** Pre-existing, off the path of this change (HARD RULE #18), and not
  pulled in: the cheap fix is a `scroll` listener, and a listener that runs `relayout` at scroll
  frequency on a phone is a jank decision that wants its own measurement.
- **A target clipped by an `overflow: hidden` ancestor gets scrolled anyway** — a programmatic
  scroll works on a box the viewer cannot scroll, so that box stays scrolled with no affordance to
  put it back. Accepted rather than guarded: it only happens when the target really is clipped,
  where the alternative is pointing at something nobody can see, and the opt-out already exists —
  a host hands the stage a `RectSource` with no `scrollIntoView` (the same shape that keeps
  Present's in-iframe targets untouched). Both are now in the library README.
- **A tour started in COMPOSE mode types into ProseMirror, which has the same shape of defect.**
  `editMode` starts at `'markdown'` and no tour switches it, so the demo never reaches Compose on
  its own — but an author who switched and then started a tour gets a `setSource` that moves no
  caret in an editor with no `revealTail`. Not pulled in (HARD RULE #18: pre-existing, off this
  path): `ComposeView` already documents, with a measurement, that ProseMirror's own
  `tr.scrollIntoView()` does not scroll that host, so the fix there is a different mechanism and
  jsdom has no layout to test it with.
- **`leadMs()` predicts a word-cued beat's travel from the PRE-scroll rect.** The prediction is
  now long for an off-screen target, so a cued action starts marginally early. Left alone
  deliberately: the alternative is scrolling the page at prediction time, well before the beat.

## 2. The Studio's phone editor — a real mechanism, and a symptom that did not reproduce

This half has a real mechanism. What it does not have is a reproduction, which is why the numbers
come before the story.

Desktop types NATIVELY (`typeTail`), so the caret moves and CodeMirror scrolls to follow for free.
A phone CANNOT: a native insert makes the CodeMirror doc run ahead of the React `value` prop, the
value-sync then diffs against the lagging value and deletes the characters typed since — dropped
characters, garbled slides. So phone typing goes through the controlled `setSource` path, which
replaces the document from React state, moves no caret, and therefore never scrolls.

`followEditor()` was the compensation, and it had two ways to fall short of the text:

- it set `scrollTop = scrollHeight` on `#studio-pane-editor .cm-scroller`, and `scrollHeight` is
  whatever extent CodeMirror has MEASURED so far. Reached before the editor's own measure cycle,
  that is the pre-insert height, and the scroll would land above the line just typed. (Would:
  the measurement below says neither engine here shows it.);
- `.cm-scroller` is the scrolling element only while the editor is the height-constrained box on
  that surface. It is a guess about layout, made from outside the editor.

Both questions belong to CodeMirror, so `EditorHandle.revealTail()` now asks it: a pure scroll
effect on `view.state.doc.length`, dispatched with no changes and no selection. CodeMirror
measures its own document and walks the real scrollable ancestors. If the reveal still lands
before the value-sync it reveals the previous tail — one line behind — rather than parking at the
top.

**MEASURED, and it changes what this half claims.** `demo-mobile.spec.ts` samples CodeMirror's own
geometry every frame across the whole four-slide phone tour and reports the worst gap between the
end of the document and the visible box, while the document is growing:

| | Chromium @ 390x844 | real WebKit @ iPhone 15 Pro |
|---|---|---|
| old (`scrollTop = scrollHeight`) | 0px | 53px |
| new (`revealTail`) | 0px | 53px |

Identical, and neither ever sustained past a frame or two. A 48px `yMargin` on the reveal was tried
against the WebKit lag and made no difference (53px with it and without), so it was dropped rather
than shipped as a number with nothing behind it.

So the fragilities above are real by construction and this change removes them before they bite —
but they are not what the iPhone report was seeing. **That symptom is still unexplained**, and the
candidates the sandbox cannot reach are the interesting ones: the software keyboard's
visual-viewport offset, which changes what "in view" means without changing any scrollTop, and
Safari's collapsing chrome. The measurement that would settle it is this same sampler, on a device.

The caret is deliberately untouched, and that is the load-bearing half: moving it to the end would
also scroll, and would fire the editor's cursor→slide channel, jumping the preview to the last
slide on every keystroke of a demo. `editor-reveal-tail.test.tsx` pins exactly that.

**The desktop `set` path had no follow at all.** It is the controlled path too — it just is not
used per keystroke. `runner.ts` routes three cases through it: an `instant: true` beat, the `still`
motion tier, and any insert over ~1600 characters (a whole slide at once). A reduced-motion DEVICE
is not one of them — it resolves to `legible`, which keeps the typing reveal. It dropped a screenful of text in below the fold and left
the view at the top, the same defect as the phone's on the surface nobody looked at. It now calls
the same follow.

## What is verified, and what is not (HARD RULE #23)

- **jsdom / vitest** — `reveal.test.ts` (13 arms) pins the mechanism: the options passed, that the
  scroll precedes every measurement in the beat, that a gesture-only beat reveals on its own
  account, the `behavior` retry, a target that cannot scroll, a provider that refuses, the
  `bounds: 'host'` re-seat, all three drag call sites, the reduced-tier snap-back landing, and the
  `wave`/`shake`/silenced exclusions. `editor-reveal-tail.test.tsx` (2 arms) pins the reveal as a
  pure scroll — no doc write, no caret move, no `onCursorSlide` — by comparing the effect's TYPE
  against a sample, because `effects: []` is truthy and a looser assertion let an empty transaction
  pass.
  **Mutation-checked per CALL SITE, not per arm, and the distinction was a finding.** "6 of 9 arms
  go red" was true of the first draft and it is a statement about arms: measured per call site the
  same draft was 2 of 5, because the three drag reveals had no arm at all. Today each of the three
  fixes dies to its own arm — drop the reduced-tier `place()` and the snap-back arm goes red; reveal
  for every gesture kind and the `wave`/`shake` and silenced arms go red; delete the three drag
  reveals and all three drag arms go red.
- **Real Chromium** — `vetrina-exemplars.spec.ts`'s `reveal` exemplar (a `#far-target` more than a
  viewport down) at 1440x900 and 390x844: the page scrolls by more than half a window, the target
  ends fully on screen, and the cursor lands inside it. `demo-mobile.spec.ts` samples CodeMirror's
  own geometry across the whole phone tour and requires the end of the document never to sit off
  screen for 6+ consecutive frames while the document is growing — coverage that did not exist
  before, on a behavior nothing checked.
- **Real WebKit at an iPhone 15 Pro box** — the reveal exemplar AND the editor-follow sampler, both
  tagged `@webkit-phone`. `behavior: 'instant'` and `block: 'nearest'` are engine judgments a
  Chromium pass cannot stand in for, and so is when an insert gets measured.
- **A before/after on the unfixed build, for the half that HAS a reproduction.** Against the old
  library the reveal exemplar's page never scrolls at all — `window.scrollY === 0` with the target
  ~1,100px below the fold, at both widths; with the fix it scrolls by more than half a window and
  the cursor lands inside the target.
- **An independent checker (HARD RULE #25) read the diff on the real surfaces**, after two runs
  died on a session rate limit. It reproduced the geometry, the before/after, the `behavior` retry
  (it made `behavior` throw on a real browser and watched the retry scroll the page), both tail
  numbers, and `relayout`'s idempotence across all five caption styles — and it found the
  reduced-tier snap-back regression, the silenced-cue and `wave`/`shake` scrolls, the per-call-site
  coverage gap, the `~2,700px` number that was borrowed from a different measurement, and four
  claims that were broader than the code. Everything it named is either fixed above or restated.
  What it could NOT verify from an artifact: the OLD column of the tail table and the `yMargin`
  experiment, both of which needed a build of the pre-change code that no longer exists in the tree.
- **UNVERIFIED: real iOS Safari on a device.** Touch, Safari's collapsing chrome and the
  visual-viewport offset (which shifts what "in view" means) are not reachable from this sandbox.
