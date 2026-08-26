---
status: shipped
summary: >
  The Studio's warm keystroke is the product promise and nothing held it. `bench:check` ratchets
  the ENGINE in Node; the edit→paint loop a person actually feels was measured only ad hoc. Measured
  on the real built Studio at 4× CPU throttle: FRAME patch 1.3ms, TOTAL edit→paint 11.1ms, engine
  RENDER 3.4ms, LCP ~1.5s. Those are now committed as `docs/scripts/frame-baseline.json` with
  `perf:frame:bless` / `perf:frame:check`. The gate needs TWO conditions to fail — the percentage
  band AND an absolute floor — because FRAME patch is ~1.1ms and 1.1→1.3ms is +18% and meaningless;
  proved both directions (a 2→11.3ms regression fails, a 1.2→1.3ms jitter does not). The measurement
  also settled an architecture question it was taken to answer. The per-keystroke unit is ONE SLIDE,
  not a deck, and at that scale a DOM round-trip costs: native DOMParser in Chromium 0.100ms (0.9% of
  the edit→paint budget), linkedom in Node 0.40ms, jsdom 6.83ms — 11.7× the 0.58ms render. jsdom's
  penalty is WORSE on a small document than a large one (11.7× at one slide, 2.5× at 117) because its
  fixed setup dominates, which is exactly the wrong shape for a typing loop. So the transform-DSL as it
  stands (`applyRulesToHtml` uses jsdom) cannot be wired into the render path, and the shape that can is
  a split by ENVIRONMENT rather than by implementation: one DOM kernel per transform, one parse at the
  registry, native DOMParser in the browser and linkedom in Node.
---

# The Studio edit→paint budget — measure it, commit it, and price the transform work against it

**Date:** 2026-08-25 · **Status:** baseline shipped; the architecture conclusion informs a later slice
**Trigger:** heading into a refactor that would put a DOM parse in the render path, the owner's
constraint was *"whatever we do today in the studio is blazing fast and that should be our gold
standard and baseline for acceptance."* Nothing in the repo held that standard, and the number I had
been reasoning from was wrong.

## 1. The number I had was measuring the wrong thing

The first pass benchmarked `engine.render()` over the 117-slide gallery in Node: 69ms, and a jsdom
parse-once at +185ms on top. Both true, both irrelevant to the Studio, for two independent reasons:

- **The Studio's per-edit unit is ONE SLIDE**, not a deck. The frame scheduler's fast path is a
  section/body patch (`docs/src/lib/frame-scheduler.ts`: *"a cheap render (a section/body patch,
  ~2ms) reschedules on the next frame"*).
- **A Node number is not a browser number.** The browser has a native parser; Node does not.

## 2. The gold standard, measured

`docs/scripts/frame-bench.mjs` already existed — it drives the REAL built Studio under CPU throttle
and reads raw per-render samples from `window.__latticeRenderMetrics`. It had no baseline. Median of
5 runs, `--cpu 4`:

| needle | measured | what it is |
|---|---|---|
| **FRAME patch** | **1.3 ms** | warm edit, body swap |
| **TOTAL patch** | **11.1 ms** | whole edit→paint, warm |
| **RENDER** | **3.4 ms** | engine Markdown→HTML |
| LCP | ~1.5 s | newcomer first paint |

`FRAME write` / `TOTAL write` (the heavy rebuild regime) come back NaN in a headless sandbox that
never triggers a theme/mode/size change. They are recorded as `null` and skipped rather than blessed
as `0` — pinning the strictest possible budget on a number nobody measured is worse than admitting
the gap.

## 3. The ratchet, and why it needs a floor the engine bench does not

`perf:frame:bless` writes `docs/scripts/frame-baseline.json`; `perf:frame:check` compares. Two guards,
both borrowed from `test/benchmark/baseline.json`'s design, plus one that is new here:

- **Machine match** (borrowed). A browser number is not portable; timing gates only when the checking
  machine matches `blessedOn`, and prints without failing anywhere else.
- **An absolute floor beside the percentage** (new, and load-bearing). FRAME patch is ~1.3 ms. A
  1.3 → 1.5 ms move is +18% and completely meaningless. A metric must break **both** the 25% band
  **and** its own floor to fail. Proved in both directions: a doctored 2 → 11.3 ms baseline fails
  (+465%, +9.3 ms, exit 1); a 1.2 → 1.3 ms jitter (+8%) does not.

The engine bench does not need this because its datasets are tens of milliseconds. A sub-millisecond
needle with only a percentage band is a gate that cries wolf, and a gate that cries wolf gets ignored.

## 4. What this settles about the transform work

The open question was whether the 17 registry transformers could collapse onto one kernel — the
`lib/core/transform-dsl/` prototype, whose parity holds *by construction* because `applyRulesToHtml`
parses and calls the same `applyRulesToDom`. The blocker is what that parse costs, and the answer
depends entirely on scale and environment. At the Studio's per-keystroke unit (one slide, 0.8 KB
rendered, 0.58 ms engine render):

| parser | one slide | 117 slides | verdict |
|---|---|---|---|
| **native DOMParser** (Chromium, 4× throttle) | **0.100 ms** — 0.9% of the edit→paint budget | 90.8 ms | the browser answer |
| **linkedom** (Node) | 0.40 ms — 0.7× the render | +39 ms | the Node answer |
| **jsdom** (what the DSL uses today) | **6.83 ms — 11.7× the render** | +133 ms | **disqualified** |

The shape worth remembering: **jsdom is proportionally WORSE on a small document than a large one** —
11.7× at one slide against 2.5× at 117 — because its fixed setup cost dominates. A per-keystroke loop
is the one place that penalty is maximal.

Two further constraints, both verified rather than assumed:

- **The string path cannot simply be deleted.** There is exactly one production call site each
  (`lib/engine/index.js:381`, `lib/runtime/index.js:927`), and the tempting move — drop `applyToHtml`
  and let the browser's own DOM be the only surface — dies on the emulator: it *strips* the runtime
  script from its render page, so the PDF and the static `.html` export need the transforms baked
  into the string with no runtime available.
- **The DOM transformers assume browser globals.** `applyAllToDom` against a headless DOM failed
  immediately on `Image is not defined`. Any Node-side DOM execution needs shims.

So the shape that meets the budget is a **split by environment, not by implementation**: one
structural kernel per transform expressed as a DOM operation, one parse at the registry level rather
than per transformer, and the parser injected by the host — native `DOMParser` in the browser,
linkedom in Node, jsdom never. That is one kernel and one code path for the *logic*, which is what
parity requires; the parser is the only thing that differs, and in the browser it is free.

## 5. What is NOT settled

The heavy-regime (`write`) numbers were never captured — the headless bench does not trigger a
theme/mode/size change. Before any change that touches the full-deck rewrite path, extend the bench
to drive one, or the ratchet is guarding half the loop.
