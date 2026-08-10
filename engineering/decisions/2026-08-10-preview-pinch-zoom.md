---
status: shipped
summary: A pinch on any Studio slide surface used to TURN THE DECK. Every surface measured `touches[0]` against `changedTouches[0]` and none counted the fingers, so two fingers spreading 100px each cleared `swipeAction`'s 45px threshold — verified on the real Studio, where a pinch on slide 3 landed on slide 4 at 1440 and 820. The trackpad half was worse: Chromium delivers a trackpad pinch as `ctrl`+wheel, no surface read `ctrlKey`, so pinching scrubbed the deck at every width including plain desktop. Root cause is #1294's again — an input rule owned per surface instead of by `lib/core/present-transport.mjs`. Fix — `createZoomGesture` + `zoomStep` join the kernel, carrying the rule that a gesture which ever held 2+ pointers is a pinch and never a swipe; `docs/src/lib/preview-zoom.ts` holds the DOM half the kernel cannot (non-passive listeners, `touch-action: none`, iOS `gesture*` suppression, middle-button quirks). Zoom is now a first-class verb on the shell preview, Present and the presenter screen, by pinch, ctrl/⌘+wheel and middle-drag, at every breakpoint. A PLAIN wheel still turns the deck — the #1294 parity contract is intact. Real iOS/Android Safari is UNVERIFIED and stated as such.
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

**Zoom resets on slide change, everywhere.** Carrying 3× onto the next slide lands
the reader in a random corner of it. Present additionally resets on close: leaving
a talk at 3× would hand the next session a cropped opening slide.

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

Zoom clamps to `[1, 4]` — 1 is fit, and pan is bounded so a zoomed slide can never
be dragged far enough to expose a gap. The badge appears only above fit: an
always-on "100%" is noise, and its absence is a truthful signal that nothing is
cropped.

## Verification

Real built Studio, real browser, genuine CDP touch and wheel events — never a
synthesized DOM event (HARD RULE #23).

- **`@parity` e2e, all three widths × both pointer states.** Four new cells on the
  shell preview (pinch zooms and does not navigate; trackpad pinch likewise;
  middle-drag zooms and middle-click resets; zoom does not leak across slides) and
  three on Present. All pass at 1440 / 820 / 390, touch and non-touch.
- **Visual evidence at 1440 / 820 / 390** — pinched and panned. The slide zooms
  crisply inside its card, the card's rounded corners still clip the transformed
  content (checked at pixel level against the fit state, in case the composited
  child leaked the radius), the page itself does not zoom, and the slide counter
  never moves.
- **Unit tiers**: 8 kernel tests for the gesture machine including the inlining
  contract, 12 for the DOM controller, plus a pinch and a `ctrl`+wheel case added
  to the presenter-window suite — where the fixture had to be fixed first, because
  it built touch events carrying only `changedTouches`, a shape no real TouchEvent
  has and one in which a pinch is unrepresentable.
- **Exported artifact bytes are unchanged.** The export player inlines four named
  kernels by `.toString()`, not the module, so `createZoomGesture` and `zoomStep`
  do not reach it — asserted by building `playerJs()` and grepping, not by reading
  the source. No export sign-off was required.

**UNVERIFIED, and stated as such: real iOS and Android Safari.** CDP touch in
headless Chromium is not a physical phone, and iOS drives its page zoom through
non-standard `gesturestart`/`gesturechange` events that Chromium never fires. Those
events are suppressed here on the reasoning that `touch-action: none` has
historically not been enough on Safari — but that reasoning has not been tested on
the surface it is about, and this sandbox cannot reach it.

## What this does NOT cover

The exported HTML player (`lib/export/player-core.mjs`) has keyboard and swipe, no
wheel, and now no zoom. It stays deliberately untouched for the reason #1294 gave:
a change there alters the bytes of an exported artifact and needs sign-off before
it ships. It is a known, recorded gap rather than an oversight.
