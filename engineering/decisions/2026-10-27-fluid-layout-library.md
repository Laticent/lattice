---
status: proposed
summary: Fluid, one runtime library that replaces both auto-split and the --fluid viewer. It is a post-processor over RENDERED slides, not over source. It reads the live canvas and the real content, then reflows or paginates. Structure decides the seams and the page count. Measurements and manifest budgets are hints, so they can rescue a page that still overflows but cannot change a deck's shape. Audit of the five split paths and the fluid viewer, the design, the jank contract, and a seven-phase plan (P0–P6). The owner settled four forks on 2026-10-27, and the "autosplit" name retires.
builds-on: 2026-09-01-autosplit-splits-on-structure.md, 2026-06-22-the-fit-spine.md, 2026-10-16-mosaico-layout-library.md, 2026-07-20-adaptive-viewport-fill.md
---

# Fluid: one runtime library for reflow and pagination (2026-10-27)

**Status: proposed.** The owner settled the four forks in §9 on 2026-10-27. No code has
shipped. The first slice is §8 P0.

## 1. The answer first

Lattice paginates content in five places, and each one does it a little differently. The
fluid viewer, which sizes slides to the reader's screen, never meets any of them. This note
replaces all of that with one library, **Fluid** (`@laticent/fluid`). It works like this:

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
4. **The canvas is fluid everywhere.** The HTML export, the Studio, the Playground and the
   player run Fluid on the live box. PDF and PPTX run the same library against a fixed
   canvas, the page size. Every surface runs the same algorithm, so they cannot disagree.
5. **A Mosaico-style package.** It has a pure, DOM-free core (numbers and seams in, a page
   plan out), a DOM adapter that measures and applies the plan, and a Lattice connector.
   Other domains can reuse the core, such as the docs site, the player and a non-Lattice
   producer.

What it buys: a 16:9 deck opened on a phone paginates, which it does not do today. A panes
slide splits per pane in the fluid view. A long table cuts at its rows instead of clipping.
The linter, the Studio and the export all reach the same page plan.

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
- The result: a 16:9 deck opened fluid on a phone is `tall` and never split. A portrait deck
  opened fluid on a desktop is `wide` and stays split. A panes deck keeps both panes side by
  side on a phone, because `patchSectionGeometry` walks only `section` elements and a
  `<lat-pane>` is not one (`runtime/index.js:2410`, read from source and not rendered).
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
depends on fonts. The rescue is also reported in the plan (§5.3), so the linter and the
Studio can say "this table will cut at rows on a phone" before anyone renders it.

The Fit Spine's moves map onto Fluid this way:

| Fit Spine | Fluid move | Driven by |
|---|---|---|
| 1 Collapse, 2 Shed | **reflow**: family CSS on the live canvas | `data-family`, re-stamped live |
| 3 Split | **paginate**: cover, body, closing | structure |
| — (new) | **rescue**: an inner-seam cut of one overflowing element | measured heights, with budgets as a fallback |
| 4 Floor | **ring**: the honest terminal | overflow probe, after the plan is applied |

There is still no shrink move.

## 4. The jank contract

The owner asked for a design where "we never have to live or experience jank". These six properties are what Fluid
guarantees, and each one gets a test (§7).

1. **Read once, solve once, write once.** Each trigger runs one batched layout read, one
   pure solve and one batched DOM write. There is no measure → split → measure loop. The
   rescue cut takes its seam offsets from the same read, so nothing is measured twice. The
   post-write probe can only ring. It never re-plans.
2. **Measure only settled content.** Fluid waits for fonts (extending
   `lib/core/preview-font-gate.mjs`, which today gates a preview's reveal),
   for media sizes (`measure-kit` hold), and for drawn plugins such as Mermaid, which the host
   already draws before layout (`2026-10-15-bridges-and-two-hosts.md` §5.2).
3. **Reserve before you measure.** Chrome that only paginated pages carry, such as the forward
   pointer, the rail and the run number, has its space reserved in the read. That closes #2054.
4. **Re-plan only on a real change, with hysteresis.** Fluid re-plans when the family changes
   or the canvas crosses a seam threshold, never on every resize event. Resize events are
   coalesced to one per frame.
5. **The reader keeps their place.** A re-plan anchors to (authored slide, member id), so
   rotating a phone keeps the same content on screen.
6. **Same input, same plan.** The core is deterministic: the same content, canvas and
   measured heights give byte-identical output, like Mosaico's golden.

Performance target: the solve takes under 1 ms per slide, and a whole visible slide (read,
solve, write) fits inside one 16 ms frame. Off-screen slides are planned lazily, nearest
first. **Not yet measured**: P1 measures and blesses it (HARD RULE #19).

## 5. The design

### 5.1 Three layers

```
@laticent/fluid          pure core, no DOM / fs / deps (gated like checkMosaicoBoundary)
  plan(flow, canvas, policy) → Plan
  familyFor(aspect)        moves here from lib/adaptive/families.js; Lattice imports it back (#1)

@laticent/fluid/dom      host adapter, inlinable as source like PROBE_SRC
  read(root, canvas)  → Flow     one batched read of seams + heights
  apply(root, plan)              one batched write: clone sections, place members, stamp roles
  watch(root, opts)              canvas observer + hysteresis + anchor (§4.4, §4.5)

lib/core/fluid-lattice.js  the Lattice connector (not published)
  seam vocabulary for the 79 components (37 enrolled today), page builders from carousel.js / split-envelope.js,
  the size gate policy, the ring hand-off to overflow-probe.js
```

### 5.2 The input: a flow read from the rendered markup

The engine already knows each component's seam from its manifest. At render time it writes
that seam into the markup as `data-fluid-*` attributes:

- the masthead
- the members of the primary collection
- the coda: the below-note, the key insight and the annotation
- each member's inner seam (`rows`, `lines`, `items` or `none`)
- the budget hint

This replaces the baked capacity map and the `splitCapacityFrom` whitelist. A rendered
slide carries everything Fluid needs, so any producer that writes the attributes can use the
core, including one that is not Lattice.

```
Flow   = { slides: Slide[] }
Slide  = { id, family?, masthead?, members: Block[], coda?: Block, panes?: Slide[] }
Block  = { id, seam: 'rows'|'lines'|'items'|'none', height?: number,
           cuts?: number[] /* offsets of inner seams, measured */, budget?: number }
Canvas = { width, height }            // px; the live box or the page size
```

Every `height`, `cuts` and `budget` value is optional. Without them, `plan()` returns the
structural plan, which is what the linter, the agent kit and the Node pre-flight use. With
them, it adds rescues. **That is the hint model: measurements refine a plan, they never
originate one.**

**Panes** are nested slides. A pane boundary is a seam like any other, so on a narrow canvas
the plan puts one pane per page and then paginates each pane. This retires the token-level
`installPaneSplit` at non-wide sizes and fixes the fluid panes gap (§2.2).

### 5.3 The output: a plan, not HTML

```
Plan = { pages: Page[], notes: Note[] }
Page = { slide, role: 'whole'|'cover'|'body'|'closing', members: id[],
         rescue?: { block: id, from: number, to: number } , of: [k, n] }
Note = { slide, kind: 'rescued'|'ring', block?: id, reason }
```

The connector turns pages into sections with the existing page builders. The 14 carousel
strategies become presentation only, meaning how a cover or a body page looks. They stop
deciding how many members ride a page. That ends the three-rules conflict in §2.1. A plan is
also what the Studio rail, the k-of-N run number and the linter all read, so none of them
re-derives pagination.

### 5.4 Policy the owner already set, carried unchanged

- The page plan is cover → body → closing, one element per body page (2026-09-01).
- At the `wide` family there is no pagination and no rescue. Overflow there is a layout
  defect, and the ring is the terminal (2026-07-29). The family is now the **canvas's**
  family, not the authored one. That is the point of §2.2.
- `<!-- stress-slide -->` and `fit: report` opt a slide out. `--no-split` becomes
  `--no-paginate` on tool rigs.

## 6. What Fluid is not

- It does not shrink content. There is no fifth move.
- It does not pack several members onto one page by measurement. That was the rejected
  option. It would reverse 2026-09-01.
- It does not own the slide box CSS. `base.fluid-view.css` stays as the box layer, and Fluid
  reads the box it produces.
- It does not render, parse markdown or sanitize. It moves rendered nodes, so the HARD RULE
  #22 markup channel is unchanged. The DOM adapter writes no new markup, only clones and
  attributes. P3 confirms that against `checkRuntimeMarkupSinks`.

## 7. How we will know it works

- **Parity:** before any surface switches over, the connector over the core reproduces
  today's `splitDoc` output byte for byte on every gallery at `square`, `tall` and `strip`, and
  the per-component enrollment records in `test/oracle/split-oracle.json` stay unchanged.
- **Determinism:** a golden of plan hashes with mutation arms that prove the golden can fail,
  as Mosaico does.
- **Jank:** `tools/check-jank.js` gains a canvas axis (390 → 820 → 1440, rotate, resize
  storm). It asserts zero drift of the reader anchor and at most one re-plan per family
  crossing. The `--no-split` hole in `jank.md:231` closes, because the rig measures the
  pages the real render emits.
- **Rescue:** every slide that rings today at `square`, `tall` or `strip` is either rescued
  or listed with a reason. The entry criterion for P4 is that census.
- **Surfaces (HARD RULE #23):** real screenshots at three widths on the HTML export, the
  Studio and the Playground. A PDF and a PPTX in dark and light go to the owner for export
  sign-off.

## 8. The plan

Each phase ships on its own, and the order is set by what it unblocks.

| Phase | What | Behavior change | Gate |
|---|---|---|---|
| **P0** | Cleanup. The CLI calls `structuralSplit` (one assembly). Delete `split-slides.js`. Fix the nine stale claims in §2.4. | none | byte-identical goldens |
| **P1** | `@laticent/fluid` core: `plan()` (structural only) and `familyFor`. `splitDoc` becomes a connector over it. Benchmark scenario plus bless. | none | split-oracle parity; bench |
| **P2** | Seams in the markup (`data-fluid-*`). Retire the baked capacity map and the `splitCapacityFrom` whitelist. Strategies become presentation only, and `perPage` retires. | code at 12 lines/page becomes one element per page plus rescue. **Owner check:** this is the one visible change before P4. | gallery page-count diff, reviewed |
| **P3** | `/dom` adapter and live canvas. The runtime runs Fluid on the HTML export, the Playground and the Studio. Panes become seams. The jank rig gains a canvas axis. Closes #506 and #2054. | a 16:9 deck paginates on a phone; panes split in the fluid view | three-width screenshots; jank canvas axis |
| **P4** | The rescue move: measured inner cuts for `rows`, `lines` and `items`. Retire `splitSlideInHalf`'s own halving rule in favor of the plan. | rings become rescued pages | rescue census (§7) |
| **P5** | PDF and PPTX run the `/dom` adapter in Chromium against the page canvas. One box selector (fluid CSS, the Present `fitScale`, the filmstrip). The player gets Fluid. | export bytes change | **export sign-off (Quality Bar)** |
| **P6** | Fluid is the default everywhere. `--fluid` and `fluid:` retire, and the viewer's `?view=fixed` mode stays. The vocabulary rename lands (`autosplit` → `fluid`, `split-*` → `fluid-*`), and the Fit Spine and 2026-09-01 notes are absorbed into a canonical `engineering/fluid.md`. | none beyond P3–P5 | build:check, docs |

P2 and P5 each change something a reader sees or a file's bytes, so each stops for the owner.
Everything else is reversible and inside the plan.

## 9. Owner decisions (2026-10-27)

1. **Trigger:** structure plus measured rescue. "Measurements are hints. Budgets are hints."
   The real input is rendered HTML, processed after render.
2. **Name:** the whole thing is called Fluid, and the autosplit name retires.
3. **Fluid scope:** fluid is the box everywhere, and export phases come back for sign-off.
4. **Shape:** a Mosaico-style package. This session delivers this note as a PR, with no
   engine code.

## 10. Open questions for later phases

- **P2:** should `code` keep a multi-line page as its "element"? A code block's natural
  member is the whole block, so the rescue cuts it at lines. That would make 12 lines/page an
  outcome, not a rule. The recommendation is yes, and the owner sees the gallery diff.
- **P3:** Mosaico's `pack()` already answers "does this fit" for panes on a `wide` canvas.
  Whether `arrangePanes` should move onto it, instead of reading `pane-catalog.generated.js`,
  is a P3 call.
- **Naming:** the package is `@laticent/fluid`, not an Italian sibling noun. That follows the
  owner's own name for it. If the brand system wants a noun, it is a rename at P6.
