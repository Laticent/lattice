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

---

## 9. Three clocks, not one

The frame model (§1) describes a slide's own motion. Two targets do not fit it, and the reason is
that they answer to different time axes. Naming them now stops them being retrofitted later.

| Clock | What drives it | Targets |
|---|---|---|
| **Slide-local frames** | the slide's own frame set | charts, content builds, `state-chart` edges |
| **Persistent chrome** | navigation between slides | the section rail — the pill travels |
| **Signature** | first appearance, once per deck | the logo |

The rail is z3 chrome, which the narrative step model says **persists through a build** — so it is
not part of any slide's frame set. Its motion happens *between* slides. The logo is the only element
that is identical on every slide and is not content, which is why it earns a signature treatment
rather than a per-slide effect: it is a title sequence, and it plays once.

## 10. The rail becomes ONE engine-generated SVG

**Decision.** The engine emits the section rail as a single `<svg>` rather than N `<span class="dot">`.

**What ships today** (`lib/forms/tile/progress/progress.transform.js`, `progress.css`): one
`<span class="dot">` per deck section, derived from `divider` slides and bucketed past a cap of ten;
the current section's dot carries `.on`. Appearance is `width: 0.85cqi` circular for a dot and
`width: 2.6cqi` with `border-radius: 999px` for the current one — a pill three times wider. The
rail is `aria-hidden` decorative chrome and carries no section label, deliberately
(`2026-07-27-footer-band-allocation.md`: the band's priority is pagination > dots > the author's
words, and a `nowrap` label could not yield).

**Why one SVG is the better substrate — including the point that reverses an earlier concern:**

1. **The width budget gets simpler.** Today the rail's total width is EMERGENT — N dots plus N−1
   gaps, varying with section count. That is exactly what the band-allocation policy has to defend
   against. One SVG has ONE declared width, so the policy becomes a single number rather than a sum.
   The first draft of this analysis treated `cqi` sizing as an argument *against* SVG; it is an
   argument for it.
2. **It fixes the two-rail drift.** `lib/core/footer-dock.js` exists because `div.tile-progress` and
   `div.lat-split-rail` kept diverging. One geometry generator serving both extends that guarantee
   from how they dock to how they draw.
3. **Motion becomes an interpolation instead of a reflow.** In SVG the pill is a `<rect>` with a
   stable id, so travelling from section 2 to section 3 is one x/width interpolation between two
   known frames. In flex-DOM the same move reflows every sibling.
4. **Palette-blindness is unaffected.** SVG `fill` accepts `var(--accent)` and `color-mix()`, so
   HARD RULE #3 costs nothing in the conversion.

**The governing constraint: pixel identity.** The rail renders on every `form` slide inside a
section, in every deck that has dividers, and the repo carries **367 committed PDF goldens**. The
SVG MUST render pixel-identically to the spans, or every affected golden re-blesses and the diff
becomes unreadable. That is a design input: put the `cqi` sizing on the `<svg>` root, keep the
viewBox in dot-units so the interior scales as the flex version did, and prove it with
`npm run regress` before anything else lands.

**The one real trade.** `gap: var(--sp-sm)` is a token resolved by CSS. Inside one SVG the gap
becomes viewBox geometry and stops responding to that token — the rail composes from tokens via
flexbox today and would compose from geometry instead. Small, but it is a genuine loss of token
reach and should be chosen rather than discovered: either bake the ratio, or drive the SVG's width
from the container and keep the interior proportional. **Open.**

## 11. Chrome targets that are already SVG

Two components are `render: hybrid`, and in both the SVG half is exactly the connective chrome worth
animating. Neither needs a new painter.

- **`state-chart`** — the best chrome target in the catalog. Its manifest records that the HTML
  `<ol>` is measured and then **nodes, edges and edge labels are painted into an `<svg>` overlay**;
  once painted the list is hidden, so "a default slide is SVG in practice." Edges drawing on is
  precisely the draw primitive's home. Only the `inline` variant's chip row keeps it hybrid.
- **`journey`** — the board is an HTML/CSS grid, but the **mood curve and mood faces** are inline
  `<svg>`, "the only parts with real geometry." The manifest states the gap outright: *"Neither side
  animates today — journey emits no motion roles, so chart-motion skips it."* A documented gap with
  a named fix: emit `data-anima-role` on the curve and the faces.

## 12. Logos — the source is SVG, the render is not

`logo:` accepts a path or URL and **SVG and PNG both work** (`lib/base/_logo/logo.docs.md`); the
shipped sample is `acme-logo.svg`. But every path emits `<img class="deck-logo">`
(`lib/core/bg-image.js:190`), and **an `<img>` pointing at an SVG is opaque** — nothing in the host
document can reach inside it. So per-part logo animation is impossible today regardless of the
file's format.

**Inlining is the fix, and it has a price worth deciding before it is discovered.** `logo:`
explicitly accepts cross-origin `https://`, protocol-relative and `data:` values, and the docs say
"nothing in the engine, the sanitizer or the docs site filters it." Inlining converts a logo from an
opaque image into **third-party markup entering the document**, which puts it on the HARD RULE #22
path — a sanitize boundary and a registered sink, not a free change. That is the real cost of
animating logos.

---

## 13. Logo policy — the asset's format decides the capability

**Decision.** Respect what the author supplied. A logo we can obtain as SVG markup is placed with
**SVG constructs** and is independently animatable. A raster logo is placed with **raster
constructs** and animation is **disabled** — never coerced, never converted, never faked.

**The test is not "is it SVG" but "can we obtain the markup without a network fetch."** That third
case is forced by an existing decision, not by taste: inlining a remote SVG would require the export
to wait on a fetch, and `lib/core/author-deferral-probe.js` settles that — *"There is no finite wait
that is correct — the next deck can always pick a longer one — so the export declines the wait."*

| `logo:` value | Construct | Animation |
|---|---|---|
| `./mark.svg` — relative local | inline `<svg>` | **enabled** |
| `data:image/svg+xml,…` | inline `<svg>` | **enabled** |
| `https://…/mark.svg` — remote | `<img>` | **disabled** |
| `.png` / `.jpg`, any location | `<img>` | **disabled** |

The discrimination already exists in the tree: `lib/core/deck-front-matter.js:108` tests
`/^(?:https?:|data:|\/\/|\/)/i` to separate a relative local path from an absolute, remote, site-
relative or `data:` one — written for a different reason (a local path cannot survive being baked
into an export) and exactly the predicate this needs.

**Disabled must be VISIBLE.** A silent no-op is the failure mode this whole line of work exists to
escape — Vivus's `ready = false`, GSAP's DrawSVG painting nothing in jsdom, both SplitText
implementations reporting success while destroying the text. When an author asks for logo motion and
supplies a raster or a remote SVG, `lint:deck` warns and names the fix. That is HARD RULE #29's
posture — *"we warn, we coach"* — and it is already the house pattern for author-facing limits.

**It also shrinks the security surface rather than growing it.** Only a logo we inline becomes
third-party markup in the document, so only the local-SVG and `data:` rows touch HARD RULE #22.
Raster and remote logos stay `<img>`, exactly as they ship today, and carry no new risk. A blanket
"inline every logo" would have put the cross-origin case on the sanitize path for no gain.

**Do the logo BEFORE the rail.** The two are the same technique — replace a DOM construct with an
inline SVG and prove pixel identity with `npm run regress` — but the blast radii differ by two
orders of magnitude. Only **7 files** reference `logo:` (4 example decks plus the logo gallery and
docs), so the goldens at risk are the logo gallery in both modes plus 4 example PDFs: **6, against
the rail's 367.** Validate the technique where a surprise is cheap. And expect one: an `<img>` takes
intrinsic sizing from the file, while an inline `<svg>` falls back to its viewBox or to 300×150
unless width and height are carried across explicitly. This supersedes §10's implied ordering.
