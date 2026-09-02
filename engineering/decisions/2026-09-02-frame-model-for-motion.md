---
status: proposed
summary: >
  Motion in Lattice is a FINITE ORDERED SET OF KNOWN FRAMES, not a continuous timeline. That one
  choice turns motion from a timeline problem into a pagination problem — the thing this engine is
  already unusually good at — and it pays four times over: a frame is a deterministic still you can
  golden-test (a continuous tween you cannot, which is exactly why live motion has zero e2e coverage
  today); the last frame IS the reduced-motion still, so there is no second code path; the hero can
  only ever BE a known frame, which dissolves the transitional-poster bug the logo prototype caught;
  and it needs no animation engine at all, because `at(k/N)` wants no easing curve and no clock —
  which is why the bake-off's no-engine result stops being a close call and becomes the obvious fit.
  PRINT POLICY, DECIDED: frames are a LIVE-SURFACE capability only. PDF and PPTX always render the
  FINAL frame, so every existing deck stays byte-identical and the 0-pixel guarantee is absolute.
  The price is named rather than hidden: motion is worth nothing in the artifact a recipient
  forwards, and the frame model's cheapest dividend — N frames as N pages, which `_focusSteps`
  already proves the engine can do — is deliberately left on the table. The TARGETS split into two
  channels, verified against source, and only one is SVG: charts (9 components declare
  `render: svg`, 12 kernels already emit `data-anima-role` + `data-mark`) and `diagram` are SVG;
  the rails (`div.tile-progress` — zero `<svg>`), masthead, header, footer and pagination are all
  DOM, and the deck logo is an `<img class="deck-logo">`, not inline SVG, so an SVG painter cannot
  reach it until something inlines it. So: ONE pure `at(t)`, TWO painters. FIRST SLICE is charts,
  where the work is mostly DELETION — the Play/Style/Speed register and its per-axis cascade stay
  exactly as they are, and `speed` is reinterpreted from a tween duration into a frame hold.
  Slide transitions are net-new (there is no transition support anywhere in the tree today) and are
  deferred; frames are what make them defensible against the step-model ADR's wizbang objection.
companion:
  - ./2026-09-02-motion-engine-bakeoff.md
  - ./2026-07-19-anima-svg-first-cut-zdog.md
  - ./2026-06-16-narrative-step-model.md
---

# The frame model — motion is known frames, not a timeline

**Date:** 2026-09-02 · **Status:** direction decided; first slice specified, not built.

This note settles the shape of the motion capability after the engine bake-off
(`2026-09-02-motion-engine-bakeoff.md`). The bake-off answered *what paints*. This answers
*what motion is*, and the answer is deliberately more modest than the two ADRs before it.

---

## 1. The decision

> **A motion is a finite, ordered set of known frames.** Frame *k* is `at(k / N)` — a
> deterministic still. There is no continuous timeline, no easing curve to author, and no clock
> in the model. A surface that can animate walks the frames; a surface that cannot shows the last
> one.

Film, not tweening. The frames are enumerable at build time, and that is the whole point.

## 2. Why this fits Lattice specifically

Continuous motion fights a deterministic engine. Frames do not — they turn motion into
**pagination**, which is the problem this codebase is already built around.

1. **A frame is testable.** You can golden-test frame *k*. You cannot golden-test a tween, which
   is precisely why live motion has **zero e2e coverage** today: across 82 specs in `docs/e2e/`,
   none references `data-scene-spec`, `scene-live`, `data-anima` or `hydrateScene`
   (`2026-09-02-motion-engine-bakeoff.md` §2 finding 7).
2. **Reduced motion is free.** The last frame *is* the still. `hydrate.ts`'s three-tier ladder
   stays useful for *how* to walk frames, but the floor stops needing its own rendering path.
3. **The poster bug dissolves.** §12 of the bake-off found the hero sitting on a transitional beat
   — striking on screen, wrong on paper — and noted "nothing in the spec enforces that today."
   When the beats *are* the frames, a hero can only ever be one of them. The class of bug is gone,
   not guarded against.
4. **It needs no engine.** `at(k/N)` wants no easing and no clock. The bake-off's no-engine
   recommendation stops being a narrow win over anime.js and becomes the obvious fit.
5. **It is diffable.** A frame set is data. That keeps motion inside the property the whole
   product rests on — same Markdown plus same tokens yields the same output.

## 3. Print policy — DECIDED: live surfaces only

**PDF and PPTX always render the final frame.** Frames are a capability of the docs site, present
mode, and the exported `--player`. No existing deck changes by one pixel, and the 0-pixel guarantee
is absolute rather than conditional.

**The price, stated plainly rather than buried.** Two things are given up, and both are real:

- **Motion is worth nothing in the artifact people forward.** The PDF is what leaves the building.
  A recipient sees the final frame and nothing else.
- **The cheapest dividend of the frame model is left on the table.** N frames as N pages is
  nearly free here: `_focusSteps` already expands one authored slide into N *rendered* slides at
  build time (`lib/integrations/markdown-it/plugins.js:145`, wired at `lib/engine/index.js:115`) —
  measured at 11 authored slides → 14 PDF pages on `examples/focus.pdf`. PPTX is image-per-slide
  already (`lib/export/pptx-export.js`), so frames-as-slides needs no OOXML.

That path stays open and costs nothing to leave open, because "final frame" is just "frame N" — the
same enumeration, read at one index. If print ever comes back, it is an additive change to the
export, not a change to the model. The narrative step model's own policy (§5, "toggle, overlay
opt-in") is the shape it would take.

## 4. The targets are two channels, and only one is SVG

Verified against source, because the distinction decides how many painters exist.

| Target | Channel | Evidence |
|---|---|---|
| **Charts** | **SVG** | 9 components declare `render: svg`; 12 kernels emit `data-anima-role` (`funnel.transform.js:132-138`, gantt, map, quadrant, piechart, radar, state-chart) |
| **Diagram** | **SVG** | 1 component. Mermaid is contested — its SVG is third-party and DOMPurify strips `<foreignObject>`/`<style>`, i.e. every node label |
| **Rails** | **DOM** | `lib/forms/tile/progress` emits `<div>` only — zero `<svg>`. Same for `div.lat-split-rail` |
| **Masthead** | **DOM** | `lib/forms/cell/masthead/` — its own Cell transform plus CSS |
| **Header · footer · pagination** | **DOM** | `.cell-footer` is a flex row (`lib/core/footer-dock.js`) |
| **Deck logo** | **DOM (and not yet SVG at all)** | `<img class="deck-logo">` (`lib/core/bg-image.js:190`). An SVG painter cannot reach it until something inlines it |

So: **one pure `at(t)`, two painters.** The SVG painter is already written and measured (the
bake-off's no-engine candidate: 2,226 B gzip, byte-identical in jsdom and Chromium). The DOM
painter is new, small, and is transform-plus-opacity over tagged units.

Note the logo row. "Animate the SVG logo" is a reasonable ask that has a prerequisite: today it is
a raster reference, so inlining it is a separate, small piece of work that has to land first.

## 5. First slice — charts, where the work is mostly deletion

The chart on-ramp is the closest thing to finished, and the frame model makes it *simpler*, not
more complex.

**What already exists.** `docs/src/lib/chart-anima.ts` builds an `SvgScene` from a rendered chart's
marks, keyed on `data-mark` and `data-anima-role`. The authoring register in
`docs/src/playground/anima-host-sel.ts` is a clean three-axis cascade — **Play**
(`motion: on|off` in front matter; `motion-on` / `motion-off` per slide; Play is the sole switch),
**Style** (`motion-build` / `motion-together` / `motion-rise`), **Speed**
(`motion-slow|normal|fast|auto`) — resolved slide token → deck default → built-in by
`resolveMotion`.

**What changes.** The register stays exactly as it is. One thing is reinterpreted:

- `speedToDurationMs(speed, markCount)` currently returns a **tween duration in ms**. Under the
  frame model, speed becomes **how long a frame is held**, and the frame count comes from the
  content — a build over M marks is M frames, not a 3,600 ms tween. `auto` already scales to
  `markCount`, so this is a change of interpretation more than of arithmetic.
- The continuous rAF scrub in `hydrate.ts` becomes a frame walker.

**What this deletes.** The per-frame interpolation, the easing set as an authored surface, and the
question of what a poster time means. Three fewer things to get wrong.

## 6. Slide transitions — deferred, and why frames make them admissible later

There is **no transition support anywhere in the tree today** — no `transition` in base CSS, core,
the player, or the front-matter register. It is fully net-new.

It is also the item the narrative step model warns about most directly: morph and transition are
"exactly where this feature is most at risk of becoming the wizbang we reject" (§3, which demotes
morph to a gated experiment that may be cut outright).

The frame model is what would make it defensible: a transition with **known frames** is a build,
not an effect — bounded, enumerable, and printable-in-principle. A continuous crossfade library is
the thing to refuse. Deferred until charts and the DOM chrome are real.

## 7. What this note does NOT do

- **It does not pick the engine.** The bake-off recommends no engine and the frame model
  strengthens that, but the pick is still a human call and is still open.
- **It does not settle morph.** Part-level morph is measured and works, but under a frame model its
  role is narrower — it interpolates *between* two known frames, if we want that at all.
- **It does not change any exported byte.** By construction, per §3.
- **It does not renumber the twenty ideas.** Most of them are a binding away from this model; the
  interactive half still needs an interaction surface that does not exist (zero `tabindex`,
  `role="button"` or `aria-expanded` across every component transform).

## 8. Unverified

- **No claim here has been driven on the real Playground, presenter window, or a `--player`
  export.** Under HARD RULE #23 the frame model is a design; the bake-off's painter is measured in
  a standalone harness in real Chromium, which is not the same surface.
- The frame-count-from-content rule in §5 is specified, not implemented; `speedToDurationMs`'s
  current arithmetic is read from source but its reinterpretation is untested.
- Whether a chart's existing scene builder can enumerate frames without a live re-compile is
  unchecked — it depends on `chart-anima-hydrate.ts`'s body, which has not been read.
