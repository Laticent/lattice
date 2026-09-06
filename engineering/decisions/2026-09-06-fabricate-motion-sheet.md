---
status: shipped
summary: >
  The Fabricate Motion tab stops authoring standalone animated scenes and becomes the deck's
  MOTION SHEET: every target the engine can animate in the open deck, what Play/Style/Speed
  resolve to for each, WHICH SCOPE decided each axis, and whether the motion carries information
  a still cannot. This answers the question 2026-09-02-frame-model-for-motion.md §7b left open as
  a human call — and answers it with a fourth option the note did not list, so the reasoning is
  recorded here rather than assumed. Five independent design tracks produced five designs; THREE
  of five concluded the tab should leave Fabricate entirely, and that dissent is recorded rather
  than buried, because it is the strongest argument against what shipped. The deciding factor was
  reversibility: the sheet's 390px column layout is already the shape of a Studio drawer, so
  moving it to a Lenses-style panel later is a placement change, not a redesign — building it
  keeps both futures open, while deleting the tab closes one. The sheet introduces NO vocabulary:
  it writes the same nine `motion-*` slide tokens and three front-matter keys the Inspector
  writes, through the same writers, as one undo step. The admission test is NEW logic and had to
  be, because `auditScene` yields ZERO notes on any chart-derived scene — measured, not assumed —
  so the bar existed and nothing checked it. Landing first, in its own commit, is the §7c
  data-loss fix: a saved scene whose spec no longer validated was silently dropped from the
  Library AND from the user's next backup.
companion:
  - ./2026-09-02-frame-model-for-motion.md
  - ./2026-09-02-motion-engine-bakeoff.md
---

# The Fabricate Motion tab becomes the deck's motion sheet

**Date:** 2026-09-06 · **Status:** shipped (pending merge authorization)

---

## 1. What was there, and why it could not stay

`MotionStudio.tsx` (668 lines) authored a standalone animated **scene**: a Director mode that
asked a model for a `Scene` as JSON, and a Rig mode with a shape tree, verb chips, and an
inspector for `axis`, `period`, `distance`, `at`/`span` and an `easing` select. Two sliders tuned
**Pace** (`duration`, 1500–8000 ms) and **Poster** (`hero`, 0–1).

Three settled decisions removed the ground under all of it:

| Decision | What it took away |
|---|---|
| The engine bake-off | Vivus and Zdog are out; **anime.js v4** is the painter. Zdog's whole vocabulary — `cone`, `ellipse`, `group`, a rotating `camera` — has no successor. |
| The frame model §1 | *A motion is a finite, ordered set of known frames.* No continuous timeline, **no easing curve to author**, no clock. `duration`, `period` and the easing set are properties of the model that was deleted. |
| The frame model §2.3 | *A hero can only ever BE a known frame.* The Poster slider's bug class is **gone, not guarded against** — so the slider has nothing left to do. |
| The frame model §7b | Motion attaches to what the engine **already draws**. Nothing in that scope needs a surface for authoring standalone scene assets. |

**And the tab was write-only.** Nothing in the product consumed its output: no Library card, no
insert path, no reopen seed, and `deleteStudioScene` had **zero callers**. A saved scene could not
be seen, edited, deleted or placed from any UI. It shipped an engine badge reading `zdog` — and
`vivus` for SVG scenes, a package deleted the week before.

## 2. §7b left this to a human, and this is a fourth option

The frame model listed three: leave the tab, retire it keeping the code, or delete it with the
Zdog excision. It said the call was the human's and should be made before that excision.

**What shipped is a fourth: replace it.** That is a real departure from the note's menu, so the
argument is recorded rather than implied.

- **Leave it** was not available honestly. The tab authored a model with no painter and showed a
  badge naming a deleted package. Leaving it is shipping a known-broken surface.
- **Delete it** was the option three of five design tracks argued for, and it is a good argument
  (§4). It is also the only irreversible one.
- **Replace it** keeps the fourth tab earning its place *and* leaves deletion available: the
  sheet's own 390px layout is the shape of a Studio drawer, and `LensesPanel` is the shipped
  precedent for a deck-scale review surface that is **not** a Fabricate tab. Moving it later is a
  placement change, not a redesign.

Reversibility decided it. The human gate on merge is where the direction itself gets confirmed.

## 3. What the sheet is

> Every target the engine can animate in the open deck — with what the register resolves to,
> **which scope decided each axis**, and whether the motion carries information a still cannot.

**Its answer to "why is this not the Inspector's Motion tab":** the Inspector is a property editor
at one scope and shows the **cause** (`Style: Build`). The sheet shows the **effect** across the
whole deck and writes in bulk. Coherence is a *comparison* problem — nine charts where three
animate is invisible from a panel that can only ever show you one of them — and the Inspector has
no comparison. **The Inspector is the pen; the sheet is the page.**

**It introduces no vocabulary.** It writes the same `motion-on`/`motion-off`,
`motion-build|together|rise`, `motion-auto|slow|normal|fast` slide tokens and the same three
front-matter keys, through the same `setGroupToken` / `writeFrontMatterLine` writers, routed
through the shell's undo-aware `settingsWrite` so a bulk change is **one undo step** and is
indistinguishable from one made a slide at a time. Eight tests drive the **real** `resolveMotion`
over a DOM section and compare its answer to the sheet's, so the two cannot drift.

## 4. The dissent — three of five tracks said retire it

Five agents designed independently from one brief and a shared source map. Recording where they
disagreed with what shipped is the point of running five.

| Track | Position | Kept the tab? |
|---|---|---|
| **A — Proof Sheet** | Retire it (4→3 tabs); motion moves to Compose as a contact sheet of every frame the deck will paint | No |
| **B — no workbench** | Delete it outright; motion becomes a *receipt* in the Inspector's existing Motion tab | No |
| **C — Frames** | **Rename** the tab to *Frames*; per-target frame enumeration saved as a blessed, diffable **frame sheet** | Yes |
| **D — Motion Sheet** | Keep it; deck-wide contact sheet grouped by the frame model's three clocks, with bulk apply | Yes |
| **E — Frames in Compose** | Retire it; a pinnable filmstrip in the Inspector's Motion tab | No |

**The strongest argument against what shipped** is E's, and it deserves to be stated in full:
*Fabricate's test is whether the output outlives the deck.* A theme, a component and a finish are
each a named file another deck can reference. Motion's register is 24 possible states reproducible
in three clicks, and a frame set is **derived** from content that lives in the deck — so saving one
recreates the very defect §7c is about. By that test motion has no artifact, and a tab whose
siblings are defined by making one does not belong beside them.

**Why the tab kept the slot anyway.** Fabricate's four tabs share a *surface* contract — a 50px
header, a live view of the thing, and a generated artifact you can read but not hand-edit — and
the sheet keeps that contract in full. It fails only the *file* half. Theme is color, Component is
layout, Finish is surface, Motion is **time**; three of them produce a file because three of them
are CSS, which is a property of CSS rather than the definition of Fabricate. Its Export is a
**generated review record** (`Copy review`) given the same treatment `FinishStudio` gives its
generated CSS: readable, copyable, not hand-editable, with the reason stated.

**C's blessed frame sheet is deliberately deferred, not rejected.** Making the frame set a saved,
diffable artifact with staleness detection is the sharpest answer to the artifact question and the
most in this repo's grain — 369 committed PDF goldens say so. It is also a new persisted asset
kind (Library card, versioning, export, re-bless), which is its own PR, and E's objection above is
the one it must answer first.

## 5. The admission test had to be new code

The bar is binding (frame model §0.1: *motion earns its place only when it carries information a
still cannot; ornament is banned*). Reusing `auditScene` for it was the obvious move and it does
not work — **measured**:

- Two of its four rules are guarded to `source === 'built'` scenes or to `spin`/`orbit` periods.
  A chart scene is `source: 'svg'` and emits neither verb.
- Its duplicate-signature rule cannot fire: every verb `chartToScene` puts on an element is
  distinct (`reveal`, optional `slide`, optional `highlight`).
- Its still-scene rule cannot fire either: every element it emits carries a `reveal`.
- It has exactly **one** production call site — the tab this change deletes — reading that tab's
  own starter scene. No chart-derived scene could ever reach it.

So a chart yields **zero** notes, not "at most one". The bar existed and nothing checked it.

The sheet's verdicts replace it: **carries** · **review** (one mark is a fade wearing a build's
name; `together` reveals every mark in one window, so it arrives rather than sequences) · **still**
(a decision, not a defect — no warning) · **no roles** (the component renders SVG but emits no
`data-anima-role`, so the register cannot reach it however it resolves). Every non-carrying verdict
carries a sentence explaining itself, because a status you cannot act on is a colored dot.

## 6. Frames are derived, not counted

`docs/src/lib/anima/frames.ts` turns a compiled `Timeline` into the beats it actually paints. The
obvious formula — *marks + labels + settle* — is wrong four ways, each measured against
`chart-anima.ts`:

1. **A synchronized build has ONE window, not N** (`:286`): `together` for any chart, and **every**
   sector chart under every style, because a staggered disc reads as "missing a slice".
2. **Labels are always one window** (`:322`) — `labelAt` is computed once, outside the loop.
3. **There is no settle beat.** Settling is the host holding the last frame; it is reported as the
   final beat's *condition*, never as an extra window.
4. **Adjacent windows always overlap by 0.08 of the duration** (`:301-302`) — 160 ms at the fastest
   speed. There is never an instant where one mark has landed and the next has not begun.

A beat is therefore a window **opening** plus the end of the timeline. That was measured too:
keying on both edges produced **eleven** beats for a real 5-band funnel, seven of which completed
nothing, because every closing lands mid-way through the next mark's arrival. Openings give the
events a viewer can name; the same funnel now reports six, and `bar-4` and the labels correctly
merge — they open 108 ms apart at normal speed, under the legibility floor.

**It ships with tests and no UI consumer yet, and that is a real cost.** It is the substrate a
frame strip needs, and it exists now because the alternative was a UI that states counts a viewer
never sees. If the frame strip is never built, this module should be deleted rather than left.

## 7. The §7c data-loss fix, landing first

A saved scene whose spec no longer validated was dropped from the Library **and** from the user's
next workspace backup, silently. Tighten the schema and every record under the old shape vanishes
from the only copy they had. HARD RULE #18 forbids shipping past it, and §7c requires any
retirement path to owe a migration or an export first.

**Fail-closed on RENDERING, fail-open on EXISTENCE** — different guarantees, and conflating them is
what let a schema change delete someone's work. `listStoredScenes` reports an unreadable record
with its parse reason and the record verbatim; `listStudioScenes` keeps its old renderable-only
contract for the UI callers that rely on it. `specVersion` is stamped on save, so a record with
none is *older than the stamp*, not *corrupt*. The backup packs unreadable records in their own
lane (they cannot go through `packBundle`, whose `StudioScene[]` signature requires a spec that
validates) and restore puts them back untouched. A failed shelf read is recorded rather than
reported as an empty shelf — but it does **not** abort the backup: a browser with no IndexedDB has
no scenes to lose, and refusing to back up the decks there trades a small reporting lie for a much
larger loss. That distinction was caught by the existing suite when an earlier draft did abort.

## 8. What this deletes

`MotionStudio.tsx` (668) and its test (93) · the scene-AI prompt and bridge in `architect.ts` (106
lines teaching `spin`/`orbit`/`explode`/`period`/`easing`, all dead vocabulary) and its test (123)
· `sceneEngine` and its `'vivus'` pin. **Seventeen authored controls become zero**, and the tab
gains no slider at all.

**It does NOT unblock the Zdog excision, and an earlier draft of this note wrongly said it did.**
`backends/registry` still has two non-test importers besides the deleted tab —
`anima-scenes.ts:18` (the live host for authored `scene` slides, which can carry `source:'built'`
specs that require the Zdog branch) and `tools/build-anima-player.js:48`.

## 9. Three docs asserted behavior the code does not have

Found while building, fixed here:

- **`lib/base/base.docs.md`** promised an animated chart "the corner playback control (pause /
  play / replay)" and said reduced motion drops it "to the safe, legible build". The chart path
  passes `chrome: false`, so no control is ever attached; and the live host mounts a
  reduced-motion chart **settled** — the finished still, not a reduced build.
- **`lib/components/imagery/scene/scene.manifest.json`** claimed four times that the Motion faculty
  inlines a saved scene's poster and writes the `anima` block for you. It never did — the old tab
  never called `Renderer.poster()` and never wrote `poster`.
- **`2026-09-02-frame-model-for-motion.md`** contradicted itself: its summary said **9** components
  declare `render: svg`; its own §4 says 7 charts + `diagram`. Measured: **8**. The summary likely
  collided with the *other* 8 in that same row — the count of files emitting `data-anima-role`,
  which is a different set. Three of the five design tracks independently caught this.

## 10. Known open, and deliberately not fixed here

- **A reduced-motion viewer gets the full build in the EXPORTED HTML player.** Live surfaces mount
  settled (`anima-scenes.ts:194` passes `startSettled: settled || reduce`), but
  `tools/build-anima-player.js` passes no reduced-motion signal at all, and charts carry no control
  to stop it. That is a WCAG 2.2.2 gap in a forwarded artifact. It is **off the path** of this
  change (the export pipeline, not the Fabricate tab), so per HARD RULE #18 it is logged rather
  than pulled in.
- **The rename question.** Two tabs in one Studio are called *Motion* and do different jobs.
  Track C's rename to *Frames* is a good fix and a product-vocabulary call left to the human.
- **Per-row frame strips.** D's design put a frame strip on every row; the cost of mounting a
  renderer per target was never measured, and the honest version needs `frames.ts` wired to a real
  rendered SVG. The selected-target depth view is the natural next slice.
