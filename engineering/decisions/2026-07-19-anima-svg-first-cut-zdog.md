---
status: proposed
summary: >
  Point Anima at the SVG (line-art) register as its primary engine, and rebuild the Motion
  faculty around "choreograph a drawing" rather than "compose 3-D primitives." Most boardroom
  visuals are DRAWN diagrams — flowcharts, matrices, funnels, org charts, isometric schematics,
  annotated figures — line + label, not shaded solids. Zdog's flat pseudo-3-D reads
  friendly/designy (the "clip-art" register the anti-gimmick thesis fought), can't render text,
  forces hand-authored primitives, and needs a whole Three.js tier to reach fidelity. SVG
  delivers what zdog can't: NATIVE TEXT/labels (the #1 gap), directional 2-D motion,
  BRING-YOUR-OWN-ASSET (any real diagram/icon/logo/map), and the serious line-art aesthetic.
  BUT the honest scope (trio review, §0): today's svg engine is NOT a motion engine — Vivus is a
  single-scalar stroke-DRAW library (it strokes `<path>`s in document order off one progress
  number; it cannot move, fade, emphasize, or fill a part, and cannot animate `<text>` at all).
  Of the proposed svg motion set (draw·trace·reveal·sequence·highlight·slide·fill), only
  draw/trace/sequence work today; reveal-as-opacity, highlight, slide, and fill are NET-NEW
  engine channels (SvgElement has no `transform` field; ElementState has no emphasis channel; the
  backend paints none of it). So the SVG faculty is a GREENFIELD build, not a re-skin. Sequencing:
  build the SVG faculty ADDITIVELY (both engines coexist), PROVE one real AI-generated labeled
  boardroom scene at the 10/10 quality bar on the real Studio (the go/no-go gate), THEN excise
  zdog in one deletion pass. Three.js is dropped from the plan (it was never built — zero LOC to
  remove; the lit-3-D ceiling is DEFERRED and re-openable, not disproven). Security moves to the
  center: every SVG (generated, pasted, templated) passes a hardened untrusted-SVG sanitize
  profile before the frame (HARD RULE #22). Design only; nothing cut or built yet.
companion:
  - ./2026-07-17-anima-animation-library.md
  - ./2026-07-18-anima-motion-faculty-modes.md
---

# Anima — SVG/Vivus-first: choreograph a drawing (and retire zdog, after we prove it)

**Date:** 2026-07-19
**Status:** Proposed (design model; nothing cut or built yet)
**Follows / refocuses:** `2026-07-17-anima-animation-library.md` (the Anima ADR — zdog was the
first/primary backend; Vivus the svg secondary; Three the gated fidelity tier) and
`2026-07-18-anima-motion-faculty-modes.md` (the Director/Rig mode shell). This doc **re-orders the
engine priority**: SVG becomes the primary engine, zdog is slated for retirement *after a proof
gate*, and the never-built Three tier is dropped from the plan.

---

## 0. Trio review — what this revision corrects

The first draft of this doc proposed a **clean up-front cut** of zdog and described the SVG work as
"grow its motion set." The adversarial trio (red team + Munger inversion + independent checker,
each grounded in the actual code) converged on one verdict: **the direction is sound, but the draft
materially understated the build and over-committed the deletion.** The corrections, folded below:

1. **The SVG engine is greenfield, not a re-skin.** Vivus is a **stroke-draw library**: its backend
   drives the *whole* SVG from a **single progress scalar** (`progressOf` → `setFrameProgress`),
   stroking `<path>`s in document order (`oneByOne`). It has **no per-element** opacity, transform,
   emphasis, or fill painting, and it **cannot animate `<text>`** (text has no stroke to draw). Of
   the seven proposed svg verbs, only **draw / trace / sequence** exist today; **reveal-as-opacity,
   highlight, slide, and fill are net-new** channels (see §4.4a). "Grow the motion set" is really
   "build an SVG motion engine."
2. **`slide` is not free.** `SvgElement` is `{ id, pathRef, color?, motion? }` — it has **no
   `transform` field**, so schema/compile reject any positional input. `slide` requires a
   type → schema → compile → backend pipeline change and per-element transform *painting* the Vivus
   single-scalar model doesn't do. It is cheap conceptually, not for free.
3. **Don't delete before you prove.** Build SVG **additively** (both engines coexist behind the
   tagged union), clear a **named proof gate** — one real AI-generated labeled boardroom scene at
   the 10/10 bar on the real Studio — and **only then** excise zdog. The regression risk of
   deleting the one working engine before its replacement clears the bar is not worth the tidiness.
4. **Scope honesty on what's dropped.** Three.js was **never built** — dropping it removes zero LOC,
   it removes a *planned tier*. And this is **one of two backends** changing, not a seven-stage
   teardown; the excision is ~10–14 files (§5), and the scene React component is source-agnostic.
5. **Softened absolutes.** "The boardroom is a DRAWN medium" is a strong tendency, not a law
   (turntables, exploded assemblies, and physical-product hero shots are real, if rare). The lit-3-D
   ceiling is **deferred and re-openable**, not disproven. §2/§4.5 overstatements corrected in place.
6. **Sanitizer + id-mapping are core scope, not open questions.** Untrusted pasted SVG needs a
   *hardened* profile (today's inert parse still permits `url()` refs and external `<image>`); and
   id-mapping (making a flat pasted SVG's parts addressable) is required for the Bring/choreograph
   path to work at all.

---

## 0.5 Floor test (real, on-key) — where the model floor actually is

The trio said the AI-SVG assumption was UNVERIFIED and the make-or-break of the pivot. It has now
been **tested for real**: the house canon (`svg-canon.md`) as system prompt × five boardroom
prompts × **five models from a 3B tiny up to a mid-tier flash** (ministral-3b, llama-3.1-8b,
qwen-2.5-7b, gpt-4o-mini, gemini-2.5-flash-lite), via OpenRouter on our key (`.scratch/` throwaway,
HARD RULE #24), every scene rendered + audited. ~1.3¢ total. Findings:

1. **The ceiling holds, the floor is higher than hoped.** A **mid-tier** model
   (`gemini-2.5-flash-lite`) draws genuinely boardroom-legible line-art — real trapezoid funnel with
   true counts, a proper 2×2 with labeled axes + named quadrants — and **generalizes to a diagram
   type the canon never showed it** (a clean timeline). The direction's core bet is real *at that
   tier.*
2. **Below the floor, models emit audit-passing GARBAGE.** qwen-7b filled boxes with a token color →
   solid black blocks that graded `CLEAN`; gpt-4o-mini's funnel was overlapping diamonds, also
   `CLEAN`; the 3B drew wavy lines for boxes. **Canon-conformance ≠ legibility, and the mechanical
   audit cannot see the difference.** The worst failure mode is silent: a weak key produces junk that
   passes every automated check.
3. **The prompt-level fence is unreliable.** "Draw a man walking" was declined by two models but drew
   a literal stick figure on three — including the *most capable* one. Fence-holding is
   refusal-instruction-following, **not** capability, and it can't live only in the system prompt.

**Scope this forces (folded into §4/§5 below):**
- **A model-floor gate in Director** — recommend/require a mid-tier+ model, warn on weak keys.
- **The audit gates safety + conformance, never quality** — quality rides on the model tier + the
  human seeing the result. (It also has a real bug: token-color fills slip through "stroke, don't
  fill.") 
- **A real decline / re-roll affordance**, and leaning on the **Bring/Template** on-ramps for keys
  that can't reliably *Describe*.
- **Reinforces "prove before cut"** (§5): quality is model-dependent, so the AI-SVG path must clear
  the bar **on the tier Director will actually gate to, in the real Playground**, before zdog goes.

Evidence artifact (renders + ladder): the floor-test dossier (`.scratch/floor-artifact.html`).

## 1. The decision

**Make the SVG (Vivus-family) source model Anima's primary engine**, and rebuild the Motion faculty
(Fabricate → Motion) around **choreographing a drawing** rather than composing 3-D primitives.
**Slate zdog for retirement** — but *after* the SVG faculty clears a proof gate (§5), not before.
**Drop the planned Three.js tier** from the roadmap (a line-art-first engine has no near-term need
for lit, textured 3-D; the tier was never built, so this is a plan change, not a deletion).

This is a strategic re-order, made with eyes open: Stages 1–7 shipped a zdog-centric engine and a
faculty built to author 3-D primitive trees. We are demoting that path in favor of the register the
boardroom most often speaks — and accepting a **greenfield SVG-motion build** to get there.

## 2. Why — most boardroom visuals are line + label, not shaded solids

**The register.** A boardroom visual is *usually* a *drawn diagram*: a value chain, a 2×2, a funnel,
a pyramid, an org chart, a process flow, a timeline, a map, an annotated figure. These are **line +
text**, and line-art reads as *technical and authoritative* — an engineering drawing, a consulting
schematic. Zdog's flat-shaded pseudo-3-D reads as *friendly and designy* — the "clip-art" register
the anti-gimmick thesis (Anima ADR §2, §12) set out to refuse. The human evaluating Director mode
felt this immediately ("these have no textures, no corners, no text… is that possible?"). This is a
strong tendency, **not an absolute** — physical-product turntables and exploded assemblies are real
boardroom moments; they are the minority case, and §3 accounts for what we give up to serve them
less well.

**The evidence trail** that led here, in order:
1. Director's live failures — "a man walking left to right," "a man opening a newspaper" — traced to
   a motion-vocabulary gap (no linear translation, no bounded pose-to-pose rotation, no oscillation).
2. The proposed fix (bounded verbs `turn`/`translate`/`swing`) surfaced a deeper limit: even with
   perfect motion, zdog scenes are **unlabeled, flat-shaded, abstract solids** — they can't carry the
   specifics (which layer, what number, who's in the chain) a board needs.
3. Text is impossible in zdog; richer fidelity needs the Three tier. The value zdog uniquely
   adds — *rotate a solid to read its form* — is **the minority case** in real decks, while its costs
   (no text, the clip-art register, hand-authored primitives, a second heavy engine for fidelity)
   are high.

**What SVG delivers that zdog can't:**
- **Native text / labels.** SVG has `<text>`. The single biggest gap — the difference between a
  communicating diagram and abstract shapes — is addressable (note: text is *rendered* natively, but
  *animating* text is net-new painting — see §4.4a; it is not a stroke Vivus can draw).
- **Directional / 2-D motion.** SVG transforms make translate/slide/rotate expressible in the DOM.
  "Value flows left→right" becomes reachable — **once** the spec carries a transform for svg elements
  and the backend paints it (§4.4a). Cheaper than a zdog `translate` verb, but still net-new work,
  **not** "closes just by changing engines."
- **Bring-your-own-asset.** Any SVG can animate *drawing itself in* — a real diagram, an icon set, a
  logo, a map, a floor plan. Zdog forces primitives hand-built from scratch. (Requires the
  id-mapping + hardened-sanitize scope in §4.3/§4.6.)
- **The serious line-art aesthetic** — on-register for the boardroom by construction.

## 3. What this resolves, drops, and gives up

**Resolves:** labels/text as first-class (#1 gap); a path to directional motion; asset reuse; the
aesthetic register.
**Drops from the plan:** the **Three.js tier** (never built — a roadmap deletion, zero LOC); and,
*after the proof gate*, zdog's engine + bundle weight and the built-verb complexity
(`spin`/`orbit`/`explode`) + the primitive-tree authoring surface.
**Gives up (accepted, and re-openable):** genuine 3-D rotation — a product turntable, a depth-based
exploded view, an orbiting mechanism. These are the **minority case** in board decks, and the common
"3-D" (an isometric exploded diagram, a schematic) is *faked isometric line art* — SVG's job. When a
true rotating solid is genuinely needed it is authored as an image/asset. **The lit-3-D ceiling is
deferred, not disproven**: if real demand appears, re-open the Three tier as a caps-gated backend —
the engine-neutral timeline/IR was built to allow exactly that, and cutting zdog does not foreclose
it.

## 4. The Fabricate evolution — choreograph a drawing

The mental model flips. Zdog Fabricate = *assemble 3-D parts into a tree*. SVG Fabricate = **bring or
generate a drawing, then choreograph how it reveals** — the same shape as the rest of the Studio
(Theme/Component/Finish all "take a thing, shape how it behaves").

### 4.1 The artifact
A scene becomes **an SVG (the drawing) + a motion plan over its parts + poster/timing.** The svg
source model carries the *shape* of this (`{ source:'svg', asset, elements:[{ pathRef, motion }],
duration, hero }`, types.ts) — but the element type is **stroke-only today** and must grow real
motion channels (§4.4a) before it can express the set in §4.4. This is a build, not a config.

### 4.2 Three on-ramps to the SVG (Describe-first)
1. **Describe** *(Director, the low floor — the chosen default)* — the model emits **labeled line-art
   SVG + a reveal plan**. This is a *plausibly better* AI target than zdog-JSON: LLMs draw competent
   SVG, text is native, and the diagram space (flow/matrix/funnel/pyramid/timeline/org/map) is
   well-trodden. **UNVERIFIED** until the proof gate (§5) shows a real model producing on-brand,
   choreographable SVG at the bar — this is the make-or-break assumption of the whole pivot.
2. **Bring** — paste or drop an existing SVG; it animates drawing itself in. (Requires id-mapping +
   hardened sanitize.)
3. **Template** — start from a house diagram and choreograph it.
All three converge on the same next step.

### 4.3 The choreograph surface (the new Rig)
The SVG's parts — paths, groups, and **text labels** — are parsed and listed by id. Selecting one
assigns a **motion role** (§4.4) + an order + timing. This is more legible than the 3-D primitive
tree: you choreograph a drawing you can already see. **Core scope, not an open question:** a pasted
flat SVG usually has *no* addressable ids, so an **auto-id / group-detection pass** is required to
make its parts choreographable at all — without it the Bring path is inert.

### 4.4 The SVG-native motion set (target)
Center the svg verbs and grow them; **drop the 3-D verbs**:
- **draw / trace** — stroke a path in (Vivus's core). *Works today.*
- **sequence** — staggered build in an assigned order. *Works today (document-order aggregate).*
- **reveal** — fade a part or label in. *Net-new: today `reveal` only feeds the aggregate stroke
  progress; painting per-element OPACITY is new (§4.4a).*
- **highlight** — a stroke-width / color emphasis pulse. *Net-new: needs a new emphasis channel in
  ElementState + painting.*
- **slide** — a 2-D move-in. *Net-new: SvgElement has no `transform` field; needs type → schema →
  compile → per-element transform painting.*
- **fill** — bind a level to data. *Net-new painting: `level` is computed but the svg backend paints
  nothing with it today.*
- **Retired (with zdog):** `spin`, `orbit`, `explode` (built-only 3-D transforms).

### 4.4a The engine gap, stated honestly (the real cost of §4.4)
Today's svg backend (`backends/vivus.ts`) is a **stroke-draw renderer**, not a motion engine:
- `draw(state)` calls `vivus.setFrameProgress(progressOf(state))` — **one scalar for the whole SVG**
  (the max `reveal` over the drawing elements), stroking paths in **document order** via Vivus
  `oneByOne`. Per-element `at`/`span` windows are explicitly **not** honored.
- `SvgElement` carries only `{ id, pathRef, color?, motion? }` — **no transform, no per-part opacity,
  no emphasis.** `ElementState` carries `reveal` + `level` + a `transform` that the svg path leaves
  at identity and the backend **ignores**.

So the target set in §4.4 requires a **per-element SVG backend** (direct per-path dashoffset +
per-element opacity + per-element transform + an emphasis channel), for which **Vivus is at most the
stroke-draw primitive**, not the engine. Concretely, the build adds:
- **`SvgElement.transform`** (a 2-D subset — translate/scale, optional rotate) → schema validation →
  compile threading into the existing `ElementState.transform` → the backend *applying* it.
- **A per-element opacity pass** so `reveal` fades a part/label independent of stroke draw.
- **A new emphasis channel** in `ElementState` (e.g. `emphasis: number`) for `highlight`, painted as
  stroke-width/color.
- **`level` painting** in the svg backend so `fill` shows.
- **Per-element progress** (moving off Vivus's single-scalar `oneByOne`) so windows/order are real.

None of this is a re-skin. It is the actual deliverable of the pivot, and it must clear the bar
before the excision (§5).

### 4.5 The modes persist (shell kept; internals rebuilt)
**Director** (describe → auto-choreographed) and **Rig** (bring/pick → hand-choreograph) keep the
same **two-mode shell** and the "one spec, many projections" thesis (2026-07-18 §2.1). Mode memory
(`lattice-motion-mode`) and the header chrome **carry over**. But the *contents* of both modes are
**rebuilt, not reused**: the Rig's primitive-tree + verb-chip inspector is **replaced** by the
drawing-parts + motion-role surface, and Director's zdog-JSON generator + `SCENE_SYSTEM` prompt are
**replaced** by an SVG generator + a new SVG canon. Only the mode switch and persistence survive
unchanged — the earlier claim that "the Rig carries over unchanged" was wrong.

### 4.6 Security is the spine, not an afterthought
SVG is untrusted markup that can carry `<script>` / `foreignObject` / event handlers **and** more
subtle vectors — `url(...)` references, external `<image href>`, `<use xlink:href>` — that today's
*inert-parse* defense-in-depth (`parseSvgInert`) does **not** strip. **Every** SVG (AI-generated,
pasted, templated) must pass a **hardened untrusted-SVG sanitize profile** — `sanitizeSlideHtml`
(HARD RULE #22) extended/audited to strip external-resource vectors, ids preserved — before it
reaches the preview frame, and be sanitized again at the store boundary (`saveStudioScene`, the
Stage-4 precedent). This is the highest-blast-radius surface of the whole faculty and gets the
adversarial trio on what ships (§6). **Defining that profile is core scope**, not an open question.

## 5. Migration — additive first, PROVE, then excise (no regression window)

The order is the point: **do not delete the one working engine before its replacement clears the
bar.**

1. **Build the SVG-native faculty ADDITIVELY** — both engines coexist behind the existing tagged
   union. Land: the per-element svg backend (§4.4a), the `SvgElement.transform` + emphasis-channel
   spec changes, the Director→SVG generator + SVG canon, the choreograph surface + id-mapping pass,
   the hardened untrusted-SVG sanitize profile, and — per the floor test (§0.5) — a **model-floor
   gate + a decline/re-roll affordance** in Director. Each slice is its own branch/PR (HARD RULE
   #17), self-reviewed at the gates; the sanitize/AI-SVG slice gets the trio (#25).
2. **PROOF GATE (go/no-go).** Verify on the **real Studio** (HARD RULE #23), **on the model tier
   Director actually gates to** (§0.5 — the floor test showed quality is model-dependent, so the gate
   must run on the gated tier, not a hand-picked strong model): one real, AI-*generated* labeled
   boardroom scene (e.g. a value chain or a 2×2) that reaches the **10/10 boardroom bar** — on-brand
   strokes, legible labels, choreography that reads as information — and a *brought* SVG that
   choreographs cleanly. Artifact from that surface, not a harness. **If this gate fails, zdog is not
   cut** — we keep both engines and re-scope, rather than delete a working path for an unproven one.
3. **THEN excise zdog in one deletion pass** (only after the gate passes): remove `source:'built'`,
   `PRIMITIVES`, the built-only verbs, `backends/zdog.ts` + its adapter allowlist entry, the
   primitive-tree Rig (`flatten`/`removeAt`/`setMotionAt` + the tree/verb-chip inspector), zdog from
   the export player bundle (`build-anima-player.js`), and the built-path tests. Simplify
   `schema.ts` / `compile.ts` / `types.ts` / `vocabulary.ts` toward svg-only (collapse or drop the
   built arm). Scope estimate: **~10–14 files**; the scene React component is **source-agnostic** and
   needs no change. Single coordinated change with maker-checker (high blast radius); nothing ships
   knowingly broken (#18).
4. **Docs + CHANGELOG + decision index** updated in the same passes; the two prior Anima ADRs get a
   "refocused by 2026-07-19" note.

### 5a. Delete vs. coexist — why cut zdog at all
A fair objection: once SVG works, why not *keep* zdog for the minority 3-D case? The argument for
cutting:
- **Maintenance + surface area.** Two source models, two backends, two authoring surfaces, two AI
  prompts, two test matrices — for a path that serves the minority register. The tagged union taxes
  every core change.
- **Register coherence.** A single line-art aesthetic is a stronger product than a split
  personality (crisp schematic vs. clip-art solid) chosen per scene.
- **The 3-D case has an escape hatch.** A genuine turntable is authored as an asset/image; and the
  caps-gated backend seam remains, so Three can be re-opened if real demand appears (§3).

The argument for coexist is real and is why the **proof gate precedes the cut**: if SVG cannot cover
enough of what zdog covered at the bar, we keep both. The decision to cut is *ratified at the gate*,
on evidence — not up front on faith.

## 6. Verification

- **Design:** human review — this doc → PR.
- **Build:** each faculty slice meets the QUALITY BAR + real-surface verification (#23 — the real
  Studio, the real Vivus/SVG render, the real export). The **AI-SVG generation + sanitize path is
  high-blast-radius** (untrusted markup → a preview frame) and gets the **adversarial trio** on what
  ships (#25). The zdog-excision pass gets maker-checker (a large multi-file deletion).
- **svg export path: UNVERIFIED.** The claim that "svg scenes already export" (Stage 6b player) is
  asserted from the code, not exercised end-to-end for a *choreographed* svg scene with the new
  channels; confirm the hero-still poster + HTML-player path on the real export before relying on it.

## 7. What we are deliberately NOT doing

- **Not a general SVG animation editor / motion-graphics tool.** The anti-gimmick fence holds: a
  closed set of *motion roles* you pick, never a free keyframe/curve surface (Anima ADR §12).
- **Not character animation / "limitless."** Out of scope, as before.
- **Not building the Three tier now.** Dropped from the plan; re-openable as a caps-gated backend if
  real 3-D demand appears (§3).
- **Not cutting zdog before the proof gate.** The excision (§5.3) is gated on §5.2.

## 8. Open questions (carried)

- **AI-SVG house style** — how the generator keeps output on-brand (palette-token strokes, consistent
  stroke weights, label typography, the isometric option). This is the `SCENE_CANON`-for-SVG
  make-or-break, the analog of the component generator's knowledge file. *(This is the proof-gate
  risk, §5.2.)*
- The exact **svg motion-role set** — validate draw/trace/reveal/sequence/highlight/slide/fill
  against real boardroom scenes as the faculty lands; add only against the §2 admission test.
- **Poster / export** — confirm the hero-still poster path for a choreographed svg scene once the new
  channels land (see §6, UNVERIFIED).
- **Naming / spec shape** — with one engine, `source:'svg'` and the built/svg tagged union lose their
  reason to exist; decide the simplified spec shape during the excision pass.

*(Moved OUT of open questions and INTO core scope by the trio: the untrusted-SVG sanitize profile
(§4.6) and the id-mapping / auto-id pass (§4.3) — both are required for the faculty to function, not
optional refinements.)*

## 9. Relationships

- **Refocuses** `2026-07-17-anima-animation-library.md`: zdog demoted from primary engine and slated
  for retirement (after the proof gate); Vivus/svg promoted from secondary to primary; the Three tier
  (§14.8) dropped from the plan; the built-centric staging (§14.2–14.6) superseded by the SVG faculty
  plan here.
- **Refocuses** `2026-07-18-anima-motion-faculty-modes.md`: the mode *shell* (Director/Rig, one spec
  many projections, mode memory) is **kept**; the spec, on-ramps, choreograph surface, AND both
  modes' internals are **rebuilt** on SVG (§4.5).
- **Reuses** the Stage-4 `kind:'scene'` asset store and the Stage-6 export player (both already handle
  svg scenes) — export end-to-end for choreographed svg is UNVERIFIED (§6).
