---
status: proposed
summary: A refined 3D/cartoon "scene" component (imagery bucket) that enhances a slide with motion — admitted only under the narrative-step anti-wizbang discipline (derived/declared, small typed vocabulary, meaning-bearing, losslessly degradable). Four load-bearing decisions — (1) the static PDF/PPTX path gets a deterministic VECTOR poster at a declared hero-time, animation lives only on the live surfaces (HTML export, Studio present), reduced-motion → poster; grounded in the CSS-3D-charts PDF-zoom finding that raster pixelates while SVG stays crisp + the video-poster precedent. (2) Zdog-SVG is the CANONICAL runtime (tiny, vector, themeable, deterministic, posterizes for free); Three.js is a present-mode-only opt-in for genuine 3D/GLTF whose raster canvas can never be the canonical poster; PixiJS is REJECTED (a third raster runtime, no niche the other two don't cover, HARD RULES #15/#22 cost). (3) the LLM authors a schema-validated declarative scene SPEC, never executable JS — a vetted engine-owned interpreter renders it, mirroring the Theme-AI/Component-AI contract and extending the #618 transform-bearing DSL track (AI-component ADR §9); this is the HARD RULE #22 safety envelope AND what makes "refine with an LLM" pleasant. (4) palette-blind — scene colors are var(--token) refs resolved at render (#3). Lives in the imagery bucket beside video, reusing its poster machinery. Design only; nothing built.
---

# The animated scene component — refined 3D/cartoon motion that enhances a slide

**Date:** 2026-07-17 · **Status:** direction proposed; field spec + build staged.

## 1. The ask, and the tension it walks into

The want: a **refined cartoon-like and 3D animation component** that enhances a
slide — a real 3D object the argument is about, or a tasteful illustrative motif —
authored and iterated **with an LLM**, using the modern web-graphics toolbox
(Three.js, Zdog, PixiJS, …) *done right*.

On its face this collides with Lattice's spine: the engine renders **boardroom
PDFs** (ink-on-paper, static-canonical), and the narrative-step model
(`2026-06-16-narrative-step-model.md` §8) bans the PowerPoint "wizbang" bundle by
construction. So the first job of this ADR is not to design a toy — it is to decide
**whether such a component is admissible at all**, and if so, under exactly what
discipline. It is admissible. The rest of this doc is the discipline.

## 2. The reframe that makes it admissible

The narrative-step ADR does **not** ban motion. It bans *ornamental, hand-authored,
print-hostile* motion. It admits motion that is:

1. **derived / declared**, not hand-keyframed per element;
2. drawn from a **small typed vocabulary**, not arbitrary easing/keyframe soup;
3. **meaning-bearing** — it shows a structure, a mechanism, a real transformation,
   or sets tone with purpose — not spectacle;
4. **losslessly degradable** to a coherent static frame.

A scene component that obeys all four is not a betrayal of the stance — it is the
stance applied on the **time axis**, the same way palette-blindness applies it on
the colour axis and the 12-token `--fs-*` scale applies it on the type axis. This is
the admission test; §7 turns it into the gate.

## 3. The four load-bearing decisions

### 3.1 The static path is a deterministic VECTOR poster — canonical, byte-stable

The PDF/PPTX export shows a **poster**: a still of the scene at a declared
**hero-time `t`**, rendered from the *same* spec, deterministically. Animation lives
only on the **live surfaces** — HTML export and the Studio present mode. Under
`prefers-reduced-motion`, the live surface shows the poster too.

This is settled by two priors, not invented here:

- **`2026-06-19-css-3d-charts-feasibility.md` §5 (the decider).** Zoom into an
  exported PDF and **vector SVG stays razor-sharp** while any **rasterized** paint
  (CSS gradients — and, by the identical logic, a **WebGL/canvas frame from Three.js
  or PixiJS**) pixelates to a fixed-resolution bitmap. For a boardroom-PDF engine
  that disqualifies raster from the *canonical* path. That ADR's resolution — "rich
  3D is a **present-mode-only** flourish; the static artifact stays vector" — is the
  template this component copies.
- **The `video` component** (`lib/components/imagery/video/`) is the shipped proof
  of the pattern: motion content becomes a **static poster** (a clickable link / QR
  to the live thing) in the PDF, because "a PDF is paper — it can't play." The scene
  component is the third instance of the same shape (video = poster+link,
  narrative-step = build-degrades-to-final-state, scene = animation-degrades-to-poster).

**Consequence:** the poster must be **vector wherever it is canonical**. That single
constraint drives the runtime decision (§3.2).

### 3.2 Runtime: Zdog-SVG canonical · Three.js present-mode opt-in · PixiJS rejected

| Runtime | Output | Poster | Verdict |
|---|---|---|---|
| **Zdog** (~28KB) | **SVG** (or canvas) | vector, free — serialize the SVG DOM | **Canonical / default tier.** |
| **Three.js** (~600KB) | WebGL **raster** | raster still (pixelates on PDF zoom) | **Opt-in, present-mode-only.** |
| **PixiJS** (~400KB) | WebGL **raster** | raster still | **Rejected.** |

- **Zdog is the default** because it is exactly the intersection the ask lands on:
  its flat-shaded, rounded, illustrative aesthetic **is** "refined cartoon 3D"; it
  renders to **SVG** (so the poster is a crisp, themeable, byte-stable vector — no
  new export machinery, it reuses the SVG path charts already use); it is tiny; and
  a declarative scene graph is its native authoring model. Pseudo-3D (it fakes depth
  by projection, no true lighting), which is a feature here, not a lack — it keeps
  the aesthetic *illustrative* rather than photoreal.
- **Three.js is an opt-in heavy tier** for the genuine-3D cases Zdog can't reach — a
  real product render, an imported **GLTF** model, true materials/lighting. But its
  canvas is **raster**, so per §3.1 it can **never** be the canonical poster: a
  `scene` that opts into Three.js animates *only on the live surfaces* and its PDF
  poster is either (a) a rasterized still (accepted as lower-fidelity, flagged at
  authoring) or (b) an author-supplied vector/`poster` override — the same
  escape hatch `video` gives Instagram. Three.js is **present-mode-only by
  construction**, mirroring the CSS-3D tilt that ADR already shipped.
- **PixiJS is rejected.** It is a *second raster* runtime whose niche (2D
  sprite/particle motion) is covered better by Zdog (for illustration) or is exactly
  the decorative-particle spectacle §7 bans. Every extra runtime is bundle weight, a
  new **XSS/attack surface** in the same-origin preview frame (#22), and maintenance
  — adopting one that opens no capability the other two lack violates HARD RULE #15
  (don't reinvent/mult­iply). Revisit only if a concrete, meaning-bearing use-case
  appears that neither Zdog nor Three.js can serve.

### 3.3 The LLM authors a declarative scene SPEC — never executable code

This is the safety keystone **and** the thing that makes "create/refine with an LLM"
actually work. The model emits a **schema-validated declarative scene spec** (a
typed JSON/YAML scene graph); a **vetted, engine-owned interpreter** — hand-written,
not model-written — renders that spec into Zdog/Three primitives.

Why this and nothing looser:

- **HARD RULE #22.** The docs-site Studio renders untrusted decks into a
  **same-origin, un-sandboxed `srcdoc` iframe**; un-sanitized/executable content
  there is XSS → OpenRouter-key theft. LLM-written Three.js/Zdog **JavaScript is
  arbitrary code execution** — categorically inadmissible. A declarative spec is
  *data*: schema-validated, no `eval`, no remote fetch, no DOM reach.
- **It is the proven Lattice shape.** "Model proposes within a tight, concrete
  contract; **deterministic code disposes**" is exactly how Theme-AI (#613) and the
  **AI component generator** (`2026-06-29-ai-component-generation.md`) already work.
  That ADR's §9 explicitly splits components into *transform-free* (model authors CSS
  directly) and **transform-bearing / behavioral** (charts, diagrams, codegen — must
  go through the closed **#618 DSL**, "safe `match→do` rules + a closed capability
  registry, **no user JS**"). **A scene is transform-bearing/behavioral by
  definition** — so it belongs on the DSL track, inheriting that safety envelope, not
  the free-CSS track. This ADR is the scene chapter of that DSL.
- **It is why LLM iteration is pleasant.** A scene spec is small, diffable,
  human-readable data. "Make the drone tilt 10° more and recolor the rotor to the
  accent" is a two-field edit the model (or a human) makes by hand and the schema
  validates — not a re-generated code blob nobody can review. Refinement is *editing
  a contract*, the same loop the theme and component generators already give.

The spec's guardrails reuse the existing kit: JSON-schema validation (reject
off-spec), the `findCssExfil`/`findSkeletonHtml` analog for the scene payload (no
remote `url()`, no `data:` bombs — size-capped), and `sanitizeSlideHtml` on anything
that reaches the preview frame.

### 3.4 Palette-blind — the scene recolors with the theme

Every colour in the spec is a **`var(--token)` reference**, resolved at render
(HARD RULE #3) — surface/ink tokens for form, `--accent` for the one emphasis,
`--cat-1..12` for categorical parts. No hex. A refined cartoon that **restyles with
the theme** (and the a11y/CVD themes) is the whole point; a hard-coded palette is the
"foreign-looking" failure mode the component generator was built to avoid.

## 4. Where it lives, and what it's called

- **Bucket: `imagery`**, beside `video` and `image` — the bucket for a visual
  exhibit that **posterizes**. It reuses `video`'s poster + caption + `companion`/
  `gallery` composition machinery rather than inventing layout.
- **Working name: `scene`** (a declarative scene graph). Alternatives considered:
  `stage` (collides with the Cell/Fit "stage"), `figure`, `diorama`, `motif`. Final
  name is an impl-ADR call; `scene` is the placeholder here.
- **Not a new bucket, not a new renderer taxonomy.** It is a component that *targets*
  the existing render paths; per the narrative-step §4 layering, "WebGL/CSS-3D" was
  already anticipated as a **renderer projection**, not a new spine.

## 5. The scene spec — shape sketch (field spec deferred to the impl ADR)

Illustrative only, to make the vocabulary concrete. The authoritative fields are the
impl ADR's; this fixes the *shape*, not the grammar.

```yaml
# a declarative scene graph — DATA, never code
scene:
  runtime: zdog            # zdog (default) | three (opt-in, present-only poster)
  hero: 0.4                # the poster time t ∈ [0,1] — the frame the PDF freezes
  camera: { rotate: [ -0.3, 0.6, 0 ] }
  parts:
    - shape: cone          # a closed, typed primitive set (Zdog: cone/box/cyl/…)
      color: var(--accent) # token ref, resolved at render — no hex (#3)
      at: [ 0, -20, 0 ]
      motion: { spin: y, period: 6s }   # small typed vocab: spin/orbit/bob/reveal
    - shape: roundedRect
      color: var(--cat-2-mark)
      motion: { bob: 8, period: 3s }
```

Non-negotiables the grammar must enforce:

- **Closed primitive + motion vocabulary** — a small typed set (`spin`, `orbit`,
  `bob`, `reveal`/`sequence`, camera easing), **no arbitrary keyframes or easing
  functions**. Same discipline as the `--fs-*` type scale: pick a *role*, not a value.
- **A declared `hero` time** — the scene must name the frame it flattens to, so the
  poster is deterministic (no "screenshot whatever renders").
- **Token-only colour**, size in `cqi`/`cqh` where it maps to the stage.
- **Deterministic** — no `Math.random()`/wall-clock in the interpreter; a given spec
  renders one, reproducible poster (a hard requirement for the byte-stable export
  gate and `tools/pixel-check.js`).

## 6. Authoring & LLM flow (end to end)

```
describe → model proposes {scene-spec}     (a scene knowledge-file in context)
        → JSON-schema validate + scene-exfil scan + size cap
            ├─ clean → render live + poster → human review (the aesthetic gate) → accept
            └─ fail  → show findings → regenerate with the failures fed back
refine  → edit spec fields (by hand or model) → re-validate → re-render
```

This is the component-generator flow (`2026-06-29` §7) with a scene-shaped knowledge
file and a scene-shaped audit. The **human review step is load-bearing** — the
machine gates the *structure* (valid spec, tokens-only, deterministic, poster
present); a human at the Quality Bar judges whether the motion is *refined* and
*meaning-bearing*, because no gate can see "tasteful."

## 7. The discipline — the anti-wizbang gate, on the time axis

Motion is admitted **only** when it is (1) derived/declared, (2) from the closed
vocabulary, (3) meaning-bearing, (4) losslessly degradable to the poster. Everything
else stays banned. This is the §2 test made enforceable.

### 7.1 Non-goals — banned by construction (if any appears, the feature failed)

- **No per-keyframe / timeline animation UI.** You declare a scene + a typed motion
  role; you do not hand-animate frames. (Mirrors "no animation pane," narrative-step
  §8.1.)
- **No entrance/exit spectacle** — fly-in, bounce, spin-on-reveal, typewriter,
  star-wipe. Motion describes the *object*, not a slide transition.
- **No decorative particle storms / confetti / physics playground.** (This is the
  PixiJS niche §3.2 rejected.)
- **No autoplay audio, no motion that can't reduce to the poster.**
- **No arbitrary user JS** — the §3.3 spec boundary is absolute.
- **"Cartoon" means *illustration*, not *cartoonish effects*.** The refined-illustration
  aesthetic (a clean Zdog object) is in scope; a mascot doing a backflip on entry is
  the banned bundle wearing a costume. This is the riskiest edge — hold it here.

### 7.2 Export sign-off (QUALITY BAR)

Because the poster is **bytes in the exported PDF/PPTX**, shipping or changing it is
an **export-sign-off** event: render a representative scene deck in **dark and light**
and get owner inspection before it lands. `tools/pixel-check.js` on the poster;
byte-stability asserted for a spec that hasn't changed.

## 8. Honest risk read

This is the **closest** any Lattice feature has come to the bundle it rejects — that
is not a reason to refuse it, but it is the reason the gate above is unusually tight.
Two failure modes to name:

- **Aesthetic drift toward spectacle.** The "cartoon" ask pulls toward ornament. The
  defense is the meaning-bearing gate + human review + the closed vocabulary; if a
  scene's motion carries no meaning, it is cut, exactly as narrative-step §3 demotes
  morph.
- **Three.js as a foot-gun.** Its raster output tempts a "just screenshot it" poster
  that pixelates in the boardroom PDF. The defense is §3.1: Three.js is
  **present-mode-only**, its poster is explicitly lower-fidelity-or-overridden, and
  Zdog-SVG is the path 90% of scenes should take. If Three.js proves rarely worth the
  weight, ship **Zdog-only** first and treat Three.js as a later, gated tier.

## 9. Staged plan (each its own increment / branch — HARD RULE #17)

1. **The scene spec + schema + a Zdog interpreter** (engine-owned, deterministic) —
   the substrate. No LLM yet; author a spec by hand, render live + poster.
2. **The `scene` component** in `imagery` — manifest, styles, `companion`/`gallery`
   compositions reused from `video`, the poster wired into the PDF path. Demo deck
   (HARD RULE #9), dark+light export sign-off.
3. **Reduced-motion + present-mode wiring** — poster under `prefers-reduced-motion`;
   live animation on HTML export + Studio present.
4. **The scene knowledge-file + generator** — the LLM authoring/refine loop (§6),
   extending the component-generator contract; frozen adversarial prompt set incl. a
   *decline* case (a request for banned spectacle must be refused) and a
   *poster-determinism* case.
5. **Three.js opt-in tier** (GATED, may be cut) — genuine 3D/GLTF, present-mode-only,
   raster-or-override poster. Ships only if a real meaning-bearing case earns the
   ~600KB; rejected if it only serves spectacle.

## 10. Open questions (for the impl ADR)

- The exact primitive + motion vocabulary (which Zdog shapes; the closed motion-role
  set and their params).
- Poster fidelity for the Three.js tier — rasterized still vs mandatory author
  `poster` override vs an offscreen high-DPI capture.
- GLTF import — is a model asset in scope for v1, or Zdog-authored geometry only?
- Present-mode integration — does a scene animate on slide-enter, on the narrative
  step advance (`2026-06-16-narrative-step-model.md`), or on a control? (Natural
  adjacency: a scene *is* a candidate steppable unit.)
- The scene knowledge-file's worked examples (the make-or-break deliverable, per the
  component-generator §4.8 lesson).

## 11. Relationships

- **Extends** `2026-06-29-ai-component-generation.md` — this is the transform-bearing
  (§9) / #618-DSL scene chapter; inherits its "propose-within-a-contract, deterministic
  disposes" architecture and its safety envelope.
- **Applies** `2026-06-19-css-3d-charts-feasibility.md` — the PDF-zoom / vector-vs-raster
  finding is the reason Zdog-SVG is canonical and Three.js is present-only.
- **Governed by** `2026-06-16-narrative-step-model.md` §8 — the anti-wizbang discipline;
  a scene is a candidate steppable unit under §2.
- **Copies** `lib/components/imagery/video/` — the posterize-motion-for-PDF precedent
  and its composition machinery.
- **Bound by** HARD RULES #3 (tokens), #15 (don't multiply runtimes), #22 (no user JS
  in the preview frame), #9 (demo deck), and the QUALITY BAR export sign-off.

## 12. Gates (for each increment when it lands)

Deterministic poster (byte-stable for an unchanged spec); `tools/pixel-check.js` on
the poster; dark+light export sign-off; reduced-motion verified on the **real** live
surface (HARD RULE #23 — not a harness); schema-validation + scene-exfil + size-cap
tests; lint · `build:check` · unit · integration green; maker-checker on the
interpreter (engine transform = real blast radius, HARD RULE #25).
