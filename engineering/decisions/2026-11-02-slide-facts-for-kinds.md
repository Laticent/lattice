---
status: proposed
summary: >
  A chart kind stops reading its content back out of the engine's HTML. The engine describes each chart slide as
  plain data, built by the slide-facts parser code packages already use, and hands a kind its own versioned input
  (kind facts): the slide's blocks with addresses, each label's markup already cut into the pieces a kind places,
  each `{…}` record already read against the kind's declared row shape, and the slide's axis, label-set, key and
  callout paragraphs already lifted. A kind splits into `read(facts) → model` and `draw(model) → figure` and
  returns which blocks it consumed. Engine-owned state the kind must share with the rest of the render (render ids)
  stays a host capability; readers of the engine's formats never cross. The adversarial trio (2026-11-02) found the
  first draft would collide ids, lose label bytes and miss half the imports; this version answers each finding,
  and three kinds are piloted before the other 25.
---

# Chart kinds read slide facts, not HTML (2026-11-02)

**Answer.** A kind reads data, never the engine's markup. The engine builds the data once per chart slide with
the slide-facts parser (`lib/core/slide-facts.mjs`), as a separate, versioned **kind-facts** contract: a superset of
what code packages get, published beside `kind.schema.json` in `@laticent/plugin-api`. A kind's entry becomes
`read(facts, ctx) → model` and `draw(model, ctx) → { html, cls?, consumed }`. The kind imports nothing from `lib/`.
Engine state the kind must share with the rest of the render arrives as a host capability (`ctx.ids`); no reader of
an engine format is ever handed over. Three kinds (bar, heatmap, journey) are converted first; the other 25 follow
only if the pilot proves the shape.

## 1. Why

Today the engine renders the author's list to `<ul><li>…</li></ul>`, and each of the 28 kinds parses that HTML again
(`parseBar(ulInner)`, `parseHeatmapTable`, `findOuterUL`, …). Because a kind reads the engine's private markup, it
borrows the engine's readers for it: 94 `lib/core` imports in 40 files sit under the MID-MOVE sanction after step 12a
(`tools/structure.js`).

Step 12b's first plan passed the readers through ctx (`ctx.rows.take(…)`); the owner rejected it, because a reader
handed in is still the engine giving the plugin a utility. A second plan (the engine reads each record and hands the
values over by a numbered stamp) fixed rows only and kept HTML as the interface. The cause is that HTML is the
interface between the engine and a kind.

## 2. The line between data and capability

This note reads the owner's rejection as a rule about **readers**, and keeps the audit's rule that ctx may carry
host capabilities (`2026-11-01-plugin-contract-alignment-audit.md`, "ctx carries data and host capabilities"):

- **Never crosses:** a function that reads the engine's private formats (the record stamp, list markup, the
  escaped-code marker). The engine reads them and hands over the result as data.
- **Crosses as a capability:** an operation over state the host owns and must keep consistent across the whole
  render, bound to this render: minting a render id (`ctx.ids.next(family)`), asking another plugin
  (`ctx.service(plugin, name)`).

Render ids must be a capability, not data. The trio showed, by running it, that a kind cannot number its own ids:

- **The runtime path has no slide scope.** `lib/transformers/chart-family.js` `applyToDom` never sets a section, so
  `nextRenderSeq` counts across the whole document (two pie slides: `pie-wedge-1..2`, then `pie-wedge-3..4`).
- **Panes share their host slide's sequence** (`lib/engine/index.js` `pinRenderSlide`): two pie panes on one slide
  give `pie-wedge-1-1..1-3`, then `1-4..1-5`.
- **The fitting loops mint ids they discard** (`trialIds` save and restore), so the sequence depends on every call
  in order, across `cartesian.js` and `svg-legend.js`.

A kind numbering from 1 would mint duplicate SVG ids in one document, the trap `render-ids.js` exists to prevent.
`ctx.ids` keeps today's exact sequence: `next(family)` and `trial(fn)` (save, run, restore), bound to the render
the host is in.

## 3. What a kind receives: kind facts

Built by `slideFacts`' parser, with fields only kinds receive. None of them reaches a code package: kind facts are
their own versioned contract, and a field moves into code-package facts only through a decision record. This
keeps the published facts free of engine markup, which the facts header says is "not a promise".

| Field | What it holds | Replaces |
|---|---|---|
| `blocks` with `path` | the slide's blocks in reading order (code-package shape), each block and item with a stable address `path: [block, item, …]` | the kinds' own list and table finding (`extractFirstList`, `findOuterUL`, `extractFirstTable`) |
| `item.lead` | the item's lead already cut: `{ html, value?, record? }`. `html` is the label markup with the value pill or record removed; `value` the value pill; `record` (below) | the per-kind `<code>` cutting (`readLeadValue`, kanban's size pill, timeline-list's leading and trailing pills) |
| `item.record` | `{ fields, settledHtml }`: the record read against the kind's `segno.row` shape (`takeRecord`, then `recordRow` or `recordCell`); `settledHtml` the legacy spans a declined record settles to | `chart-rows` (17 kind imports and `cartesian.js`) |
| `item.quote` | a row's `>` note as `{ html, text }`, kept apart from the item text | `mark-detail.js` `takeRowDescription` |
| `item.html`, `item.listHtml` | the item's whole inner markup and its nested list's markup, for the kinds that place them whole (a popover, kanban's second sub-item) | raw `<li>` slicing in `cartesian.js`, `kanban` |
| `item.marker` | `{ marker, tag }` for a leading `[x] Tag`, by the list-text grammar | `checks-leading` `cellMarkerPrefix` |
| run flags | `escaped` (the author escaped it), `break` (a `<br>`) on runs | `flowchart-html`, `lift-bracket-span`'s escaped-code skip |
| `table` | `head`, `rows`, each cell `{ html, text, marker }`, the table's own `html` with its attributes | `html-tables` (plugin-side) and roadmap's in-place rewrite |
| `lifted` | the paragraphs the engine lifts for this kind, each `{ path, value }`: axis spans, label sets, the flowchart key, `@callout{}` and `@legend{}` notes. Read by the grammar the kind declares (§5), so a span is cut only by the reader that will use it | `lift-bracket-span`, `lift-label-set`, `callout-core` `around`, flowchart's key cut |

Every `html` field is **opaque**: a kind places it and never parses it. The structure gate gains a check that no
kind runs a regex or a markup walker over a facts `html` field.

To give byte-exact markup, the parser records source offsets and each `html` field is a slice of the section the
engine rendered. The parser keeps decoding text for `text` fields as it does today.

The existing ctx fields stay: `cls`, `classTokens`, `orientation`, `aspect`, `paneView`, `pluginsOff`. `ctx.utils`
(`KERNEL_UTILS`, the HTML walkers handed to every kernel and used by none) is deleted.

## 4. What a kind returns, and what the dispatcher does

A kind returns `{ html, cls?, consumed: [path…] }` or `null`:

- `html` is the figure. For roadmap, which rewrites the author's table in place, it is the rewritten table.
- `consumed` names every block and lifted paragraph the figure replaces. The dispatcher removes exactly those and
  puts the figure where the first of them was.

This is new work: today a kind splices its own figure and returns the whole section (`chart-family.dispatch.js`
contract, "it does not return the figure alone"). The dispatcher keeps the chart class, the frame (eyebrow, title,
subtitle, caption), the label-drop bracket and the decline path that settles records to text.

Each kind's manifest declares what it draws from (`reads: list | ul | table`), which the engine uses to choose the
block. "First list" follows today's semantics exactly, including a list inside a blockquote or a raw `<div>`,
because the behavior change otherwise lands outside the corpus.

## 5. Where every lib/core import goes

| Module (imports) | Destination | Step |
|---|---|---|
| `chart-rows` (18) | engine; kinds get `item.record`. The dispatcher's own `bridgeRecordsHtml`, `unstamp`, `RECORD_ATTR` move with the framing to the host | 12b |
| `render-ids` (8) | engine; kinds get `ctx.ids` | 12b |
| `checks-leading` (1), `matrix-grid-cells` (1) | engine; kinds get `item.marker`, cell markers | 12b |
| `lift-bracket-span` (7), `lift-label-set` (4), `flowchart-html` (2) | engine lifts and reads; kinds get `lifted` and run flags. The grammar that accepts a span is the kind's, declared in its manifest (the catalog entry the acceptor already reads), so the engine runs a declared grammar, not plugin code | 12b |
| `plugin-services` (2) | `ctx.service` | 12b |
| `status-marks` (3), `axis-catalog.generated` (7) | the plugin: `statusMarkSvg` has only chart callers, and the axis catalog is the charts' own generated data. Owner decision needed (§9, Q2) | 12b |
| `chart-values` (7), `axis-member` (5), `label-set` (4), `legend` (2), `legend-key` (3), `legend-limits` (1), `flowchart-grammar` (2), `chart-status` (2), `chart-point` (2), `journey-step`, `gantt-pill`, `gantt-time`, `cell-note`, `bullet-facts`, `kanban-sizes`, `tower-size`, `risk-matrix-model`, `state-graph-facts`, `waterfall-markers`, `hub-spoke-model`, `histogram-model`, `ep-curve-model` (1 each) | the plugin, with its `lint` role and a service for the engine's narrator (`2026-11-01-charts-one-plugin.md` §2 D). Each grammar takes neutral item values, so the linter (fed from Markdown) and the kind (fed from facts) share one reading (HARD RULE #1) | 12c |

The framing (eyebrow, title, subtitle and caption lifting) is engine chrome and moves to the host with the
dispatcher's record bridging, so the plugin keeps no `lib/` edge for it.

## 6. Cost, measured

- **Time.** `slideFacts` on the 752 chart slides of the corpus: 263 ms against 3,245 ms of rendering, 0.35 ms a
  slide, measured on finished slides (the checker reproduced 262 ms against 2,983 ms). On the kinds' actual inputs
  the red team measured 48–69 ms for 757 slides, 0.06–0.09 ms each, before the offset slicing and record reading
  this adds. `takeRecord` today: 5,097 calls, 5.8 ms. One measurement is still owed: the Studio's single-slide
  re-render on every keystroke, and a two-pane slide.
- **Bundle.** The parser ships today only in the CLI bundles and a lazy docs chunk, not in the docs engine or the
  runtime. Bundled alone it is 10.9 KB minified, 4.3 KB gzipped. Moving it into the engine raises `engineJsGz`
  and the runtime by up to about 4 KB, partly paid back by the readers the kinds drop. It is declared in the route
  budget ledger with the measurement.
- **Work.** 28 kinds rewrite their input half into `read` and `draw`. About 46 test files import a kind directly
  and 67 touch the kinds or their shared readers; they get a helper that renders markdown through the real engine
  and hands the kind its facts.

## 7. How it lands, and how it is checked

1. **Pilot.** bar (the shared Cartesian path and callouts), heatmap (a table and a label set) and journey (the
   outer list, a label set and callouts). The pilot turns every open question into an answer from code. If the
   shape does not hold, the note changes before any other kind moves.
2. **By shared reader, not by kind.** `cartesian.parseSeries`, `mark-detail`, the callout lift, `html-tables` and the
   label-set lift are each converted once, with every kind that uses them. A shared module never holds both input
   styles.
3. **Each commit is checked on every render path:** 348 decks of engine HTML byte-identical against `main`;
   `lint:deck --all` unchanged; `npm run equiv:check` (the Studio single-slide path); a runtime-path fixture through
   `applyToDom`; a two-pane fixture for ids; and a differential test of the old reader against the new one over
   the kind's fixtures plus mutated inputs. Any behavior change outside the corpus is an export change and goes to
   the owner.
4. The MID-MOVE sanctions in `tools/structure.js` shrink with each commit and go with the last one.

## 8. What this does not change

- No output byte moves. The host marker and the slide tree's output half (`followups.d/2997-p1`) and narration
  (`-p2`, `-p3`) stay in their own PRs under export sign-off. The `read → model` split is what lets 2997-p1 derive
  each figure's units from the model instead of touching 28 kinds again.
- Code-package facts are unchanged.
- Authoring is unchanged.
- Kind facts are the kind's **input**. The linter reads Markdown before any render and never sees them. Narration,
  screen readers and the Guide read the slide tree, which kinds produce. Facts are read back out of markup, and an
  author's raw HTML can forge the record stamp (the dispatcher's own `STAMP` comment). That is harmless for a
  chart's own data, but it means facts cannot become the tree's prose half unless the stamp becomes unforgeable.

## 9. Owner decisions

1. **The data-or-capability line (§2).** Readers never cross; capabilities over host-owned render state do. That
   is what makes ids work without duplicates.
2. **Status marks.** The 2026-11-01 audit (Q2) said the engine keeps the drawing of a check mark and the checks
   plugin gets a capability to draw. `status-marks.js` is a different module with only chart callers. This note
   moves it into the charts plugin (§5). That is a departure from Q2's wording, and the alternative is a
   `ctx.marks.draw(…)` capability.
3. **The bundle rise (§6)**, up to about 4 KB gzipped on `engineJsGz` and the runtime.
4. **Pilot first (§7).** Three kinds, then a go or no-go on the other 25.

## Found on the way (off-path)

`risk-band` ids (`risk-matrix.transform.js:126`) are minted through `nextRenderSeq`, but the family is missing from
the anti-squat probe in `render-ids.js` (`FAMILIES`). Logged in `followups.d/2997-p4-risk-band-anti-squat.md`.

## References

- `lib/core/slide-facts.mjs`; `engineering/decisions/2026-09-24-code-package-contract.md` §11.
- `engineering/decisions/2026-11-01-charts-one-plugin.md` §2 D, E; §3; §8.
- `engineering/decisions/2026-11-01-plugin-contract-alignment-audit.md` (rule; Q2).
- `engineering/decisions/2026-11-02-declared-figure-semantics.md` §2, §3.
- `followups.d/2997-p1-slide-tree-and-host-marker.md`.
- The adversarial trio's reports (2026-11-02): red team, inversion, checker; their probes are scratch, not committed.
