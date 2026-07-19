---
status: proposed
summary: >
  Cut zdog. Make the SVG (Vivus) source model Anima's single engine, and rebuild the Motion
  faculty around "choreograph a drawing," not "compose 3-D primitives." The boardroom is a
  DRAWN medium — flowcharts, matrices, funnels, org charts, isometric schematics, annotated
  figures — line + label, not shaded solids. Zdog's flat pseudo-3-D reads friendly/designy
  (the "clip-art" register the anti-gimmick thesis fought), can't render text, forces
  hand-authored primitives, ships a heavy bundle, and needs a whole Three.js tier to reach
  fidelity. SVG delivers what zdog can't: NATIVE TEXT/labels (the #1 gap, solved free),
  DIRECTIONAL 2-D motion trivially (translate/slide — "value flows left→right" for real),
  BRING-YOUR-OWN-ASSET (any SVG — a real diagram, an icon set, a logo, a map), and the
  serious line-art aesthetic. Fabricate's Motion faculty keeps its two-mode shell (Director
  low-floor / Rig ceiling) but re-bases the spec on SVG: three on-ramps (Describe-first — AI
  emits labeled line-art SVG + a reveal plan; Bring — paste/upload; Template — house
  diagrams) converge on a CHOREOGRAPH surface where the drawing's parts (paths · groups ·
  text) get a motion role (draw · trace · reveal · sequence · highlight · slide · fill).
  Migration is a CLEAN CUT, SEQUENCED: build the SVG faculty first and verify on the real
  Studio, THEN excise the built source model / primitives / zdog backend / 3-D verbs /
  primitive-tree Rig / zdog-in-the-player-bundle in one deletion pass. The Three tier
  evaporates (line-art-first needs no lit/textured 3-D). What we give up — genuine 3-D
  rotation (turntable, depth exploded, orbiting mechanism) — is rare in real decks and faked
  isometric is SVG's job anyway. Security moves to the CENTER: every SVG (generated, pasted,
  templated) passes sanitizeSlideHtml before the frame (HARD RULE #22). Design only; nothing
  cut or built yet.
companion:
  - ./2026-07-17-anima-animation-library.md
  - ./2026-07-18-anima-motion-faculty-modes.md
---

# Anima — cut zdog, go SVG/Vivus-first: the boardroom is a drawn medium

**Date:** 2026-07-19
**Status:** Proposed (design model; nothing cut or built yet)
**Follows / refocuses:** `2026-07-17-anima-animation-library.md` (the Anima ADR — zdog was the
first/primary backend; Vivus the svg secondary; Three the gated fidelity tier) and
`2026-07-18-anima-motion-faculty-modes.md` (the Director/Rig mode shell). This doc **reverses the
engine priority**: SVG becomes the single engine, zdog is retired, and the Three tier is dropped.

---

## 1. The decision

**Cut zdog.** Make the **SVG (Vivus) source model the single Anima engine.** Rebuild the Motion
faculty (Fabricate → Motion) around **choreographing a drawing** rather than composing 3-D
primitives. Drop the planned **Three.js tier** — a line-art-first engine has no need for lit,
textured 3-D.

This is a strategic reversal, made with eyes open: Stages 1–7 shipped a zdog-centric engine and a
faculty built to author 3-D primitive trees. We are retiring that primary path in favor of the
register the boardroom actually speaks.

## 2. Why — the boardroom is line + label, not shaded solids

**The register.** A boardroom visual is a *drawn diagram*: a value chain, a 2×2, a funnel, a
pyramid, an org chart, a process flow, a timeline, a map, an annotated figure. These are **line +
text**, and line-art reads as *technical and authoritative* — an engineering drawing, a consulting
schematic. Zdog's flat-shaded pseudo-3-D reads as *friendly and designy* — the exact "clip-art"
register the anti-gimmick thesis (Anima ADR §2, §12) set out to refuse. The human evaluating Director
mode felt this immediately ("these have no textures, no corners, no text… is that possible?").

**The evidence trail** that led here, in order:
1. Director's live failures — "a man walking left to right," "a man opening a newspaper" — traced to
   a motion-vocabulary gap (no linear translation, no bounded pose-to-pose rotation, no oscillation).
2. The proposed fix (bounded verbs `turn`/`translate`/`swing`) surfaced a deeper limit: even with
   perfect motion, zdog scenes are **unlabeled, flat-shaded, abstract solids** — they can't carry the
   specifics (which layer, what number, who's in the chain) a board needs.
3. Text is impossible in zdog; edges/materials need the Three tier. The value zdog uniquely
   adds — *rotate a solid to read its form* — is **rare** in real decks, while its costs (no text, the
   clip-art register, hand-authored primitives, a ~30 KB engine bundle, and a whole second heavy engine
   for fidelity) are high.

**What SVG delivers that zdog can't:**
- **Native text / labels.** SVG has `<text>`. The single biggest gap — the difference between a
  communicating diagram and abstract shapes — disappears for free.
- **Directional / 2-D motion, trivially.** SVG transforms make translate/slide/rotate cheap. "Value
  flows left→right," which needed an entire new zdog `translate` verb, is native. Most of the motion
  gap closes just by changing engines.
- **Bring-your-own-asset.** Any SVG animates *drawing itself in* — a real diagram, an icon set, a
  logo, a map, a floor plan. Zdog forces primitives hand-built from scratch.
- **The serious line-art aesthetic** — on-register for the boardroom by construction.

## 3. What this resolves, drops, and gives up

**Resolves:** labels/text (#1 gap); directional motion; asset reuse; aesthetic register.
**Drops (good riddance):** the **Three.js tier** (unneeded); zdog's engine + maintenance + bundle
weight; the built-verb complexity (`spin`/`orbit`/`explode`) and the primitive-tree authoring surface.
**Gives up (accepted):** genuine 3-D rotation — a product turntable, a depth-based exploded view, an
orbiting mechanism. These are **rare** in real board decks, and the common "3-D" (an isometric
exploded diagram, a schematic) is *faked isometric line art* — which is SVG's job, not zdog's. When a
true rotating solid is genuinely needed, it is the exception, authored as an image/asset, not a reason
to keep an entire engine.

## 4. The Fabricate evolution — choreograph a drawing

The mental model flips. Zdog Fabricate = *assemble 3-D parts into a tree*. Vivus Fabricate = **bring
or generate a drawing, then choreograph how it reveals** — the same shape as the rest of the Studio
(Theme/Component/Finish all "take a thing, shape how it behaves").

### 4.1 The artifact
A scene becomes **an SVG (the drawing) + a motion plan over its parts + poster/timing.** The svg
source model already carries this shape (`{ source:'svg', asset, elements:[{ pathRef, motion }],
duration, hero }`, types.ts) — the work is to make it authorable and to grow its motion set (§4.4).

### 4.2 Three on-ramps to the SVG (Describe-first)
1. **Describe** *(Director, the low floor — the chosen default)* — the model emits **labeled line-art
   SVG + a reveal plan**. This is a *better* AI target than zdog-JSON: LLMs draw competent SVG, text is
   native, and the diagram space (flow/matrix/funnel/pyramid/timeline/org/map) is well-trodden.
2. **Bring** — paste or drop an existing SVG; it animates drawing itself in.
3. **Template** — start from a house diagram and choreograph it.
All three converge on the same next step.

### 4.3 The choreograph surface (the new Rig)
The SVG's parts — paths, groups, and **text labels** — are parsed and listed by id. Selecting one
assigns a **motion role** (§4.4) + an order + timing. This is far more legible than the 3-D primitive
tree: you choreograph a drawing you can already see, not blind-assemble solids.

### 4.4 The SVG-native motion set
Center the svg verbs and grow them; **drop the 3-D verbs**:
- **draw / trace** — stroke a path in (Vivus's core).
- **reveal** — fade a part or label in *(currently built-only in VERB_SOURCE; extend to svg)*.
- **sequence** — staggered build in an assigned order.
- **highlight** — a stroke-width / color emphasis pulse *(new)*.
- **slide** — a 2-D move-in *(new; trivial via SVG transform — the directional motion, for free)*.
- **fill** — bind a level to data *(currently computed but unpainted; paint it in the svg backend)*.
- **Retired:** `spin`, `orbit`, `explode` (built-only 3-D transforms).

### 4.5 The modes persist
**Director** (describe → auto-choreographed) and **Rig** (bring/pick → hand-choreograph) — the same
two-mode shell and the same "one spec, many projections" thesis (2026-07-18 §2.1). Only the spec is
now SVG-based. Mode memory + the header chrome carry over unchanged.

### 4.6 Security is the spine, not an afterthought
SVG is untrusted markup that can carry `<script>` / `foreignObject` / event handlers. **Every** SVG —
AI-generated, pasted, or templated — passes `sanitizeSlideHtml` (HARD RULE #22) before it reaches the
preview frame, and is sanitized again at the store boundary (`saveStudioScene`, the Stage-4
precedent). This is the highest-blast-radius surface of the whole faculty and gets the adversarial
trio (§6).

## 5. Migration — clean cut, sequenced (no regression window)

1. **Build the SVG-native faculty first** — the Director→SVG generator + prompt (a `SCENE_CANON` for
   labeled line-art), the choreograph surface, the extended svg motion set (reveal/highlight/slide +
   painted fill), the sanitize spine — and **verify on the real Studio** (HARD RULE #23).
2. **Then excise zdog in one deletion pass:** remove `source:'built'`, `PRIMITIVES`, the built-only
   verbs, `backends/zdog.ts` + its adapter allowlist entry, the primitive-tree Rig
   (`flatten`/`removeAt`/`setMotionAt` + the tree/verb-chip inspector), zdog from the export player
   bundle (`build-anima-player.js`), and the built-path tests. Simplify `schema.ts` / `compile.ts` /
   `types.ts` / `vocabulary.ts` to svg-only (collapse the tagged union or drop the built arm).
3. **Docs + CHANGELOG + decision index** updated in the same passes; the two prior Anima ADRs get a
   "refocused by 2026-07-19" note.

Each slice is its own branch/PR (HARD RULE #17); the deletion pass is a single coordinated change with
maker-checker (high blast radius). Nothing ships knowingly broken (#18).

## 6. Verification

- **Design:** human review — this doc → PR.
- **Build:** each faculty slice meets the QUALITY BAR + real-surface verification (#23 — the real
  Studio, the real Vivus render, the real export). The **AI-SVG generation + sanitize path is
  high-blast-radius** (untrusted markup → a preview frame) and gets the **adversarial trio** on what
  ships (#25). The zdog-excision pass gets maker-checker (a large multi-file deletion).

## 7. What we are deliberately NOT doing

- **Not a general SVG animation editor / motion-graphics tool.** The anti-gimmick fence holds: a
  closed set of *motion roles* you pick, never a free keyframe/curve surface (Anima ADR §12).
- **Not character animation / "limitless."** Out of scope, as before.
- **Not building the Three tier.** Retired by this decision.

## 8. Open questions (carried)

- The exact **svg motion-role set** — validate draw/trace/reveal/sequence/highlight/slide/fill against
  real boardroom scenes as the faculty lands; add only against the §2 admission test.
- **AI-SVG house style** — how the generator keeps output on-brand (palette-token strokes, consistent
  stroke weights, label typography, the isometric option). This is the `SCENE_CANON`-for-SVG
  make-or-break, the analog of the component generator's knowledge file.
- **Bringing arbitrary SVG** — sanitize + **id-mapping**: a pasted flat SVG needs addressable ids so
  its parts become choreographable; define the auto-id / group-detection pass.
- **Poster / export** — svg scenes already export (Stage 6b, the HTML player); confirm the hero-still
  poster path for the PDF once the built path is gone.
- **Naming** — with one engine, "source: 'svg'" and the built/svg tagged union lose their reason to
  exist; decide the simplified spec shape during the excision pass.

## 9. Relationships

- **Refocuses** `2026-07-17-anima-animation-library.md`: zdog retired as the engine; Vivus/svg
  promoted from secondary to sole; the Three tier (§14.8) dropped; the built-centric staging
  (§14.2–14.6) superseded by the SVG faculty plan here.
- **Refocuses** `2026-07-18-anima-motion-faculty-modes.md`: the mode shell (Director/Rig, one spec many
  projections, mode memory) is **kept**; the spec, on-ramps, and choreograph surface are re-based on
  SVG. The Rig "primitive tree + verb chips" is replaced by the "drawing parts + motion roles" surface.
- **Reuses** the Stage-4 `kind:'scene'` asset store and the Stage-6 export player unchanged (both
  already handle svg scenes).
