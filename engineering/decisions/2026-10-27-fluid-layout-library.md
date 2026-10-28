---
status: in-progress
summary: Fluid, one runtime library that replaces both auto-split and the --fluid viewer. It is a post-processor over RENDERED slides, not over source. It reads the live canvas and the real content, then reflows or paginates. Structure decides the seams and the page count. Measurements and manifest budgets are hints, so they can rescue a page that still overflows but cannot change a deck's shape. Live surfaces rescue from measured heights; files (PDF, PPTX, the static pages in HTML) rescue from budgets only, so they stay reproducible. Audit of the five split paths and the fluid viewer, the design, the jank contract, and an eight-phase plan (P0–P7) that ships a Playground slice before the catalog migration. The owner settled nine forks on 2026-10-27, including the library name Fluido, and the "autosplit" name retires. Hardened by the adversarial trio the same day (§11).
builds-on: 2026-09-01-autosplit-splits-on-structure.md, 2026-06-22-the-fit-spine.md, 2026-10-16-mosaico-layout-library.md, 2026-07-20-adaptive-viewport-fill.md
---

# Fluid: one runtime library for reflow and pagination (2026-10-27)

**Status: in progress.** The owner settled the nine forks in §9 on 2026-10-27, and the adversarial
trio reviewed the design the same day (§11). P0 is built (§12). The canonical doc for what is true
now is [`../fluid.md`](../fluid.md).

## 1. The answer first

Lattice paginates content in five places, and each one does it a little differently. The
fluid viewer, which sizes slides to the reader's screen, never meets any of them. This note
replaces all of that with one library, **Fluid** (`@laticent/fluido`). It works like this:

1. **It runs after render, on the real thing.** The input is rendered slide HTML and a
   canvas, meaning the live box the slide is shown in. It reads no source, no markdown and no
   precomputed capacity map. The structure it needs travels in the rendered markup.
2. **Structure decides; measurements and budgets are hints.** A component's seams decide
   where a page may break, and the page count follows from them: a cover, one element per
   page, then a closing page (the 2026-09-01 rule, unchanged). The two hints are a real
   measured height and a manifest budget. A hint can do one thing: **rescue** a page whose
   single element still overflows, by cutting it at an inner seam such as table rows, code
   lines or list items. Today that page clips and shows the overflow ring.
3. **One name.** Reflow (the family CSS responding to the box) and pagination are two moves
   of one fit operation, so they share a name: **Fluid**. "Auto-split" and `autosplit`
   retire as names.
4. **The canvas is fluid everywhere.** The HTML viewer, the Playground and the player run
   Fluid on the live box. The Studio runs it on the deck's authored size, with a device
   toggle (§5.5). PDF and PPTX run it on the slide box, never the paper sheet. Every surface
   runs the same algorithm, so the **structural** plan is identical everywhere.
5. **Files are reproducible.** A file (PDF, PPTX, or the static pages baked into an HTML
   export) rescues from budgets only, so the same deck gives the same file on any machine.
   Only a live surface rescues from measured heights.
6. **A Mosaico-style package.** It has a pure, DOM-free core (numbers and seams in, a page
   plan out), a DOM adapter that measures and applies the plan, and a Lattice connector.
   Other domains can reuse the core, such as the docs site, the player and a non-Lattice
   producer.

What it buys: a 16:9 deck opened on a phone paginates, which it does not do today. A panes
slide splits per pane in the fluid view. A long table cuts at its rows instead of clipping.
The linter predicts a file's page plan exactly, because a file uses no measurement.

## 2. What the audit found

The audit read source, not docs, and the docs were often wrong (§2.4).

### 2.1 Five paths paginate content, and a sixth is dead

| # | Path | Where it runs | Input | What decides a break |
|---|---|---|---|---|
| 1 | `splitDoc`, `lib/core/auto-split.js:508`, plus 14 strategies in `lib/core/carousel.js:1739` | CLI in Node (`lattice.js:3780`), Playground (`lib/playground/index.js:225`), Studio (`docs/src/lib/single-slide-render.ts:1803`), player export (`share-export.ts:459`) | rendered document HTML string + a capacity map baked from manifests | structure, one element per page (`splitTargetOf` returns 1) |
| 2 | the per-strategy `perPage` in `carousel.js`: code at 12 lines; a fallback of 4 for cards (`:418`) that no shipped manifest reaches, since all 15 others set `perPage: 1` | inside #1 | the same | manifest numbers that override #1's rule |
| 3 | `installPaneSplit`, `lib/core/panes.js:560` | markdown-it tokens, before slides form | tokens | authored size is not `wide` |
| 4 | `arrangePanes`, `lib/core/pane-spec.js:276`, path 3's helper at `wide` (`panes.js:590`) and the linter's (`lint-core.js:2819`) | markdown-it, `wide` only | tokens + `pane-catalog.generated.js` | fits precomputed at build time |
| 5 | `splitSlideInHalf`, `docs/src/components/studio/split-slide.ts:146` | Studio, edits the source | source text | halves the biggest list, with its own collection finder |
| 6 | `split-slides.js`, a fence-aware `---` slide splitter | nothing calls it | — | dead; only its test imports it, superseded by `slide-boundaries.mjs` |

In practice paths 1 and 2 disagree only on code, and path 5 disagrees with both.
One case in path 2 is already a rescue in all but name. A code slide with a single block
over budget is cut by line-run (`carousel.js:1272`), because that one block is what clips.
It cuts on a manifest number, not a measured height, and no other component gets the
equivalent. Fluid's rescue move (§3) generalizes it.
Path 1 is put together twice: the CLI composes `splitDoc` and `railRun` inline, while every
browser surface calls `structuralSplit` (`lib/core/structural-split.js:157`).

### 2.2 Fluid and split never see the same box

- Split gates on the **authored** size before render: `splitApplies`
  (`structural-split.js:102`) and `AUTOSPLIT_APPLIES` (`lattice.js:2152`).
- The fluid viewer (`lib/base/base.fluid-view.css`, `initFluidView` at
  `lib/runtime/index.js:3375`) re-derives the family from the **viewport** after export and
  re-stamps `data-family`. It never paginates. Its own CSS says over-dense content "overflows
  and clips … later autofit / re-pagination capabilities address" (`base.fluid-view.css:70-71`).
  Nothing does yet.
- The result: a 16:9 deck opened fluid on a phone is re-stamped `strip` (390×844) and never
  split. A portrait deck opened fluid on a desktop is `wide` and stays split. A panes deck
  keeps both panes side by side on a phone, because `patchSectionGeometry` walks only
  `section` elements and a `<lat-pane>` is not one (`runtime/index.js:2410`).
- **Rendered, 2026-10-27.** `node lattice.js examples/panes.md out.html --fluid`, opened in
  Chromium at 390×844 (Playwright). All 8 sections read `data-family="strip"`. Six of the
  seven panes slides keep their panes side by side, at 92–214 px wide each, and the seventh
  was authored stacked. On slide 5 the table's `MARGIN` column clips and the slide shows
  "Content clipped" ([`panes-fluid-390.png`](2026-10-27-fluid-layout-library/panes-fluid-390.png)).
  The same render shows each pane printing its own page number, `1`. That shows in the 16:9
  HTML export too, not in the PDF, and it is already tracked
  (`followups.d/2898-p1-every-pane-prints-its-own-page-number.md`).
- Fluid is opt-in (`--fluid` or `fluid: true`). The Studio and the Playground never use it.
  Three components decide the slide box separately: the fluid CSS, the player and Present
  letterbox (`present-transport.mjs:32`), and the docs filmstrip.
  `2026-07-20-adaptive-viewport-fill.md` §9 lists converging them (P2), fill as the default
  (P3) and live portrait split (P4). None of the three is built.

### 2.3 Manifest budgets: four kinds, two of which reach the cut

| Field | Feeds |
|---|---|
| `capacity.soft/hard/sweet` | lint only (`auto-split.js:181-191`) |
| `capacity.axis`, `split.strategy` | the enrollment gate and the seam, through a hand-written whitelist (`splitCapacityFrom`, `structural-split.js:80`). A field left off the whitelist silently does nothing. |
| `split.perPage` | some strategies (path 2) |
| `venueCapacity`, `density`, `pane.budget` | lint, review and the pane catalog. Never the cut. |

### 2.4 Docs that contradict the source

- `2026-07-29-autosplit-is-not-a-toggle.md` says the split fires on fit. It carries a
  superseded-in-part banner, but its front matter still says `status: shipped`.
- The front-matter summary of `2026-06-25-runtime-autosplit-eventual-consistency.md` says
  `resplitDoc` is reused verbatim. Its body has a banner saying it was deleted on 2026-09-01.
- `split-verdict.js:17-36` still describes the runtime as "the second use site when Option B
  is built". Option B's input, `resplitDoc`, no longer exists, and `backlog.d/506.md` was
  rewritten away from it on 2026-09-24.
- The comments in `overflow-probe.js:12-23` say autosplit "divides by measured ratio".
- The `--no-split` help (`lattice.js:196`) says "an overflowing slide".
- `carousel.js:1274` says a code run carries `capacity.hard` lines. The code reads
  `split.perPage`.
- `runtime/index.js:3404-3407` says "fluid in portrait, fixed in landscape". The code fills
  every screen.
- `structural-split.js:74` says `splitTargetOf` "falls back to sweet → soft → hard". It returns 1.
- `2026-09-06-component-owned-split-kernels.md` and `backlog.d/506.md` cite
  `lattice-emulator.js`, which does not exist.

### 2.5 Open defects this design must close

#506 (live split on every surface), #2054 (the last body page shifts because the forward
pointer's space is not reserved), #501, #1838, plus four components that clip silently past
the page edge (`logo-wall`, `matrix-grid`, `state-chart`, `obligation-matrix`; from the
2026-09-06 note). `engineering/jank.md:231-235` adds one more: the jank sweep renders with
`--no-split`, so at non-wide sizes it measures pages the real render never emits. It also has
no viewport axis.

## 3. Why the 2026-09-01 rule survives

On 2026-09-01 the owner moved the split trigger from measured fit to structure, for three
reasons:

- Page count became a property of the renderer.
- A five-pass loop re-cut pages.
- Only a browser could say what a deck would become.

All three still hold, so Fluid keeps structure as the authority. A measured hint can never
merge two members onto one page or change the page count of a deck that fits. It acts only
when the structural plan has already failed: one element on its own page that still
overflows. In that case the alternative is a clip, which is worse than a page count that
depends on fonts. And that dependence stays on live surfaces: files rescue from budgets
(§9.5), so 09-01's reproducibility holds for every artifact anyone ships. Each rescue records
its source (`budget` or `measured`), so the linter says exactly what a file will do and "may
cut" for a live screen.

The Fit Spine's moves map onto Fluid this way:

| Fit Spine | Fluid move | Driven by |
|---|---|---|
| 1 Collapse, 2 Shed | **reflow**: family CSS on the live canvas | `data-family`, re-stamped live |
| 3 Split | **paginate**: cover, body, closing | structure |
| — (new) | **rescue**: an inner-seam cut of one overflowing element | measured heights on live surfaces; budgets in files |
| 4 Floor | **ring**: the honest terminal | overflow probe, after the plan is applied |

There is still no shrink move.

## 4. The jank contract

The owner asked for a design where "we never have to live or experience jank". These seven
properties are what Fluid guarantees, and each one gets a test (§7). The first draft said "read
once, solve once, write once". The red team measured why that cannot hold for a rescue (§11),
so the contract below counts the passes honestly.

1. **One visible write per trigger.** The structural plan needs no measurement, so it is a
   solve and one write. A rescue needs heights **in page context**: on a `square` render of
   the gallery's `cards-grid`, a card measures 469×393 px in the unsplit slide and 972×742 px
   on its own body page. So a rescue gets exactly **one probe pass**. Fluid writes skeleton
   pages into a hidden measuring container at canvas size, reads there, solves, then makes the
   one visible write. The rig asserts at most one probe pass, with a mutation arm. The
   post-write overflow probe can only ring. It never re-plans.
2. **Measure only settled content.** Fluid waits for fonts (extending
   `lib/core/preview-font-gate.mjs`, which today gates only a preview's first reveal), for
   media sizes (`measure-kit` hold), for drawn plugins such as Mermaid (the host draws them
   before layout, `2026-10-15-bridges-and-two-hosts.md` §5.2), and for box-responsive redraws
   that a page placement itself triggers: chart `viewFor`, a Mosaico re-pack, a logo-wall
   mark fetch. Waiting has a cap. Past the cap, a live surface keeps the structural plan and
   does not rescue on fallback metrics.
3. **Reserve before you measure.** The probe page carries the run chrome at its largest
   form. The forward pointer becomes a single-line band with a fixed height and an ellipsis.
   The rail reserves the larger of its two forms (pills, or `k/N` past `RAIL_DOT_MAX`). The
   heading is measured with its `(cont.)` suffix. That closes #2054.
4. **Re-plan only on a real change, with hysteresis.** A live surface re-plans when the
   family changes or the canvas crosses a **named size bucket**, never on raw pixels. Heights
   come from `svh`/`lvh`, never `dvh`, so a phone's collapsing URL bar cannot re-plan
   mid-scroll. A rescued slide stays rescued until it fits with a margin. Resize events
   coalesce to one per frame.
5. **The reader keeps their place, and so does everyone else.** Positions are anchors
   (authored slide, pane, member, offset), not page indexes. That holds for the reader's
   scroll, the Present stage window and console, the player transport, narration and comments.
   A rotate shows the same content.
6. **Same input, same plan.** The core is deterministic. A file depends only on content,
   slide box and budgets, so it is byte-reproducible across machines. A live plan also depends
   on measured heights, and every live rescue is labeled `measured` in the plan.
7. **Fluid does not trip its neighbors.** Fluid's write is one batch, and the runtime's shared
   MutationObserver and `patchSectionGeometry` filter out Fluid's own mutations. Every moved
   or cloned subtree is re-id'd, with `url(#…)`, `href` and `aria-*` references rewritten. The
   red team showed that a duplicate `linearGradient` id in a hidden section paints the visible
   copy white.

**Performance target and kill criterion.** The solve takes under 1 ms per slide. Probe, solve
and write for one visible slide fit inside one 16 ms frame at p95 on the gallery's densest
slide, with 4× CPU throttling. The current slide and its neighbors are planned eagerly, and
the rest of the deck at idle, in the measuring container. A surface that misses the frame
budget ships structural-only until the cost is fixed. **Not yet measured**: P1 and P2 measure
and bless it (HARD RULE #19).

## 5. The design

### 5.1 Three layers

```
@laticent/fluido          docs/src/lib/fluido/, an npm workspace like @laticent/mosaico
                         pure core, no DOM / fs / deps (gated like checkMosaicoBoundary)
  plan(flow, canvas, policy) → Plan
  lib/adaptive/families.js moves in WHOLE (familyFor, orientationFor, canvasScaleFor, …), so
                         the family boundaries keep one home; Lattice imports it back (#1)

@laticent/fluido/dom      host adapter, inlinable as source like PROBE_SRC
  read(root, canvas)  → Flow     batched read of seams + heights, in the measuring container
  apply(root, plan)              MOVES member nodes into page sections; the authored section
                                 stays as their inert home
  unapply(root)                  moves them home again, so a re-plan starts from the original
  watch(root, opts)              canvas observer + buckets + hysteresis + anchors (§4.4, §4.5)

lib/core/fluid-lattice.js  the Lattice connector (not published)
  seam vocabulary for the 79 components (37 enrolled today), the page builders, the size
  gate policy, the ring hand-off to overflow-probe.js
```

**`apply` moves; it does not clone.** The 2026-06-25 note (Amendment 2) measured how much
node identity each approach keeps. Re-parsing kept 64.8% and moving nodes kept 96.8%.
Anima targets, `data-mark` popovers, the chart WeakMap guard and the scroll anchor all depend
on node identity. Cloning is limited to chrome (cover and closing furniture) and to the table
shell a `rows` rescue needs (`thead`, `colgroup`). Rows themselves move. The red team showed
that a `<tr>` re-parsed outside its table loses its structure.

### 5.2 The input: a flow read from the rendered markup

The engine already knows each component's seam from its manifest. At render time it writes
that seam into the markup as `data-fluid-*` attributes:

- the masthead
- the members of the primary collection
- the coda: the below-note, the key insight and the annotation
- each member's inner seam
- the budget hint

**Author-written `data-fluid-*` and `data-split-*` attributes are stripped** in the engine's
raw-HTML handling, before the engine stamps its own. The red team forged
`data-fluid-seam="rows" data-fluid-budget="0"` through both the engine and
`createSlideSanitizer`, because DOMPurify keeps `data-*` attributes. Budget 0 on a 1,000-row
table would generate thousands of pages. The core also caps pages per authored slide at
**64**, and past the cap the slide rings. 64 is this note's own number, not an owner
decision, and P1 measures it against the largest gallery.

```
Flow   = { slides: Slide[] }
Slide  = { id, family?, masthead?, members: Block[], coda?: Block, panes?: Slide[] }
Block  = { id, seam: Seam, height?: number, cuts?: number[], budget?: number }
Seam   = 'rows' | 'lines' | 'items' | 'none'
       | { veto: true }                // e.g. redline never splits a passage
       | { recipe: string }            // a strategy-owned seam the four kinds cannot express
Canvas = { width, height, family, size, chrome: { top, bottom } }
         // px; `size` is the named bucket the plan is keyed on; chrome is the reserve (§4.3)
```

- `height` and `cuts` are px, measured in page context (§4.1). `cuts` lists the offsets of
  the inner seams.
- `budget` is in **seam units per page**: rows, lines or items.
- A **budget rescue** fires only when the member's count exceeds its budget, and only in a
  file or when no measurement is available.
- A **measured rescue** fires only when the member's measured height exceeds the page's
  content box.
- Without heights or budgets, `plan()` returns the structural plan. The linter and the agent
  kit run it with budgets, which is exactly what a file will do.

**That is the hint model: measurements and budgets refine a plan, they never originate one.**

**Panes** are nested slides. A pane boundary is a seam, so on a narrow canvas the plan puts
one pane per page and then paginates each pane. The outer masthead rides the first pane's
cover and the outer coda rides the last pane's closing page. At `wide`, `arrangePanes`' own
`split` outcome stays a legal seam. This replaces the token-level `installPaneSplit` only when
the last caller of the string path is gone (P6), so no surface loses pane splitting in between.

### 5.3 The output: a plan, not HTML

```
Plan = { pages: Page[], notes: Note[] }
Page = { anchor: { slide, pane?, member? }, role: 'whole'|'cover'|'body'|'closing',
         members: id[], rescue?: { block: id, from: number, to: number },
         number: string /* "3", "3.2", "3.2.1" */ }
Note = { slide, kind: 'rescued'|'ring'|'capped', source: 'budget'|'measured',
         block?: id, reason }
```

- **Numbering keeps the authored count.** A three-slide panes deck stays three slides at
  every size. Pane and run pages take dotted sub-numbers (`3.2`, and `3.2.1` for a run inside
  a pane). Today the token-level pane split spends whole slide numbers: a three-slide deck
  reads 1 · 2 · 2.2 · … · 4 at `square`. This is a visible change, so it goes to the owner
  at P4.
- **Notes, captions and `say:` rebind by member id**, not page index. That closes #1838.
  The glossary range pill is computed per page from `members`, which closes #501.
- **Page building happens on the host's side of the sanitizer (HARD RULE #22).** The page
  builders in `carousel.js` and `split-envelope.js` produce markup that holds author text:
  `(cont.)`, the rail segments, "→ next: {label}". `auto-split.js:740-748` records that this
  kernel once turned an authored label into a firing `<img onerror>`. Where a host exists
  (Studio, Playground), the frame posts the pure `Plan`. The host builds the page chrome,
  sanitizes it, and patches the frame. In the exported HTML viewer, which has no host, `/dom`
  builds chrome with `createElement` and `textContent` only, and never assigns an HTML string.
  The package path joins `RUNTIME_MARKUP_EXTRA_FILES` with a justification and a sink count of
  0, so `checkRuntimeMarkupSinks` scans it.
- The 14 carousel strategies split into **seam** logic, which moves into `Seam` and the
  connector, and **presentation** logic, which shapes a cover or a body page. A census at P3
  sorts every strategy before any markup changes (§8).

### 5.4 Policy the owner already set, carried unchanged

- The page plan is cover → body → closing, one element per body page (2026-09-01).
- At the `wide` family members do not paginate and nothing is rescued. Overflow there is a
  layout defect (2026-07-29). The terminal is what 2026-07-29 defined: a file clips and prints
  a build-time stderr line, and a live surface shows the overflow ring. The one `wide` seam is
  `arrangePanes`' pane split. The family is now the **canvas's** family, not the authored one.
- `<!-- stress-slide -->` and `fit: report` opt a slide out. `--no-split` becomes
  `--no-paginate` on tool rigs.

### 5.5 Each surface's canvas

| Surface | Canvas | Rescue source |
|---|---|---|
| PDF, PPTX | the slide box (`@size`), never the `--paper` sheet | budget |
| HTML export and player, static pages | authored slide box, baked at export so a no-JS reader (iOS Quick Look) gets pages | budget |
| HTML viewer and player, with JS | the live viewport, re-planned from the authored originals kept in an inert `<template>` | measured |
| Playground | the live frame | measured |
| Studio | the authored size by default; a device toggle (phone, tablet, desktop) runs the same plan on that canvas | measured |
| Linter, agent kit | named sizes | budget (exact for files; "may cut" for live) |

The `<template>` is a new place markup lives inside the frame, so it gets its own HARD RULE
#22 entry and justification at P4.

### 5.6 Render-time family reads

Some reflow is decided when the slide renders, so re-stamping `data-family` live cannot redo
it. `lib/plugins/math/math.render.js:260-281` emits line-breakable equations only off `wide`.
The engine passes `family` to every plugin (`lib/engine/index.js:300-316`), and panes
re-orient tokens by the authored family. P2 takes an inventory of every render-time `family`
read. Each one either emits both forms and lets CSS choose, or is declared a **re-render on
family crossing**, which is the one stated exception to "post-render only".

## 6. What Fluid is not

- It does not shrink content. There is no fifth move.
- It does not pack several members onto one page by measurement. That was the rejected
  option, because it would reverse 2026-09-01.
- It does not own the slide box CSS. `base.fluid-view.css` stays as the box layer. A Studio or
  Playground surface that does not use the fluid view passes Fluid an explicit `Canvas`.
- It does not render, parse markdown or sanitize. Where it writes markup, §5.3 says who builds
  it and on which side of the sanitizer.

## 7. How we will know it works

- **Parity:** P0 creates the golden this needs, because none exists. The golden is
  `structuralSplit` output for every gallery at `square`, `tall` and `strip`, hashed per page
  (command and deck list in the P0 PR). Through P3 the connector over the core matches it byte
  for byte. `test/oracle/split-oracle.json` changes schema at P3, when `perPage` gives way to
  budgets, and that diff is reviewed.
- **Reproducibility:** a file rendered twice, with cold and with warm fonts, has the same page
  count and the same page hashes.
- **Determinism:** a golden of plan hashes with mutation arms that prove the golden can fail,
  as Mosaico does.
- **Identity:** the 2026-06-25 identity rig keeps at least 96.8% of nodes after `apply`. A
  rotate arm checks that listeners still fire after `unapply` and a re-plan.
- **Jank:** `tools/check-jank.js` gains a canvas axis: 390 → 820 → 1440, rotate, a resize
  storm, and a URL-bar collapse. It asserts zero anchor drift, at most one re-plan per bucket
  crossing, and at most one probe pass. The `--no-split` hole in `jank.md:231` closes, because
  the rig measures the pages the real render emits.
- **Rescue:** every slide that rings today at `square`, `tall` or `strip` is either rescued
  or listed with a reason. A gallery gate diffs the budget rescue set against the measured set
  per family and ratchets the gap down.
- **One paginator:** `checkPaginationOwners` in `tools/check-ownership.js`, with a
  `SANCTIONED_PAGINATORS` allowlist of every module that stamps a split page's role or run.
  Each phase that deletes such a writer removes its entry. The check fails on a stale entry
  and on any new stamper outside `@laticent/fluido` and the connector. Paths that paginate
  without stamping (the pane split, `splitSlideInHalf`) are tracked by name in §8's deletion
  table instead. It is a `build:check` rule, not a new CI job.
- **Surfaces (HARD RULE #23):** real screenshots at three widths on the HTML viewer, the
  Studio's device toggle and the Playground, plus a no-JS render of the player. PDF, PPTX and
  HTML-export artifacts in dark and light go to the owner for export sign-off.

## 8. The plan

The order changed after review (§11). Four earlier plans in this area landed their safe
infrastructure phases and stalled before the risky one, so the risky unknowns now come
second, on one surface, before the catalog migrates.

| Phase | What | Behavior change | Gate |
|---|---|---|---|
| **P0** | Cleanup and guard rails. The CLI calls `structuralSplit` (one assembly). Delete `split-slides.js`, with its `affected-tests` row, the comments that name it, and `engineering/architecture.md`'s two references. Fix the nine stale claims in §2.4: issue #506's body is shared state, so that edit goes to the owner. Create the parity golden (§7). Add `checkPaginationOwners`. Strip author-written `data-fluid-*`/`data-split-*`. Create `engineering/fluid.md` as the canonical doc, with a glossary separating **the fluid view** (the box) from **Fluid** (the plan). Mark 06-25 and 07-20 §9 P2–P4 as absorbed. | none | parity golden green; gate arms fail on a planted second paginator |
| **P1** | The `@laticent/fluido` core: `plan()` (structural, plus budget rescue for `lines`, which generalizes `carousel.js:1272`), with `families.js` moved in whole. `splitDoc` becomes a connector over it. Benchmark scenario, plus bless. | none | parity golden; bench |
| **P2** | **The vertical slice on the Playground** (revised 2026-10-28 to fit first, §13). `/dom` `read`/`apply`/`unapply`/`watch`, structural plan only, enrolled components only, today's seams. Host-side page building. The identity rig. The jank canvas axis. The inventory of render-time family reads (§5.6). Closes #506 for the Playground. | a 16:9 deck paginates in a narrow Playground frame | identity ≥ 96.8%; jank canvas axis; three-width screenshots |
| **P3** | **The catalog.** A seam census sorts every strategy into seam or presentation and extends `Seam` first. Then components migrate to `data-fluid-*` one at a time, behind a ratchet (an enrolled-via-markup count that only rises). The baked capacity map and the `splitCapacityFrom` whitelist retire when the count reaches 37. `perPage` gives way to budgets, and code keeps its line cut through the P1 budget rescue, so no slide regresses. Each of the four silent clips (`logo-wall`, `matrix-grid`, `state-chart`, `obligation-matrix`) gets a seam or an explicit ring-by-rule. | gallery page counts change only where a census entry says so | **owner check:** the gallery page-count diff |
| **P4** | **Live everywhere else.** The HTML viewer and the player (baked authored plan, plus a `<template>` re-plan when JS runs), and the Studio (authored size plus the device toggle). Anchor transport for Present, the player, narration and comments. Panes become seams on these surfaces, with dotted numbering. | a 16:9 deck paginates on a phone; panes split in the fluid view; panes decks keep their authored count | **export sign-off** (the HTML bytes change); **owner check:** numbering |
| **P5** | **The measured rescue** on live surfaces: the probe pass, rescue hysteresis, the frame-budget kill criterion. `splitSlideInHalf` reads the plan instead of its own halving rule. | rings become rescued pages on live screens | rescue census; **owner check** |
| **P6** | **Files on one path.** PDF and PPTX run the connector on the slide box with budget rescue. The Node string path, the token-level `installPaneSplit` and their `SANCTIONED_PAGINATORS` entries are deleted. One box selector (the fluid CSS, the Present `fitScale`, the filmstrip). | export bytes change where budget rescue fires | **export sign-off** (dark and light); reproducibility arm |
| **P7** | Fluid is the default everywhere. `--fluid` and `fluid:` retire, and the viewer's `?view=fixed` mode stays. The vocabulary rename lands (`autosplit` → `fluid`, `split-*` → `fluid-*`). `engineering/fluid.md` absorbs the Fit Spine and the 2026-09-01 note. | none beyond P2–P6 | build:check, docs |

**What each phase deletes** is the other half of the plan:

| Path (§2.1) | Deleted at | Proven by |
|---|---|---|
| 6 `split-slides.js` | P0 | file gone; gate entry gone |
| 2 per-strategy `perPage` | P3 | census; `split.perPage` absent from every manifest |
| the baked capacity map and the whitelist | P3 | the ratchet reaches 37 |
| 5 `splitSlideInHalf`'s halving rule | P5 | it calls `plan()` |
| 1 the Node string assembly, 3–4 token-level panes | P6 | `SANCTIONED_PAGINATORS` holds only the core and the connector; `installPaneSplit` and `arrangePanes`' token rewrite are gone (grep) |

**Kill criterion.** If P2 has not landed within six weeks of P1 merging, the owner decides
whether the core stays, with the connector over today's string path, or is reverted. That way
the plan cannot stall into a third splitter.

## 9. Owner decisions (2026-10-27)

Quoted from the owner's answers, with the date.

1. **Trigger:** structure plus measured rescue. "Measurements are hints. Budgets are hints but
   the real boat is taking in the rendered html as a post processor style thing to do the
   fluid work."
2. **Name:** "the whole thing can be called fluid and we can dump autosplit name."
3. **Fluid scope:** fluid is the box everywhere, and export phases come back for sign-off.
4. **Shape:** a Mosaico-style package. This session delivers this note as a PR, with no
   engine code.
5. **Rescue source, after the trio:** live surfaces rescue from measured heights. Files (PDF,
   PPTX, and the static pages in HTML) rescue from budgets only.
6. **The Studio's canvas, after the trio:** the authored size by default, plus a device toggle.
7. **The library's name, after P0:** **Fluido**, package `@laticent/fluido`, so it matches its
   Italian siblings. The engine concept and its docs keep saying Fluid, the way Mosaico the library
   does mosaic packing.
8. **The mark:** the vessel. One waterline runs across a wide, a square and a tall box, the same
   content in any box, with the family's ringed hub floating above it. Chosen over a "seam" and a
   "spill" concept, both of which echoed Calco's overlapping frames
   (`2026-07-18-sibling-brand-system.md` § Fluido).
9. **The palette:** ochre (honey) with a jade live accent, picked by measured color distance from
   every sibling (same section).

## 10. Open questions for later phases

- **P1:** whether 64 pages per slide is the right cap. Measure it against the largest gallery.
- **P2:** the size of the named buckets (§4.4). Start from the registered `size:` presets
  (`hd`, `portrait`, `story`, `mobile`, …), and measure.
- **P3:** Mosaico's `pack()` already answers "does this fit" for panes on a `wide` canvas.
  Whether `arrangePanes` should move onto it, instead of reading `pane-catalog.generated.js`,
  is a P3 call.
- **Not tried yet:** a classic-scrollbar loop at the 1.05 family boundary. Paginating adds a
  scrollbar, which narrows the box, which can flip the family. The P2 jank axis includes it.
- **Naming:** the package is `@laticent/fluido`, not an Italian sibling noun. That follows the
  owner's own name for it. If the brand system wants a noun, it is a rename at P7.

## 11. Adversarial review (2026-10-27)

The red team, an inversion and an independent checker reviewed the first draft. All three
said the direction holds. They found that the **build** did not, and every point below
changed the note.

| Finding | Evidence | What changed |
|---|---|---|
| A rescue cannot be measured in one read of the unsplit slide | `cards-grid` at `square`: 469×393 px unsplit, 972×742 px on its body page (red team, Chromium 131) | one probe pass in page context (§4.1) |
| Page building moved after the sanitizer, in a same-origin frame | the builders write author text; a past `<img onerror>` in this kernel (`auto-split.js:740-748`) | host-side builds; `createElement` only in the viewer; scan path (§5.3) |
| Authors could forge seams and budgets | `data-fluid-budget="0"` survives the engine and DOMPurify | strip author attributes; 64-page cap (§5.2) |
| A measured PDF page count varies by machine, the 09-01 problem | font backstop timer; `dvh`; CI vs local | files rescue from budgets (§9.5); `svh`; buckets (§4.4) |
| No-JS readers would lose pagination | `player-no-js.test.js` pins iOS Quick Look | static pages baked at export (§5.5) |
| Cloning loses node identity | 64.8% vs 96.8% (2026-06-25 Amendment 2) | `apply` moves; `unapply` (§5.1) |
| Duplicate SVG ids paint nothing | a hidden copy's `linearGradient` blanks the visible one | re-id subtrees (§4.7) |
| P2–P4 regressed code slides and pane splitting | a 34-line block at `square` is cover + 3 pages today | budget line rescue in P1; panes string path kept until P6 |
| §5.4 misquoted the `wide` terminal and missed the `wide` pane split | the 2026-07-29 front matter; `pane-spec.js:266-276` | §5.4 rewritten |
| Panes numbering and index-keyed consumers break | 1 · 2 · 2.2 … · 4 at `square`; `{pv:n}`, `count: slides.length` | dotted numbering; anchors (§5.3, §4.5) |
| Render-time `family` reads defeat a live re-stamp | `math.render.js:260-281` | inventory and re-render exception (§5.6) |
| The plan repeats the stall of four earlier plans | 07-22, 06-25, 07-20 §9, 09-06 | vertical slice second, a deletion table, a ratchet, a kill criterion (§8) |
| Owner checkpoints were undercounted | the HTML export's runtime is exported bytes | sign-off at P4 and P6, checks at P3, P4 and P5 |

## 12. As built

### P0 (2026-10-27)

- **One CLI assembly.** `lattice.js` calls `structuralSplit` with one Chromium navigation instead of
  composing `splitDoc` and `railRun` with a navigation after each. HTML output is byte-identical on
  seven decks, six of which split.
- **The parity golden.** `tools/split-pages-golden.js` (`npm run split:golden:check`) hashes every
  page `structuralSplit` emits for 80 galleries at `square`, `portrait` and `mobile`: 7,347 pages in
  6.3 s. Changing one `(cont.)` marker fails it on three `redline` pages. It runs on demand, not in
  CI, because it hashes engine output and would force every markup-changing PR to re-bless it.
- **The dead splitter.** `lib/core/split-slides.js` and its test are deleted, along with every
  reference to it.
- **Stale claims.** Eight of the nine in §2.4 are fixed. The ninth, the body of issue #506, is
  shared state; the owner approved the edit on 2026-10-27, and it now names `lattice.js` and points
  at P2 and P4. The 07-29 note keeps `status: shipped`, because its
  directive retirement still stands; its summary now opens by saying the fit trigger was reversed.
- **Reserved attributes.** `lib/core/reserved-attrs.mjs` renames every `data-split-` and
  `data-fluid-` in author raw HTML to `data-x-split-` / `data-x-fluid-`, wherever it appears. The
  first cut parsed each token's tags and dropped real attributes only, and the P0 checker broke it
  five ways in Chromium: `<!-->`, `--!>`, a `<!--` inside `<textarea>`/`<style>`/`<script>`/
  `<title>`, and a quote opened in one token and closed in the next, which forged
  `data-split-role` on a top-level `<section>`. The browser carries that state across tokens, so no
  per-token parser is sound, and the blunt rename is. All eight shapes are unit arms, and the
  checker's Chromium and DOMPurify repros come back clean. The engine installs it beside
  `guardHtmlInline`, and the parity golden is unchanged. The same cross-token quote can still forge
  the engine's own `data-lattice-slide`; that predates Fluid and is logged as a follow-up.
- **One paginator, scoped honestly.** `checkPaginationOwners` in `tools/check-ownership.js` counts
  every write of a split page's role or run: templates, concatenations, literals, `setAttribute`,
  markdown-it `attrSet` and `dataset` writes, across `lib/`, `docs/src/` (including `.astro`) and
  `lattice.js`. Today the writers are `split-envelope.js` (2) and `auto-split.js` (1), each in
  `SANCTIONED_PAGINATORS` with its reason, and a file planted in `lib/core/` fails the rule. It
  cannot see a path that paginates without stamping role or run, so the pane split and
  `splitSlideInHalf` stay tracked by name in §8's deletion table, not by this rule.
- **The golden's two arms.** It hashes `structuralSplit` as the CLI calls it and with `settle: true`
  as the live previews do (no gallery page differs between them today). It does not model the
  Studio's one-slide renders.
- **Docs.** `engineering/fluid.md` is the canonical doc, with the glossary. 06-25 is marked
  superseded by this note, and 07-20 §9 carries an "absorbed" banner.


### P0 verification on real surfaces (2026-10-27)

- **The docs site** builds with the P0 engine (`cd docs && npm run build`, route budgets inside
  their ceilings).
- **The Studio**, from that shipped build in Chromium: a `size: portrait` `inventory` deck typed
  into the editor splits into a cover and body pages (the frame showed page 1.3, "3 of 5"), and an
  author `<div data-split-role="cover" data-fluid-budget="0" data-split-label="…">` arrives on the
  page as `data-x-split-role`, `data-x-fluid-budget` and `data-x-split-label`.
- **The deck logo**, which sits outside the 80-deck golden: `lib/base/_logo/logo.gallery.md`
  rendered before P0 (`1ffa5eb`) and after, at `hd` and at `portrait` (where it splits). The HTML
  is byte-identical once the checkout path is normalized, the logo tint ids included, and both
  PDFs (7 and 9 pages) match pixel for pixel.
- **Not driven:** the `/playground/` route itself (it runs the same engine bundle as the Studio),
  and PPTX output.

### P1 (2026-10-27)

- **The package.** `@laticent/fluido` (`docs/src/lib/fluido`) is a pure, dependency-free
  TypeScript core, built to ESM and CJS like Mosaico and guarded by `checkFluidoBoundary` (no
  import may leave the folder, not even `node:`) and its own standalone typecheck
  (`npm run check:fluido` in `docs/`). It exports `planSlide`, `paginates`, `rescueRuns`,
  `fitsCap`, `MAX_PAGES` (64) and `ONE_PER_PAGE` (1).
- **The decision moved, the builders stayed.** `splitDoc` reads the facts (the opt-outs, the
  enrollment, the recipe and whether its refusal is a veto, whether the slide is a re-split) and
  asks `planSlide`, then runs the recipe or the envelope the answer names. The seam is passed as a
  `readSeam` callback that Fluido calls only when the decision gets that far, so a slide a recipe
  handles never has its axis derived, as before. `splitApplies` asks `paginates`, and code's line
  run asks `rescueRuns`.
- **Parity.** The 80-gallery golden is byte-identical, and a one-off sweep of all 402 decks at
  `square`, `portrait` and `mobile` (1,206 renders) against the commit before P1 found 0 diffs.
- **One deliberate behavior change.** A run of more than 64 pages now stays whole and rings, however
  it was built: `splitDoc` checks the run it actually built with Fluido's `fitsCap`, after the
  envelope, the partition or a component's recipe. The longest run in the 402 decks is 41 pages.
  The first version estimated the count inside `planSlide`, assumed every run had a cover and a
  closing page, and never saw recipe-built runs (a 70-block code slide still became 70 pages). The
  P1 checker caught both, and a unit test now pins the exact edge: 64 built pages ship, 65 ring.
- **Cost.** `planSlide` takes about 23 ns a call. `structuralSplit` over the 120-slide gallery
  took 73.8 and 81.8 ms (median of 30) before P1 and 76.2 and 76.4 ms after, inside the noise.
  The benchmark gains a split tier that gates on its slide and page counts, and P0's CLI rows are
  renamed from "(3 nav)" and "(4 nav)" to "(2 nav)": one preprocessor now re-navigates once. P0's
  saving, timed on the real CLI (median of three, the first cold run dropped): auto-split
  8,464 → 7,749 ms, cover-paginate 10,293 → 9,833 ms, against a non-splitting control that moved
  5,653 → 5,408 ms, so about 0.2 to 0.5 s of it is the dropped navigation.
- **A deviation from §8 P1.** The family classifier did NOT move into Fluido. `lib/adaptive/families.js`
  is bundled into the runtime that every exported HTML carries, so re-pointing it at a package
  changes exported bytes, which is export territory. Fluido takes the family as an input instead,
  and the classifier moves at P4, which already stops for export sign-off.
- **The trap P1 hit.** Lattice requires Fluido's built `dist/`, which is not committed. The first
  golden run after an edit to `plan.ts` reported 468 drifts across the galleries, because `dist/` was stale; a rebuild put
  every page back. `engineering/fluid.md` now says to rebuild.
- **The Libraries page.** `/libraries/fluido/` drives the real core: pick a box and some content
  and it shows the decision and the pages it names. Its Learn page is the catalog entry.

## 13. Spike: fit first, then cut the rendered flow (2026-10-28)

The owner asked whether P2 should measure at all, given that a measurement step is easy for the next
component to forget, and suggested the problem is really fitting rendered output into a box and
cutting it like a tall poster. A throwaway spike tested that on six galleries (inventory,
comparison, evidence, progression, statement, chart) at `square`, `story` and `mobile`. Scripts are
in `.scratch/spike/` (not committed). It changes nothing that ships.

**Method.** Render each deck twice: today's split, and with the structural split switched off so
every slide renders whole at the page's own size. On the whole render, a slide fits when no
clipping box overflows and no content leaf falls below the footer line. For slides that do not fit,
collect cut lines that cross no member box and cut greedily, with the continuation pages reserving
one small running-head line instead of the full heading.

**What it found.**

| Size | Slides split today | Pages today | Fit whole, no split | Pages if they stayed whole | Truly overflow |
|---|---|---|---|---|---|
| square | 25 | 123 | 23 | 23 (instead of 111) | 2 |
| story | 27 | 131 | 19 | 19 (instead of 90) | 8 |
| mobile | 27 | 131 | 23 | 23 (instead of 114) | 4 |

1. **Most splits are not needed.** The structural rule splits every enrolled slide with more than
   one member at a non-wide size, whether or not it overflows. 65 of the 79 slides it split fit
   whole, and the screenshots confirm they read well (the agenda at `story` is six lines on one
   page, which today becomes a cover plus six one-line pages). A body page today repeats the full
   heading, 11 to 18% of the page height at the median, and stretches one member's card over most of
   the rest.
2. **Cutting the overflowing ones is cheap and stable.** Where the spike found the right members, a
   cut at member boundaries needs 2 pages where today's run has 5 to 7 (team profile 7 → 2,
   evidence 5 → 2, progression 5 → 2). Reading the boxes and solving took 0.3 to 1.3 ms a slide in
   the page, and two runs on one machine gave identical plans.
3. **The members must be declared, not guessed.** The spike's guess (the element with the most
   children) picked the wrong level on nested layouts such as the roadmap's phases. Cutting needs the
   component to mark its unbreakable pieces in the markup, which is the seam declaration §8 P3
   already plans.
4. **Not every component is responsive.** The pricing comparison at `story` squeezes three tiers
   into one narrow column, one word a line, and clips. No cut fixes that: the component has to
   stack its tiers on a tall box. That is a component defect a catalog-wide fit check would catch.
5. **A catalog fit check is affordable.** One gallery renders at one size in about 3.4 s, so all 94
   galleries at three sizes take about 16 minutes on one core, or about 4 on four.

**Not tested.** Plans on two different machines (CI and the sandbox), which decides whether files
stay reproducible when the trigger is a measured fit. Cracking a single member taller than a page.
The visual design of continuation pages.

**Owner decisions (2026-10-28).**

- **Fit first, measured on the rendered output.** A slide that fits its box after the layout has
  reflowed stays one page. Only a slide that overflows is cut, like a tall poster, into as few
  pages as it needs. This reverses the 2026-09-01 trigger (§3) and §1's "structure decides".
  Whether a file can use the same measured fit and still be reproducible is the first thing P2
  measures, on CI against the sandbox. Until that answer is in, §9.5 (files rescue from budgets)
  stands.
- **Cut boundaries are inferred, not declared.** The host reads the rendered markup for the pieces
  that must stay whole. The spike's one-level guess failed on nested layouts, so P2 has to infer
  better: try each candidate level and keep the one whose cut lines cross no box, with the
  manifest's `capacity.axis` as a hint where it exists. No per-component markup work.
- **Continuation pages follow carousel practice.** Page 1 carries the full heading. A later page
  carries one small running line (the heading at eyebrow size) beside the k/N rail. When a page
  holds one member, that member's own title is the page's headline. The section keeps the full
  title as its accessible name.
- **The catalog fit gate is decided later**, when P2 lands, with the cost above.

**Readability is the input, and fit is measured under it (2026-10-28).** Fitting is not the goal by
itself: the deck has to read at the room it is shown in (a conference room, a hall) and on a phone.
Lattice already fixes that before any fit question: `venue:` sets the type size for the back row
(1.3x at `conference`, 1.5x at `hall`; `engineering/typography.md` §7), portrait and square carry
their own larger hierarchy, and the engine never shrinks text to fit. So the fit check runs on the
slide at its venue's size, and "fits" can only mean "fits at a readable size". The spike re-ran at
each venue:

| Venue | Size | Pages today | Fit whole | Overflow | Pages for the cut slides (today → cut) |
|---|---|---|---|---|---|
| laptop | square | 123 | 23 of 25 | 2 | — |
| laptop | story | 131 | 19 of 27 | 8 | — |
| conference | square | 123 | 14 of 25 | 11 | 16 → 6 (3 slides) |
| conference | story | 131 | 12 of 27 | 15 | 47 → 18 (9 slides) |
| hall | square | 123 | 6 of 25 | 19 | 46 → 19 (9 slides) |
| hall | story | 131 | 2 of 27 | 25 | 73 → 31 (15 slides) |

The structural rule gives the same pages at every venue. Fit first gives a laptop deck few splits and
a hall deck many, each page at the room's type size. Where the spike's guess at the members failed
(6 to 10 overflowing slides per row of the table, about 40% of them), it did not cut at all; P2's
inference has to do better than one level, or those slides ring.

**Tables cut in two directions (owner, 2026-10-28).** A table that does not fit is cut like a
spreadsheet printed across several sheets, a proven technique: rows into bands, and columns into
windows, with the first column (the row labels) repeated on every page and the header row repeated
on every band, so the pages read c1+c2, c1+c3, and so on. Today's portrait behavior is different: the
`cover-cards` recipe reshapes each row into a card (the column headers become labels inside the card)
and gives each card a page. P2 records which one the slice uses; the owner's direction is the
sticky-first-column cut.

**What changes in the plan.** P2 becomes the fit-first vertical slice on the Playground: render
whole, check the fit, cut only what overflows at inferred boundaries, and lay out continuation pages
as above. Its gates gain two arms: the same plan on two machines, and the page-count change across
the six spike galleries. Still open for P2's design: whether a cut slide still opens on a separate
cover page, or keeps its heading on page 1 with the first members.
