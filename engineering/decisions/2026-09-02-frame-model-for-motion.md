---
status: proposed
summary: >
  Motion in Lattice is a FINITE ORDERED SET OF KNOWN FRAMES, not a continuous timeline. That one
  choice turns motion from a timeline problem into a pagination problem — the thing this engine is
  already unusually good at — and it pays four times over: a frame is a deterministic still you can
  golden-test (a continuous tween you cannot, which is exactly why live motion has zero e2e coverage
  today); the last frame IS the reduced-motion still, so there is no second code path; the hero can
  only ever BE a known frame, which dissolves the transitional-poster bug the logo prototype caught;
  and it asks very little of the engine, because `at(k/N)` wants no easing curve and no clock, so
  the library (anime.js v4, decided) is used narrowly as a painter rather than as a timeline.
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

**Date:** 2026-09-02 · **Status:** direction decided; first slice specified, not built — but the
library pick is now **confirmed on the real Playground**, not only in a harness (§8).

This note settles the shape of the motion capability after the engine bake-off
(`2026-09-02-motion-engine-bakeoff.md`). The bake-off answered *what paints*. This answers
*what motion is*, and the answer is deliberately more modest than the ADRs before it.

## 0. This note governs — and what it supersedes

**Where this note and any earlier motion note disagree, this one wins.** Four notes are marked
`status: superseded` and point here, so they no longer appear in the index's active list:

| Superseded | What it got wrong |
|---|---|
| `2026-07-17-anima-animation-library.md` | Motion as a **continuous timeline** with three engines (Zdog, Vivus, a Three.js tier) and a scene-asset faculty. All three engines are dead; the timeline is replaced by known frames. |
| `2026-07-18-anima-motion-faculty-modes.md` | Superseded **by scope, not by error** — its thesis (author-persona modes over one shared spec) is spec-agnostic and sound. What is out of scope is the `kind:'scene'` asset model and the fourth Fabricate tab. **Its §6.2 records that the two v1 modes SHIPPED**, so this retires a live Studio surface — an open decision, not a paper one. |
| `2026-07-18-animation-component-fit-for-purpose.md` | Its *plan* is superseded; its **critique is validated**. It found the `scene` component SOVEREIGN, with no supporting-actor mode for motion embedded alongside content. The new scope is entirely supporting-actor, so the gap closes by changing what motion attaches to. |
| `2026-07-19-anima-svg-first-cut-zdog.md` | **Direction right** (SVG over 3-D, retire Zdog, drop Three.js) — but the seven-verb continuous motion set, the Director/Rig rebuild and the AI-SVG faculty are all superseded. |

The bake-off note is **not** superseded: it is the evidence behind the library pick and the audit of
what ships today. Read it for *why anime.js*; read this for *what motion is*.

**Superseding these notes leaves 37 citations pointing at them, and that is intended.** They are
cited as design-of-record from **21 files outside the decisions folder** — module headers across
`docs/src/lib/anima/**`, `lib/components/imagery/scene/scene.transform.js`, the Studio surfaces, and
`tools/check-ownership.js`, where a gate names 2026-07-17 as its rationale. Those citations are not
broken by the supersession: each note now opens with a banner naming what it got wrong and pointing
here, which is precisely what the repo's `superseded` status is for — the note survives as the
rationale of record for how the code came to be written. **One exception was fixed**, because it is
author-facing rather than engineering-facing: `lib/base/base.docs.md` sent deck authors to
2026-07-19 §0.75 and now points here.

**Three things from the superseded notes are carried forward and remain binding:**

1. **The admission test** (2026-07-17 §2, §12). Motion earns its place only when it carries
   information a still cannot. Ornament is banned. That is the quality bar and it survives the
   architecture that carried it.
2. **Power tracks source structure** (2026-07-19 §0.75). The more we own a thing's render, the more
   meaningful and automatic its motion — which is exactly why charts are the first slice.
3. **Untrusted SVG is a sanitize boundary** (2026-07-19 §4.6), not an afterthought. This governs the
   logo-inlining work in §13.

**Two decisions live outside this note and are unchanged:** the library is **anime.js v4**
(`2026-09-02-motion-engine-bakeoff.md`), and Zdog is retired on the prove-then-cut sequencing — build
the replacement, clear the bar on a real surface, then excise.

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
2. **Reduced motion is simpler, but NOT free — and one shipped decision survives it.** The last
   frame *is* the still, so the floor needs no separate rendering path. **What must not be dropped
   is the VIEWER OPT-IN.** `2026-07-17` §12.2 settled that `prefers-reduced-motion` bounds the
   *default* and the *author*, not the *viewer*: a scene held still **by the floor alone** shows a
   labelled "Play the motion" control that mounts the full author-intended motion, because the
   viewer explicitly asked. That shipped — `docs/src/lib/anima/hydrate.ts:188` (`ControlMode`
   includes `'optin'`), `:194` (the aria label), `:237` (`floorSuppressed`), `:242` (an opt-in plays
   the FULL scene, not the legible projection). An earlier draft of this line said only that "the
   floor stops needing its own rendering path", which reads as license to delete that control.
   **It is binding: a reduced-motion viewer gets frame N *plus* an opt-in to walk the frames.**
3. **The poster bug dissolves.** §12 of the bake-off found the hero sitting on a transitional beat
   — striking on screen, wrong on paper — and noted "nothing in the spec enforces that today."
   When the beats *are* the frames, a hero can only ever be one of them. The class of bug is gone,
   not guarded against.
4. **It asks very little of the engine.** `at(k/N)` wants no easing curve and no clock, so
   whatever library we carry is used narrowly — as a painter, not as a timeline. The engine pick
   is **anime.js v4** (decided; `2026-09-02-motion-engine-bakeoff.md`), and the frame model means
   we lean on a small part of it: `createDrawable` for stroke work, and little else.
5. **It is diffable.** A frame set is data. That keeps motion inside the property the whole
   product rests on — same Markdown plus same tokens yields the same output.

## 3. Print policy — DECIDED: live surfaces only

**PDF and PPTX always render the final frame.** Frames are a capability of the docs site, present
mode, and the exported `--player`. No existing deck changes by one pixel, and the 0-pixel guarantee
is absolute rather than conditional.

> **CORRECTION — the `--player` half is an INTENTION, not the current state, and for charts it is
> not close.** Driving a real export contradicted the sentence above. `node dist/lattice-emulator.js
> examples/anima-chart.md --player` produces a file carrying **108 `data-anima-role` marks and ZERO
> hydration**: no `hydrateScene`, no `scene-live`, no `data-scene-spec`, no `data-anima-state`. The
> cause is structural rather than a bug — `player-core.mjs:2298` gates the injected player JS on
> `hasScene = /<section[^>]*\sdata-scene-spec=/`, which only an authored `scene` component emits;
> a chart builds its scene at runtime from rendered marks via `chartToScene`, and
> `anima-player-bundle.generated.mjs` contains no reference to `chartToScene`, `hydrateChart` or
> `data-anima-role` at all. `anima-scenes.ts:14` already said so in a comment —
> *"standalone-HTML-export hydration is a separate follow-on"* — and this note restated the
> aspiration as fact. **So today a chart's live surfaces are the Playground and present mode; the
> exported player ships the still.** Making the player animate charts is real work and is not
> costed here.

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
| **Charts** | **SVG** | **7** chart components declare `render: svg` (funnel, gantt, map, piechart, quadrant, radar, word-cloud); **8** files emit `data-anima-role` — those 7 transforms minus word-cloud, plus `state-chart` (hybrid) and the shared `_chart-family/svg-label.js` |
| **Diagram** | **SVG** | 1 component (`render: svg`, so 8 with the charts above). Mermaid is contested — its SVG is third-party and DOMPurify strips `<foreignObject>`/`<style>`, i.e. every node label |
| **Rails** | **DOM** | `lib/forms/tile/progress` emits `<div>` only — zero `<svg>`. Same for `div.lat-split-rail` |
| **Masthead** | **DOM** | `lib/forms/cell/masthead/` — its own Cell transform plus CSS |
| **Header · footer · pagination** | **DOM** | `.cell-footer` is a flex row (`lib/core/footer-dock.js`) |
| **Deck logo** | **DOM (and not yet SVG at all)** | `<img class="deck-logo">`, emitted at `lib/integrations/markdown-it/plugins.js:604` and mirrored in `lib/runtime/index.js:1623`. An SVG painter cannot reach it until something inlines it |

So: **one pure `at(t)`, two painters — and the SVG one is anime.js v4** (§2.4), used narrowly:
`createDrawable` for stroke work, direct attribute writes for the rest. The bake-off's hand-rolled
candidate (2,226 B gzip, byte-identical in jsdom and Chromium) is **not** what ships; it is the
measuring stick anime.js was compared against, and the two came out pixel-identical (0.000% mean
diff). The **DOM painter is new**, small, and is transform-plus-opacity over tagged units.

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

- **It does not re-open the engine pick.** That is decided: **anime.js v4**
  (`2026-09-02-motion-engine-bakeoff.md`). The frame model narrows what we use it for — a painter,
  not a timeline — but does not revisit the choice.
- **It does not settle morph.** Part-level morph is measured and works, but under a frame model its
  role is narrower — it interpolates *between* two known frames, if we want that at all.
- **It does not change any exported byte.** By construction, per §3.
- **It does not renumber the twenty ideas.** Most of them are a binding away from this model; the
  interactive half still needs an interaction surface that does not exist (zero `tabindex`,
  `role="button"` or `aria-expanded` across every component transform).

## 7c. A LIVE data-loss defect, re-logged here because its only record moved to Historical

`2026-07-18-anima-motion-faculty-modes.md` §7 carried an adversarial-trio finding that is **still
unfixed in shipped code**. Superseding that note filed its only record under Historical, which
would de-log it — and HARD RULE #18 requires a found defect to stay logged. So it is restated here.

**The defect.** A saved scene whose spec no longer validates is silently dropped from the Library,
and therefore silently absent from the user's backup.

- `docs/src/components/studio/scene-library.ts:67-72` — `toStudioScene` returns `null` when
  `parseScene` fails, deliberately fail-closed so a corrupt record never yields an unrenderable
  scene.
- `:107-113` — `listStudioScenes` then does `.filter((s) => s != null)`.
- `docs/src/components/studio/workspace-backup.ts:65` — the workspace backup is built **from
  `listStudioScenes()`**.

So: tighten the schema, and every record saved under the old shape vanishes from the list *and*
from the next backup, with no message. Restore onto a clean profile and they are gone. The three
fixes §7 named — stamp a `specVersion`, make reads non-destructive, surface a dropped count — are
all unimplemented: `grep -rn specVersion docs/src lib/` returns **nothing**.

**This constrains §7b.** Its "delete it with the Zdog excision" option makes the defect *worse*:
deleting the faculty without a migration destroys the only copy of those records. **Any retirement
path for the Motion Studio owes a migration or an export first.**

## 7b. The shipped Motion Studio is now out of scope — undecided

Superseding `2026-07-18-anima-motion-faculty-modes.md` retires a surface that **shipped**, not a
paper design. Its §6.2 records the two v1 modes landing, and the code is there:
`docs/src/components/studio/MotionStudio.tsx` (667 lines, Director + Rig), registered as the fourth
Fabricate tab, with `scene-library.ts`, `architect.ts` and the `kind:'scene'` asset rail behind it.

Under the narrowed scope, motion attaches to what the engine already renders. Nothing in that scope
needs a Studio surface for authoring standalone scene assets. **So this faculty has no role in the
plan, and no decision has been made about it.** Three options, none taken:

| | |
|---|---|
| **Leave it** | Costs nothing today; leaves a live Studio tab whose output the new direction does not consume, and which cites a superseded note as its design. |
| **Retire the tab, keep the code** | Removes the user-facing surface without deleting work, pending a decision on whether scene assets ever return. |
| **Delete it with the Zdog excision** | Cleanest, and the prove-then-cut sequencing already schedules a Zdog removal pass — this would ride it. |

This is a human call and is deliberately left open. It should be made **before** the Zdog excision,
because that pass is where the cost of each option is lowest.

## 7a. One loose end, closed — and a claim retracted

**`docs/src/lib/anima/README.md` was stale and IS fixed here.** It is the first file anyone opens
in that folder, and it said "Stage 1 is the pure core — no backend yet" (both backends ship and
`hydrate.ts` imports them), presented a three-engine table naming a Three.js backend that was
**never built**, pointed at the superseded 2026-07-17 note as its design contract, and listed 7 of
the 14 non-test modules in the folder (11 top-level + 3 backends). It now carries a banner pointing here, and each of those claims is
corrected against the tree.

**RETRACTED: the claim that `docs-typecheck` is broken on `main`.** An earlier draft of this
section said `docs/astro.config.mjs` imported a name `@astrojs/markdown-remark@7.3.0` does not
export, set a `markdown.processor` key invalid in Astro 7, and left `astro sync` unable to load the
config — and used that to explain why the README fix was withheld. **All three are false.**
Measured on this branch, `2026-09-02`:

- `npm --prefix docs run typecheck` (`astro sync && tsc --noEmit`) exits **0** with no diagnostics.
- `@astrojs/markdown-remark@7.3.0` **does** export `unified` — a real ESM import from the `docs`
  workspace resolves it, alongside `createMarkdownProcessor`, `rehypeShiki` and nine others.
- `markdown.processor` **is** a valid Astro 7 key. `astro.config.mjs` carries `// @ts-check` and is
  inside the tsc program (confirmed via `--listFiles`), and tsc accepts the object. The check is
  sensitive at exactly that position: planting a bogus sibling key next to `processor` raises
  `TS2353`, and the error text enumerates the valid keys **including** `processor?:
  MarkdownProcessor<...>`.

So `650712c` is not half-done, no port is owed, and nothing blocks a `docs/` edit. The retraction is
kept in place rather than deleted, because the false claim was load-bearing: it was the stated
reason this note left a stale doc unfixed, and it was written from a failure that was never
re-derived before being recorded.


## 8. Verified on the real surface — and what is still not

**The core claim has a real-surface artifact.** `docs/e2e/anima-motion-frames.spec.ts` drives the
**real Playground on the built site** — not a harness — with a real `funnel` deck, and measures the
**live** marks. (`.scene-live` holds the animated copy; the figure's first svg is a `display:none`
poster whose `opacity` is never written, so a bare `[data-anima-role]` selector reads frozen nulls.)

| Claim | Measured on the real Playground |
|---|---|
| The build really runs, ordered | every mark observed **below 1** mid-reveal, monotonic non-decreasing, and each band completes **strictly after** the one above it |
| anime.js loses nothing as a painter | every frame value our painter emitted, written through `anime.utils.set` and read back, within **~5e-7** — 4 orders of magnitude inside one 8-bit opacity step |
| `createDrawable` needs no geometry | stamps `pathLength="1000"` on a real funnel polygon; `getTotalLength` instrumented and **never called** |
| anime's seek is path-independent | the same frame reached forward, from 0, and from the end yields an identical `stroke-dasharray` |

**Read the second row precisely.** It measures anime as a **painter** — handed a frame value our
model produced, does it land that value on the element without loss? It is **not** a comparison of
two tween curves; no anime-generated easing is involved, and the residual is anime's own
6-significant-digit formatting rather than any disagreement about motion. That is the property the
frame model actually requires ("two painters, one `at(t)`"): the model owns the frames, the painter
only paints them. The bake-off's pixel comparison of two *animations* remains a harness result.

**Counts here are per-run, not constants.** The frame count is however many `requestAnimationFrame`
ticks the build spans on the machine running it — measured **167–169** distinct frames across five
runs here, with the max delta ranging **4.88e-7 – 5.15e-7**. The spec asserts floors (`> 20` frames,
`> 80` comparisons) and a bound, never these figures. An earlier draft of this section quoted
"169 / 676 / 4.98e-7" as if they were fixed; they are timing artifacts of one run.

**The CHANNEL differs, and precedence is not a race.** anime writes the **CSS property**
(`style.opacity`); the shipped painter writes the **`opacity` presentation attribute**. Inline style
outranks a presentation attribute, so once anime has touched a mark **the CSS channel wins
unconditionally** — the shipped painter can run last, on every frame, and still lose. Measured:
style `0.75`, then `setAttribute('opacity','0.1')` afterwards, computed stays **`0.75`**. An earlier
draft of this note said a half-migrated mark would be driven by "whichever painter ran last", which
is backwards and would send someone hunting for an ordering bug that does not exist.

**Mutation-proved: the five assertions that carry the argument.** Not every assertion in the file —
the earlier claim of "each" was an overclaim. Each of these was broken deliberately and fails as it
should: sampling only after settle (the frozen-chart regression — *"every mark was observed
mid-reveal"* fails); asserting the reverse stagger order (real indices `[49, 84, …]`); expecting
`pathLength` `999` (reports `1000`); a `1e-12` delta bound (reports the real ~5e-7); and claiming the
presentation attribute wins precedence (reports `0.75`). The first of those matters most: **before
it was added, the whole test passed on a chart with zero motion** — a regression that mounts every
mark at 1 satisfies "monotonic" and "settles at 1" perfectly.

**This narrows a gap this note found, and the narrowing is partial.** At the parent commit, none of
the 82 specs in `docs/e2e/` referenced `data-scene-spec`, `scene-live`, `data-anima` or
`hydrateScene`; this is the 83rd and references all four. But it carries no `@smoke` tag, so it runs
**only in the nightly** (`studio-e2e-nightly.yml`) — `ci.yml` runs `test:e2e:smoke` and pre-push runs
no e2e at all. Live motion now has real-surface coverage that **cannot block a merge**, which is the
exact shape of the #780 drift `docs/e2e/studio-fixture.ts` documents.

### What a second audit found, after the engine slices landed

An independent checker audited the engine and export commits (the first checker had seen only
the decision notes). It returned **14 findings**. Two were blockers, and both are fixed here:

- **Front-matter scalars reached the player's inline `<script>` unescaped.** A deck writing
  `motion-style: "</script>…"` rendered attacker markup in the exported file AND truncated the
  script so its sha256 CSP hash stopped matching — which blocks the **whole player** and hands
  every recipient a dead deck. The repo's own idiom (`.replace(/</g, '\\u003c')`, used two
  functions away in the same file) is now applied and pinned by a test that fails when the
  escape is removed.
- **The shipped `examples/anima-scene.md` stopped drawing in order.** Its five elements carry
  `span: 1` with no `at`, which under Vivus's one document-order scalar drew sequentially and
  under per-element seeking drew in lockstep — while the slide's own body text says *"The
  drawing ORDER is the meaning — node, arrow, node."* A window per element restores it
  (measured on the real export: `n1 → a1 → n2 → a2 → n3`, not lockstep). This is HARD RULE #18:
  a surface that worked before the change and did not after.

Three more were the same defect wearing three faces: **one question with three readers.**
"Does this deck animate a chart?" was answered by the exporter, the Studio panel, and the live
cascade — differently. Measured: `motion: On` animated live and exported a still; a legacy
`chart-anima` slide did the same; a `motion-build` slide (a STYLE parameter, not a switch)
shipped 22,845 bytes of player that never moved. The rule now lives once in
`lib/core/resolve-motion.mjs` and is pinned against the runtime cascade by
`docs/src/playground/motion-eligibility-parity.test.ts`.

And one finding was about this work's own honesty: **four mutations to the "verbatim" extracted
painter survived all 3,601 docs tests.** Deleting `vivus.test.ts` took 21 cases with it and the
replacement covered only the draw channel, so the extraction's central claim was unfalsifiable.
`svg-paint.test.ts` restores that coverage and each of the four mutations now fails.

### Reduced motion in a forwarded file — DECIDED: as designed

**A recipient whose OS asks for reduced motion still sees a chart build, and has no control to
stop it.** That is the decision, taken deliberately rather than inherited by accident.

The reasoning, in order:

- **It is not a new behavior, it is the SAME behavior.** `effectiveTier` drops to `legible`
  under the floor, and `toLegible` strips the vestibular verbs — of which a chart uses none. A
  staggered opacity fade is not a vestibular trigger; the tier is *reduce*, not *remove*. The
  live Playground has always done exactly this.
- **The old export honored the setting by ACCIDENT, not by design.** It never animated charts
  at all, so there was nothing to suppress. Reading that as a property we are now losing
  mistakes an absence for a guarantee.
- **Diverging the two surfaces is the expensive option.** Three of this change's defects were
  one question answered differently by the exporter and the live cascade, each one silent. A
  deliberate fourth divergence — even a well-intentioned one — buys a smaller problem with a
  bigger one.

**What is given up, stated plainly:** charts pass `chrome: false`, so unlike an authored scene
there is no pause and no "Play the motion" opt-in. A recipient who wants it still has none.
Revisit this by giving charts a control on BOTH surfaces — that was a considered product call
("the control read as a gimmick"), and reversing it is its own change, not a rider on this one.

**Still open, and smaller:** a settled chart keeps its `highlight` emphasis, so one band stays
outlined in a way the PDF of the same deck is not. Pre-existing on the live surface, newly
visible in an artifact people forward.

### Still not verified

- **The `--player` export HAS now been driven, and the result was a correction, not a
  confirmation** — chart motion does not ship there at all (§3). That closes the question for the
  player and opens a piece of work.
- **The presenter window is still not driven.** It is reachable, but the Studio needs a deck
  created through its own flow, and it runs the SAME `createAnimaScenes` / `DeckPreview` path the
  Playground already exercises — so the incremental evidence was judged not worth the cost. Named
  rather than quietly skipped.
- **The bake-off's `0.000% mean diff` is still a HARNESS result**, and its harness is in gitignored
  `.scratch/`, so §5, §10 and §12's numbers are not re-derivable from the tree.
- **`morphTo` is unproven.** It no-ops in jsdom and nothing here exercises it on a real surface.
- **Nothing here measures OUR frame model.** No Lattice code implements it yet; the determinism row
  establishes a precondition about the library, not a property of a model that does not exist.
- The spec runs on `desktop` Chromium only — no cross-engine or mobile exposure.
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
section, in every deck that has dividers, and the repo carries **369 committed PDF goldens**. The
SVG MUST render pixel-identically to the spans, or every affected golden re-blesses and the diff
becomes unreadable. That is a design input: put the `cqi` sizing on the `<svg>` root, keep the
viewBox in dot-units so the interior scales as the flex version did, and prove it with
`npm run regress` before anything else lands.

**The gap — SETTLED: today's spacing is the basis, and it transfers exactly.** The dots and the
space between them are already measured against the same ruler, so there is no conversion and no
judgment call:

| | value |
|---|---|
| small dot | `0.85cqi` |
| gap (`--sp-sm` = `calc(1.25 * 1cqi * var(--canvas-scale))`) | `1.25cqi` |
| current pill | `2.6cqi` |

The SVG's interior uses those same three numbers and its outer width is set in `cqi`, so
`--canvas-scale` keeps applying exactly as it does now. That also hands the band-allocation policy
its single number: at the full ten dots, nine small (7.65) plus one pill (2.6) plus nine gaps
(11.25) is **21.5cqi** — one declared width instead of a sum that varies with section count.

**The trade is smaller than an earlier draft of this section claimed.** It said the rail "loses
token reach." What is actually lost is narrower: the value is inherited exactly, and the only thing
given up is that a later edit to `--sp-sm` would no longer move the rail's internal gap. Minor, and
worth stating accurately rather than dramatically.

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
orders of magnitude. **8 files** carry a `logo:` key (4 example decks, the logo gallery and docs, `base.docs.md`, and
`test/fixtures/deck-logo.md`), so the goldens at risk are the logo gallery in both modes plus 4 example PDFs: **6, against
the rail's 369.** Validate the technique where a surprise is cheap. And expect one: an `<img>` takes
intrinsic sizing from the file, while an inline `<svg>` falls back to its viewBox or to 300×150
unless width and height are carried across explicitly. This supersedes §10's implied ordering.
