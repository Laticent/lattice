# Vetrina

**A self-driving product tour that never fakes a click.**

Vetrina narrates and drives your live app with a fake cursor — pointing, typing,
gesturing, dragging — while every real change flows through *your own_setters_*.
It dispatches **no synthetic input**, so the moment the viewer touches something
for real, that first click or keystroke is an unambiguous **take-over**: the tour
steps aside and hands them the wheel, mid-sentence, with no "are you still there?"
modal to dismiss.

It is **framework-free** (the core imports nothing but the DOM), **zero-config**
(pass nothing, get the house look), and **buildless-friendly** (a plain `<script
type="module">` is enough — no bundler required).

> Vetrina is the walkthrough engine behind SlideWright's Studio demo. The full
> design contract, invariants, and the adversarial review that shaped it live in
> [`engineering/decisions/2026-07-05-vetrina-walkthrough-library.md`](../../../../engineering/decisions/2026-07-05-vetrina-walkthrough-library.md).

## 60-second start — on a plain page, no build

```html
<button id="save">Save</button>
<input id="title" />

<script type="module">
  import { run, scene } from './vetrina/index.js';

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

## Gestures — the cursor's body language

A curated **five-gesture alphabet**, each carrying a distinct *meaning* the eye
reads (the set is frozen by a build gate; a new one must earn a new meaning):

| Gesture | Meaning |
|---|---|
| `wave` | greeting / hello (the opening flourish) |
| `circle` | "look here / this just rendered" — a glow on the element's bounding box |
| `check` | success / done / correct |
| `cross` | wrong / rejected / deleted |
| `shake` | "no — careful / try again" |

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
`--vt-cursor-*`, `--vt-caption-*`, the cue halos, the chrome, the Exit control).
Prefer JS? Pass a `theme: { accent }` object — a convenience that writes the
tokens for you. Either way accent colors are **validated**: a pale/same-hue value
is lifted to a legibility floor (the cursor can't go invisible), and any
`url()` / `image()` / control-char value is **rejected** (token values are
host-trusted, never wire/AI content).

Pacing is a curated preset — `speed: 'slow' | 'moderate' | 'fast'` — not a raw
number the eye can't use. The pointer is a shape from a small legible set
(`arrow` / `ring` / `dot`). Cues can be silenced (`cues: { intro: false }`) but
never replaced by DOM-touching callbacks.

## Accessibility & reduced motion

The overlay's decoration is `aria-hidden`, but the **Exit** control reaches the
accessibility tree (it's the only escape) and the narration caption is a polite
live region. Under `prefers-reduced-motion`, gestures collapse to instant cues and
pacing shortens — the tour still completes, it just doesn't animate.

## Where things live

```
vetrina/
  stage.ts       the theater: cursor, cues, chrome, gestures, drag, tokens
  runner.ts      run() + take-over guard + await-racing + teardown
  storyboard.ts  the Step[] data model → Walkthrough
  scene.ts       the fluent recorder → Step[]
  theme.ts       token defaults + color validation
  recipes.ts     waitFor / loop / retry
  index.ts       the public surface
```

The core is mechanically kept self-contained (an import-boundary gate fails the
build if anything here reaches outside the folder). Worked examples — a buildless
`awaitUser` tour and a generic-host board covering gestures, drag success/rejection,
CSS-first theming, root-scoping, and interleave + take-over — live in
[`../vetrina-exemplars/`](../vetrina-exemplars/) with their e2e proofs in
`docs/e2e/vetrina-*.spec.ts`.
