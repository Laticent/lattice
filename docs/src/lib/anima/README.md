# Anima

**A pure animation core: give it a scene spec (data), get a timeline whose `at(t)` is
an engine-neutral snapshot a renderer paints.**

Anima turns a declarative **scene spec** into a **timeline** — `compile(scene)` → a
`Timeline` whose `at(tMs)` returns a `SceneState`: the transforms, reveal, and level of
every element at that instant. It **owns no DOM and no WebGL**: it emits data and reads
a clock you inject, and a **renderer you inject** paints the snapshot. That is the whole
idea — the generalization of Cadenza's *"a timeline is data; the clock is someone
else's"* to *"a scene is data; the **renderer** is someone else's."*

Zero-dependency, framework-free, `node:`-and-relative imports only (an import-boundary
gate enforces it) — designed to spin off as its own library. The full design contract is
[`engineering/decisions/2026-07-17-anima-animation-library.md`](../../../../engineering/decisions/2026-07-17-anima-animation-library.md).

> **Stage 1 is the pure core — no backend yet.** The spec schema, the timeline compiler,
> the closed vocabulary, and the capability model. Backends (Zdog, Vivus.js, Three.js)
> land in later stages and paint a `SceneState`; this stage is tested purely by asserting
> snapshot values at sampled `t`.

## 60-second start

```ts
import { parseScene, compile, negotiate } from './anima';

// 1. A scene is DATA (what the LLM emits and the asset serializes). Validate it.
const parsed = parseScene({
  source: 'built',
  duration: 6000,          // ms
  hero: 0.4,               // the poster is the frame at 40% of the timeline
  camera: { rotate: [-0.3, 0.6, 0] },
  elements: [
    { id: 'rotor', shape: 'cone', color: 'var(--accent)',
      motion: [{ verb: 'spin', axis: 'y', period: 6000 }] },
    { id: 'body', shape: 'rounded-rect', color: 'var(--cat-2-mark)',
      motion: [{ verb: 'bob', axis: 'y', amplitude: 8, period: 3000 }] },
  ],
});
if (!parsed.ok) throw new Error(parsed.errors.join('\n'));

// 2. Compile to a timeline and sample it (pure — no DOM, no renderer).
const timeline = compile(parsed.scene);
const frame = timeline.at(1500);   // the snapshot at 1.5s
const poster = timeline.poster();  // the still the PDF freezes (hero time)

// 3. A backend advertises caps; the library checks the scene fits BEFORE painting.
const zdogCaps = { vector: true, poster: true, draw: false, true3d: false, gltf: false, live: true, source: ['built'] };
const problems = negotiate(parsed.scene, zdogCaps);   // [] = the backend can render it
```

## The one idea — the scene differs per engine; the timeline does not

The three engines share the **timeline** layer but **not** the scene layer:

| | Zdog | Vivus.js | Three.js |
|---|---|---|---|
| Source model | **built** primitives | **svg** line-art (`source:'svg'`) | **built** primitives |
| Output | vector | vector | raster |
| Its `draw` verb | — | **stroke reveal** | — |

So the spec is a **tagged union on `source`** (`built` \| `svg`), and each backend reads
the fields it paints. `compile` is engine-neutral; capability negotiation (`caps.ts`)
makes "this scene fits that engine" a checked contract, not a hope.

## The closed vocabulary

Motion is a **closed, typed set of verbs** — you pick a role, never hand-author
keyframes (the anti-wizbang discipline, ADR §12):

| Verb | Drives | Source | Class (ADR §2) |
|---|---|---|---|
| `spin` / `orbit` | rotation / orbit of position | built | explanatory 3D |
| `bob` | gentle translate | built | (accent) |
| `explode` | outward from origin | built | structure |
| `reveal` / `sequence` | presence 0→1 (staggered) | built / both | mechanism |
| `fill` | data-bound level 0→to | both | data-bound |
| `draw` / `trace` | SVG stroke reveal | svg | drawn figure (Vivus) |

Colours are `var(--token)` references only (palette-blind, HARD RULE #3); the validator
rejects hex, `url()`, and markup.

## API

| Export | What it does |
|---|---|
| `parseScene(input)` | untrusted data → `{ ok, scene }` or `{ ok:false, errors }` (closed vocab, hero range, token colours, source/verb fit) |
| `compile(scene)` | validated scene → `Timeline` (`durationMs`, `at(tMs)`, `poster()`) |
| `negotiate(scene, caps)` / `canRender` / `requiredCaps` | capability match between a scene and a backend |
| `validateColor` / `usedVerbs` | the token-colour check; the verbs a scene uses |
| `ease` / `EASINGS` | the closed easing set |

Types: `Scene` (`BuiltScene` \| `SvgScene`), `Motion`, `SceneState`, `ElementState`,
`Timeline`, `RendererCaps`, and the vocabulary consts (`PRIMITIVES`, `MOTION_VERBS`, …).

## What Anima is NOT

- **Not a renderer.** No DOM, no `<canvas>`, no WebGL, no CSS. It returns a snapshot;
  you inject a backend that paints it.
- **Not a keyframe/timeline editor.** The vocabulary is closed; motion is declared by
  role, and every scene degrades to a deterministic poster.
- **Not a clock.** The host owns the loop and feeds `at(t)` — a `requestAnimationFrame`
  loop for live, or the hero time for the poster.

## Files

```
vocabulary.ts  the closed primitive + motion-verb sets, and verb → cap / source maps
easing.ts      the closed easing set (pure p→p')
types.ts       the spec (Scene = built | svg) + the evaluated SceneState + Timeline
schema.ts      parseScene — hand-rolled, zero-dep validation + validateColor
caps.ts        RendererCaps + requiredCaps + negotiate (the checked multi-engine contract)
compile.ts     compile(scene) → Timeline; deterministic time → SceneState evaluation
index.ts       the public surface (framework-free — zero deps)
```

Every module is pure and unit-tested (`*.test.ts`, run with `vitest`). The core stays
self-contained by a build gate (`checkAnimaBoundary` in `tools/check-ownership.js`): a
non-relative, non-`node:` import fails the build.
