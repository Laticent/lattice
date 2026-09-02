---
status: proposed
summary: >
  Anima's SVG backend is built on Vivus, and Vivus is the wrong tool: it drives the WHOLE
  drawing off ONE progress scalar (so per-element windows and author-set order are impossible —
  the order is DOM document order, full stop), it cannot animate `<text>` at all, its Pathformer
  REPLACES `rect`/`circle`/`line` nodes with `<path>` inside an untrusted user asset, and it
  needs `getTotalLength()` so it throws in jsdom and the whole draw channel silently no-ops
  behind `ready = false`. We already hand-rolled six of the seven verbs around it. Two measured
  findings make it worse: on the chart on-ramp — the one people actually use — `chart-anima.ts`
  emits no `draw`/`trace` at all, so Vivus is constructed, destructively rewrites the DOM, and is
  then pinned at progress 1 for the life of the animation while every visible pixel comes from
  our own `paintElements`; and across 82 e2e specs nothing references `data-scene-spec`,
  `scene-live`, `data-anima` or `hydrateScene`, so under HARD RULE #23 no claim that live motion
  works has ever been verified on a real surface. A four-way bake-off (no engine · anime.js v4 ·
  GSAP · Motion) built the SAME scene — per-element draw windows, SVG text reveal, ordered
  sequence, a keyframed viewBox camera, an exploded view, and a drag-scrubbed swap across three
  angle SVGs — on each candidate, in real Chromium and in jsdom. Results: the no-engine painter
  and anime.js are pixel-identical (0.000% mean diff) and both work in jsdom; GSAP is correct in
  the browser and pixel-equivalent (0.008%) but its DrawSVGPlugin measures real geometry (2×
  `getTotalLength`, 3× `getBBox`) so it silently paints NOTHING in jsdom — reproducing the exact
  Vivus defect independently of its licensing; Motion never paints the draw channel and its WAAPI
  output leaves inline style empty, so a serialized poster carries none of it. And the headline
  reason to buy an engine evaporates on inspection: BOTH GSAP's SplitText and anime.js's
  splitText report success on an SVG `<text>` and then destroy it — they inject XHTML-namespace
  `<div>`/`<span>` children via `innerHTML`, `getBBox().width` goes 68 → 0, and anime's also
  duplicates the string. Neither can reveal text inside a supplied SVG; that primitive is
  hand-rolled whichever engine wins. Recommendation: no engine for v1 (2.2 KB gzip total,
  including the scene layer), adopting anime.js's pathLength-normalization TECHNIQUE rather than
  the package. A SECOND round covered the three categories the first missed — supplied-format
  players (Lottie, Rive), native SMIL, and SVG-native libraries. One addition survives, and it is a
  PRIMITIVE rather than a package: PART-LEVEL MORPH. Because the angle SVGs carry identical part
  ids, each part can morph to its counterpart in the next angle, which reads as rotation instead of
  the double-exposure crossfade or a flip-book cut. Two packages supply it and the pick follows the
  engine pick, not the other way round: flubber (pure `(t) => pathString`, byte-identical in bare
  node, jsdom and Chromium, exact at both endpoints, 18,958 B, unmaintained since 2022) if v1 stays
  engine-free; anime.js `morphTo` (14,523 B including the engine, maintained) if anime.js is adopted
  for `createDrawable` too — but it SILENTLY no-ops in jsdom, the same criterion that decided GSAP,
  and emits a 155-point polyline even at t=0 and t=1 instead of the author's exact `d`. Lottie scrubs and serializes but CRASHES in jsdom, costs 79 KB gzip, and is
  playback of After Effects output rather than choreography — reconsider it later as an import
  feature, never as the engine. SMIL scrubs natively for zero bytes but the animated value never
  reaches the serialized markup, so it cannot make a poster, and `<animate>` is already on the
  untrusted-SVG strip list. Rive rasterizes (every renderer is canvas/WebGL); Theatre.js is 2+
  years stale; KUTE.js uses the browser's getTotalLength for paths. Engine pick is a human call
  and is NOT yet made.
companion:
  - ./2026-07-19-anima-svg-first-cut-zdog.md
  - ./2026-07-17-anima-animation-library.md
  - ./2026-07-18-anima-motion-faculty-modes.md
  - ./2026-06-16-narrative-step-model.md
---

# The motion engine bake-off — measure the painter, not the timeline

**Date:** 2026-09-02 · **Status:** findings settled; the engine pick is pending a human decision.

> **Naming.** The library is renamed **Animals**. The 2026-07-17 ADR set "Anima" explicitly as a
> naming call ("All three are naming calls (alternatives: `Moto`, `Diorama`)"), so this supersedes
> it rather than contradicting it. **This note records the decision; the code still says `anima`.**
> A sweep is 1,049 references across 146 files, and it is not a find-and-replace: it moves the
> `docs/src/lib/anima/` folder (23 files), the boundary gate's `ANIMA_DIR` / `ANIMA_ADAPTER_DEPS` /
> `checkAnimaBoundary` / `checkAnimaColorVocabulary` (24 hits in `tools/check-ownership.js`), the
> `kind:'scene'` asset rail, the generated player bundle and its build step, and **149 occurrences
> of `data-anima-role` that are SHIPPED MARKUP** — a rendered-attribute rename, so it breaks any
> saved scene asset and any exported player already in the wild. Do it as its own PR with a
> migration for stored assets, not folded into feature work.

This note does three things. §1–2 audit what Anima ships today and why its SVG backend has to go.
§3–9 report a four-way engine bake-off that was **built and measured**, not argued. §10 covers a
second round over the three categories the first one missed.

---

## 1. What ships today

Anima is real and reachable — no dead code. The pure core (`docs/src/lib/anima/`, 2,124 source
lines) compiles a scene spec into a timeline whose `at(t)` returns an engine-neutral snapshot.
Two backends paint it: `backends/zdog.ts` for `source:'built'` primitives, `backends/vivus.ts`
for `source:'svg'` line art. A `scene` component (`lib/components/imagery/scene/`) frames the
still, and a Motion faculty (`docs/src/components/studio/MotionStudio.tsx`, 667 lines) authors it.

Both engine dependencies are MIT and both are abandoned: **vivus 0.4.6 last published
2022-06-28, zdog 1.1.3 last published 2022-05-25.** Both are minified verbatim into
`lib/export/anima-player-bundle.generated.mjs` — 63,846 committed bytes that ship in the npm
package and bake into every standalone `--player` HTML export a recipient downloads.

## 2. Why the SVG backend has to go

Eight findings, each verified against the source.

1. **One scalar for the whole drawing.** `progressOf` is the max `reveal` across drawing
   elements, handed to `vivus.setFrameProgress` (`backends/vivus.ts:200`). Per-element `at`/`span`
   windows are explicitly not honored and the drawing order is **DOM document order**. The
   `sequence` verb names something the engine cannot do; the file says so at line 197.
2. **It cannot animate text.** `<text>` has no stroke to draw. For a medium that is line *and
   label*, that is the whole gap.
3. **It destroys the asset.** Vivus's Pathformer rewrites `rect`/`circle`/`line` into `<path>`,
   *replacing the nodes*. `mount()` must construct Vivus first and re-resolve every element
   reference afterward (`vivus.ts:216-220`) because the nodes it captured are now detached — on
   untrusted, user-supplied markup.
4. **It cannot be tested.** Vivus needs `getTotalLength()`, absent in jsdom, so the constructor
   throws and `ready = false` (`vivus.ts:224`). The one thing the dependency provides is the one
   thing no unit test can cover.
5. **We wrote the rest anyway.** `paintElements` (`vivus.ts:181-197`) is our own per-element
   painter for transform, opacity and emphasis — composing SVG transform strings by hand, doing
   bbox-center pivot math, and choosing inline style over presentation attributes to win a
   specificity fight. Vivus contributes `stroke-dashoffset`. We hand-rolled six of seven verbs.
6. **On the on-ramp people use, it does nothing at all.** `chart-anima.ts` emits only `reveal`,
   `slide` and `highlight` — **zero** `draw`/`trace`. So `animated` is empty, `strokeProgress`
   returns 1 on every frame, and Vivus is constructed, destructively rewrites the DOM, and is
   then pinned at full progress for the life of the animation. Every visible pixel of chart
   motion comes from `paintElements`. We pay the rewrite and 208 KB for a no-op.
7. **Nobody has seen it work.** Across 82 specs in `docs/e2e/`, none references
   `data-scene-spec`, `scene-live`, `data-anima` or `hydrateScene`. Combined with (4), the draw
   channel has no verification anywhere — not unit, not e2e. Under HARD RULE #23, nothing about
   live motion is currently verified.
8. **A designed subsystem is dead.** `Timeline.poster()` and `Renderer.poster()` — the
   deterministic-still contract the PDF story rests on — have zero call sites outside tests. Both
   backends implement `poster()` for nobody, because no render path mounts a backend: the PDF
   still is simply the `<svg>` the author typed into the deck.

Finding 8 has a useful corollary. **An engine swap cannot change PDF bytes.** It changes the
`--player` HTML export, which inlines the engine into every copy a recipient opens — so the
export sign-off in CLAUDE.md's QUALITY BAR applies to that surface, and only that one.

## 3. The reframe — we need a painter, not a timeline

The features this pivot is for bind progress to a **user input**, not a clock: a drag-scrubbed
angle swap, a scroll-driven build, a tilt, an x-ray slider. The narrative step model
(`2026-06-16-narrative-step-model.md`) binds it to slide advance. Only the draw channel and the
camera run free.

Lattice already owns the right shape for that: `compile(scene).at(t)` is pure and accepts `t`
from anywhere, and `lib/core/present-transport.mjs` already ships the keyboard, swipe, wheel-gate
and pinch-zoom verbs to feed it. **So the timeline, clock and easing engine — the bulk of GSAP,
anime.js and Motion, and the reason they are large — is the part we would bypass.** What we would
actually buy is narrow: stroke-dash math, attribute tweening, text splitting, and SVG
transform-origin normalization.

The bake-off therefore judges candidates as **painters of a snapshot we compute**, which is also
the only way to compare them fairly.

## 4. Method

One scene, built four times. The pure scene layer (spec + evaluator) is shared, so every
candidate consumes an identical `SceneState` and the comparison isolates the engine.

The scene exercises every primitive in scope: **per-element draw windows in author order**
(the thing Vivus cannot do), **SVG text reveal**, **ordered sequence**, a **keyframed viewBox
camera**, an **exploded view** on SVG groups, a **highlight** swell, and a **drag-scrubbed swap
across three angle SVGs** carrying identical part ids. Measured in real Chromium (puppeteer,
2× DPR) and in jsdom (the environment vitest runs), plus esbuild-minified bundle bytes in the
same IIFE shape the `--player` export uses.

Harness: `.scratch/motion-bakeoff/` — throwaway, per CLAUDE.md. **GSAP was installed only
inside that sandbox and never entered the repo's dependency tree**, deliberately: see §6.

## 5. Results

| | no engine | anime.js v4 | GSAP | Motion |
|---|---|---|---|---|
| License | — | MIT | **Proprietary Free** | MIT |
| Bundle, gzip | **2,226 B total** | +14,239 B | +29,210 B | +22,705 B |
| Draw correct in browser | ✓ 63.6% | ✓ 63.6% | ✓ 63.6% | ✗ frozen at 100% |
| Scrubs from our clock | ✓ | ✓ `seek(ms)` | ✓ `time(s)` | partial — opacity yes, dash no |
| **Works in jsdom** | ✓ | ✓ | **✗ silent no-op** | ✗ |
| Painted state survives `outerHTML` | ✓ attributes | ✓ attributes | ✓ inline style | **✗ WAAPI only** |
| SVG text reveal | hand-rolled | **✗ destroys the text** | **✗ destroys the text** | not offered |
| Pixel diff vs baseline (mean / worst) | — | **0.000% / 0.002%** | 0.008% / 0.022% | 0.022% / 0.114% |
| Non-destructive to the asset | ✓ | ✓ | ✓ | ✓ |

Four results carry the decision.

**The no-engine painter and anime.js are the same picture.** 0.000% mean pixel difference across
nine sampled frames — below antialiasing. Both report the identical draw value (63.6% at
p=0.20) in the browser *and* in jsdom.

**GSAP reproduces the Vivus defect, independently of its license.** `DrawSVGPlugin` measures real
geometry — 2× `getTotalLength`, 3× `getBBox` — so in jsdom it paints nothing, silently, with no
error. That is finding (4) above, in a different package. anime.js's `createDrawable` has **zero**
occurrences of either; it normalizes with `pathLength` (8 occurrences) and works headless. This
is a genuine engineering difference between the two, not a licensing one: **GSAP would be the
wrong pick here even if its license were clean.**

**Motion is out on the poster contract.** It never paints `strokeDasharray`, and `strokeDashoffset`
lands on the final value instead of the seeked one. Worse, because it drives WAAPI, inline style
stays empty — a probe read computed `opacity: 0.5` while `style.opacity` was `""`. A poster
serialized from a Motion-driven SVG carries none of the animated state. (An early version of the
harness scored Motion as passing determinism; it was passing *trivially* by writing nothing. The
test now also requires that two different times serialize *differently*.)

**Neither text plugin works on SVG, and both fail silently.** Run against an SVG `<text>`:

| | reports | injects | namespace | `getBBox().width` | textContent |
|---|---|---|---|---|---|
| GSAP `SplitText` | success, 10 chars | 10 × `<div>` | XHTML | **68 → 0** | unchanged |
| anime.js `splitText` | success, 10 chars | 3 × `<span>` | XHTML | **68 → 0** | **duplicated** |

Both build HTML elements via `innerHTML` (verified in source: zero occurrences of `tspan` or
`createElementNS` in either). Inserted into an SVG `<text>`, XHTML children do not render — the
label disappears while the API reports success. **SplitText is a headline reason to want GSAP,
and it does not apply to our medium.** The `<tspan>` splitter is hand-rolled whichever engine wins.

### A product finding from looking at the output

The angle swapper's **crossfade reads as a double exposure** — two whole drawings overlaid, not a
rotation. A **hard cut** between angles reads cleanly, like a flip-book. So idea-set "360-degree
swapper" wants a cut plus *more* angles (8–12), not a blend across three. Morphing between
corresponding paths is the one place an engine (anime.js `morphTo`) would add capability we
cannot cheaply build — and it is the reason to keep anime.js named as the reserve.

## 6. The GSAP licensing problem, stated separately

GSAP's engineering result above stands on its own. Its licensing is a second, independent
obstacle, and it is a human decision rather than a technical one.

- The npm tarball contains **no LICENSE file**; `package.json` carries
  `"license": "Standard 'no charge' license: https://gsap.com/standard-license."` — a URL, not an
  SPDX identifier. ScanCode LicenseDB categorizes it **Proprietary Free**.
- The grant is Webflow → the user, to "use, reproduce, display, and implement... solely for
  **Permitted Uses**." There is no sublicense right. Lattice is **AGPL-3.0-only**, publishes
  `lib/` and `dist/` to npm, inlines the engine into a committed generated bundle, and bakes it
  into every HTML export a recipient downloads. AGPL §7 does not permit passing along the added
  restriction.
- **Prohibited Uses** covers "use of GSAP Products in tools that allow users to build visual
  animations without code." The Motion faculty is such a tool.

This is a reading of published terms, not legal advice. Adopting GSAP would want written consent
from Webflow first. The measured result in §5 means we do not need to seek it.

## 7. Recommendation (pending the human pick)

**No engine for v1.** Adopt anime.js's `pathLength`-normalization *technique* — set
`pathLength="1"`, then drive `stroke-dasharray`/`stroke-dashoffset` in fractional units — rather
than the package. The whole painter plus the scene layer is 2,226 bytes gzipped, it is the only
option that is byte-for-byte reproducible in jsdom *and* in the browser, and every primitive in
scope (draw, text reveal, sequence, camera, explode, highlight, angle swap) is already built and
measured in the harness.

**Name anime.js v4 (MIT) as the reserve.** If `morphTo` becomes the right answer for the angle
swapper, it is a maintained, MIT, tree-shakeable dependency that already proved pixel-identical
here, and adopting it later is additive.

## 8. Scope this settles for the build

- `explode` is `built`-only today (`vocabulary.ts` `VERB_SOURCE`). The 2026-07-19 line "Retired
  (with zdog): spin, orbit, explode" is **wrong** under the exploded-view requirement — `explode`
  **migrates to SVG groups**, it does not retire.
- `SvgScene.asset` is a single asset. The angle set needs an asset **list** with per-asset
  timing — the second increment of "parts first, then sets."
- The `<tspan>` text splitter injects markup **inside** the preview frame, after the host
  sanitized. That is HARD RULE #22's fourth shape, so it must be declared in
  `SANCTIONED_RUNTIME_MARKUP_SINKS`. It is safe by construction — it writes `textContent`, never
  `innerHTML` — but the gate still has to know about it.
- The 2026-07-19 sequencing holds: build additively, clear the proof gate on the real Studio,
  then excise zdog. The angle swapper strengthens that gate, because it recovers the turntable
  case that was zdog's last unique claim.

## 9. What is NOT verified

- **No claim here is about the real Studio.** The bake-off ran in a standalone harness in real
  Chromium — that is a real browser, but it is not the Playground, the presenter window, or an
  exported `--player` file. Under HARD RULE #23 the candidate must still clear the proof gate on
  the surface a human actually drives. Marked **UNVERIFIED** until then.
- Bundle bytes are the harness's own bundles, not a rebuilt `anima-player-bundle.generated.mjs`.
  The relative costs are sound; the absolute export delta is not yet measured.
- Nothing was measured for PPTX. Only the PDF and HTML-player paths were traced.

---

## 10. Round two — the categories the first bake-off missed

The first four candidates were all one category: **generic tween engines**. Three other categories
exist, and each was measured rather than reasoned about.

| Candidate | Category | License | Last publish | gzip | Verdict |
|---|---|---|---|---|---|
| **flubber** | pure path interpolation | MIT | 2022-06-18 | 18,958 B | **Morph primitive — if v1 takes no engine** |
| anime.js `morphTo` | morph inside a tween engine | MIT | 2026-08-17 | 14,523 B | **Morph primitive — if v1 takes anime.js** |
| lottie-web | supplied vector-animation format | MIT | 2025-05-21 | 79,382 B | Out as an engine; possible import path |
| `@lottiefiles/dotlottie-web` | same, WASM player | MIT | 2026-08-28 | — | Out — canvas, rasterizes |
| `@rive-app/*` | runtime + SaaS editor | MIT | 2026-09-01 | — | Out — every renderer is canvas/WebGL |
| Native SMIL | zero-dependency, in-browser | — | — | **0 B** | Out — cannot serialize a poster |
| KUTE.js | tween engine | MIT | 2026-03-26 | — | Out — browser `getTotalLength()`; will not bundle |
| `@svgdotjs/svg.js` | SVG construction + animation | MIT | 2026-08-04 | 31,004 B | Skipped — we receive SVG, we do not build it |
| `@theatre/core` | scrubbable sequencer | Apache-2.0 | **2024-05-19** | — | Out — 2+ years stale, the Vivus risk again |
| popmotion · velocity · snap.svg | tween engines | MIT/Apache | 2022–2023 | — | Out — abandoned |

**Correction — anime.js `morphTo` was not tested before flubber was named, and it should have
been.** It exists (`svg/morphto.js`), it works, and it is *cheaper*: 14,523 B gzip including the
whole anime engine, against flubber's 18,958 B standalone. Rendered side by side over the same
front → side lid at t = 0 / .25 / .5 / .75 / 1, the two are visually equivalent at slide scale;
anime's corners read a touch softer because its output is a 155-point polyline under
`stroke-linejoin: round`. **Morph quality does not separate them.** Three other things do:

| | anime.js `morphTo` | flubber |
|---|---|---|
| Shape | `FunctionValue` — needs the anime engine to tween it | pure `(t) => pathString` |
| Morph target | must be a **mounted DOM element** | a path **string** |
| Method | `getTotalLength` + `getPointAtLength` resampling | topology-aware interpolation |
| **In jsdom** | **silent no-op** — `d` never changes, no error | ✓ works, byte-identical to Chromium |
| At t=0 and t=1 | a 155-point polyline (2,804 / 2,932 chars) | the author's **exact** `d` (17 / 23 chars) |
| gzip | **14,523 B** | 18,958 B |
| Maintained | ✓ 2026-08-17 | ✗ 2022-06-18 (pure fn — low drift risk) |

The jsdom row is the one that matters, because it is the same criterion that decided GSAP in §5:
anime's `morphTo` reports success, leaves the `d` attribute untouched, and throws nothing. The
endpoint row is a smaller but real cost against the poster contract — a morph-capable part would
bake a 155-point polyline into the PDF instead of `M60 62h200v34H60z`, losing the author's geometry
and inflating the poster. It is fixable with a two-line snap-to-exact guard at t ≤ 0 and t ≥ 1, so
it is a caveat, not a disqualifier.

**So the morph choice is downstream of the engine choice, and should not be stated on its own:**

- **v1 = no engine → flubber.** Pure, headless, exact at the endpoints; it matches an architecture
  whose whole test tier is jsdom and whose poster is a serialized SVG. Its 2022 staleness is
  lower-risk than it looks: it is a pure function over path strings with no browser-API surface to
  drift against — but it is unmaintained, and a bug in it is ours to fix.
- **v1 = anime.js → use its `morphTo`.** Marginal cost is zero, it is maintained, and it is the
  cheaper total. Accept that morph then has no headless test and add the endpoint snap.

Either way, **flubber's real contribution to this note is not the package — it is the finding that
part-level morph works at all.** Because the angle SVGs carry identical part ids, each part can
morph to its counterpart in the next angle, and the front → side lid renders with the chamfer
growing in on straight edges and no wobble. That reads as a rotation, which neither the
double-exposure crossfade nor the flip-book cut does — and it is the strongest form of the
360-swapper idea regardless of which package supplies the interpolation.

**Lottie deserves its own line, because it is the obvious answer and it does not fit.** It is the
industry format for *supplied* vector animation with large free asset libraries — squarely on the
"user-supplied assets" thesis. Measured: its SVG renderer scrubs deterministically via
`goToAndStop(f, true)` and the painted state does survive `innerHTML`. But it **crashes in jsdom** —
`getContext()` on a null canvas, a hard throw at load, not the silent no-op GSAP and Vivus give — it
costs 79 KB gzip, and it is *playback of After Effects output*, not choreography of a drawing we
were handed. It cannot serve the choreograph surface. It is worth reconsidering later as a separate
**import** feature ("place a supplied `.lottie`"), never as the engine.

**SMIL is the interesting near-miss.** `pauseAnimations()` + `setCurrentTime(t)` is a native,
deterministic, zero-byte scrub, and it works: computed opacity stepped 0 → 0.25 → 0.5 → 1 at
t = 0, 1, 2, 4, exactly linear. It fails on the poster contract for the same reason Motion does —
the animated value never reaches the serialized markup (`inSerialized: false`; the attribute stays
`null` while only the computed style moves). It is also barred by the other side of the house:
`<animate>` is on the strip list in the untrusted-SVG parse, deliberately, as uncontrolled motion
outside our timeline.

**Revised recommendation.** Unchanged for v1 — no engine, 2,226 B gzip. Morph is an **add-on
whose package follows the engine pick**: flubber if v1 stays engine-free, anime.js `morphTo` if
anime.js is adopted for `createDrawable` as well. Round two did not turn up a better painter; it
turned up the missing *primitive*, and part-level morph is that primitive.

---

## 11. The idea list, decomposed into primitives — the build order

Twenty candidate features were sorted against the primitives the bake-off actually measured.
`✅` built and measured · `◐` spec'd but unpainted, or needs migration · `✚` net-new.

Two facts frame the sort. **Input-verb parity is shipped** — every surface showing a slide takes
keyboard, wheel and touch through `lib/core/present-transport.mjs`, which also holds `zoomStep`
and `createZoomGesture` — but the **exported HTML player is deliberately one verb short**
(2026-08-10-input-verb-parity.md; export bytes need sign-off). And **no component has any
interactive chrome**: zero `tabindex` / `role="button"` / `aria-expanded` across every component
transform, so a scene's whole interaction surface is one play/pause button (`hydrate.ts:203`).
Every hover, click, drag and toggle below is therefore a new surface, not a wiring job.

| # | Idea | Decomposes into | Status |
|---|---|---|---|
| 6 | ViewBox panning | `camera` ✅ | Best ratio on the list — crisp at zoom, deterministic, poster-safe |
| 5 | Exploded views | `explode` ✅ | A **migration**: the verb is `built`-only today, so it moves to SVG groups |
| 15 | Step-by-step build | `draw`+`reveal-text`+`sequence` ✅ + slide-advance clock | Painting is done; the clock is the narrative step model (proposed, unbuilt) |
| 1 | 360 swapper | `angle-set` ✅ + `morph` ✅ + drag-scrub ✚ | Buildable now; drag-scrub follows the `createZoomGesture` pattern |
| 11 | Dark-mode inversion | — | **Already shipped** — HARD RULE #3 + `resolveColor` re-resolves on theme switch |
| 9 | Material injection | color ✅ / texture ✚ | Color half free; texture half reuses `--cat-N-texture`, never an injected `<image>` |
| 13 | Text-triggered highlight | `highlight` ✅ + term→part binding ✚ | Precedent in `chart-narration.js`, `svg-a11y-names.js`; authored version is print-safe |
| 12 | Measurement overlay | `getBBox` ✅ + line injection ✚ | Authored beats hover — then it survives print |
| 7 | Layer toggle | group visibility ✅ + checklist UI ✚ | Split: authored layer state per step is cheap, a live checklist is new chrome |
| 16 | Data-driven deformation | `fill` ◐ + data binding ✚ | Honest form is "animate our own charts" — the 07-19 highest-tractability on-ramp |
| 8 | X-ray slider | scrub ✅ + reveal mask ✚ + slider ✚ | A mask avoids injecting a `clipPath`, dodging most of the #22 work |
| 2 | Angle hotspots | `angle-set` ✅ + `camera` ✅ + hit-test ✚ | Needs the id-mapping pass anyway; reads as a product configurator |
| 3, 14 | Scroll-driven | `angle-set` / `draw` ✅ + scroll clock | Not Anima's — the step model already names scroll a driver; same feature as #15 |
| 20 | Heatmaps | `fill` ◐ + color ramp ✅ | Data-driven form works; click-frequency needs analytics a static deck cannot have |
| 19 | Focus blurring | dim ✅ / `feGaussianBlur` ✚ | Do the dim — a filter means injection into untrusted SVG *and* unpredictable rasterization |
| 4 | Gyroscope | `angle-set` ✅ + DeviceOrientation ✚ | ~20 lines, but an iOS permission flow that cannot be verified from here (#23) |
| 10 | Cursor lighting | — | **Cut** — fails the admission test; there is no cursor on a projected slide |
| 17 | Stateful UI morphs | `morph` ✅ | **Cut the use case, keep the primitive** — app chrome, not deck content |
| 18 | Magnetic connectors | — | **Cut** — a diagram canvas editor; mermaid already renders connected diagrams |

**Three conclusions.**

1. **The list is two products.** Six ideas are *deck motion* — a slide that assembles, a drawing
   that draws, a camera that moves (#5, #6, #12, #13, #15, #3/#14). They fit Lattice's grain and
   survive as a poster. Ten are *an interactive object viewer* (#1, #2, #4, #7, #8, #9, #10, #17,
   #19, #20) — a different artifact that happens to sit on a slide. Decide which ships first;
   they have different homes.
2. **Fourteen of twenty collapse to a still in PDF.** By design — but their value then lives on
   the docs site, present mode and the `--player` export, and the player is the surface
   deliberately short an input verb. A *shared* deck is the weakest surface for the most
   interactive half of the list.
3. **Build order: `camera` (#6), `explode` (#5), step-driven build (#15).** All three are measured,
   need no new interaction surface, no sanitizer work and no new UI — and together they cover the
   opening thesis: hand-draw an SVG, reveal text, animate a set.

---

## 12. Prototype — the whole motion set, on the Lattice logo

Built at `.scratch/logo-proto/`, driving `design/logo/lattice-lockup.svg` — a real supplied asset
with no ids, which is exactly the Bring on-ramp's starting condition.

**The id-mapping pass runs headless and is the piece that makes Bring work.** `prepare.mjs` takes
raw markup and returns addressable parts: it runs the #22 inert strip, groups stacked circles that
are visually one node (halo + fill + ring), tags roles, and orders everything center-out so a
`sequence` needs no hand-authored windows. On the lockup that is **22 parts — 12 bonds, 9 nodes, 1
label**, and it works in jsdom because element centers are read from the element's own attributes
rather than `getBBox()`.

**The scene uses every primitive the bake-off measured**: bonds `draw` center-out with real
per-element windows; nodes `reveal` with a scale overshoot as their bonds land; the `camera` pushes
into the center node's ring and pulls out to the full lockup; `highlight` swells the center node;
`explode` pushes every node out along its own radius and settles; and the wordmark reveals letter
by letter through `<tspan>` — the primitive both GSAP's and anime.js's SplitText destroy (§5). The
poster serializes to **5,470 bytes of vector**, which is what a PDF bakes.

**Four bugs the prototype caught that the synthetic harness could not.**

1. **`stroke-dasharray="1 0"`.** A finished stroke emitted a zero-length gap, which Chrome renders
   as a repeating dash under `stroke-linecap: round` — every bond in the logo came out dotted. Two
   causes at once: the epsilon was rounded away by a 3-dp formatter, and a zero gap is not a safe
   "solid". **A finished stroke must drop the attribute, not tend toward it.**
2. **"Center-out" measured from the wrong center.** The order radiated from the *viewBox* center,
   which on the lockup is `[235, 64]` — the middle of the wordmark — instead of the drawing's
   `[64, 64]`. The mark assembled right-to-left. The center has to come from the drawable
   geometry's own bounding box, and the fix is visible as the lockup's bond order becoming
   identical to the bare mark's.
3. **The poster sat on a transitional beat.** `hero` at 0.80 froze the print still mid-explode with
   the wordmark half-revealed — striking on screen, wrong on paper. **A hero must land on a
   resolved beat**, and nothing in the spec enforces that today.
4. **A group fade ghosts a punch-out.** Fading a node group as a unit let the bond show straight
   through the halo while it arrived, and the assembly read muddy. The halo has to lead the
   coloured fill. Generalized: **a supplied asset's occlusion is part of its meaning**, so a naive
   per-part opacity is not always the right reveal.

**And one finding for the sanitizer.** The mark's own dark-mode mechanism is a `<style>` block with
`prefers-color-scheme`, and the #22 inert parse **strips `<style>` wholesale** — deliberately, as
an `@import` beacon vector. So a supplied logo silently loses its dark-mode swap. The mark still
renders because every element also carries a hardcoded `stroke`/`fill` attribute, but the theme
response is gone. Any Bring path needs to either recover those rules into our own token mapping or
tell the author their asset's theming will not survive.
