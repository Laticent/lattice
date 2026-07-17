---
status: proposed
summary: >
  Anima — a pure, framework-free ANIMATION LIBRARY in the Cadenza/Vetrina mold, for refined
  3D/cartoon motion that enhances a slide. Three layers: (1) a DSL — three authoring forms
  (fluent `scene()` recorder · `storyboard` data · raw), all compiling to (2) a SPEC/IR — a
  medium-independent, pure-data scene graph + timeline that owns NO DOM and NO WebGL; its one
  idea generalizes Cadenza's "a timeline is data, the clock is someone else's" to "a scene is
  data, the RENDERER is someone else's" — the core turns time→SceneState (pure) and you inject a
  backend to paint it. (3) a RENDERER backend interface — a capability-advertising adapter
  (`caps`, `mount`, `draw(state)`, `poster(spec,t)`, `dispose`) that engines implement, so the
  engine is SWAPPABLE and MULTIPLE backends can consume one IR AT THE SAME TIME. Backends: Zdog
  (SVG, vector, themeable, posterizes — the CANONICAL/default, the only one that can paint the
  PDF poster per the CSS-3D-charts raster-pixelates finding); Three.js (WebGL, true-3D/GLTF,
  present-mode-only); PixiJS deferred. "Multiple engines at once" resolves honestly via capability
  negotiation into three in-scope shapes: different scenes on different backends, and one scene
  rendered by Zdog for the vector poster AND Three for the live view. The LLM authors the DSL/spec
  (DATA, never JS) — the HARD RULE #22 safety keystone and what makes LLM refinement pleasant;
  extends the AI-component transform-bearing #618 DSL track. Palette-blind (`--anima-*`/var(--token)).
  A thin `scene` component (imagery bucket) is ONE consumer, as Studio's demo consumes Vetrina.
  Library-shape-today / spin-off-later, boundary-gated (checkAnimaBoundary), per 2026-07-08. Design
  only; nothing built.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-06-19-css-3d-charts-feasibility.md
  - ./2026-06-29-ai-component-generation.md
---

# Anima — a pluggable-engine animation library for refined slide motion

**Date:** 2026-07-17 · **Status:** direction proposed; field spec + build staged.
**Working name:** *Anima* (Italian, and the root of *animation*) — final name is a naming call.
Alternatives weighed: `Scena`, `Moto`, `Diorama`.

## 1. The ask, restated as a library

The want: refined **cartoon-like and 3D** motion that enhances a slide, authored and
iterated **with an LLM** — and, crucially, built as a **real library** the way
**Vetrina** and **Cadenza** are, with **a DSL, a spec, and a lower-level engine that
can be swapped out or drive multiple engines at once** (Zdog, Three.js, Pixi …).

That reframing is the whole design. Anima is not "a component with a runtime
choice" — it is a **framework-free library** whose stable contract is a **spec + DSL**
and whose rendering **engine is a pluggable backend**. A `scene` component is just
*one consumer* of it, exactly as the Studio demo consumes Vetrina and read-aloud
consumes Cadenza. This ADR supersedes the component-only framing of the first draft.

The admissibility question — does a boardroom-PDF engine that bans "wizbang" get to
have animation at all — is settled the same way as before and restated in §11: motion
is admitted only when it is **declared, from a small typed vocabulary, meaning-bearing,
and losslessly degradable to a static poster** (narrative-step model §8). The library
*is* the mechanism that enforces that discipline.

## 2. What Cadenza and Vetrina taught us — the house library shape

Both are **pure, self-contained, framework-free** cores, boundary-gated
(`checkCadenzaBoundary` / `checkVetrinaBoundary` bar any import outside `./`), with a
README, a barrel `index.ts`, standalone unit tests, and a spin-off path
(`2026-07-08-library-shape-cadenza-vetrina.md`). Anima copies this shape wholesale.
Two of their ideas are load-bearing here:

- **Cadenza's one idea — "a timeline is data; the clock is someone else's."** Cadenza
  emits plain data (a caption track) and reads a **clock the consumer injects**, which
  is precisely what lets *one* engine serve every surface (silent read-along, TTS,
  scrub). Anima **generalizes this to the renderer**: the core emits a scene + timeline
  as data and reads a **renderer the consumer injects**. Inject a clock *and* a
  backend, and one scene paints anywhere, on any engine. (§4 is this idea in full.)
- **Vetrina's "three ways to author, one engine."** Vetrina compiles a fluent
  `scene()` recorder, a `storyboard` data form, and a raw primitive all down to one
  `Walkthrough` type. Anima's DSL copies this exactly: three authoring forms, one spec
  (§6). Vetrina also proves the pieces Anima needs: a **frozen, gated vocabulary** (its
  five-gesture alphabet — "a new one must earn a new meaning"), a **CSS-first token
  contract** (`--vt-*`), a **three-tier reduced-motion policy**, and **adapters as
  sanctioned peer-deps** (its `react.ts`, allowlisted, not in the zero-dep index) —
  the model for Anima's engine adapters.

## 3. The three layers

```
 authoring ─────────────────────────────────────────────────────────────
   DSL        scene() fluent  ·  storyboard(data)  ·  raw            (§6)
                 │  all three compile to ↓
 contract ──────────────────────────────────────────────────────────────
   SPEC / IR   a pure-data scene graph + timeline — NO DOM, NO WebGL   (§5)
                 core:  compile(spec) → timeline ;  timeline.at(t) → SceneState
                 │  inject a backend to paint a SceneState ↓
 engine ────────────────────────────────────────────────────────────────
   RENDERER    caps · mount · draw(state) · poster(spec,t) · dispose   (§4)
   backends    Zdog (vector, poster)  ·  Three (live 3D)  ·  Pixi (later)
```

The layers are the whole point of the ask: the **DSL** and the **SPEC** are the stable
contract; the **RENDERER** is swappable and multi-instance. Everything above the spec
is medium-independent; everything below it is an engine detail.

## 4. The one idea — inject the renderer (so engines swap AND coexist)

The core is **pure**: it compiles a spec to a timeline and answers `timeline.at(tMs)`
with a **`SceneState`** — a normalized, engine-neutral description of where every part
sits at time `t` (transforms, colors-as-tokens, visibility). It touches **no DOM and no
GPU**. Painting is a **`Renderer` you inject**:

```ts
import { compile } from './anima';
import { zdogRenderer } from './anima/backends/zdog';

const timeline = compile(sceneSpec);          // pure data — spec → IR + timeline
const r = zdogRenderer();                      // pick ANY backend
r.mount(hostEl);
function frame(nowMs) {                         // the host owns the loop + clock (Cadenza's move)
  r.draw(timeline.at(nowMs));                   // paint one time-slice
  requestAnimationFrame(frame);
}
```

Because a `SceneState` is engine-neutral data, **any** conforming backend can paint it,
and **several can paint the same timeline at once**. That is the mechanism behind
"swap the engine / run multiple engines." The `Renderer` contract:

```ts
interface Renderer {
  readonly caps: RendererCaps;              // what this engine can do — see §4.1
  mount(host: Element): void;               // attach its surface (an <svg>, a <canvas>…)
  draw(state: SceneState): void;            // paint one time-slice (called per frame)
  poster(spec: Scene, t: number): Poster;   // a DETERMINISTIC still at hero-time t
  dispose(): void;
}
```

### 4.1 Capability negotiation — the honest core of "multiple engines"

Engines are **not interchangeable in what they can do**, and pretending otherwise is
where a naive "pluggable renderer" design fails. Each backend advertises `caps`:

```ts
type RendererCaps = {
  vector: boolean;    // paints resolution-independent output (SVG)
  poster: boolean;    // can produce a crisp poster fit for the canonical PDF path
  true3d: boolean;    // real depth/lighting, not projected pseudo-3D
  gltf: boolean;      // can load external 3D model assets
  live: boolean;      // animates on an interactive surface
};
```

The library **validates the spec against the chosen backend's caps** and fails loudly
on a mismatch (a `gltf`-bearing spec on a backend without `gltf`; a request for a
vector poster from a raster-only backend). This turns "multiple engines" from a vague
promise into a checked contract, and it is what lets the poster/live split (§7) be
expressed cleanly as *two backends, chosen by capability*.

## 5. The spec / IR — the medium-independent contract (shape sketch)

The spec is **data**, the way Cadenza's `CaptionTrack` is data. Illustrative; the field
grammar is the impl ADR's:

```yaml
scene:
  hero: 0.4                      # the poster time t∈[0,1] — the frame a still freezes
  camera: { rotate: [-0.3, 0.6, 0] }
  parts:
    - id: rotor
      shape: cone                # a CLOSED, typed primitive set
      color: var(--accent)       # token ref, resolved at paint — no hex (#3)
      at: [0, -20, 0]
      motion: { spin: y, period: 6s }     # CLOSED typed vocab: spin/orbit/bob/reveal/sequence
    - id: body
      shape: roundedRect
      color: var(--cat-2-mark)
      motion: { bob: 8, period: 3s }
```

Invariants the grammar enforces (all echoing the house discipline): a **closed
primitive + motion vocabulary** (no arbitrary keyframes/easing — pick a *role*, like
`--fs-*` type), a **declared `hero` time** (so the poster is deterministic), **token-only
colour**, and a **deterministic core** (no `Math.random`/wall-clock inside `compile`/
`at` — a spec renders one reproducible poster, required by the byte-stable export gate).

## 6. The DSL — three authoring forms, one spec (Vetrina's shape)

```ts
// fluent recorder — hand authoring
const s = scene()
  .part('rotor', { shape: 'cone', color: 'var(--accent)' }).spin('y', '6s')
  .part('body',  { shape: 'roundedRect', color: 'var(--cat-2-mark)' }).bob(8, '3s')
  .hero(0.4)
  .build();          // ≡ the storyboard data below

// storyboard data — generated / serialized (what the LLM emits, §8)
storyboard({ hero: 0.4, parts: [ /* … */ ] });
```

Both compile to the §5 spec; a raw spec object is the total primitive. This is exactly
Vetrina's `scene()` / `storyboard` / raw trichotomy — the fluent form for humans, the
data form for generation and round-tripping, the raw form as the escape hatch.

## 7. The static path is a backend CAPABILITY — vector poster, canonical

Settled by `2026-06-19-css-3d-charts-feasibility.md` §5 and the `video` poster
precedent: the exported PDF/PPTX shows a **poster** — a still at the declared `hero`
time — and it must be **vector wherever it is canonical**, because zooming a PDF keeps
SVG razor-sharp while any **raster/WebGL frame pixelates** to a fixed bitmap. Under
`prefers-reduced-motion`, live surfaces show the poster too.

In this library that constraint is **just a capability**: `poster: true` requires
`vector: true`. So:

- **Zdog** (`vector`, `poster`) paints the **canonical poster** and can also run live.
- **Three.js** (`true3d`, `gltf`, `live`, **not** `poster`) is **present-mode-only**;
  its still is either a rasterized lower-fidelity preview (flagged) or an author-supplied
  vector `poster` override (the same escape hatch `video` gives Instagram).

### 7.1 "Multiple engines at the same time" — the three in-scope shapes

1. **Different scenes, different backends** in one deck — scene A on Zdog, scene B on
   Three. Falls straight out of the adapter model.
2. **One scene, two backends for two purposes** — Zdog renders the **vector poster**
   (canonical, for the PDF) while Three renders the **live** view (present mode). This
   is the poster/live split expressed as capability-routed multi-backend, and it is the
   cleanest answer to the ask: the *same spec*, painted by the engine each surface needs.
3. **Layered co-render (GATED, later)** — Zdog vector foreground composited over a Three
   WebGL background in one scene. Powerful but real work (z-order across a vector +
   GPU layer, shared camera); staged, not v1.

## 8. LLM authoring — the model emits the DSL/spec, never code

Unchanged from the first draft and now the library's front door. The model proposes a
**schema-validated declarative spec** (the storyboard data form, §6); the **vetted,
library-owned core** (`compile`) interprets it; a backend paints it. No LLM-authored
JavaScript ever reaches a renderer.

- **HARD RULE #22** — the Studio renders untrusted decks into a same-origin `srcdoc`
  iframe; LLM-written engine JS is arbitrary code execution → key theft. A spec is data:
  schema-validated, no `eval`, no remote fetch, size-capped, exfil-scanned (the
  `findCssExfil`/`findSkeletonHtml` analog for the scene payload).
- **The proven Lattice shape** — "model proposes within a tight contract; deterministic
  code disposes" (Theme-AI #613; **AI component generation** `2026-06-29`). That ADR's §9
  routes *transform-bearing / behavioral* components to the closed **#618 DSL** (safe
  `match→do`, closed registry, **no user JS**). **A scene is transform-bearing** — Anima
  *is* the scene chapter of that DSL track, inheriting its safety envelope.
- **Why iteration is pleasant** — the spec is small, diffable, human-readable data.
  "Tilt the drone 10° more and recolor the rotor to the accent" is a two-field edit the
  model or a human makes and the schema validates — not a re-generated code blob.

## 9. Theming — palette-blind, CSS-first (Vetrina's `--vt-*` model)

Every colour in a spec is a **`var(--token)`** reference resolved at paint (HARD RULE
#3): surface/ink tokens for form, `--accent` for the one emphasis, `--cat-1..12` for
categorical parts. The library's own chrome (controls, poster matte) is a validated
`--anima-*` token contract exactly like `--vt-*` — host CSS restyles it, light/dark for
free, and any `url()`/`image()`/control-char token value is rejected (token values are
host-trusted, never wire/AI content — Vetrina's rule).

## 10. The `scene` component — one thin consumer

The component is small: `imagery` bucket (beside `video`/`image`, reusing its poster +
`companion`/`gallery` compositions). Its transform hands the authored spec to Anima,
mounts the capability-appropriate backend for the surface, and wires the poster into the
PDF path. All the animation logic lives in the library; the component is glue — the way
`use-studio-demo.ts` is glue over Vetrina. Anima can equally back a future Studio "scene
inspector," a docs-site interactive, or a standalone export, without touching the engine.

## 11. Where it lives, library-shape, spin-off later

Follows `2026-07-08-library-shape-cadenza-vetrina.md` step for step:

- **Home:** `docs/src/lib/anima/` — pure, framework-free, `node:`+relative imports only,
  barrel `index.ts`, README, per-module unit tests (`*.test.ts`, vitest).
- **Boundary gate:** `checkAnimaBoundary` in `tools/check-ownership.js` — no import
  outside `./` fails the build. This is the spin-off contract.
- **Engine adapters are sanctioned peer-deps** — the `three` backend imports `three` (a
  heavy external) only in `backends/three.ts`, allowlisted (`ANIMA_ADAPTER_DEPS`, the
  `VETRINA_ADAPTER_DEPS` pattern). The **Zdog backend is bundled** (tiny, and it is the
  canonical/poster path, so it can't be optional). The pure core stays zero-dep.
- **The poster runs where slides render** — the existing export pipeline renders slides
  in headless Chromium, so the Zdog backend paints the poster SVG in-page like charts do;
  no Node-native graphics needed. When the export pipeline (root CJS) needs to drive it
  directly, Anima gets the same **workspace + CJS `dist/`** treatment the library-shape
  ADR gives Cadenza.
- **Spin-off** = move the dir out + `npm publish`, later, deliberately.

## 12. The discipline — anti-wizbang, enforced by the DSL

The library is the enforcement mechanism for narrative-step §8. Motion is admitted only
when declared, from the closed vocabulary, meaning-bearing, and poster-degradable.

### 12.1 Banned by construction (if any appears, the feature failed)

- **No per-keyframe / timeline-editor authoring** — you declare parts + typed motion
  roles, never hand-animate frames (narrative-step §8.1's "no animation pane").
- **No entrance/exit spectacle** (fly-in, bounce, spin-on-reveal, typewriter, star-wipe)
  — motion describes the *object*, not a slide transition.
- **No decorative particle storms / confetti / physics playground** — the PixiJS niche
  §7 defers; adopting a raster engine for spectacle is exactly the line.
- **No autoplay audio; no motion that can't reduce to the poster.**
- **No arbitrary user JS** — the §8 spec boundary is absolute.
- **"Cartoon" = illustration, not cartoonish effects.** A clean Zdog object is in scope;
  a mascot doing a backflip on entry is the banned bundle in a costume. This is the
  riskiest edge — the meaning-bearing gate + human review hold it.

### 12.2 Reduced motion — Vetrina's three-tier policy

`prefers-reduced-motion` targets *vestibular* motion, not content the viewer reads by.
Anima adopts Vetrina's `full` / `legible` / `still` tiers: `legible` suppresses
sweeping camera orbits/parallax but may keep a gentle, meaning-bearing reveal; `still`
collapses to the poster. `system` resolves a reduced-motion device to `legible` (or, for
a scene whose whole content *is* vestibular, to the poster).

## 13. Honest risk read

- **The renderer abstraction can leak.** A single `SceneState` that must paint on both
  pseudo-3D vector (Zdog) and true-3D GPU (Three) will not express *everything* both can
  do; the IR must target the **honest intersection** for portable scenes and gate
  engine-specific richness behind `caps`. Capability negotiation (§4.1) is the release
  valve, but the IR design is the hard part — call it the make-or-break, like Cadenza's
  spoken/display split.
- **Aesthetic drift toward spectacle** — the "cartoon" pull. Held by §12 + human review.
- **Three.js weight** — ~600KB and a raster poster. Mitigation: ship **Zdog-only first**;
  Three is a gated later tier that must earn its weight with a real meaning-bearing case.
- **Scope creep into a general animation engine.** Anima is for *slide-enhancing,
  poster-degradable* motion — not a game loop or a motion-graphics tool. The closed
  vocabulary and the poster requirement are the fence.

## 14. Staged plan (each its own increment / branch — HARD RULE #17)

1. **The pure core** — the spec schema, `compile` → timeline, `timeline.at(t)` →
   `SceneState`, the closed vocabulary. Zero deps, boundary-gated, unit-tested. No
   backend yet (test against the data).
2. **The Zdog backend** — `caps:{vector,poster,live}`, `mount/draw/poster/dispose`;
   deterministic vector poster. This alone makes a hand-authored scene render live +
   poster.
3. **The `scene` component** (imagery) — spec → Anima → poster wired into the PDF path;
   demo deck (#9); dark+light **export sign-off** (QUALITY BAR).
4. **Reduced-motion + present-mode wiring** — the three tiers; live on HTML export +
   Studio present, poster on PDF and `still`.
5. **The DSL fluent recorder + the LLM authoring loop** — `scene()`; the Anima
   knowledge-file + generator extending the component-generator contract; a frozen
   adversarial prompt set incl. a *decline* case (banned spectacle refused) and a
   *poster-determinism* case.
6. **The Three.js backend** (GATED, may be cut) — `caps:{true3d,gltf,live}`, present-only,
   raster-or-override poster; capability negotiation enforced. Ships only if a real case
   earns the weight.
7. **Library-shape packaging** (workspace + CJS `dist/`) if/when the root export pipeline
   must drive Anima directly — per the 2026-07-08 recipe. **Layered co-render (§7.1.3)**
   remains a deferred, gated experiment.

## 15. Open questions (impl ADR)

- The `SceneState` IR — the exact engine-neutral intersection, and how `caps` gate the
  engine-specific extras (the §13 make-or-break).
- The closed primitive + motion vocabulary (which Zdog shapes; the motion roles + params).
- Present-mode integration — does a scene animate on slide-enter, on narrative-step
  advance (`2026-06-16-narrative-step-model.md` — a scene is a candidate steppable unit),
  or on a control?
- GLTF import — in scope for the Three tier v1, or Zdog-authored geometry only?
- The Anima knowledge-file's worked examples (the make-or-break generator deliverable,
  per component-generator §4.8).

## 16. Relationships

- **Copies the library shape of** `2026-07-05-vetrina-walkthrough-library.md` and
  `2026-07-07-cadenza-caption-timeline.md`; **packages per**
  `2026-07-08-library-shape-cadenza-vetrina.md`.
- **Generalizes Cadenza's injected clock to an injected renderer** (§4).
- **Extends** `2026-06-29-ai-component-generation.md` §9 — the transform-bearing / #618-DSL
  track; inherits its propose-within-a-contract architecture and safety envelope.
- **Applies** `2026-06-19-css-3d-charts-feasibility.md` §5 — vector-vs-raster / PDF-zoom
  is why `poster` requires `vector`, Zdog is canonical, and Three is present-only.
- **Governed by** `2026-06-16-narrative-step-model.md` §8 (anti-wizbang); a scene is a
  candidate steppable unit under §2.
- **Bound by** HARD RULES #3 (tokens), #15 (don't multiply runtimes — Pixi deferred, not
  reflexively adopted), #22 (no user JS in the preview frame), #9 (demo deck), and the
  QUALITY BAR export sign-off.

## 17. Gates (for each increment when it lands)

Deterministic poster (byte-stable for an unchanged spec); `tools/pixel-check.js` on the
poster; dark+light export sign-off; reduced-motion verified on the **real** live surface
(HARD RULE #23 — not a harness); schema-validation + scene-exfil + size-cap tests; the
`checkAnimaBoundary` import gate green; lint · `build:check` · unit · integration green;
maker-checker on the core + each backend (an engine transform = real blast radius, HARD
RULE #25).
