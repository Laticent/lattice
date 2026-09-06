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

# Motion is a property, not a craft — the sheet moves to the Inspector

**Date:** 2026-09-06 · **Status:** shipped (pending merge authorization)

> **CORRECTED 2026-09-06, after review.** An earlier revision of this note argued the sheet should
> BE the Fabricate Motion tab. That was wrong, and the reason is worth keeping: **Fabricate is for
> crafting.** Each of its tabs brings a named, reusable asset into existence that did not exist
> before — a theme, a component, a finish — with a live preview and a Library shelf. The sheet
> inspects and adjusts things the engine already draws. That is a property editor, and property
> editors are the Inspector's job. It now lives under the deck Inspector's **Motion** tab, beneath
> the Play/Style/Speed controls whose consequence it reports; the Fabricate tab strip returns to
> three. §7b's open question is answered as **retire the tab** — option 2 of the three it listed,
> not the fourth this note originally proposed.
>
> **The crafting faculty is not canceled — it is unblocked, and it is the next piece of work.**
> `2026-07-19-anima-svg-first-cut-zdog.md` §4 already designed it ("choreograph a drawing": bring
> or generate an SVG, then choreograph how it reveals) and §4.4a recorded why it could not ship —
> Vivus drove the whole drawing off ONE progress scalar, so per-element windows were "explicitly
> not honored", and `reveal`, `highlight` and `slide` had no painting at all. **anime.js closed
> that gap.** Measured against today's tree: `drawStrokes` seeks each track to its own element's
> reveal; `svg-paint.ts` paints per-part opacity (`isFade`), a stroke-weight emphasis channel
> (`hasHighlight`) and a per-part transform (`hasTransform`, `composeTransform`); and
> `SvgElement.transform` exists. **Five of §4.4's six verbs are live; only `fill`/`level` is still
> unpainted.** The faculty that note describes is now buildable, and v1 leads with the **Bring**
> on-ramp — paste or drop an SVG, auto-id its parts, choreograph, save — because Describe rests on
> the make-or-break assumption §4.2 flagged UNVERIFIED, and Bring proves the choreograph surface
> and the Library lifecycle without betting on it.

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

## 2. §7b left this to a human — and the answer is option 2, retire the tab

The frame model listed three: leave the tab, retire it keeping the code, or delete it with the
Zdog excision. It said the call was the human's and should be made before that excision.

**The answer is option 2: retire the tab, keep the code.** An earlier revision of this note
proposed a fourth option — replace it with the sheet — and review rejected it on the grounds above:
a control panel in a workshop. The sheet moved to the Inspector; Fabricate's slot is held open for
the crafting faculty §4 of the SVG-first note describes.

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

## 6. Frames are derived, not counted — and the kernel is deferred

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

**It was written, adversarially reviewed, and then REMOVED from this PR.** Two reviewers
independently objected that it shipped with zero consumers, and a third found a defect that
settled it: `synchronized` could never be true on a real chart scene, because the flag compared
every revealing element's window — and a chart's label window is by construction different from
its marks'. Its own test passed only because the fixture built a label-less scene, a shape
`chartToScene` never emits. A kernel with a wrong invariant, a test certifying the opposite, and
no caller is worse than no kernel. The measurements above are the durable part and they are kept
here; the module lands with the frame strip that needs it.

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

## 10. What the adversarial pass changed, and what it did not

The trio (red team · inversion · independent checker) ran against what was going to ship, and it
moved the design rather than polishing it. The findings that changed code:

| Finding | What was wrong | Now |
|---|---|---|
| **Charts are lists, not fences** | `markCount` read rows inside a ``` fence. **No chart uses that shape** — every chart's data slot is `ul > li`. On a real deck every row read "marks not countable", the one-mark verdict was unreachable, and the unit and e2e fixtures were all written in the fenced form, so they asserted over decks that could not animate at all | Counts the first contiguous top-level list, fence- and detail-aware. Every fixture rewritten in the real shape |
| **`diagram` and `state-chart` were backwards** | Keyed on `render: svg` in the manifest. `diagram` declares SVG and emits NO role (its markup is third-party Mermaid); `state-chart` is `render: hybrid` and DOES emit one. So the sheet said "Carries" on the most common animatable class in the repo's decks and told the author to go fix a component that was already fine | Keyed on `data-anima-role`, measured by grep |
| **Deck `class:` tokens were invisible** | The engine appends front-matter `class:` to **every** section, so `class: motion-off` really does silence a deck. Reading only the `motion:` key made the sheet report the exact opposite on four documented shapes — including a full green board for a deck the author had turned off | Slide and deck-class tokens resolve as one union, with the engine's own precedence. Four new parity cases drive the real `resolveMotion` |
| **A leading modifier hid a whole target** | `component = tokens[0]`, but the engine's dispatch is `CHART_LAYOUTS.find(l => classTokens.includes(l))` — position-independent. `_class: dark funnel` produced no row at all | Position-independent, like the engine |
| **The bulk pickers were dead on two of seven values** | A controlled Radix `Select` only fires when the picked value differs from the one shown, and they showed `Build` and `Auto` — exactly what an author picks to normalize a deck back to default | One-shot pickers with a placeholder, so every pick fires |
| **The deck Play switch was dead on a `class:`-driven deck** | It rendered on, wrote a key the section token outranks, and snapped back with no message | Disabled, with the front-matter line and its tokens named |
| **`putUnreadableScene` dropped the id** | Sent the record down `putAsset`'s no-id path, which resolves `(kind, name)` — so restoring a backup whose `rotor` is unreadable would overwrite a **working** `rotor`, with no version history to recover from | Preserves the id; idempotent across restores |
| **Restore counted what it did not store** | Incremented for rows `putUnreadableScene` had declined | Counts actual writes |

**Two findings were accepted and NOT fixed, deliberately.** A write round-trips the deck through
`splitSlides` + rejoin, which trims slides, drops a deliberately blank one, and normalizes author
separators. That is the **house pattern** — `deck-ops.replaceSlide` does exactly the same and the
Inspector writes through it — so it is a pre-existing defect this change inherits rather than
authors, and #18 says an off-path one gets logged, not pulled into the diff. What this change owed
was to stop *overstating*: the two "nothing changes your PDF" lines now say that no motion setting
changes an exported byte, and that writing one re-saves the deck source exactly as the Inspector
does.

**The inversion's core objection stands and is not resolved by any of the above:** everything the
sheet does, the Inspector can do one slide at a time, and a deck-scale review surface has a
shipped precedent that is *not* a Fabricate tab (`LensesPanel`). It argued for landing §7c alone
and taking §7b's option 2. That case is recorded here because the merge gate is where it should be
weighed, and because the sheet was built to make that reversal cheap.

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
