---
status: proposed
summary: Anima — a SERIOUS animation capability (not a gimmick), where motion must carry information a STILL FRAME CANNOT (geometry you must rotate to read, a sequence/causality that only unfolds in time, or a quantity bound to real data) — never bouncing-ball ornament. Three pieces on architecture that already exists: (1) the ANIMA LIBRARY — a pure, framework-free engine in the Cadenza/Vetrina mold with a DSL, a medium-independent SPEC/IR, and a PLUGGABLE capability-negotiated renderer with TWO first-class vector/poster engines on the canonical path — Zdog (builds flat-3D shapes) and Vivus.js (draws SVG line-art stroke-by-stroke) — plus Three.js present-mode-only for true-3D/GLTF (raster) and Pixi deferred, whose one idea generalizes Cadenza's "the clock is someone else's" to "the RENDERER is someone else's"; (2) an ANIMATION ASSET (kind:'scene') — a serialized scene spec you CREATE, TUNE, SAVE, and SHARE exactly like a kind:'theme' or kind:'component' asset (asset-bundle.ts / asset-store.js), authored by the LLM-plus-human loop the theme & component generators already prove; (3) ONE HOST COMPONENT (imagery bucket) framing a scene asset with variants mirroring the image component (clean/split/spotlight/gallery/statement/mirror) — asset is the payload, component is the frame. Static PDF/PPTX gets a deterministic VECTOR poster (CSS-3D-charts raster-pixelates finding); reduced-motion → poster. LLM authors DATA (the spec), never JS (HARD RULE #22); palette-blind. Ornament banned by the "information a still cannot carry" test. Design only; nothing built.
companion:
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-05-vetrina-walkthrough-library.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
  - ./2026-06-19-css-3d-charts-feasibility.md
  - ./2026-06-29-ai-component-generation.md
---

# Anima — a serious animation capability: a library, an asset, and a host

**Date:** 2026-07-17 · **Status:** direction proposed; field spec + build staged.
**Working names:** the **library** = *Anima*; the fabricated **asset** = a *scene* (`kind:'scene'`);
the **host component** = `scene`. All three are naming calls (alternatives: `Moto`, `Diorama`).

## 1. The ask, and the bar

Refined 3D/cartoon motion that **enhances** a slide — but a **serious feature, not a gimmick**:
genuinely useful, no bouncing balls. And it must fit how Lattice already works:

1. an **animation is a fabricated asset** you **create, tune, save, and reuse** — the same
   lifecycle as a theme or a component, authored with an LLM;
2. a **component hosts** that asset, and (for now) there is **one** host with **variants like the
   `image` component** — the asset is the payload, the component is the frame;
3. it is built as a real **library** (a DSL, a spec, a swappable/multi lower-level engine), the way
   **Vetrina** and **Cadenza** are.

§2 sets the utility bar (what makes it serious). §3 names the three pieces. §4–13 build them.

## 2. The utility thesis — motion must carry information a still cannot

This is the whole difference between a serious feature and a gimmick, and it is the **admission
test** for every scene:

> **A scene earns its motion only when the motion IS the information.** If a single still frame
> conveys the same thing, it must *be* a still — use `image` or `diagram`. Motion is justified only
> when it carries what a frame cannot: **geometry you must rotate to read, a sequence or causality
> that only unfolds over time, or a quantity bound to real data.**

That test yields the **serious use classes** Anima is built for — each a real boardroom need:

- **Explanatory 3D of a real object** — rotate/expose a product, device, part, or site so the
  room understands its *form and structure*: what's on the back, how it's held, how big it is. (A
  hardware or med-device pitch, a building massing, a deep-tech component.) The rotation shows
  geometry a photo can't.
- **Mechanism / process in motion** — *how a thing works*: a pump cycle, an assembly sequence, a
  data path through a system, a state machine advancing. The **sequence and causality are the
  content**; a still can only freeze one instant of it.
- **Data-bound motion** — geometry driven by **real numbers**: a vessel filling to a measured
  capacity, an orbit at true parameters, a load deforming a part to a modeled stress. The motion
  *encodes* the data (the honest cousin of a chart, for spatial/physical quantities).
- **Structure pulled apart** — an **exploded view** or a layered stack separating so the room can
  read how parts or tiers compose. Motion clarifies 3D structure that flattens in a still.
- **A figure or path drawn in sequence** — a schematic assembling stroke-by-stroke, a route or
  boundary tracing across a map or plan, a geometric/mathematical construction built in order, a
  signature signing. The **drawing order is the information**: it walks the eye along the
  construction and shows *how the figure is built*, which a finished still flattens. (Vivus.js's
  home — §7.)
- **An honest transformation** — a real before→after change made legible (a site pre/post build; a
  shape deforming to represent a modeled change). The meaning-bearing morph, never a slide effect.

Everything outside that test is **ornament and is banned** (§12): bouncing balls, drifting
particles, mascots, spin-for-spin's-sake, entrance flourishes, ambient loops with no referent. The
"cartoon" register is welcome as a *refined illustration style* (clean, flat-shaded, Zdog-like) —
never as *cartoonish antics*. Serious content, tastefully drawn; not a toy.

## 3. The three pieces (and how they map to what exists)

```
  ANIMA (library)          fabricates + renders          §5–8
     │  produces / tunes / renders ↓
  a SCENE ASSET  (kind:'scene')                           §4
     │  a serialized scene spec + poster + metadata
     │  created·tuned·saved·shared like a theme/component asset
     │  referenced by ↓
  the `scene` COMPONENT  (imagery bucket)                 §9
        frames the asset with image-like variants
        (clean · split · spotlight · gallery · statement · mirror)
```

The split is the point of this revision: an animation is **not baked into a component**. It is an
**asset** the library fabricates and a **component** merely frames — exactly as an *image* is an
asset the `image` component frames, and a *theme* is an asset a deck applies. This puts Anima on the
**same rail as the Theme-AI and Component-AI**, not a bespoke path.

## 4. The scene ASSET — a fabricated asset like a theme or a component

Lattice already has a fabricated-asset model, and this slots straight into it. `kind:'theme'` and
`kind:'component'` assets are created/tuned in the Studio, saved to a shared local library that
survives reload (`docs/src/playground/asset-store.js`), and shared as `.lattice-*.zip` bundles
(`docs/src/components/studio/asset-bundle.ts`, `ASSET_FORMAT`). The theme bridge emits a
`kind:'theme'` record (`lib/theme/serialize.js`); the component bridge a `kind:'component'` one
(`lib/layout/scaffold.js`).

**A scene is a new `kind:'scene'` asset on that same rail:**

- **Payload:** a serialized **scene spec** (§6, the Anima DSL/IR as data) + a **poster** (the
  deterministic still, §7) + metadata (name, tags, the `caps` it requires).
- **Create + tune:** in a Studio surface (a "scene inspector," sibling to the theme and component
  studios) — the LLM drafts a spec from a prompt; the human **tunes** it by editing typed spec
  fields or nudging DSL controls, re-rendering live (§8). Tuning *a saved asset* is the headline of
  the ask ("create and tune"); because the spec is data, tuning is editing a contract, not code.
- **Save + reuse:** it joins the shared asset library (`kind:'scene'`) and is usable across the
  author's decks and shareable via a `.lattice-scene.zip` bundle — one asset, many slides.
- **Graduate:** promoting a scene into the shipped set is the same deliberate, human, post-review
  step every asset takes (HARD RULES #8/#9) — AI authorship bypasses no gate.

`asset-bundle.ts`'s `AssetManifest.kind` union and the `asset-store` kinds gain `'scene'`; the
bundle carries the spec + poster. This is an additive extension of a proven store, not a new one.

## 5. The ANIMA library — pure core, pluggable engine (Cadenza/Vetrina shape)

Anima is the engine that **fabricates and renders** the asset. It copies the house library shape
wholesale: pure, framework-free, self-contained, boundary-gated (`checkAnimaBoundary` bars any
import outside `./`), a barrel `index.ts`, per-module unit tests, a README, a spin-off path
(`2026-07-08-library-shape-cadenza-vetrina.md`). Three layers:

```
 DSL        scene() fluent · storyboard(data) · raw     — three ways, one spec  (§6)
              │ all compile to ↓
 SPEC / IR   a pure-data scene graph + timeline — NO DOM, NO WebGL              (§6)
              │ core: compile(spec) → timeline ; timeline.at(t) → SceneState
              │ inject a backend to paint a SceneState ↓
 RENDERER    caps · mount · draw(state) · poster(spec,t) · dispose              (§5.1)
 backends    Zdog (build·vector·poster) · Vivus (draw·vector·poster) · Three (live·3D·raster) · Pixi (later)
```

### 5.1 The one idea — inject the renderer (so engines swap AND coexist)

The core is **pure**: `compile(spec)` → a timeline; `timeline.at(tMs)` → a **`SceneState`**, a
normalized, engine-neutral snapshot (transforms, token colors, visibility). It touches **no DOM and
no GPU**. Painting is a **`Renderer` you inject** — generalizing Cadenza's *"a timeline is data;
the clock is someone else's"* to *"a scene is data; the **renderer** is someone else's."* Because a
`SceneState` is data, any conforming backend can paint it, and several can paint one timeline at
once.

```ts
interface Renderer {
  readonly caps: RendererCaps;              // { vector, poster, draw, true3d, gltf, live }
  mount(host: Element): void;
  draw(state: SceneState): void;            // one time-slice, per frame (host owns the clock+loop)
  poster(spec: Scene, t: number): Poster;   // a DETERMINISTIC still at hero-time t
  dispose(): void;
}
```

**Capability negotiation** is the honest core of "multiple engines": each backend advertises
`caps`; the library validates a spec against the chosen backend and **fails loudly** on a mismatch
(a `gltf` spec on a backend without it; a vector-poster request to a raster-only engine; a
`draw`/`source: svg` spec on an engine that only builds primitives). That makes "swap / run multiple
engines" a *checked contract*, and it lets the poster/live split (§7) be expressed as **backends
chosen by capability** — e.g. Zdog or Vivus paints the canonical vector poster while Three paints the
live view, from the *same* asset. A backend's `caps` also records its **source model**: Zdog/Three
**build** geometry from the spec's primitives; **Vivus ingests an authored SVG** (`source: svg`) and
animates its stroke — the same timeline, a different way in.

## 6. The DSL + spec — three authoring forms, one asset (Vetrina's shape)

The spec is **data** (like Cadenza's `CaptionTrack`). Three authoring forms compile to it — a
fluent `scene()` recorder (hand authoring), a `storyboard` data form (what the LLM emits and what
the asset serializes), and a raw spec object (the escape hatch) — Vetrina's "three ways, one
engine." Illustrative shape:

```yaml
scene:
  hero: 0.4                      # the poster time t∈[0,1] — the frame the still freezes
  camera: { rotate: [-0.3, 0.6, 0] }
  parts:
    - id: rotor
      shape: cone                # a CLOSED, typed primitive set
      color: var(--accent)       # token ref, resolved at paint — no hex (#3)
      motion: { spin: y, period: 6s }   # CLOSED typed vocab: spin/orbit/sequence/fill/explode/reveal
```

Invariants the grammar enforces, each echoing the house discipline and §2: a **closed primitive +
motion vocabulary** whose verbs map to the *serious* classes (`orbit`/`spin` = explanatory 3D;
`sequence` = mechanism; `fill`/`trace` = data-bound; `explode` = structure) — **no arbitrary
keyframes/easing** (pick a *role*, like `--fs-*` type); a **declared `hero` time** (deterministic
poster); **token-only colour**; and a **deterministic core** (no `Math.random`/wall-clock in
`compile`/`at`, so an asset renders one reproducible poster — required by the byte-stable export
gate).

A part's geometry arrives one of two ways, recorded in the backend's `caps` **source model**: it is
either **built** from the closed primitive set (Zdog shapes, a Three model) or **ingested** as
authored SVG line-art (`source: svg`) whose *stroke* the drawing verbs animate (Vivus). The IR spans
both; a spec that names `source: svg` requires a backend with the `draw` capability (§5.1).

## 7. The static path is a backend CAPABILITY — vector poster, canonical

Settled by `2026-06-19-css-3d-charts-feasibility.md` §5 + the `video`/`image` precedent: the
exported PDF/PPTX shows a **poster** (a still at the `hero` time), and it must be **vector where it
is canonical**, because a zoomed PDF keeps SVG razor-sharp while any **raster/WebGL frame
pixelates**. Under `prefers-reduced-motion`, live surfaces show the poster too. In the library this
is *just a capability*: `poster: true` ⇒ `vector: true`. **Two first-class vector engines anchor the
canonical path**, each poster-capable; the raster engine is the present-only outlier:

- **Zdog** (`vector, poster, live`) **builds** and rotates flat-3D shapes; paints the **canonical
  poster** and runs live — the default for the explanatory-3D / structure classes.
- **Vivus.js** (`vector, poster, draw, live`) **draws** authored SVG line-art stroke-by-stroke — a
  **first-class canonical engine, not a flourish tier**: SVG in, so its poster is the finished
  drawing, crisp at any PDF zoom. It owns the *drawn-figure* class (§2) — a diagram assembling, a
  route tracing, a construction built in order. Its source is an ingested SVG (`source: svg`), and it
  needs *strokable* line-art, not flat fills (§13).
- **Three.js** (`true3d, gltf, live`, **not** `poster`) is **present-mode-only**; its still is a
  rasterized lower-fidelity preview (flagged) or an author-supplied vector `poster` override (the
  escape hatch `image`/`video` already give).

The **scene asset carries its poster**, so the `image`-style host (§9) frames a scene exactly as it
frames a photo, and the PDF path is unchanged plumbing.

## 8. Authoring & tuning — the LLM emits/edits the spec, never code

The create-and-tune loop is the component-generator flow (`2026-06-29` §7) with a scene-shaped
knowledge file:

```
describe → model proposes {scene spec}   (Anima knowledge-file in context)
        → schema-validate + scene-exfil scan + size cap + caps check
            ├─ clean → render live + poster → human review (the utility gate) → SAVE as kind:'scene'
            └─ fail  → show findings → regenerate
tune    → edit spec fields / DSL controls (human or model) → re-validate → re-render → re-save
```

- **HARD RULE #22 (the keystone).** The Studio renders untrusted decks into a same-origin `srcdoc`
  iframe; LLM-written engine JS is arbitrary code execution → key theft. A spec is **data**:
  schema-validated, no `eval`, no remote fetch, size-capped, exfil-scanned. The vetted,
  library-owned `compile` interprets it; a backend paints it. **No LLM JS ever reaches a renderer.**
- **The proven shape.** "Model proposes within a tight contract; deterministic code disposes"
  (Theme-AI #613; Component-AI `2026-06-29`, whose §9 routes *transform-bearing/behavioral*
  components to the closed **#618 DSL** — a scene **is** transform-bearing, so Anima is that DSL's
  scene chapter, inheriting its safety envelope).
- **Why tuning is pleasant** — the spec is small, diffable data. "Rotate the device 15° more, slow
  the cycle to 8s, recolor the housing to `--accent`" is a three-field edit the human or model
  makes and the schema validates — the literal "tune the asset" of the ask.

## 9. The host `scene` COMPONENT — an `image`-shaped frame

One component (imagery bucket, beside `image`/`video`), deliberately **thin**: it references a scene
asset and **frames** it. It mirrors `image` — *the layout reads the asset and resolves the
composition; name a variant to override* — so an author already fluent in `image` knows it:

| `scene` variant | mirrors `image` | Frame |
|---|---|---|
| `clean` | clean | floated card sized to the scene, caption chrome dropped |
| `split` | split | the scene takes its own column, argument alongside |
| `spotlight` | spotlight | full-bleed; message rides a solid card |
| `gallery` | gallery | contained on a matte with a placard — the exhibit |
| `statement` | statement | full-bleed + scrim + title hero |
| `mirror` | mirror | flips the scene to the other side |

Slots mirror `image`: the **scene asset** (referenced like `![scene](asset-id)` — resolved to the
Anima mount, not an `<img>`), an optional **heading** (the so-what), an optional **body/caption**.
All motion logic lives in the library + the asset; the component is glue — the way `use-studio-demo`
is glue over Vetrina. A second host later (e.g. a `compare` that seats two scenes) is additive and
out of scope now (HARD RULE #17: one host, one PR).

## 10. Theming — palette-blind, CSS-first (Vetrina's `--vt-*` model)

Every colour in a spec is a **`var(--token)`** reference resolved at paint (HARD RULE #3): surface/
ink for form, `--accent` for the one emphasis, `--cat-1..12` for categorical parts. The library's
own chrome is a validated `--anima-*` token contract like `--vt-*`; host CSS restyles it, light/dark
for free, and `url()`/`image()`/control-char token values are rejected (host-trusted, never wire/AI
content). A scene asset **recolors with the theme** — the same asset reads correctly in every theme
and the a11y/CVD palettes.

## 11. Library shape, spin-off later

Follows `2026-07-08-library-shape-cadenza-vetrina.md`: home `docs/src/lib/anima/`, pure and
framework-free (`node:`+relative only), `checkAnimaBoundary` gate = the spin-off contract. The
**Three backend imports `three` only in `backends/three.ts`**, allowlisted (`ANIMA_ADAPTER_DEPS`,
the `VETRINA_ADAPTER_DEPS` pattern); the **Zdog and Vivus.js backends are bundled** (both tiny, zero-dependency, SVG — the canonical
poster path). The poster renders where slides render (headless Chromium), so Zdog paints the poster
SVG in-page like charts do — no Node-native graphics. When the root export pipeline must drive Anima
directly, it gets the same **workspace + CJS `dist/`** treatment as Cadenza. Spin-off = move the dir
out + `npm publish`, later.

## 12. Discipline — the "information a still cannot carry" test, enforced

§2 *is* the anti-wizbang line (narrative-step §8) sharpened for this feature. The library enforces
it: the motion vocabulary is **closed** and its verbs map to the serious classes; there is no
free-easing/keyframe surface to build ornament with.

### 12.1 Banned by construction (if any appears, the feature failed)

- **No motion a still could replace** — the §2 test; if one frame carries it, it's an `image`.
- **No bouncing-ball / particle / mascot / ambient-loop ornament** — the gimmick set, explicitly.
- **No per-keyframe timeline-editor authoring** — declare parts + typed motion roles, never
  hand-animate frames (narrative-step §8.1's "no animation pane").
- **No entrance/exit or slide-transition spectacle** (fly-in, bounce, spin-on-reveal, typewriter,
  star-wipe, cube) — motion describes the *object/process*, not the slide.
- **No self-drawing for flourish** — a Vivus stroke-reveal is admitted only when the drawing
  *order* carries meaning (§2's drawn-figure class), never a logo drawing itself to look slick.
- **No autoplay audio; no motion that can't reduce to the poster.**
- **No arbitrary user JS** — §8's spec boundary is absolute.

### 12.2 Reduced motion — Vetrina's three tiers

`full` plays; `legible` suppresses vestibular sweeps/orbits but may keep a gentle meaning-bearing
reveal; `still` collapses to the poster. `system` resolves a reduced-motion device to `legible`, or
to the poster for a scene whose whole content is vestibular.

## 13. Honest risk read

- **The utility bar is a discipline, not a gate.** No machine can see "this rotation is
  informative." §2's test + human review at the Quality Bar hold it — the same honest residue the
  component generator accepts for "tasteful." The knowledge file must *teach* the serious classes
  and the decline, or the model will drift to ornament.
- **The `SceneState` IR is the make-or-break** — an engine-neutral intersection expressive across
  pseudo-3D vector (Zdog), true-3D GPU (Three), **and drawn SVG line-art (Vivus)**, spanning two
  *source models* (built primitives vs ingested SVG); `caps` gates engine-specific richness. Like
  Cadenza's display/spoken split, this is the hard design. **Stage 1 resolved it** (validated by the
  adversarial trio, HARD RULE #25) as a **nested built tree** — each element's transform is *local*
  and the backend composes parent∘child, matching Zdog's Anchor / Three's Object3D trees, so compound
  motion (a rotor inside a tilting housing) is expressible and the `group` primitive is real —
  with `reveal` defined as **opacity** and paint order = tree pre-order.
- **Self-drawing as flourish, and the stroke constraint.** Vivus's reveal is the easiest of all to
  slip into ornament; §2 + §12.1 hold it to meaning-bearing drawing order. A hard *input* constraint
  too: Vivus animates strokes, so its source SVG must be line/path art (strokable outlines), not flat
  fills — the scene-inspector must steer authored/generated art to that shape.
- **Three.js weight** (~600KB, raster poster) — ship the **vector engines (Zdog + Vivus) first**;
  Three is a gated later tier that must earn its weight with a real §2 case (a genuine GLTF/true-3D
  need).
- **Scope creep into a motion-graphics tool.** The closed vocabulary + the poster requirement + the
  §2 test are the fence; Anima is for slide-serving, poster-degradable, information-bearing motion —
  not a game loop or an FX suite.

## 14. Staged plan (each its own increment / branch — HARD RULE #17)

1. **Anima pure core** — spec schema, `compile`→timeline, `timeline.at`→`SceneState`, the closed
   vocabulary. Zero-dep, boundary-gated, unit-tested against the data (no backend yet).
2. **Zdog backend** — `caps:{vector,poster,live}`; deterministic vector poster. A hand-authored
   scene renders live + poster.
3. **Vivus.js backend** — `caps:{vector,poster,draw,live}`; the `source: svg` ingest mode + the
   stroke-reveal drawing verbs. The second first-class vector engine — a drawn diagram/route renders
   live + poster. Both vector engines land **before** the gated Three tier.
4. **The `kind:'scene'` asset** — extend `asset-bundle.ts` / `asset-store` with the scene kind
   (spec + poster + metadata; the `source: svg` art for a Vivus scene); save/load/share. Record
   shape + poster-storage decision: `2026-07-18-anima-motion-faculty-modes.md` §4.
5. **The host `scene` component** (imagery) — the image-mirrored variants; asset → Anima mount;
   poster wired into the PDF path. Demo deck (#9); dark+light **export sign-off** (QUALITY BAR).
6. **Reduced-motion + present-mode wiring** — the three tiers; live on HTML export + Studio present,
   poster on PDF and `still`.
7. **The Motion faculty + LLM create/tune loop** — the Studio surface, shaped as author-persona
   **modes over one scene spec** (v1: Director Mode/Guided + Rig Mode; shared chrome + swappable tune body):
   `2026-07-18-anima-motion-faculty-modes.md`. Plus the Anima knowledge file & generator (extending
   the component-generator contract); a frozen adversarial prompt set with a **decline case** (an
   ornament/bouncing-ball request must be refused and routed to `image`) and a **poster-determinism**
   case.
8. **Three.js backend** (GATED, may be cut) — `caps:{true3d,gltf,live}`, present-only,
   raster-or-override poster, capability-negotiated. Ships only if a real §2 case earns the weight.
   **Library-shape packaging** and **a second host / layered co-render** remain deferred.

### 14.6a Stage 6 as shipped — Playground live now (6a), present + export next (6b)

Stage 6 landed as a **split**, recorded so the deferred half is tracked work, not a dropped promise:

- **Stage 6a (shipped).** The spec transport (an `anima` fenced block → base64 `data-scene-spec`,
  lifted onto `section.scene`), the surface-agnostic **host** (`docs/src/lib/anima/hydrate.ts`:
  decode+validate → negotiate → mount → one rAF loop → reduced-motion tiers → replay/dispose), and
  the **Playground** live preview (parent-hosted, mirroring `createChartInteract`/`createVideoOverlay` —
  the backends stay out of the lean in-frame runtime). Verified on the real Playground with a real
  Chromium (HARD RULE #23): an `anima` deck renders the spec into the frame, the host mounts Zdog, the
  scene animates theme-recolored. The **adversarial trio** (HARD RULE #25) ran the diff — no CRITICAL/
  HIGH crash/security/leak (dispose cancels the rAF + disconnects the observer; the base64 transport is
  ReDoS-safe and can't break the attribute; `parseScene` + the injected `sanitizeSlideHtml` + Vivus's
  inert-parse gate the untrusted spec/markup). Folded: **diff-based, eager `rebind()`** (a re-render no
  longer restarts every scene, and it no longer relies on a finicky parent-context IntersectionObserver
  across the scaled iframe — Munger's ship-blocker + the red team's IO-coverage HIGH); a spec **size-cap**
  before decode (client-DoS guard); `data-scene-motion` value validation; a `disposed` guard; a broadened
  stray-placeholder strip; and `usedVerbs` made **recursive** (dropping the host's duplicate `sceneVerbs`).
- **Stage 6b (fast-follow).** Present-mode advance (still gated on §15's unresolved slide-enter-vs-
  narrative-step-vs-control question) and **standalone-HTML-export** hydration. Export needs a *different
  delivery* than the parent-hosted Playground — an in-frame injected script carrying the backends — but it
  calls the **same** surface-agnostic `hydrateScenes`, so only the delivery bifurcates, not the logic.
- **Poster ↔ spec correspondence (carry).** For **built** (Zdog) scenes the poster still and the spec are
  two hand-authored artifacts today; nothing binds them, so a maintainer editing one can drift the other
  (only the print/`still` surface diverges — the live view is always spec-faithful). **svg** scenes have no
  drift (the poster SVG *is* the Vivus asset). Stage 7's faculty closes this by generating the built poster
  from the *same* `zdogRenderer().poster()` the live path derives from — the two then can't diverge by
  construction. Until then, built posters in demos are explicitly hand-authored placeholders.

## 15. Open questions (impl ADR)

- **The poster COLOUR / recolour model (decide before Stage 5 wires the poster into the PDF —
  the adversarial trio's highest-cost Stage-2 finding).** A backend resolves `var(--token)` to a
  concrete `rgb()` at paint (correct for LIVE; a re-theme re-mounts). But if a *stored* poster
  bakes those literals, it is theme-FROZEN and a deck on another theme shows the wrong colours —
  breaking the §10 recolour promise. Two options to pick from before the export path is built:
  (a) the poster keeps `style="fill:var(--token)"` (+ a separate opacity for `reveal`) so it
  recolours in whatever theme frames it; or (b) the export RE-RENDERS the backend under the deck's
  theme (the poster is a thumbnail, not the canonical artifact) — which also means §7's "unchanged
  plumbing" is false and Vivus's source markup must reach the export Chromium. This is an
  export-sign-off-gated decision; Stages 2–3 render live/verification posters only, no theme-frozen
  poster is wired into any export. **Storage side now resolved** (`2026-07-18-anima-motion-faculty-modes.md`
  §4.1): the *stored* asset poster keeps `var(--token)` (option (a)) and the spec is canonical; the
  *export* choice (a) vs (b) stays open + Stage-5 sign-off-gated.
- The `SceneState` IR — the engine-neutral intersection and how `caps` gate the extras (§13).
- The closed primitive + motion vocabulary, keyed to the §2 serious classes (which Zdog shapes;
  the motion roles + params; how `sequence`/`fill`/`explode` are declared).
- Present-mode integration — does a scene advance on slide-enter, on narrative-step advance
  (`2026-06-16-narrative-step-model.md` — a scene is a candidate steppable unit), or on a control?
- GLTF import — in scope for the Three tier v1, or Zdog-authored geometry only?
- The asset bundle shape (spec + poster + caps) and the scene-inspector's tuning controls.
- The `source: svg` ingest (Vivus) — constraining authored/generated art to strokable line-art, and
  mapping the drawing verbs (`draw`/`trace`/`sequence`) onto its paths.
- The Anima knowledge-file's worked examples across the serious classes (the make-or-break
  generator deliverable, per component-generator §4.8).

## 16. Relationships

- **Rides the fabricated-asset rail of** the Theme-AI (#613) and **Component-AI**
  (`2026-06-29-ai-component-generation.md`) — `kind:'scene'` joins `kind:'theme'`/`'component'` in
  `asset-bundle.ts` / `asset-store.js`; extends the transform-bearing #618 DSL track (§9).
- **Copies the library shape of** `2026-07-05-vetrina-walkthrough-library.md` and
  `2026-07-07-cadenza-caption-timeline.md`; **packages per** `2026-07-08-library-shape-*`.
- **Mirrors the `image` component** (`lib/components/imagery/image/`) for the host + variants.
- **Applies** `2026-06-19-css-3d-charts-feasibility.md` §5 — vector-vs-raster / PDF-zoom is why
  `poster` requires `vector`, why **Zdog and Vivus are the canonical vector engines**, and why Three
  is present-only.
- **Governed by** `2026-06-16-narrative-step-model.md` §8 (anti-wizbang) — §2 is its sharpened form;
  Vivus's stroke-reveal is a natural renderer for that model's "assemble as you go" build.
- **Bound by** HARD RULES #3 (tokens), #8/#9 (graduation + demo deck), #15 (don't multiply runtimes
  — **Vivus earns first-class status because it opens a distinct capability (`draw`) and is
  vector/poster/tiny; Pixi stays deferred because it only duplicates raster with no new canonical
  capability**), #17 (one host, one PR), #22 (no user JS in the preview frame), and the QUALITY BAR
  export sign-off.

## 17. Gates (for each increment when it lands)

Deterministic poster (byte-stable for an unchanged spec); `tools/pixel-check.js` on the poster;
dark+light export sign-off; reduced-motion verified on the **real** live surface (HARD RULE #23);
schema-validation + scene-exfil + size-cap + caps-negotiation tests; the `checkAnimaBoundary` gate
green; lint · `build:check` · unit · integration green; maker-checker on the core + each backend (an
engine transform = real blast radius, HARD RULE #25).
