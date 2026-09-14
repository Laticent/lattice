# Vetrina

**A self-driving product tour that never fakes a click.**

Vetrina narrates and drives your live app with a fake cursor — pointing, typing,
gesturing, dragging — while every real change flows through *your own_setters_*.
It dispatches **no synthetic input**, so the moment the viewer touches something
for real, that first click or keystroke is an unambiguous **take-over**: the tour
steps aside and hands them the wheel, mid-sentence, with no "are you still there?"
modal to dismiss.

It is **framework-free** (the core imports nothing but the DOM), **zero-config**
(pass nothing, get the house look), and **buildless-friendly**: it ships a real ESM
build (`dist/index.mjs`), so a plain `<script type="module">` that imports it needs
no bundler. (A TS/bundler consumer imports the package by name — `@laticent/vetrina`
resolves to the ESM build for `import` and the CJS build for `require`.)

> Vetrina is the walkthrough engine behind Laticent's Studio demo. The full
> design contract, invariants, and the adversarial review that shaped it live in
> [`engineering/decisions/2026-07-05-vetrina-walkthrough-library.md`](../../../../engineering/decisions/2026-07-05-vetrina-walkthrough-library.md).

## 60-second start — on a plain page, no build

```html
<button id="save">Save</button>
<input id="title" />

<script type="module">
  import { run, scene } from './vetrina/dist/index.mjs'; // the shipped ESM build

  // Your app's real setters. Vetrina names nothing in here — it's your bag.
  const actions = {
    setTitle: (t) => { document.querySelector('#title').value = t; },
    save: () => { /* … your real save … */ },
  };

  const tour = scene()
    .say('Give your deck a title…')
    .point('#title').type('#title', 'Q4 Board Update')
    .hold(600)
    .say('…then save it.')
    .point('#save').click().act((a) => a.save()).check()   // ✓ = it worked
    .hold(800)
    .build();

  document.querySelector('#save').addEventListener('dblclick', () =>
    run({ root: document.body, actions, play: tour, type: {
      set: (t) => { document.querySelector('#title').value = t; },
      append: (t) => { document.querySelector('#title').value += t; },
    } }));
</script>
```

A runnable, non-slide version of this is the **reference tour**
(`docs/src/pages/vetrina-tour.astro`, driven by
[`../vetrina-exemplars/reference-tour.ts`](../vetrina-exemplars/reference-tour.ts)).

## The one idea — theater vs. substance

The fake cursor is **theater**: a `pointer-events: none` overlay that can never
touch your app. Every real effect happens because a step's `act` calls a setter
*you_provided_*. So a Vetrina run is honest by construction:

- **Nothing happens that your code didn't do.** A `check` gesture *shows* success;
  it doesn't mark anything done — the `act` did. A `drag`'s drop is **gated on the
  real move succeeding**: if your `act` rejects, the item snaps back and a `cross`
  is honest. The theater never shows a move that didn't happen.
- **The first real input wins, instantly.** A genuine click/keystroke off the tour
  chrome aborts the run and falls through to the control the viewer aimed at. After
  that, the actions bag is inert — driving the app post-take-over is impossible.

## Three ways to author, one engine

Everything compiles to a `Walkthrough` — `(ctx) => Promise<void>` — that `run()`
plays. Pick the layer that fits:

| Layer | What it is | Reach for it when |
|---|---|---|
| `storyboard(seed, Step[])` | a linear tour **as data** | the tour is a straight line you'd read top-to-bottom |
| `scene(seed)…​.build()` | a fluent recorder; `build()` ≡ `storyboard(seed, toData())` | you're hand-authoring and want chaining + readability |
| raw `Walkthrough` | `async (ctx) => { … }` — the total primitive | you need branches, loops, or `awaitUser` (below) |

They compose: `await someSegment(ctx)` inside a raw walkthrough runs a built
scene as one beat. (Never nest `run()` — it's single-flight and throws.)

A `Step` reads in a fixed order — `say → (point+click | drag) → act → type →
gesture → settle`:

```ts
scene()
  .say('Reorder the backlog.')
  .drag('#task-3', '#task-1').act((a) => a.reorder(3, 1))   // drop gated on act
  .hold(400)
```

## Instant beats & advance control

Not every beat should be *performed*. Setup, closing an overlay, or jumping ahead
are plumbing — mark them **`instant`** and the substance applies with **no cursor
movement, no typing animation, no gesture, no settle**. (An `instant` beat that
also carries a `point`/`gesture` warns at build — those verbs have no theater to
hang on.)
A walkthrough that is *mostly* instant isn't a walkthrough — it's a silent state
machine; instant is for the plumbing *between* the beats you actually teach.

```ts
scene()
  .act((a) => a.closeOverlay()).instant()          // fires now, silently — no theater
  .say('Now the real beat…').point('#next').click().act((a) => a.next())
```

**Controlling when the next beat starts** — three gates, by what your app exposes:

- **Fixed pause** — `settle` (or `.hold(ms)`): wait a set duration. Works with
  `instant` too: `{ act, instant: true, settle: 500 }`.
- **A promise (async readiness)** — an **async `act`**: the step already `await`s
  it, so returning a promise that resolves when you're ready holds the beat. Reach
  for this first when the app can hand you a "done" promise.
- **A pollable condition (non-async readiness)** — `until(() => cond)`: when the
  app only exposes a *synchronous* flag (a DOM attribute, a state bool) with no
  promise, hold (abort-safe polling) until it's true, *then* continue. It keeps
  that wait in the declarative layer, so you never drop to the raw API for it. It
  is **throw-safe** — a predicate that throws while its element is still null
  counts as "not ready yet" — and on a ~15s timeout it **advances with a
  `console.warn`** (naming the last predicate error, if any): never silent, but
  never fatal either, so a backgrounded tab or a slow app can't self-destruct the
  run. For a hard "fail if not ready," gate inside an async `act` and throw there.

  ```ts
  scene().act((a) => a.loadDeck()).instant().until(() => deckIsRendered())
  ```

## Teaching beats — read the caption before the action

A caption is easy to treat as a subtitle that rides an action beat — but then it
flashes by before a newcomer can read it, and the tour feels like a feature
recital, not a lesson. Mark a beat **`read: true`** and it becomes a *teaching
beat*: after the caption shows, the cursor **dips to the narration dock and the
words glow-pulse** (the eye lands on what's being said — the teacher underlining
it), and the beat **dwells long enough to read** — timed to the caption's length
via `readMs()` (≈ `300 + 200·words`, clamped 1.2–4.5 s) — **before** the action
runs. So the viewer understands the words first, *then* watches the thing happen.

```ts
scene().say('This is all plain Markdown.').read()   // show → point at it → dwell to read → …
  .point('#editor').type('# Title')                 // …then act, now that it's understood
```

Pair it with a short `settle` (the **land** — a brief digest pause on the
result). The emphasis is motion-safe (the glow is opacity, not a transform, so it
plays under `legible`; the cursor dip teleports when vestibular motion is
suppressed) — see *Accessibility & reduced motion*.

## Gestures — the cursor's body language

A curated alphabet, each member carrying a distinct *meaning* the eye reads (the
set is gated by a build check; a new one must earn a new meaning). It comes in
two families.

**The tour's own state** — how the run is going:

| Gesture | Meaning |
|---|---|
| `wave` | greeting / hello (the opening flourish) |
| `circle` | "look here / this just rendered" — a glow on the element's bounding box |
| `check` | success / done / correct |
| `cross` | wrong / rejected / deleted |
| `shake` | "no — careful / try again" |

**Deictic** — naming a piece of *your content*, the way a presenter's hand does.
Pick by the **shape** of the thing you are naming, so the variety is motivated
rather than a die roll:

| target | Gesture | Meaning |
|---|---|---|
| one wide, short line of text | `underline` | "this line" — a stroke swept along the baseline |
| compact, roughly square | `circle` | "look here" — the ring, doing double duty |
| a phrase inside a longer block | `wash` | "these words" — a highlighter band per line |
| a whole card / multi-line block | `bracket` | "this whole block" — a soft outline just outside it |
| something small and discrete | `tap` | "this one" — a ripple, where a ring would be a dot |

What separates the second family is the property they all share:

> **The cursor's position is a consequence of the stroke.**

Each one glides along its own ink and stops where the ink stops, and every one of
those endings is outside the target by `clearance`. A pointer that picks its
position independently has to be *checked* against what it might be covering —
a search. A pointer that rides the stroke cannot cover the thing the stroke is
drawn around, so there is nothing to check.

```ts
await stage.gesture('underline', target, signal, { clearance: 19, strength: 'notable' });
```

| option | what it does |
|---|---|
| `strength` | `'quiet'` (default) or `'notable'` — heavier ink, held longer. Never a *different* gesture: the shape says which one, emphasis says how loudly. |
| `clearance` | px the **cursor** (and the ring/bracket ink) keeps off the target's box. Default `0`, so every call written before this is byte-identical. |
| `rest` | where the cursor ends up, overriding the gesture's own ending. The four deictic strokes **end there directly** — a host passes `rest` because the default ending is occupied, so traveling there first and correcting afterwards would hop *through* the position you rejected. `circle` applies it as a withdrawal after the orbit, which has no ending to redirect. |

`gestureRest(kind, box, rects, clearance)` is exported and pure: it reports where
a gesture *will* leave the cursor. Ask it when your layout knows something the
stage cannot — "past the block's right edge" is the page margin on one screen and
the second column on another — and pass a different `rest` when the answer would
land somewhere you know is occupied.

**Two rectangles, two jobs.** `getBoundingClientRect()` is what the cursor must
*clear*; `getClientRects()` is what the ink *follows*. They are usually the same
and are allowed not to be — naming a phrase inside a paragraph wants ink on the
phrase's own lines and a cursor clear of the whole paragraph.

## The hand — why the cursor does not travel in a straight line

The cursor stands in for a presenter's hand, and a hand does none of the three
things a plain tween does. `theme.hand` (0..2, default `1`) scales all three:

- **an arc**, because a limb is hinged and a straight path is the one trajectory
  an arm cannot take without correcting for it (Thomas & Johnston's "arcs");
- **an overshoot and a correction**, because aimed movement is ballistic then
  closed-loop, not one smooth deceleration (Woodworth; Meyer et al.);
- **a tremor** — a band-limited wobble at hand frequencies, because a held hand
  is never still and its *absence* is what reads as CGI.

It is a sum of sinusoids with a seeded per-movement phase, **not** a random
offset per frame: white noise is a rattle, and it could never be pinned by a test.
Two properties the library depends on and `handOffset` guarantees — **the
endpoints are exact** (a glide lands on the point it was given, so every ink and
every `gestureRest` answer still holds) and **the logical position never wobbles**
(the displacement is applied when painting, never to the cursor's coordinates).

`hand: 0` reproduces the previous straight glide sample for sample, and the
`legible` / `still` motion tiers force it to 0 without the host asking — a wobble
*is* vestibular motion.

## Targets — and why a cue keeps asking where its target is

A `Target` is a **selector** (resolved inside the `root` you passed), an **element**, a
**thunk** returning one, or — since the same widening — anything that can answer
`getBoundingClientRect()`:

```ts
export interface RectSource {
  getBoundingClientRect(): DOMRect;          // viewport coordinates, live
  getClientRects?(): DOMRect[] | DOMRectList; // optional; per LINE, for the deictic cues
  scrollIntoView?(arg?): void;               // optional; used before every aim (see below)
}
```

Both `Element` and `Range` satisfy all of it already. `getClientRects` exists
because a bounding box is a *lying rectangle* for anything that wraps: a phrase
running across three lines has three rectangles, and its bounding box names words
the phrase does not contain. Answer it and `wash` follows the words; leave it out
and every cue falls back to the bounding box.

Every `HTMLElement` already satisfies that, so nothing you have written changes. What it
adds is the escape hatch for a target the stage **cannot reach with a selector** — a region
inside an iframe, a canvas hit box, a row in a virtualized list. You hand Vetrina a small
object that knows where that thing currently is; Vetrina keeps knowing nothing about your
app's structure. (`stage.resolve()` still returns elements only — a rect source has no node
to hand back, so it resolves `null` there while remaining a perfectly good cue target.)

**Live, not snapshotted.** A cue is anchored to a target, not to a copy of where it was.
The spotlight ring re-reads its target every frame for as long as it is on screen, and the
cursor's glide re-aims every frame while it is in flight. That is not a nicety: your `act`
setters commit asynchronously, so the rect available the instant `act` returns can be a
whole pane out of date by the time the cue paints — and a cue drawn from that never
corrects itself. Vetrina got this wrong once, in production, and a walkthrough that points
confidently at the wrong thing is worse than no walkthrough.

The cost of that guarantee is exactly one frame: a reflow lands after the frame that caused
it, so a tracking cue is ~16ms behind during a resize. Momentary bursts (the click spark,
the anticipation ping) stay snapshot-positioned — they are gone before any of this matters.

**Off-screen targets are scrolled into view, instantly.** Before every aim — a `point()`, a
drag's pick-up, its drop and its snap-back, and a gesture that uses its target — Vetrina calls
`scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })` on it. Two kinds of
target are left alone: `wave` and `shake` play at the cursor and ignore the one they are handed, and
a cue you silenced through `theme.cues` draws nothing, so scrolling for it would move the page with
no visible cause. `nearest` means a target already in view moves
nothing, so a tour on a page that fits never scrolls; a target below the fold is brought up
rather than pointed at off-screen — and on a phone that is almost every target.

It is **instant on purpose**, not for lack of polish. A smooth scroll makes the landing a race
between two animations: the glide's duration is computed once, from the distance at kickoff, and
a browser's smooth scroll (~300–500ms) can outlive the 300–820ms travel envelope — so the cursor
lands and the target keeps moving. Instant settles the geometry before the number is taken. It is
also the motion-safe choice, so the `legible` / `still` tiers need no exception.

Three consequences worth knowing. Your own `scroll-behavior: smooth` does **not** apply to these
scrolls (that is the point). Under `bounds: 'host'`, Vetrina re-seats the dock after **any** scroll
that moves the host's visible box — its own, a resize, or one the viewer performs — the whole bar
for an edge style, the Exit chip for `caption: 'cursor'` (whose balloon is placed per beat and so
picks up the new geometry on its next show). The viewer's half is rAF-coalesced and compares the
clamped box before it writes anything, so a scroll of a host that already spans the window — the
common case — costs two rect reads and no layout. Note that on a touch screen a finger scroll begins
with a `pointerdown`, which the take-over guard reads as the viewer taking over, so it ends the run
rather than re-seating anything. And a
target clipped by an `overflow: hidden` ancestor *will* be scrolled into view, because a
programmatic scroll works on a box the viewer cannot scroll; that box then stays scrolled with no
affordance to put it back.

### The caption is an occluder, and the reveal clears it

**Scrolling a target into view is not the same as making it visible, and `block: 'nearest'` is
where the two come apart.** `nearest` scrolls the *minimum*, so a target that was below the fold
lands its bottom edge flush with the window's — and that is the edge Vetrina paints its own
caption against. With the default `bar` the caption is a dock roughly 120px up from it; with
`caption: 'scrim'`, the phone choice, it is a 230px gradient reaching 90% opacity exactly there.
So the cue scrolled to its target and then talked through it.

Measured on the Studio's phone tour, with the caption up and the editor typing: the tail of the
document sat **115px inside the gradient on Chromium at 390×844** and **225px inside it on real
WebKit at an iPhone 15 Pro box**. That is the second half of the iPhone report the reveal work
above did not close.

Every reveal now asks for that much room through **`scroll-margin`** — the platform's own "leave
space for the fixed thing over there". Using it rather than correcting the scroll afterwards is
the decision: `scroll-margin` lets the *browser* keep choosing which ancestor scrolls, which is
the guess the rest of this file exists to avoid making. The property is written inline on the
target and restored in a `finally`, so a tour that was only visiting a page leaves nothing behind
on it. A `RectSource` that is not an element simply does not get one.

**It is two passes.** The first is the `nearest` scroll this library has always done — the one that
makes a reveal safe before every aim, because an in-view target moves nothing. Only then does the
stage look at where the target landed, and only if it landed inside the band does it borrow the
margin and align again with `block: 'end'`. An in-view target still costs exactly one no-op scroll.

Two things about that second pass are worth knowing, because both were measured rather than assumed:

- **It uses `end`, not `nearest`, because the engines disagree.** With the target already flush
  against the viewport's edge, Chromium's `nearest` ignores the scroll-margin and scrolls nothing;
  WebKit honors it. `end` works on both.
- **A target too tall for the remaining room is left alone.** `nearest` acts on the scroll-*margin*
  box, so once that box is taller than the viewport a target that was fully visible has one edge in
  and one out — and the browser aligns the far edge, pushing the near one off screen. A 500px target
  with a 230px band in a 659px window ends 71px above the top. Anything that big cannot hide under a
  caption anyway, so it keeps the position plain `nearest` gave it.

**It clears what it can.** A target sitting at the end of its scroll range has nowhere to be
scrolled to, so it stays partly covered — measured at 85 of 123px recovered on a page with no
runway below the target. If your tour points at the last thing on the page, give the page some
room under it.

**Your app can read the same number.** While a stage is mounted it publishes two custom properties
inline on the document element:

```
--vt-chrome-top     px of the viewport's TOP edge the caption is covering
--vt-chrome-bottom  px of the viewport's BOTTOM edge the caption is covering
```

Both are measured **from the window's edges**, so a host recovers the band's top as
`innerHeight - inset` whatever `bounds` is set to. They are removed on `destroy()` — removed, not
zeroed, so a stale value can never make a later reveal reserve room for a caption that has gone —
and only when the value is still the one this stage published, so a second stage tearing down
cannot take a running tour's number with it.

They are **measured from the rendered box**, not derived from the style constants, so a `bar` that
wraps to three lines reports its real height; and `caption: 'cursor'` publishes `0`, because its
balloon already places itself out of the way of whatever is being pointed at.

Two honest limits on what the number means. It is a conservative **band**, not a paint mask: for an
edge dock it runs from the window's edge up to the dock's box, so it includes the ~78px transparent
gutter the dock floats above (123px for a ~45px `bar`). And it is purely **vertical** — a centered
`progress` pill 380px wide is reported as a full-width band. Both over-reserve rather than
under-reserve, which is the right direction to be wrong in.

Read them from the inline style (`documentElement.style.getPropertyValue(...)`), not
`getComputedStyle` — a host reading this per keystroke should not force a style recalculation. The
Studio does exactly that so its editor follows what a tour types without revealing the new line
under the caption (`docs/src/components/studio/tour-chrome.ts`).

**Opting a target out is one line, and it is the same widening `RectSource` already gives you:**
hand Vetrina something that answers `getBoundingClientRect()` and nothing else, and the reveal is
a no-op for it. That is how the Studio's Present guide aims at regions inside the preview iframe
without the tour ever scrolling the slide
(`engineering/decisions/2026-09-13-vetrina-reveals-its-target.md`).

**How to say "gone".** A `RectSource` has to return a `DOMRect`, so it cannot answer `null`.
Answer with a **zero-area rect** instead — that is the word for "this is nowhere now", and
Vetrina reads it as no position at all: the cursor settles where it is rather than gliding to
the viewport corner. Two other answers are treated the same way, because none of them names a
place: a rect with a `NaN` in it (one used to poison the layer for the rest of the run), and a
provider that throws. Anything else is taken literally.

### When you don't always have a target — `setCursorVisible`

```ts
const target = resolveWhateverIsCurrent();     // may be null
stage.setCursorVisible(!!target);
if (target) await stage.point(target);
```

If your host points at something it does not always have, **hide the cursor rather than leaving
it where it was**. A stationary pointer is not neutral — it reads as a claim about whatever it
happens to be sitting on, so a cue you cannot resolve turns into a confident answer that is
wrong. `setCursorVisible(false)` cross-fades the pointer out and is reversible within the same
run (it is not `destroy()`); the **dock is never affected**, so Exit stays reachable either way.

If you are also hiding the viewer's real pointer while your cursor stands in for it, tie the two
together: hide the real one only while yours is actually aiming at something. Otherwise the
viewer ends up with no usable pointer at all — yours pointing nowhere useful, theirs invisible.

### A bare pointer layer — `caption: 'none'`

Every caption style keeps **Exit** reachable, because stranding a viewer inside a running tour
is the one thing this library will not do. `caption: 'none'` is the deliberate exception, and it
is not for tours:

```ts
createStage({ root, onExit, theme: resolveTheme({ caption: 'none' }) });
```

No dock, no narration, no Exit — just the cursor and its cues. Use it only when the HOST owns
the chrome and the escape, and nothing awaits user input: a stage driven as a pure pointer layer
over an app that already has its own controls. Lattice's Guide rung is the case it exists for —
a cursor pointing at the sentence a narrator is currently speaking, inside a presentation overlay
that already has Pause and Exit. A second Exit button and a "click anywhere to take over" hint
there would be chrome competing with chrome.

If your run has beats, narration, or an `awaitUser`, you want one of the four docked styles.

## Cooperative hand-off — `awaitUser`

Sometimes the tour should stop and let the viewer *do* the thing themselves. That's
the one cooperative primitive:

```ts
async (ctx) => {
  ctx.stage.say('Your turn — click Publish.');
  await ctx.stage.point('#publish');
  await ctx.awaitUser({
    match: (e) => e.target instanceof Element && e.target.closest('#publish') != null,
    timeout: 8000,           // a stalled viewer can't hang the tour
    onTimeout: 'abort',
  });
  ctx.stage.say('Nicely done.');
}
```

The take-over guard stays live throughout: a click that **matches** resumes the
tour; **any other** real input is still a take-over. There is no way to trap the
viewer.

## Theming — CSS-first, JS convenience

Zero config is the house look. To brand it, style the `--vt-*` token contract in
**your own CSS** — and your existing light/dark cascade re-themes the tour for
free, with no JavaScript and no mode-switch wiring:

```css
:root                    { --vt-accent: #2b6ef2; }
:root[data-theme="dark"] { --vt-accent: #4b82ff; }
```

The token set covers **every color the stage draws** (`--vt-accent`,
`--vt-cursor-*`, the narration dock's `--vt-caption-bg` / `--vt-caption-ink` /
`--vt-caption-hint`, the `scrim` style's `--vt-caption-scrim` darkening — which
pairs with `--vt-caption-ink`, so darken one and lighten the other — the cue
halos, the Exit control). Prefer JS? Pass a
`theme: { accent }` object — a convenience that writes the tokens for you. Either
way accent colors are **validated**: a pale/same-hue value is lifted to a
legibility floor (the cursor can't go invisible), and any `url()` / `image()` /
control-char value is **rejected** (token values are host-trusted, never
wire/AI content).

The **narration dock** carries the narration (a polite live region) and an
always-reachable **Exit** icon. It sits at the bottom by default; move it with
`placement: 'top' | 'bottom'`. Its **style** is a curated choice — `caption`:

| `caption` | Look | Best for |
|---|---|---|
| `'bar'` *(default)* | full-width bar, leading pulse dot, Exit as a trailing ✕ | legible over **any** ground — the safe default for raw/generic hosts |
| `'split'` | a clean text-only caption + a separate ✕ chip in the corner | typographic calm |
| `'scrim'` | no box — a film-subtitle over a soft bottom gradient | busy/dark content (the Studio demo opts into it) |
| `'progress'` | the bar, with a beat-progress ring in place of the dot | long/kiosk walkthroughs that want a sense of pacing |
| `'cursor'` | a speech balloon next to the cursor that steps aside while it performs, and takes itself down after. Becomes the `'split'` dock when the narrator is voiced | a tour where the round trip between an edge caption and the thing it is about is the cost you are paying |

Every style keeps Exit inside `.vetrina-caption` (so the take-over guard reads it
as chrome) and keeps one narration live region. The boxed styles' corner **shape**
is the `--vt-caption-radius` token (CSS-only, default `16px`; raise to `999px` for
a stadium pill). Backgrounds are deliberately translucent (with a backdrop blur) so
the deck shows through; retint via `--vt-caption-bg`. The `'progress'` ring is fed
by the storyboard interpreter (`stage.progress(beat, total)`); a raw `Walkthrough`
that never reports progress just leaves the ring empty.

Pacing is a curated preset — `speed: 'slow' | 'moderate' | 'fast'` — not a raw
number the eye can't use. The pointer is a shape from a small legible set
(`arrow` / `ring` / `dot`). Cues can be silenced (`cues: { intro: false }`) but
never replaced by DOM-touching callbacks.

## The caption next to the cursor — `caption: 'cursor'`

An edge dock is furniture: it sits at the bottom of the screen and the viewer's eye makes a
round trip to it once per beat. `caption: 'cursor'` puts the words where the hand is.

```ts
run({ root, actions, play, theme: { caption: 'cursor', bounds: 'host' } });
```

Three properties do the work, and each one is a rejection of the obvious version:

- **Anchored, not following.** The balloon is placed once, where the cursor is resting, and does
  not move again while it is readable. A caption that TRACKS the pointer cannot be read at all —
  reading is a sequence of fixations on stationary text, and text that drifts during a fixation
  has to be re-found. Moving it means hiding it and showing it somewhere else, never sliding it.
- **It is transient — it appears when there is something to say, and not otherwise.** The rhythm
  is: the cursor moves (the movement is what brings the eye), it arrives, the balloon appears
  beside it, it holds for as long as an average reader needs, and then it takes itself down. Then
  the action happens. A beat that points somewhere says its line **on arrival**; a beat whose only
  DOING is a deictic stroke says it once the stroke is drawn; everything else says it immediately.
  "Only doing" is narrower than "only movement": a beat that also has an `act`, a `type` or an
  `until` speaks first, because those are the things the line is there to explain. Saying it last
  would put the words after the typing, or leave a 15-second advance gate with nothing on screen.
- **It steps aside for anything else that moves.** If the cursor performs while a line is still up
  — which, since the caption dismisses itself before the action, means a DRAG, whose lift-to-drop
  window spans the line — the balloon fades out and comes back **re-anchored to where the cursor
  now is**. The stage brackets its own verbs, so you write nothing; the one seam is
  `stage.busy(on)`, which the runner already calls around the typing reveal (typing lands through
  YOUR setters, so the stage cannot see it).
- **The reading time is not free.** Every beat spends its caption budget, where an edge dock spends
  none (the words just sit there). Measured on the prototype's six-beat tour: 13.0s with an edge
  dock against **30.1s** with the cursor caption and no narrator. **Caption length is the lever** —
  the model prices a line at ~150 wpm and clamps at 6s, so anything reaching that clamp is the
  model telling you the beat should have been two.
  Counter-intuitively a narrator makes it *shorter* (27.5s timed, 22.2s voiced): a word-cued beat
  spends only what is left of the reading window after the action, and a voiced run is an edge dock,
  which spends none.
  **The budget is `dwellMs`, not `captionMs`** — always the grounded ~150 wpm, whatever `pacing` the
  run selected. The two are the same number under `'grounded'` and differ by 43% under the default
  `'legacy'`, whose 300 wpm is the rate `pacing.ts` documents as wrong by a factor. An edge dock
  survives it because the words stay up; a caption that erases itself does not.
- **Exit does not go with it.** The balloon hides; the corner chip does not. A caption that can
  hide would otherwise take the only escape with it, and stranding a viewer inside a running tour
  is the one thing this library will not do. Hiding is by opacity, never `display` — the narration
  is a live region, and dropping it out of the layout tree drops it out of the a11y tree.

- **The caption never outlives its beat.** Every line that goes up comes down, on every exit from
  the beat — including a throw, an abort, and an `instant` beat, which has no dwell to spend and so
  keeps its line only as long as its substance takes. A `read` beat and a word-cued (`at`) beat are
  the two that stay up *through* the action; they still come down after it, once the reading window
  is spent. "It appears when there is something to say, and not otherwise" is the whole style.
- **Avoidance is a preference, not a guarantee.** The balloon stays clear of the thing being
  pointed at by flipping to another quadrant around the cursor — which escapes a target the cursor
  is OUTSIDE of, and cannot escape one the cursor is sitting inside. Pointing at a whole panel puts
  the caption on the panel, and that is the right answer: the alternative is a caption 400px from
  the pointer, which is the one thing this style exists to stop.

**A VOICED narrator docks the caption at the edge instead.** Ask for `caption: 'cursor'` and wire a
narrator whose `voiced` is true, and `run()` gives you the `'split'` dock — silently, because it is
the same decision you would make yourself once the reasons are on the table:

- The balloon exists to save a **reading trip** between the pointer and the words. A voice removes
  that trip; nobody reads a caption they are being told.
- What is left is the caption's other job — the **subtitle** for a viewer who cannot hear it — and
  subtitle practice (BBC, ITU-R BT.1359) puts a subtitle at a **fixed screen position**, because a
  reader has to know where to look back to. Moving one around the frame is a known a11y failure.
- It is also the only honest fix for the anchor. A voiced caption never hides, and the balloon
  re-anchors on the hidden→shown edge — so a voiced one was placed once, at the top of the beat,
  and then sat there while the cursor crossed the app. Measured at **493px** from the pointer it
  was speaking for.

A stage you build yourself is not second-guessed: `stage.setVoiced(true)` still means "keep the
caption up during the action" on a cursor-anchored stage you mounted directly.

### Confining the chrome to your app — `bounds`

`bounds: 'host'` measures every caption against the `root` element the walkthrough drives instead
of against the window. Reach for it when the tour runs in a PANE of a larger page: a caption bar
spanning the whole window, for a demo confined to one panel, is chrome about the wrong thing.

It is the **visible part** of `root`, intersected with the window. A host taller than the
window is the ordinary case — a panel in a scrolling page — and seating the chrome in the raw
host's corner put Exit 638px above the top of the window, where it cannot be pressed and cannot be
reached by keyboard either (the first `Tab` is a keydown the take-over guard reads as the viewer
taking the wheel). A host scrolled entirely out of view falls back to the window.

It is a **clamping box, not a containing block.** The overlay layer stays `position: fixed` and
click-through; only the chrome's geometry is measured against `root`. Nothing about your CSS has
to change, and the tour does not inherit your stacking, overflow or transform context — which is
where an overlay goes to get clipped.

## Narration — a port, not an engine

Vetrina does not know how to time text and must not learn: Cadenza already does, and the two are
separately spin-off-able (an import gate enforces it). So narration arrives the way audio arrives
in Suono — as something you wire in.

```ts
import { cadenzaNarrator } from '…/lib/vetrina-narration/cadenza-narrator';

run({ root, actions, play, narrate: cadenzaNarrator({ pace: 'moderate' }) });
```

Three things a narrator buys, and **only the first needs audio**:

1. a voice;
2. a REAL duration for each line, replacing the reading-time estimate — a timed track is text
   arithmetic, so this works with no sound at all;
3. a word CLOCK, which is what makes the cue below possible. Also silent.

**To actually speak**, use `voicedNarrator` and hand it the bytes — it owns no key, no model and
no network, exactly as Suono does not:

```ts
voicedNarrator({ synthesize: (text, { signal }) => myTts(text, signal) });
```

It plays through Suono and re-anchors the word clock to the clip's **measured** span — Cadenza's
hybrid align, where the estimate supplies the internal rhythm and the measurement supplies the
total. Every cue is scaled into that span, not just the first: anchoring only cue 0 stretches
sentence one across the whole clip and pushes the rest past the end of the audio. It reports
`voiced: true`, which is what docks the caption at the edge.

**Build it ONCE and reuse it — then `dispose()` it.** `voicedNarrator` opens an `AudioContext`
eagerly (the unlock has to happen inside the user gesture that started the tour), and the run does
not own it: a narrator is passed *in*, so `run()` never closes it, and one narrator across many
runs is what keeps a single `AudioContext` for the page. Build one per Run click and nothing
closes them — measured at 8 live contexts after 8 runs. Chromium caps them per document and the
constructor throws at the cap, from inside a handler that has already disabled its own button.

```ts
const narrator = voicedNarrator({ synthesize });      // once, in the gesture that starts the tour
addEventListener('pagehide', () => narrator.dispose?.());
```

`dispose()` clears the track cache and closes the `AudioContext` **only if the narrator created
it** — pass your own `audio` stage and it is left alone, because the rest of your page is using it.

Two failures are handled rather than propagated: a voice that throws, and a voice that never
answers (`synthesizeTimeoutMs`, 20s). Either way the beat plays on silently and the caption still
gets its full reading budget — a hung TTS must not hang the tour.

Implement `Narrator` yourself for anything else — `speak(text, { signal, onWord })` returning a
handle whose `done` resolves at the end of the line, plus an optional `plan(text)` that reports
the line's word timeline ahead of speaking it.

### The action lands on the word — `at`

```ts
scene()
  .say('Now click Publish to send it to the board.')
  .at('Publish')
  .point('#publish').click().act((a) => a.publish())
```

The cursor arrives on `#publish` as the narration reaches "Publish". **Whichever side is
behind waits**: if the hand needs longer than the word (the usual case — cue words come early and
a cursor crossing an app needs the best part of a second), the LINE starts late; if the word is
further off than the trip, the ACTION starts late. Exactly one of the two ever waits.

Needs a narrator that can `plan`. Without one, or when the line does not contain the word, the
beat plays in its normal order — nothing breaks, the moment is just not staged. `at` and `read`
are opposite rhythms; setting both warns and `at` wins.

**With a VOICE, the cue is aligned to the estimate, not to the clip.** `plan()` has to answer
before the beat starts — that is what buys the cursor its head start — but a voiced line is
re-anchored to the clip's *measured* span once the audio arrives, and the cue does not move with
it. So the action lands early or late by however far the real clip diverges from the estimate:
the prototype stretches its placeholder voice to 1.2x deliberately, and a mid-line cue there
fires ~20% of `startMs` early, on the order of 180ms. Silent (`cadenzaNarrator`), the estimate
*is* the clock and the alignment is exact — measured at 1ms.

The same caveat applies to `onWord`: the `startMs`/`endMs` on a `NarratedWord` are estimate
times. The highlight itself runs on the re-anchored clock and stays in sync; the numbers handed
to a host's callback are the pre-align ones.

## Pacing — where the durations come from

Every duration the theater spends lives in `pacing.ts`, and each constant carries its source:

| timing | model |
|---|---|
| caption dwell | `300 + (60000/wpm)·words`, 120/150/175 wpm by preset, clamped 1.0–6.0s. Below Brysbaert's ~238 wpm for *undistracted* silent reading, inside the 160–180 wpm subtitle band — a tour caption is read under split attention. |
| cursor travel | Fitts's law, `180 + 110·log2(D/W + 1)`, clamped 300–820ms. Target SIZE matters: landing on a 16px icon is not the same trip as landing on a 300px card. |
| register beat | 350ms, and **zero when the cursor is already on target** — a saccade takes ~200ms to launch and the eye leads the hand by another 100–200ms, but only when it has somewhere to go. |
| settle | 650ms — a saccade to the changed region plus time to encode it. |
| typing | 55ms/char, above the ~40ms at which successive visual events fuse (below it the reveal reads as a paste), still ~3x a fast human. |

A narrator's measurement supersedes the caption estimate wherever one exists — with a voice, that
is the clip's measured duration. A grounded default is still a guess.

`speed` remains the only public knob, and it is applied ONCE — `captionMs` is indexed by it, the
rest are multiplied by it at their call sites.

**`pacing` defaults to `'legacy'`** — the five literals this library shipped before the model
existed. The grounded numbers are the better ones, but switching costs **+13%** run length
(measured on the prototype tour with everything else held constant), and a library option should
not re-time an existing walkthrough because you upgraded. Opt in with
`theme: { pacing: 'grounded' }`, and compare the two on one surface.

## Driving from React

The core is framework-free; the one thin React binding is a peer-dep adapter in `./react`.
`useWalkthrough` owns the component lifecycle — single-flight start, stop, an `active` flag,
and teardown on unmount — while you supply the run config at `start()` time (so it closes
over the freshest state):

```tsx
import { useWalkthrough } from '…/lib/vetrina/react';

function Panel() {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const demo = useWalkthrough(rootRef, () => ({
    actions, play: tour, type,
    onStop: () => restoreMyChrome(),   // fires after teardown; the hook resets `active`
  }));
  return (
    <div ref={rootRef}>
      <button onClick={demo.start} disabled={demo.active}>Watch the demo</button>
      {/* … */}
    </div>
  );
}
```

The Studio's `use-studio-demo.ts` is the reference consumer. Import `./react` directly — it
is **not** re-exported through `index.ts`, which stays zero-dependency.

## Accessibility & reduced motion

The overlay's decoration is `aria-hidden`, but the **Exit** control reaches the
accessibility tree (it's the only escape) and the narration caption is a polite
live region.

Motion is a **three-tier policy** (`theme.motion`, default `'system'`), because
`prefers-reduced-motion` targets *vestibular* motion — sweeps, parallax, spin,
zoom (WCAG 2.3.3 / Apple HIG) — **not** the content cadence a viewer reads by:

| tier | vestibular motion | content cadence |
|---|---|---|
| `full` | plays (glides, rings, orbit, hand-wave, drag sweeps, `theme.hand`) | plays |
| `legible` | **suppressed** (glides teleport, rings/orbit/sweeps skip, wave → in-place pulse) | **kept** (typing reveal, caption cross-fades, full reading settles) |
| `still` | suppressed | **collapsed** (typing snaps in, settles shorten) |

`'system'` reads the OS preference and resolves a reduced-motion device to
**`legible`, never `still`** — so a reduced-motion viewer loses the disorienting
sweeps but still *watches the deck get typed and rendered*, at full reading pace,
opened by a motion-safe in-place greeting. `still` is the maximal-suppression
escape hatch a host opts into explicitly; `full` ignores the OS preference.

The stage exposes two derived flags: `stage.reduced` (vestibular suppressed —
`legible` or `still`) and `stage.still` (content collapsed — `still` only). The
runner and storyboard gate the typing reveal and default settle on `still`, so
`legible` keeps them.

## Where things live

```
vetrina/
  stage.ts       the theater: cursor, cues, chrome, gestures, drag, tokens
  runner.ts      run() + take-over guard + await-racing + teardown
  storyboard.ts  the Step[] data model → Walkthrough
  scene.ts       the fluent recorder → Step[]
  theme.ts       token defaults + color validation
  pacing.ts      every duration, each with the finding it comes from
  narrate.ts     the narration PORT (types + one no-op) — no engine, no DOM
  recipes.ts     waitFor / loop / retry
  index.ts       the public surface (framework-free — zero deps)
  react.ts       the React adapter — useWalkthrough (peer dep react; not via index)
```

The core is mechanically kept self-contained (an import-boundary gate fails the
build if anything here reaches outside the folder). Worked examples — a buildless
`awaitUser` tour and a generic-host board covering gestures, drag success/rejection,
CSS-first theming, root-scoping, and interleave + take-over — live in
[`../vetrina-exemplars/`](../vetrina-exemplars/) with their e2e proofs in
`docs/e2e/vetrina-*.spec.ts`.
