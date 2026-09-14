---
status: shipped
summary: >
  Phase 1 of the plugin rollout: kill the hand-maintained rosters. Adding a chart touched zero
  lines of chart-family.js and still needed about six edits to unrelated lists in five other
  files — and NOT ONE went red, so a forgotten one shipped as black fills or a vector export
  silently downgraded to PNG. The census found the rosters were worse and better than the note
  claimed: nine literals, not six (one hid inside a page.evaluate under a different name), and
  FOUR of them held the IDENTICAL twelve names. One fact wearing four names. Each component now
  declares one `projection` block — how its rendered visual travels off the slide, and whether
  its substance is data — and one generated ESM catalog projects the sets every consumer reads.
  Eight of the nine derived sets are member-identical to the literals they replace; the ninth
  gains three names its own comment said belonged. Deliberately NOT inferred from existing
  manifest fields: that was tried here before and got two components backwards. A chart that
  forgets to declare now fails the build, which is the arm the six rosters never had.
last-updated: 2026-09-13
companion:
  - ../../lib/core/projection-catalog.generated.mjs
  - ../../tools/build-projection-catalog.js
  - ../../test/unit/components/chart-folder-drop.test.js
  - ./2026-09-13-plugin-architecture.md
  - ./2026-09-01-manifest-driven-chart-dispatch.md
---

# The rosters stop being hand-maintained

**Date:** 2026-09-13
**Implements** [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md)
§ Rollout **Phase 1 — kill the rosters**, the prerequisite for every phase after it.
**Continues** [`2026-09-01-manifest-driven-chart-dispatch.md`](2026-09-01-manifest-driven-chart-dispatch.md),
whose § "What a folder drop does NOT get you" logged exactly this debt.

## The problem, stated as a cost

Adding a chart is a folder drop for **dispatch and framing** — real, and pinned by a test.
It was not a folder drop for anything else. Six hand-maintained rosters in five other files
each had to be remembered, and the plugin note named the consequence:

> **Not one of them goes red.** Omit the first and `--chart-cat-N-*` resolves to nothing, so
> fills render black. Omit `CLEAN_SVG_LAYOUTS` and vector export silently downgrades to PNG.

That is the blocker for the whole rollout, because a third party cannot hand-edit
`deck-export.js`.

## What the census found

Two things the plugin note did not know, both of which changed the design.

**There were nine literals, not six.** `tools/export-chart-svg.js` carries its copy *inside a
`page.evaluate()` callback*, named `KEYED` rather than `KEYED_CHART_LAYOUTS` — invisible to a
grep for the exported name, which is why the earlier count missed it. And
`prose-projection.mjs` held five sets, not two.

**Four of them were the same twelve names.** Measured, not eyeballed:

| Roster | File |
|---|---|
| `CHART_TOKEN_COMPONENTS` | `lib/transformers/prose-projection.mjs` |
| `KEYED_CHART_LAYOUTS` | `lib/export/image-set.js` |
| `CLEAN_SVG_LAYOUTS` | `docs/src/components/studio/export/deck-export.js` |
| `KEYED` | `tools/export-chart-svg.js`, inside the `page.evaluate` |

Same twelve members, three different orders, four different names, two module systems. They
are all asserting **one fact**: *this chart renders as a single self-contained `<svg>`.* The
prose projection cares because such an SVG re-hosts cleanly but loses its
`section.chart-frame`-scoped custom properties; the two export paths care because a
self-contained SVG can be extracted as vector instead of rasterized. Same property, different
consequence — which is precisely the shape that grows four copies.

`deck-export.js` makes the point on its own: it already imports the single-sourced
`core.KEYED_CHART_LAYOUTS` for the image-set path at line 1625, and kept its own literal for
the single-chart path 180 lines above. One module, two rosters, same twelve names.

## The model — one declaration, sets derived

Each component manifest gains one optional block:

```jsonc
"projection": {
  "figure": "svg",   // svg | flow | spatial | placeholder | bare | none
  "data": true       // substance is data; only ever true
}
```

`figure` is **how the rendered visual survives being taken off the slide** — the one fact all
eight figure rosters were encoding:

| kind | means | who declares it |
|---|---|---|
| `svg` | one self-contained `<svg>`: re-hosts cleanly, extracts as vector, needs `chart-frame` carried back or its fills fall to black | the twelve |
| `flow` | HTML+CSS table/bar/track sized only in `cqi`; the whole `.chart-body` re-hosts into a width container | gantt, kanban, progress, roadmap, timeline-list |
| `spatial` | absolutely-positioned / `cqi`-sized; needs a **bounded** box | word-cloud |
| `placeholder` | a static re-host cannot reconstruct it; keeps the honest "best seen in Present" note | journey, state-chart |
| `bare` | plain `<figure>`, no chart-frame — does not ride the chart spectrum | diagram, image, video, math |
| `none` | no static re-host producer at all | matrix-grid |

`data` is a genuinely separate axis and stays its own key: `kpi`, `stats` and `big-number` are
data with no re-hostable visual, and a `bare` image is a visual with no data.

`tools/build-projection-catalog.js` freezes these into
`lib/core/projection-catalog.generated.mjs`, which exports the record plus the seven derived
sets. **The rule lives in the generator, so every consumer reads a name rather than
re-deriving one** — `MEDIA_COMPONENTS` is "every figure except `flow`", and that sentence is
now written once instead of being implicit in a hand-typed list of nineteen.

## Declared, not inferred — and the repo already paid for that lesson

The obvious shortcut is to derive the kinds from fields the manifests already carry: `render`
is `svg | hybrid | html`, `bucket` is `chart`, `substance` is `series`. **That was tried here
and it was wrong.** `docs/src/components/studio/motion-sheet.ts` says so in its own docblock:

> MEASURED, not inferred from the manifests… An earlier draft of this file keyed on
> `render: svg` in the manifest instead, and got two of them backwards — `diagram` declares
> SVG and emits NO role… while `state-chart` is `render: hybrid` and DOES.

`render` describes what a component *draws with*. `projection.figure` describes what happens
when you *lift it off the slide*. Those correlate and are not the same question, and a
correlation that holds for nineteen of twenty-one components is the worst possible kind: it
passes review, and the two it gets backwards fail silently. So the fact is declared.

## Why generated, and why ESM

**Generated** for the same reason as the chart registry: this file is bundled by esbuild into
`dist/lattice-emulator.js` and the docs-site bundles, which cannot `fs`-load 69 manifests at
run time.

**ESM** because the five consumers straddle both module systems and three trees — ESM:
`lib/transformers/prose-projection.mjs` and `docs/src/.../deck-export.js`; CJS:
`lib/export/image-set.js`, `lib/authoring/scorecard.js` and `tools/export-chart-svg.js` —
and rollup cannot take named exports from a source-tree CommonJS file. One ESM consumer
inside the docs bundle is enough to force the choice. That is the exact role `lib/theme/edges.generated.mjs` already fills: `require()`d from
CJS on Node ≥ 22.12 (pinned in `package.json`), imported by relative path in the docs bundle.

This is also the answer to a blocker `2026-09-01` had to leave open. It recorded the durable
fix for the `single-slide-render.ts` mirror as "import it here rather than mirror it —
**blocked only on the generated module being CJS while this bundle is ESM**". The chart
registry could not take this route, because it emits `require()` calls into CJS transform
modules. A pure **data** catalog has no such tie, so it takes the `.mjs` road and the blocker
does not apply to it.

## What changed, and what did not

**Eight of the nine derived sets are MEMBER-identical** to the literals they replace —
`CHART_TOKEN_COMPONENTS`, `MEDIA_COMPONENTS`, `FLOW_CHART_COMPONENTS`,
`SPATIAL_BOUNDED_COMPONENTS`, `SPATIAL_PLACEHOLDER_COMPONENTS`, `KEYED_CHART_LAYOUTS`,
`CLEAN_SVG_LAYOUTS` and the `page.evaluate` copy. That parity is the evidence the
declarations are right, and it is asserted rather than claimed
(`test/unit/core/projection-catalog.test.js`).

**Member-identical, not byte-identical, and the distinction is real.** An earlier draft
of this line said "byte-identical" and contradicted the sentence eighty lines above it
that the four copies sat in *three different orders*. Five of the eight were `Set`
literals, where order is not a fact at all. The other three were **arrays**, and their
order changes from insertion order to alphabetical. That is not cosmetic in principle:
`lattice-emulator.js` and `deck-export.js` both derive a section's `chartType` with
`.find(c => sec.classList.contains(c))`, so the first matching name wins. It is
harmless in fact — a section carries one layout class, and the one pair where a reader
would suspect otherwise (`bar` / `stacked-bar`) is exact class matching, not substring,
and orders the same way either way. Said plainly because "byte-identical" was a stronger
claim than the evidence, and this note is about claims nobody re-derives.

**One set changes, by exactly three names.** `DATA_LAYOUTS` gains `journey`, `matrix-grid` and
`roadmap`. These are chart layouts that the roster's own comment says belong to it — *"chart +
evidence buckets, plus the solo hero metric"* — and their absence was drift, not intent. The
effect is that a deck built on one of the three now scores **Data** instead of reporting
`N/A`. It is the only behavior change in this commit, it is what the roster meant to say all
along, and it is named here rather than buried because a silent scoring change is precisely
the genre of defect this note exists to end.

**`matrix-grid` keeps its FIGURE behavior exactly as it is today** — it is one of the three
names `DATA_LAYOUTS` gains above, and it moves family in the docs picker (below), so the
unqualified form of this sentence would be false. This is where `none` earns its It has no static re-host producer — its CSS already carries the
`figure.matrix-grid` half and nothing projects into it, a gap `matrix-grid.test.js` documents.
Declaring a real figure kind for it would change a rendered surface, which is a different
change owing a demo deck under HARD RULE #9. Declaring `none` records the gap instead. **The
point is not that every chart re-hosts; it is that every chart SAYS** — and the difference
between "declares no producer" and "was forgotten" is the entire subject of this note.

`scene` (imagery) is the second `none`, found by the checker when the gate widened past the
chart bucket. It renders an inline palette-blind SVG, so it plainly has a visual, and it was
never in `MEDIA_COMPONENTS` — a pre-existing gap of exactly matrix-grid's shape. Declaring
`none` records it and changes nothing; giving it a real kind is a rendered-surface change
that owes its own deck.

## The arm the rosters never had

A declaration you can forget is a roster with better manners. `checkProjectionCoverage`
(`tools/check-ownership.js`, via `build:check`) fails the build when a **chart-bucket**
component declares no `projection.figure`. Chart bucket only, and required rather than
optional there: every chart has a rendered visual, so there is always a right answer, while a
component outside the bucket may legitimately have none.

The error names what breaks, not just what is missing, because the whole defect class is
failures nobody could see.

**Mutation-proved**, four arms, baseline clean after each revert:

| Mutation | Result |
|---|---|
| A chart drops `projection.figure` | `checkProjectionCoverage` fails, naming the chart and the three consequences |
| A chart declares `figure: "vector"` | the loader rejects the manifest |
| A chart declares `data: false` | the loader rejects it — `data` is only ever `true`, so there is no negative to declare |
| The generated catalog is edited by hand | `build-projection-catalog.js --check` reports it STALE |

## The folder-drop proof, extended

`test/unit/components/chart-folder-drop.test.js` already dropped a chart nobody has seen into
a copy of `lib/` and rendered a real deck through it. It now also runs the real projection
generator against that copy and asserts the drop reaches every catalog it belongs in:

- declared `flow` → in `FLOW_CHART_COMPONENTS` and `DATA_LAYOUTS`, and **out** of
  `MEDIA_COMPONENTS` (flow dispatches on its own branch first) and `SVG_CHART_LAYOUTS`;
- re-declared `svg` → in `SVG_CHART_LAYOUTS`, which is one assertion covering all four of the
  rosters that held the identical twelve, and in `MEDIA_COMPONENTS`;
- declared `none` → recorded in `PROJECTION`, absent from all five figure sets, still in
  `DATA_LAYOUTS`;
- **declaration omitted** → the loader still accepts it (absence is a coverage question, not a
  shape error) and the ownership gate refuses it. Driven over a synthetic manifest through the
  exported `checkProjectionCoverage`, because the shipped tree can never be in that state —
  which is exactly why the rosters could be forgotten in silence. The repo already exports its
  theme gates for this reason: *"a gate only proves something if you can watch it fail."*
- `familyOf('tempo-bars', 'chart') === 'charts'` → the docs picker finds it with no edit.

## `families.mjs` is a floor, not a projection

The sixth roster is different in kind and is treated differently. `FAMILY_DEFS` is a
**curated browsing taxonomy**, not a fact about a component: it deliberately keeps `split-*`
whole and makes math its own family rather than "a lodger in Code & math". Projecting it from
manifests would delete real editorial judgment to fix a coverage bug.

So the taxonomy stays hand-written and `familyOf()` gains a **bucket fallback** before
`'other'`, and a dropped chart reaches the picker with no edit. That is a floor under the
curation, not a replacement for it.

**The floor is partial, and deliberately so.** `BUCKET_FALLBACK` maps eight of the thirteen
buckets — the ones where a single family key is unambiguous. `connect`, `progression`,
`inventory`, `statement` and `evidence` have no entry, so six shipped components (contact,
cycle, inventory, premise, team-profile, wifi) still resolve to `'other'`, exactly as they do
today. Extending it would re-home those six, and which shape family each belongs in is an
editorial call about a curated taxonomy rather than a mechanical one — the same reason this
change does not project `FAMILY_DEFS` in the first place. Logged rather than guessed.

**Four components that ship today DO change family**, because they were already falling to
`'other'` and now have a bucket: `matrix-grid` → Charts & diagrams, `video` and `scene` →
Images, `policy-recommendation` → Legal. Captured at 1440 / 820 / 390 px; no jank, and the
Other group shrinks from ten to six. This is a website change and it is named here rather
than described as affecting only new components, which is what an earlier draft said.

## One of the four copies fed nothing

Worth recording, because it changes how much the fourth copy ever cost. Of the two
Studio export paths this catalog serves, only one is reachable:

| Path | Roster it read | State |
|---|---|---|
| Image-set ZIP — `Share → Images (.zip)`, "chart SVGs" | `KEYED_CHART_LAYOUTS`, via `core.KEYED_CHART_LAYOUTS` (`deck-export.js:1630`) | **wired**; `ShareSheet.tsx:232` reaches it |
| Single-chart export | `CLEAN_SVG_LAYOUTS` → `activeChartSvg` / `exportChart` | **no caller** |

`exportChart` and `activeChartSvg` are exported from `deck-export.js` and imported by
nothing — measured across `docs/src`, `lib`, `tools` and `test`, and across the built
site: the only chunk carrying the symbols is the one that defines them, and the string
`Export chart` appears nowhere in `docs/dist`. A third, `activeChartSection`, has exactly
one caller — `activeChartSvg` — so the whole three-function cluster is reachable from
nothing. The comment above the literal said it "drives the Export menu's 'Export chart'
entry", and a SECOND comment two lines below said the same of `activeChartSection`;
there is no such entry, and both are corrected.

So the fourth copy of the twelve names was maintained by hand for a code path a user
cannot reach. That is not an argument that it did not matter — it is the same
`chartType` fact, it sits in a module whose *other* half is live, and the day someone
wires the menu it would have been the copy most likely to have rotted. It is an
argument that a hand-maintained roster can be wrong for years without anyone noticing,
which is this note's whole subject arriving one level lower than expected.

**Pre-existing and off the path** (HARD RULE #18): wiring a menu is a feature, not a
roster fix. Logged here, not pulled into the diff. What this change does is make the
dead path read the same catalog as the live one, so it cannot drift while it waits.

## What this does NOT cover

Four more hand-maintained lists in this family are **out of scope and off the path** of this
change (HARD RULE #18), logged here rather than pulled into the diff:

| Roster | Why not here |
|---|---|
| `chart-interact.js` `CHART_SVG_SEL` | A CSS **selector** list (`.bar-svg, …`), and it is NOT derivable from `kernel.figureClass` — `bar` declares `bar-figure`, the selector wants `bar-svg`. A different fact needing its own declaration. |
| `single-slide-render.ts:1249` | A regex alternation mirroring `LAYOUTS`. Its documented blocker (the registry being CJS) is real for *that* list, which is the chart registry's, not this catalog's. |
| `motion-sheet.ts` `ROLE_COMPONENTS` | Measured per component, and its docblock is the best argument in the tree against inferring any of this. Would need its own declared field. |
| `registers.ts` `TABLE_UNSUITED` | The one roster in the family that already **has** a rot guard (`table-suitability.test.ts`). Least urgent by definition. |

So the honest form of the claim is: **a chart folder-drop needs zero edits outside its own
folder for dispatch, framing, prose projection, standalone-SVG extraction, both vector export
paths, the deck scorecard and the docs picker** — and where a drop still costs an edit, it is
one of the four above, none of which fails silently in the way the nine did.

## References

- [`2026-09-13-plugin-architecture.md`](2026-09-13-plugin-architecture.md) § Rollout Phase 1 — the sequence this is first in.
- [`2026-09-01-manifest-driven-chart-dispatch.md`](2026-09-01-manifest-driven-chart-dispatch.md) § "What a folder drop does NOT get you" — where this debt was logged.
- [`2026-08-16-manifest-is-the-theme-contract.md`](2026-08-16-manifest-is-the-theme-contract.md) — `edges.generated.mjs`, the dual-consumption precedent.
- `design/skills/chart-component.md` § the roster checklist — shortened by this change.
