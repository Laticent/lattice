---
status: shipped
summary: A pinch on any Studio slide surface used to TURN THE DECK. Every surface measured `touches[0]` against `changedTouches[0]` and none counted the fingers, so two fingers spreading 100px each cleared `swipeAction`'s 45px threshold — verified on the real Studio, where a pinch on slide 3 landed on slide 4 at 1440 and 820. The trackpad half was worse: Chromium delivers a trackpad pinch as `ctrl`+wheel, no surface read `ctrlKey`, so pinching scrubbed the deck at every width including plain desktop. Root cause is #1294's again — an input rule owned per surface instead of by `lib/core/present-transport.mjs`. Fix — `createZoomGesture` + `zoomStep` join the kernel, carrying the rule that a gesture which ever held 2+ pointers is a pinch and never a swipe; `docs/src/lib/preview-zoom.ts` holds the DOM half the kernel cannot (non-passive listeners, `touch-action: none`, iOS `gesture*` suppression, middle-button quirks). Zoom is now a first-class verb on the shell preview, Present and the presenter screen, by pinch, ctrl/⌘+wheel and middle-drag, at every breakpoint. A PLAIN wheel still turns the deck — the #1294 parity contract is intact. Real iOS/Android Safari is UNVERIFIED and stated as such. FOLLOW-UP (#1558): the exported HTML player, which shipped one release behind because its bytes need sign-off, now carries the guard too — the rule alone, not the gesture machine, since it has no zoom to drive; verified on a real exported file with CDP touch at 390/820/1440.
---

# Pinch-to-zoom: the gesture the swipe rule was eating

**Date:** 2026-08-10 · **Status:** shipped · **Predecessor:** [`2026-08-10-input-verb-parity.md`](./2026-08-10-input-verb-parity.md)

## The rule

> A gesture that ever held **two or more pointers** is a pinch, and is **never**
> measured as a swipe — from the moment the second finger lands until the last one
> lifts. Zoom is the fourth input verb, and like the other three it lives in the
> kernel, not in a surface.

## What was actually broken

Measured on the real built Studio with genuine CDP touch and wheel events, before
any change. Two gestures, five cells:

| Gesture | desktop (1440) | desktop-touch | tablet-touch (820) | mobile-touch (390) |
|---|---|---|---|---|
| Two-finger pinch | — (no touchscreen) | slide 3 → **4** | slide 3 → **4** | no nav¹ |
| Trackpad pinch (`ctrl`+wheel) | slide 3 → **2** | slide 3 → **2** | slide 3 → **2** | slide 3 → **2** |

¹ Not a working guard — the same unguarded code path, which simply did not trip on
that particular synthetic sequence. It is now an assertion that the slide *zooms*,
so the cell proves a behavior instead of an absence.

Both readings were taken **mid-deck on purpose**. The first cut of the probe
started on slide 1, where a misfired `prev` clamps and looks exactly like a
gesture correctly ignored — which is how the phone cell first read as a false
"no nav". A verification harness that cannot distinguish "ignored" from "clamped"
is measuring the clamp.

Two defects, one root cause.

**No surface counted the fingers.** `onTouchStart` stored `e.touches[0]`;
`onTouchEnd` measured `e.changedTouches[0]` against it. During a pinch the first
finger travels ~100px horizontally, `swipeAction`'s threshold is 45px with a 1.3×
horizontality ratio, and a horizontal pinch is perfectly horizontal. So the rule
fired every time, with high confidence, on a gesture that meant the opposite.

**No surface read `ctrlKey`.** A trackpad pinch does not arrive as touch — Chromium
synthesizes a `wheel` event with `ctrlKey` set. The wheel gate saw a firm flick on
the dominant axis and turned the deck. This is why the defect reached the plain
`desktop` project, which has no touchscreen at all: *every laptop trackpad in the
world* was hitting it.

The root cause is the one `lib/core/present-transport.mjs` exists to end, and the
one #1294 already named: **the rule for an input verb was owned by each surface
instead of by the kernel.** The kernel held `keyAction`, `swipeAction` and
`createWheelGate` — but nothing that knew a second finger existed, so every
surface's swipe rule was structurally unable to decline a pinch.

## What changed

- **`createZoomGesture` and `zoomStep` join the kernel.** The gesture machine owns
  scale, pan offset, the pan bounds, and the finger-count bookkeeping. It returns
  `{swipeBlocked}` from `up()`, which is what a surface must read *before* calling
  `swipeAction`. DOM-free and self-contained, so it still inlines verbatim into the
  presenter popup — pinned by `test/unit/export/inlinable-kernels.test.js`.
- **`docs/src/lib/preview-zoom.ts` holds the DOM half.** Four things the kernel
  cannot have and stay DOM-free: non-passive listeners, `touch-action: none` on the
  surface, iOS `gesture*` suppression, and the middle-button platform quirks.
- **One owner per surface.** The controller takes the surface's *whole* input
  stream — swipe and wheel navigation included — rather than sharing the element
  with React handlers. Two listeners racing over one touch stream is how the swipe
  rule and the zoom rule came to disagree about what a gesture was.
- **All three surfaces**: the Studio shell preview, the Present overlay, and the
  presenter screen. Each gained zoom and lost the misfire in the same change,
  because a per-surface rollout is exactly what produced the drift.

## Three judgment calls worth naming

**A plain wheel still turns the deck; `ctrl`/`⌘`+wheel zooms.** The plain wheel
cannot do both, and it is a *shipped parity contract* — #1294 makes the wheel one
of three navigation verbs every slide surface owes, with an `@parity` suite
asserting it. Taking it for zoom would have deleted a navigation verb to add a
zoom verb. `ctrl`+wheel is also what a trackpad pinch already emits, so pinch on a
laptop and `ctrl`+wheel on a mouse are one code path rather than two.

**React's synthetic listeners could not have done this.** `onWheel` and
`onTouchMove` are attached at the React root as **passive**, so `preventDefault()`
inside them is a silent no-op. Without it the browser zooms the whole page
underneath the slide we are already transforming — the handler appears to work in
review and does the wrong thing in a browser. Every listener here is native and
explicitly `{passive: false}`.

**Zoom resets on slide change, everywhere** — and the first version of this note
justified it with a claim that is simply false: *"carrying 3× onto the next slide
lands the reader in a random corner of it."* It does not. The kernel works in
viewport-relative pixels and every slide renders into the same box at the same fit
scale, so persisting `(scale, x, y)` would land on the **identical** region of the
next slide.

The honest argument is weaker and worth stating as such. Resetting is the choice
that is never *surprising*: consecutive slides in a deck are often the same layout,
but often enough they are not (a table then a section title), and arriving at 3× on
a slide whose content is somewhere else reads as a bug. The cost is real and falls
on a real use — *"row 3 in Q1, now Q2, now Q3"* is exactly what zoom is for in a
boardroom deck, and that reader now re-pinches every slide. The asymmetry also runs
against us: unwanted persistence is one click to fix, unwanted reset has no fix.

**Reconsidered on that basis, and KEPT — a settled call now, not an unexamined
one.** Both directions above were put to the human as a product decision rather
than resolved as a bug, and the answer was to keep resetting: *never surprising*
beats *never re-pinching*. What changes is the status, not the behavior. This was
the weakest of the three judgment calls and the one flagged as most likely to be
revisited; it has now been revisited, with the false premise removed from the
argument, and it survives on its own merits. Both surviving in-code rationales say
so — `StudioShell.tsx`'s comment carried the "random corner" claim verbatim until
this pass and now carries the corrected one, and the presenter popup's already did.
The thing that would reopen it is evidence from a reader, not a re-reading of these
same two paragraphs.

Present additionally resets on close, which is not in doubt: leaving a talk at 3×
would hand the next session a cropped opening slide.

## Interaction model

| Input | At fit scale | Zoomed in |
|---|---|---|
| One finger drag | swipe → turns the deck | pans the slide |
| Two fingers | zoom about the pinch midpoint | zoom + pan together |
| Plain wheel | turns the deck | turns the deck |
| `ctrl`/`⌘` + wheel | zoom about the cursor | zoom about the cursor |
| Middle-button drag | zoom about the press point | zoom about the press point |
| Middle-button click | — | back to fit |
| Zoom badge | hidden | back to fit |

`+`/`=`, `-`/`_` and `0` do the same three things from the keyboard, zooming about
the viewport center — because there is no cursor to anchor on, and because a verb
reachable only by pinch, wheel or middle button is *gated on pointer capability*,
which is exactly what the parity rule forbids. A modified chord is never taken:
`⌘+`/`ctrl+-` belong to the browser's own page zoom, and taking those would remove
whole-UI enlargement from the readers a zoom feature is most for.

Zoom clamps to `[1, 4]` — 1 is fit — and pan is bounded so a zoomed slide can never
be dragged far enough to expose a gap. That bound is only true if the transform
target really does fill the box at scale 1, which it did NOT at first: the clipping
box carries a 1px border under `box-sizing: border-box`, so its border-box rect is
2px larger than the child in each axis, and a measured 7px strip of background
showed at the far corner at 4×. The controller reads the CONTENT box
(`clientWidth`/`clientLeft`) instead, which makes the kernel's premise true rather
than approximately true.

The badge appears only above fit: an always-on "100%" is noise, and its absence is
a truthful signal that nothing is cropped.

## Verification

Real built Studio, real browser, genuine CDP touch and wheel events — never a
synthesized DOM event (HARD RULE #23).

- **`@parity` e2e** across `desktop` / `desktop-touch` / `tablet-touch` /
  `mobile-touch`. New cells: on the shell preview, pinch zooms and does not
  navigate, trackpad pinch likewise, middle-drag zooms and middle-click resets,
  zoom does not leak across slides, and a pane resize while zoomed never blanks the
  slide; on Present, the same first three plus — added after the trio — a plain
  wheel and a one-finger swipe still turning the deck. Three touch-only cells
  **skip** rather than pass on the non-touch `desktop` project, which is correct
  (that project models a machine with no touchscreen) but means "all pass at every
  width, touch and non-touch" would be an overstatement.
- **Visual evidence at 1440 / 820 / 390** — pinched and panned. The slide zooms
  crisply inside its card, the card's rounded corners still clip the transformed
  content (checked at pixel level against the fit state, in case the composited
  child leaked the radius), the page itself does not zoom, and the slide counter
  never moves.
- **Unit tiers**: 10 kernel tests for the gesture machine including the inlining
  contract, 20 for the DOM controller, 4 for the keyboard route, plus a pinch and a
  `ctrl`+wheel case added to the presenter-window suite — where the fixture had to
  be fixed first, because it built touch events carrying only `changedTouches`, a
  shape no real TouchEvent has and one in which a pinch is unrepresentable. The
  same gap existed in this change's own controller fixture and was found the same
  way.
- **Exported artifact bytes are unchanged.** The export player inlines four named
  kernels by `.toString()`, not the module, so `createZoomGesture` and `zoomStep`
  do not reach it — asserted by building `playerJs()` and hashing the output before
  and after, on both export paths, not by reading the source. No export sign-off
  was required.

**The presenter screen shipped UNVERIFIED here, and is now verified.** That note
read: its guards are covered by jsdom unit tests and the generated script was
driven in a harness, but the presenter view is a `window.open` popup the Playwright
suite does not drive, so no artifact from the real surface existed. It does now —
`docs/e2e/presenter-zoom.spec.ts`, which catches the popup with
`context.waitForEvent('page')` and dispatches genuine CDP touch and wheel events
INTO it. Three `@parity` cells, green at `desktop` / `desktop-touch` /
`tablet-touch`:

- a **two-finger pinch** scales the current-slide stage (its measured on-screen box
  grows past fit) and relays no navigation;
- a **trackpad pinch** (`ctrl`+wheel) does the same on a machine with no
  touchscreen — the cell that matters, since that is the path that scrubbed the deck
  from every laptop before #1555 — and the badge returns the stage to fit;
- a **plain wheel still turns the deck**.

"Relays no navigation" is measured **at the wire, not at the pixel**: the popup
never navigates itself, it posts `{pp:'go', v:±1}` to its opener, so the spec
records every such message arriving at the opener and asserts a pinch produces
none. The plain-wheel cell is the **positive control for that instrument** — it
drives the same relay through the same spy and REQUIRES a delta — so a spy that
stopped recording, or a popup that never received the events, fails there instead
of turning the two "no nav" cells vacuously green. That is the lesson from the
first probe in this change (a harness that cannot tell "ignored" from "clamped" is
measuring the clamp), applied one layer up.

The cells are also **mutation-checked**, which is what separates them from a
formality: with `swipeBlocked` deleted from the popup's touchend and its
`ctrl`+wheel branch disabled, the two zoom cells go red and the plain-wheel control
stays green. Visual evidence at 1440: the stage at 4×, clipped by the screen's
rounded box, badge reading `400%`, opener counter still `2 / 7`.

**The mobile projects SKIP rather than pass.** The presenter launcher is
`hidden … md:inline-flex` — a phone has no second screen to put a presenter view
on — so at 390px there is no surface to drive. Stated here because "green at every
width" would be an overstatement of the same kind this note already flags for the
three touch-only cells.

## Performance — and the defect the measurement found

Measured with **`docs/scripts/zoom-gesture-bench.mjs`**, committed with this change
— the browser-side regime `frame-bench.mjs` established, extended to gestures
(`npm run bench` is the ENGINE benchmark and has no gesture scenario, so it is not
the instrument for this). It is committed precisely because the first version lived
in `.scratch/`, which is gitignored: the only quantitative claim in this change
would have shipped with no way to reproduce it.

```
cd docs && npm run build:e2e && npm run preview:e2e &
CPU=6 WIDTH=390 HEIGHT=844 node scripts/zoom-gesture-bench.mjs
```

Three questions, each measured: does zooming trigger an engine render, what do
frames look like during the gesture, and what does it cost at idle.

The headline is structural: **a pinch causes ZERO engine renders**, at every
throttle and viewport. That is the design working — a transform on a rendered layer
is not a re-render, so the whole edit→paint pipeline stays asleep. The zero is a
real zero and not an unwired counter: the same probe's `slide change` arm reports
`engine renders: 1` in the same page session, so the metric demonstrably can go up.

But the first measurement, at 6× throttle on a 390px viewport, found a defect
that reasoning had missed:

| pinch, 40 samples @ 6× CPU | p95 frame | frames > 32ms |
|---|---|---|
| first cut | 50.0ms | 15 |
| after the fix | 16.8ms | 1 |

**The long-task count is deliberately not in that table.** The first write of this
note claimed "57ms, 51ms → one ~55ms", and an independent re-measurement on a
rebuilt first-cut bundle got **one** long task in *both* states across three runs —
so on this hardware the long-task count does not discriminate between them, and
citing it as a before/after was reading noise as signal. p95 and the janky-frame
count do reproduce, and the p95 spread on the first cut (33.4 / 50.0 / 33.4 ms over
three runs) contains the number originally quoted.

The tell was that **panning was perfectly smooth (60fps, no long tasks) while
pinching was not** — both write the same transform through the same code, so the
difference could not be the transform. It was the badge: `onZoom` fired a React
`setState` **per gesture sample**, re-rendering `StudioShell` — one of the largest
components in the app — around 40 times during a single pinch. The claim "the
transform bypasses React" was true; the badge quietly did not.

The fix splits the two: the badge's **existence** is React state (a boolean, which
bails out of re-rendering on every sample after the first), and its **number** is
written straight to the DOM node. Same for Present. Repeated across three runs,
p95 is now indistinguishable from idle.

The one remaining ~55ms task is once per gesture, not per sample — the badge
mounting plus the re-raster at the new scale. For scale: a plain **slide change**
on the same device costs an engine render, two comparable long tasks and 4 janky
frames. **Zooming is now cheaper than turning the page.**

This is worth recording as a method note, not just a fix: the defect was invisible
to every correctness gate (all 61 `@parity` cells passed with it present), and
reasoning had explicitly concluded the opposite. Only measuring the gesture on a
throttled device found it, and only the *pan-vs-pinch contrast* localized it.

**UNVERIFIED, and stated as such: real iOS and Android Safari.** CDP touch in
headless Chromium is not a physical phone, and iOS drives its page zoom through
non-standard `gesturestart`/`gesturechange` events that Chromium never fires. Those
events are suppressed here on the reasoning that `touch-action: none` has
historically not been enough on Safari — but that reasoning has not been tested on
the surface it is about, and this sandbox cannot reach it.

## What the adversarial trio caught

The change passed every gate — lint, 5766 unit, 2928 docs, `build:check`, and a
green CI — and then the trio (HARD RULE #25: red team + Munger inversion +
independent checker) found nine real defects in it. They are worth naming, because
the pattern is sharper than any individual bug: **every correctness gate was green
while three of these were live, and two of them were things this note explicitly
claimed were handled.**

1. **Resizing the pane while zoomed rendered the preview BLANK.** `bound()` runs
   only inside a gesture, so nothing re-clamped the pan when the box changed size —
   and the splitter drag, "Collapse editor", a window resize and a rotation all
   change it. A 4× pan into a corner then sat entirely outside the new box. On the
   chromeless surfaces (Read stop, landscape phone) there is no badge, so there was
   no way out but a blind pan on a white box. Fixed with a `ResizeObserver` and a
   kernel `nudge(0,0)` that re-clamps without moving.
2. **The wrong fingers were counted.** `e.touches` is every contact on the
   *document*; the correct list is `e.targetTouches`. A thumb resting on the editor
   pane while the index finger swiped the preview — how a tablet is actually held —
   counted as a second pinch finger, so navigation died and the slide zoomed
   instead. The change whose entire premise is "count the fingers" counted the
   wrong ones, on all three surfaces.
3. **The zoom badge survived a remount, lied, and could not be dismissed.** Present
   returns `null` while closed rather than unmounting, and the shell's holder is a
   callback ref that re-fires on a breakpoint flip — so React state outlived the
   handle. Reopening Present after a zoomed session showed a stale "246%" over a
   slide at fit, and clicking it did nothing, because `reset()` early-returned
   silently when already at fit. Fixed three ways: `reset()` always emits, a fresh
   handle announces its scale at attach, and the announcement no longer rides on a
   DOM lookup that can fail.
4. **The pan bound was 2px too generous**, because the clipping box's 1px border
   makes its border-box rect larger than the child that fills it — a measured 7px
   strip of background at the far corner at 4×, against a note that claimed a gap
   "can never" be exposed. Reading the content box makes the premise true.
5. **A partial `touchcancel` lurched the slide ~200px**, and the presenter popup had
   **no `touchcancel` handler at all** — so a palm rejection there latched the pinch
   flag and silently ate the next swipe. The popup also skipped `deltaMode`
   normalization, leaving ctrl+wheel zoom inert on Firefox. Two copies of one rule
   had already diverged, which is the #1294 failure this module exists to end.
6. **The middle drag never checked `e.buttons`**, so a release that delivered no
   `mouseup` here left it live and bare cursor motion kept zooming.
7. **Zoom was gated on pointer capability** — no keyboard route at all, in a change
   that edits the CLAUDE.md row asserting no verb is so gated. `+`/`-`/`0` added.
8. **Present's swipe and wheel navigation had zero coverage.** This change moved
   them out of React props and into the zoom controller; nothing asserted they still
   worked, so a later edit could have killed them with every gate green.
9. **Three claims in this note were false or unreproducible** — the long-task
   before/after (noise, not signal), the test counts, and "verified" applied to the
   presenter screen, which has no artifact from a real surface. All corrected above.

The generalizable lesson, beyond "run the trio": the two highest-severity findings
(1 and 2) are both *state that only becomes wrong when something OUTSIDE the gesture
changes* — the viewport resizing, a finger landing elsewhere on the page. A test
suite built by driving the gesture can only ever exercise the gesture, so it was
structurally incapable of seeing either. The `@parity` matrix proved the cells it
contained, exactly as its predecessor warned.

## The exported player — the misfire, closed separately (#1558)

This change deliberately stopped at the Studio's door: the exported HTML player
(`lib/export/player-core.mjs`) alters the bytes of a shipped artifact and needs
human sign-off, so it shipped one release behind, as a recorded gap rather than an
oversight.

Its version of the defect was **worse than the one fixed above**. The player binds
`pointerdown`/`pointerup` rather than touch events, so the second finger's press
*overwrote* the single start point and the first finger's release was then measured
against the **other finger's** start — a `dx` of roughly the whole inter-finger
span, where the touch-based surfaces at least measured one finger against itself.
Measured on a real exported file at 390 / 820 / 1440, mid-deck, before the fix: a
pinch out on slide 3 landed on slide 4, and pinching back in landed on slide 5. The
stage also carries `touch-action: none`, so the browser's own pinch-zoom was
suppressed: on a phone the gesture did the wrong thing *instead of* the right one.

The fix is the GUARD alone — the rule ("a gesture that ever held 2+ pointers is
never a swipe, until the last pointer lifts"), not the gesture machine. The player
carries no zoom, and `createZoomGesture` is 5.9 KB of source — 23% of the whole
player script, shipped into every recipient's file — to read two of its nine methods.
That is a dead zoom engine in every deck anyone sends. The rule is stated at the
call site with a pointer back here; the drift risk that buys is real and is the
price of not shipping the bytes. **What earns those bytes is giving the player real
zoom**, which is the next change, not this one.

The honest version of that byte argument is narrower than it first looks: the player
script is already **51% comments**, shipped verbatim, so "5.9 KB is too many bytes"
does not survive its own premise. The argument that does survive is that dead code
with no caller is a liability at any size, and the bar for shipping 400 lines of
fresh gesture state machine into an artifact that is emailed to a board and **never
patched** is higher than for a site you can redeploy. `createZoomGesture` alone would
not even be enough — the Studio needed `docs/src/lib/preview-zoom.ts` (390 lines) to
go with it, and the trio found nine defects in exactly that code.

### The trio, and the hole the first cut shipped

Three lenses ran against the finished change. The red team and the checker
independently found the same live defect, and it is the one worth recording:

**The first cut counted only pointers whose `pointerdown` landed on `#lp-stage`** —
mirroring the Studio's `targetTouches`, whose documented reason is that a thumb
parked on the *editor pane* must not count as a pinch finger. That rationale does not
transfer. The Studio's preview is one pane among several; the player's stage is the
whole screen minus its own 119 px of chrome (`#lp-bar` above, `#lp-nav` below). A
pinch with one finger on either strip counted **one** contact, and the finger on the
slide was measured as exactly the swipe the guard exists to refuse. Measured on the
real artifact at 390 / 820 / 1440: an ordinary bottom-of-screen pinch straddling the
nav row moved slide 4 to slide 3. For a narrated deck the caption band widens the
uncounted strip to ~22% of a phone screen.

Neither verification tier could see it, for the same reason: the harness's `pinch()`
pins both contacts to the stage's vertical center, so no number of runs could ever
place a finger off the stage, and every jsdom cell dispatched both presses on the
stage. **The tests exercised the gesture that was imagined rather than the geometry
that exists** — the `@parity` lesson again, one level down.

So contacts are counted on the **window**, which makes the rule the kernel's without
a region caveat. Its cost is real, deliberate, and named here rather than discovered
later: **a second contact anywhere — a supporting thumb — declines the swipe for as
long as it rests** — measured on the real artifact at 390: slide 3 stays on slide 3
where `main` advanced. An earlier version of this note justified that by saying
Present already behaves the same way. **It does not, and the claim has been
withdrawn:** Present reads `targetTouches`, which is scoped to the event's target,
so a contact on its rail or arrows never counts. The player's rule is strictly
stricter, and this same record documents document-wide counting as a defect the
first trio found and fixed — the honest statement is that stage-scoped was measurably
too narrow here (a pinch straddling the nav row still turned the deck) and that
window-scoped is the wider of two imperfect sets, not that it matches a precedent.
Telling a resting thumb from a pinch needs *relative motion* between the contacts,
which belongs in `createZoomGesture` for both surfaces. Tracked as its own defect.

Two more things the guard needs, neither obvious:

- **The release is on the window too**, and `pointercancel` beside it — a contact can
  end anywhere, and a palm rejection or a system gesture ends one with no `pointerup`
  at all. (The original justification for this was wrong in an instructive way: it
  claimed a finger lifting over the chrome fires no `pointerup` on the stage, but
  Chromium's implicit pointer capture retargets a *touch* release back to the stage.
  The listener is still right — mouse and pen have no such capture and cancel routing
  varies by engine — but for a different reason than the one first written down.)
- **`e.isPrimary` re-syncs the count.** Enumerating the leaks you thought of does not
  make a guard safe; the list of ways a platform can eat a release is not knowable
  from here. A primary press is the UA stating it has no other live contact of that
  type, so it is authoritative over whatever this code still believes. That is the
  property the kernel gets for free by being handed the live contact list on every
  event, and the one this local restatement would otherwise lack. **A guard that
  latches is worse than the defect it fixes** — it kills swipe navigation silently,
  on a file nobody can patch.

### Verification

Real artifact, genuine CDP touch (`tools/verify-player-input.mjs`, committed),
mid-deck at all three widths — including the off-stage-contact case whose absence
shipped the hole above. The run **replays the old measurement over the real
coordinates**, so a pass reads "a gesture that would have turned the deck did not"
rather than "nothing happened", and it refuses to emit sign-off images of a slide
that overflows its frame.

Both tiers were **mutation-tested rather than assumed**: counting on the stage,
dropping the `isPrimary` re-sync, dropping the duplicate-id dedup, dropping the
`sw` reset on the last release, and an off-by-one in the finger count are each
killed by at least one cell (the off-by-one is caught by four). The guard was
RESHAPED to make that true: an earlier form cleared `sw` from the counting listener
*and* read `pinch` in both stage handlers, so no single deletion changed any behavior
— three overlapping guards, none individually killable, and a comment describing them
as redundant that a red team correctly took as an invitation to delete them. Now the
counting listener owns `pinch`, the stage records where a press began, and one read
decides; delete it and six cells fail. **One mutation still survives and is recorded
rather than papered over:** dropping the not-found check before `splice`. Its failure
direction is benign — an early disarm, a lost swipe, never a wrong turn — which is why
it is documented instead of pinned. An earlier version of the headline cell asserted only the end
state, where a symmetric pinch that misfires twice in opposite directions nets to
zero; it now asserts after **every** release.

Exported artifact bytes moved deliberately, and the frozen-artifact golden was
re-blessed with the reason.

**UNVERIFIED, and stated as such: real iOS and Android Safari.** Headless Chromium
with CDP touch is not a phone, and CDP always delivers paired start/end events — so
the latch path specifically is exercised only in jsdom. `docs/playwright.config.ts`
records that a touch navigation guard once passed every Chromium check here and still
failed on a real iPhone, which is why the `webkit-phone` project exists; no cell in it
covers the exported player.

## What this does NOT cover

**A correction, because the sentence that stood here was false and the falsehood hid a
live bug.** It read: *"the exported HTML player still has no wheel and no zoom — one
input verb short of the parity rule."* The player has had a working `wheel` handler
since `6008dff`, on `main`, before this branch existed. That sentence was the
justification for deferring everything wheel-shaped to a follow-up, and because it
said there was nothing there, nobody looked — including the harness, which drove three
widths of touch and never sent the one gesture a laptop actually makes.

What was actually true: **a trackpad pinch turned the deck on every laptop**, after
the touch guard shipped. A trackpad pinch is not touch — every engine delivers it as a
`wheel` event with `ctrlKey` set — so no amount of finger counting can see it, and the
wheel handler read it as a decisive notch and then called `preventDefault`, so the
browser's own zoom could not happen either. Verbatim #1558, on the artifact this PR
ships, at 1440 and 390: pinch out on slide 3 landed on slide 2. #1555 fixed exactly
this arm for the Studio (`preview-zoom.ts` reads `ctrlKey || metaKey`); the player
never got the line.

It is fixed here rather than filed, because "the same defect, same file, one screen
away, named in the title of the issue being closed" is on-path by any reading of HARD
RULE #18. The handler now returns on `ctrlKey`/`metaKey` **without** `preventDefault`,
so the gesture goes back to the browser and a desktop reader gets real page zoom out
of it.

What remains: **no zoom on touch**, where `touch-action: none` still suppresses the
browser's own. That is tracked as **#1578**, which carries the measurement worth
having before anyone writes code for it — `touch-action: pinch-zoom` instead of `none`
gives the player real zoom for one CSS token and no JS, with the swipe intact at fit
scale, unverified on Safari. #1540 records the player as having no wheel at all; that
is stale for the same reason this sentence was, and is corrected there.

**Verification owed, tracked as #1579.** The latch path is the one branch no harness
here can reach: CDP always delivers paired touch events, so a contact whose release
is *eaten* by a platform gesture is exercised only in jsdom. `docs/playwright.config.ts`
records that a touch navigation guard once passed every Chromium check and still
failed on a real iPhone, which is why the `webkit-phone` project exists — and no cell
in it covers the exported player.

**A pre-existing defect found while taking the sign-off images, logged as #1577
rather than fixed** (HARD RULE #18's off-path rule — it lives in the fit/CSS
subsystem, not the gesture block, and fixing it would move exported bytes for a whole
class of decks): **the exported player hardcodes 1280×720 and breaks for any deck
declaring a non-default `size:`.** `fit()`, `fitRead()`, the `.lp-frame.lp-active`
sizing and the `section` override all assume the default canvas — seven sites, none
of which reads the deck's declared size. Exporting `examples/gallery-jargon.md`
(`size: 4K`) and measuring slide 3 at 1440×900: the section is forced to 1280×720
while its content lays out at 3840×2160, so `scrollHeight` is 1503 px in a 708 px box
and the heading renders at 112 px against a default deck's 37 px — type at ~3×,
headings overlapping body text, the slide cut off mid-word. The PDF of the same slide
is correct, so this is the export player alone. **54 committed decks declare a
`size:`, and the 32 that are not the default aspect all export this way.** The
verification harness now asserts its sign-off slide fits its frame, so this can no
longer be photographed and handed over as evidence without someone noticing — which
is exactly what happened the first time.
