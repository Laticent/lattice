---
status: shipped
summary: >
  Adding a chart used to cost four hand-edits to one 1650-line file — a layout array, a kernel
  require, a thin adapter, and a figure-class alternation — and the fourth failed silently: the
  kernel ran, the figure was built, and the slide rendered it unframed. Each chart now declares
  its own dispatch in a manifest `kernel` block; `tools/build-chart-registry.js` freezes those
  into a generated registry, and chart-family.js holds no per-chart knowledge at all. The six
  inline kernels moved to their own folders, so all fourteen are alike. Two things the array was
  hiding surfaced: radar's `quadrant` VARIANT collides with the quadrant chart's NAME, so
  dispatch order is load-bearing and is now derived from the manifests rather than settled by
  where a name happened to sit; and gantt was reading kanban's status vocabulary. LPM Phase 1's
  dispatch half, narrowed to what #287 asks for — function-plot, the conformance fixtures and
  spec/LPM-1.0.md are not in this change.
---

# The chart family stops knowing its own members

**2026-09-01 · issue #287, implementing `2026-06-14-plugin-extension-system.md` § Rollout Phase 1**

## The problem, stated as a cost

Adding a chart was four edits to `lib/components/chart/_chart-family/chart-family.js`:

1. the `CHART_LAYOUTS` array,
2. a `require` of the kernel,
3. a `buildXSection` adapter,
4. the layout's figure class in the `bodyRE` alternation the chart-frame wrap scans for.

The outer transformer registry (`lib/transformers/registry.js`) had already killed
exactly this lock-step problem one level up, in 2026-05. The chart family reproduced
it one level down.

Edit 4 is the one worth naming, because **it fails silently.** Miss it and the
kernel still runs, the figure is still built, and the section renders it full-bleed
with no eyebrow, no subtitle and no caption — a slide that looks wrong rather than a
build that goes red.

## What ships

**A manifest block per chart.** Each of the fourteen chart manifests now carries:

```jsonc
"kernel": { "figureClass": "gantt-chart" }
```

One key, because one fact is not derivable: `timeline-list` emits
`timeline-spine`, `kanban` emits `kanban-board`. The kernel's path
(`<name>/<name>.transform.js`) and its entrypoint (`transformSection`) are
convention. A first draft declared both as `module` and `entry`, following the
ADR's leaning toward string refs — and they were dead weight in different ways.
`module`'s only legal value was `<name>.transform.js`, because the validator said
so, which makes it a restatement rather than a degree of freedom. `entry` had no
users at all, and the red-team pass showed what an unexercised one costs: `entry:
"toString"` passed every gate and resolved off `Object.prototype` to a function
that silently swallowed the slide, and a case typo threw from generated code and
took the whole deck render down. A facility Phase 2 would have inherited and cited.

**A generated registry.** `tools/build-chart-registry.js` reads those blocks and
writes `lib/components/chart/_chart-family/chart-registry.generated.js` — static
`require`s, the layout list, the figure classes, and the kernel entrypoints.
`chart-family.js` reads that and nothing else; it now holds no chart name.

**All fourteen kernels in their own folders.** Six were inlined in the family file
(`progress`, `timeline-list`, `piechart`, `gantt`, `kanban`, `matrix-grid`); they
moved out, and the eight that were already modules gained the same entrypoint. The
file went 1650 → 306 lines and owns what is genuinely common: the section walk, the
dispatch, the chart-frame wrap, the idempotence guard.

**One ratified entrypoint.** `transformSection(html, ctx) -> html | { html, cls } | null`,
with `ctx = { cls, classTokens, orientation, utils }`. The `{ html, cls }` arm is not
a hedge: `roadmap` auto-selects its `horizons` card form on a portrait deck, and the
card CSS is gated on the *section* class, so the token has to ride back out. The
`null` arm is a guard, not a path anything takes — a census of all fourteen kernels
over 198 adversarial inputs each returned a string twelve times and `{html, cls}`
twice, never `null`.

`ctx.utils` carries the shared section helpers so a kernel written outside this tree
does not have to guess a relative path to `transform-utils`. First-party kernels
require it directly, which would have left the facility shipped and unexercised — so
the dropped kernel in the folder-drop proof takes **every** helper off `ctx.utils`
and requires nothing. That is the one place the facility is for, and now the one
place it is tested.

**A gate tying the declaration to the code.** `figureClass` is a claim about what
the kernel WRITES, and the chart-frame wrap believes it: `BODY_RE` is built from the
declared set, so a mismatch means the wrap never finds the body and the chart renders
full-bleed — a slide that looks wrong with every test green. That is the same silent
failure the alternation had. Moving the declaration next to its kernel did not close
it; only tying the two together does. `checkChartKernels` (`tools/check-ownership.js`,
via `build:check`) asserts the declared class appears in the kernel's own source,
that the kernel exists at the conventional path, and that it exports
`transformSection`. Mutation-checked on all three arms.

## Why generated and not scanned

`chart-family.js` is bundled by esbuild into `dist/lattice-runtime.js`,
`dist/lattice-emulator.js` and five docs-site bundles. A bundler cannot follow
`require(templateLiteral)`, so a directory scan at require time would leave every
kernel out of every bundle. The ADR already settled this — discovery is
build-time-frozen (§ Performance) — and `lib/runtime/axis-dom-catalog.generated.js`
is the same shape. Zero-registration describes the *authoring* experience; it is
never a hot-path scan.

The registry is committed, so a cold checkout can load `lib/` before anything is built.

## Three things the hand-written array was hiding

**1. Dispatch order is load-bearing, and one pair collides.** A section is dispatched
on the FIRST layout token in its class list. `radar`'s `quadrant` variant is *also*
the `quadrant` chart's name, so `<!-- _class: radar quadrant -->` has two layout
tokens and only one right answer. Fourteen hand-written array positions settled that
by accident — `radar` simply sat earlier in the literal — and alphabetical order
rendered every such slide as a quadrant chart. Caught by
`test/unit/components/radar.test.js`, which is why this is a paragraph and not a
regression.

The fix keeps the resolution *derived*: if chart B's name appears in chart A's
`variants`, A dispatches first; alphabetical within that constraint. A cycle fails
the build rather than picking a side, and so does a duplicated `figureClass`.

**2. The runtime and the engine disagreed about section order.** `applyToDom`
(`lib/transformers/chart-family.js`) looped the layout list and queried each layout
in turn, so it visited sections in LAYOUT order; the engine path walks the document
(`mapSections`). Both mint render-scoped ids from one counter
(`lib/core/render-ids.js`), so on a deck mixing chart types the two paths gave the
same chart a different `chart-spine-N`. Nothing was broken by it — every reference
is inside its own section and no id collided — but it is two of the three render
paths disagreeing about shared state, which HARD RULE #1 exists to prevent. It was
invisible while the layout list was hand-ordered, and the generated order surfaced
it. Fixed by querying the whole selector once, so the runtime walks the document
too and no longer depends on dispatch order at all. Pinned in
`test/unit/transformers/chart-family-dom.test.js` with a fixture laid out in the
REVERSE of dispatch order — the first draft used a fixture that happened to be in
dispatch order and passed against the very walk it was written to catch.

**3. `gantt` was reading `KB_STATUS`.** The status vocabulary sat in the kanban block
under a `KB_` prefix, which read as kanban-private right up until the kernels moved
apart and gantt could no longer see it. It is the family's, and it now lives in
`transform-utils.js` as `CHART_STATUS`.

None of the three was a defect this change introduced. All three were invisible
facts that only a mechanical separation could ask about — which is the argument for
doing the separation, and the reason the section is here rather than in a follow-up
issue.

## The proof

`test/unit/components/chart-folder-drop.test.js` copies `lib/` to a scratch tree,
drops a chart nobody has seen (`tempo-bars`) into the copy, runs the real generator
against it with `--root`, and renders a deck through `lib/engine` loaded from that
copy. It asserts the figure appears, that the chart-frame wrap found it, and that
`chart-family.js` in the copy is byte-identical to the shipped one — plus that the
shipped one names no chart layout at all, which is what makes the claim durable
rather than true-by-luck on this one drop.

The copy is not fastidiousness: the drop has to be a real, valid component for
`loadAll` to see it, which means every other test file in the run would see it too
and hold it to docs, gallery and catalog contracts a fixture cannot meet.

Mutation-checked: pointing the manifest's `figureClass` at a class the kernel does
not emit turns three of the four sub-tests red.

**And the corpus is unchanged.** Every deck in `examples/`, every chart gallery and
every baseline deck — 160 decks, 56 of them carrying 281 chart sections — renders
BYTE-IDENTICAL through `lib/engine` before and after, compared against a worktree at
the pre-change commit. The adversarial pass ran the same comparison its own way (78
decks through both engines, plus 20,832 fuzzed section/token/orientation
combinations and 1,400 jsdom `applyToDom` cases) and found no divergence either.

## What a folder drop does NOT get you

The claim this change earns is narrow, and an earlier draft of the changelog and the
docs overstated it as "adding a chart is a folder drop" full stop. It is the
**dispatch and the framing**. A chart is still absent from six hand-maintained
rosters until someone adds it, and not one of them goes red:

| Roster | What the chart silently loses |
|---|---|
| `lib/transformers/prose-projection.mjs` `MEDIA_COMPONENTS` | the accessible captioned-`<figure>` projection |
| the same file's `CHART_TOKEN_COMPONENTS` | `chart-frame` on the re-hosted figure, so `--chart-cat-N-*` go undefined and fills fall to black |
| `lib/export/image-set.js` `KEYED_CHART_LAYOUTS` (+ a second copy in `tools/export-chart-svg.js`) | standalone-SVG extraction |
| `docs/src/components/studio/export/deck-export.js` `CLEAN_SVG_LAYOUTS` | Studio export cleanup |
| `lib/authoring/scorecard.js` `DATA_LAYOUTS` | the deck scores Data: N/A instead of scoring |
| `docs/src/lib/families.mjs` | the chart never appears in the docs picker |

These are pre-existing and off the path of this change (HARD RULE #18), so they are
logged here and named in `design/skills/chart-component.md`'s checklist rather than
pulled into the diff. Folding them into the manifest the way dispatch now is would
be the right follow-up; the `kernel` block is the shape to extend.

**One of them was already wrong and is fixed here**, because it is a chart-layout
roster that had drifted: `docs/src/lib/single-slide-render.ts` mirrored the old
`CHART_LAYOUTS` and was missing `matrix-grid`, so `stats.charts` under-counted any
deck using one.

**Nothing reads `stats.charts` today** — it is populated there, declared on
`RenderStats` (`docs/src/playground/render-metrics.ts`), and consumed by no
surface. So the drift was latent, not a visible undercount, and correcting it is
worth exactly what it is: a field that would have been wrong the moment something
read it. Said plainly because the first draft of this note and its changelog
fragment claimed a user-visible chip, and there is no chip.

The durable fix is to import `LAYOUTS` from the generated registry instead of
mirroring it — the comment's stated reason for the copy ("neither the engine nor
the playground re-exports the list") stopped being true with this change. It is
blocked on the generated module being CJS while that bundle is ESM, so the mirror
is corrected in place and the import is left as follow-up.

## Scope: what this is NOT

The ADR's Phase 1 is five items. This is items 1 and 2, which is what #287's
acceptance check asks for. Not here:

- **function-plot** (item 3) — the canary for `exec` / `renderPaths` / `degradesTo`.
  Those fields are not in the schema yet, and adding them with one consumer and no
  gate would be the ungated assertion the `render`-nature contract exists to avoid.
- **the `lpm-conformance` fixtures and the 3-path parity gate** (item 4).
- **`spec/LPM-1.0.md`** (item 5).

So the ADR stays `status: proposed`. Its `kind` / `trigger` / `order` / `parity` /
`degradesTo` / `tokens` fields are unbuilt, and nothing here freezes a public API.

**The field is `kernel`, not `render`.** The ADR calls this block `render`; that name
was taken in 2026-07 by the render-NATURE enum (`svg` | `hybrid` | `html`), and
`transform` by the unwired component transform DSL. `kernel` is what this repo
already calls these modules.

**Chart bucket only.** The generated registry addresses a kernel as
`../<name>/<module>` relative to `_chart-family/`, and the chart-frame wrap is what
consumes `figureClass`. Neither holds outside the bucket, so the loader rejects a
`kernel` block anywhere else. Widening it to the ADR's `block` kind is a Phase-2
decision, not a silent one.

## References

- `engineering/decisions/2026-06-14-plugin-extension-system.md` § Rollout Phase 1 — the governing model.
- `engineering/decisions/2026-05-17-shared-transformer-registry.md` — the same move, one level up.
- `engineering/decisions/2026-07-27-render-nature-declaration.md` — why `render` was already spoken for.
- `lib/components/chart/_chart-family/chart-family.docs.md` — the kernel contract as an author reads it.
