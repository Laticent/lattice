---
status: proposed
summary: >
  A chart kind stops reading its content back out of the engine's HTML. The engine describes each chart
  slide once, as plain data, with the builder code packages already use (lib/core/slide-facts.mjs), extended with
  what a kind needs: each item's rendered inline HTML, each `{…}` record already read against the row shape the
  kind declares, the slide's id base, and the status-mark shapes. A kind becomes "facts in, figure out": no HTML
  walking, no engine imports. This replaces the per-module plumbing #2997's step 12b was about to do (pass each
  engine helper through ctx), which the owner rejected as handing the plugin utilities through a different door.
  Output stays byte-identical; the host marker and the full slide tree's output half stay in followups.d/2997-p1.
---

# Chart kinds read slide facts, not HTML (2026-11-02)

**Answer.** The engine already turns a slide into plain data for third-party code: `lib/core/slide-facts.mjs`
gives a code package `{ classes, directives, title, blocks, text, tokens }`, "so it never parses our `<ul><li>`"
(its header). Chart kinds get the same description, built by the same builder, with four additions (§2). A kind's
entry point becomes `transformSection(facts, ctx) → html | { html, cls } | null`: it reads values, never markup,
and imports nothing from `lib/`. The dispatcher keeps the chart frame and the splice; the engine keeps every
reader of its own formats. One description serves in-tree kinds, code packages and, later, narration, screen
readers, lint and the Guide (`2026-11-02-declared-figure-semantics.md` §3).

## 1. Why

Today the engine renders the author's list to `<ul><li>…</li></ul>`, and each of the 28 kinds parses that HTML
again with its own string walking (`parseBar(ulInner)`, `parseLine`, `parseHeatmapTable`, …). Because a kind reads
the engine's private markup, it borrows the engine's readers for it: 95 imports of `lib/core` sit under a
MID-MOVE sanction after step 12a (`tools/structure.js`).

Step 12b's first plan passed those readers in through ctx (`ctx.rows.take(…)`). The owner rejected it: a reader
handed in is still the engine giving the plugin a utility. The next plan (the engine reads each `{…}` record and
hands over the values, keyed by a numbered stamp) fixed rows only and kept HTML as the interface. Both treat the
symptom. The cause is that HTML is the interface between the engine and a kind.

## 2. What a kind receives

`facts` is `slideFacts(section)` at the version current in-tree, plus four fields that exist only for the
engine's own kinds today and are added without a version bump (slide-facts' own rule: a new field is not a
break). Each answers one engine import a kind has now.

| Field | What it holds | Replaces |
|---|---|---|
| `item.html`, `block.html` on every list item, paragraph, heading and table cell | the inline content exactly as the engine rendered it (bold, links, math, an inline icon), so a label a kind places in its figure is byte-identical | kinds splicing label HTML out of `<li>` by hand (`@laticent/markup` walkers) |
| `item.record` | `{ fields, text }`: the item's `{…}` record read by Segno against the row shape the kind declares in its manifest (`rows`), or absent. A record the shape refuses is left as text, as the pill pass leaves it today | `chart-rows` `takeRecord`, `recordRow`, `recordCell`, `settleLead`, `settleCell` (18 imports) |
| `item.marker` | `{ marker, tag }` for a leading `[x] Tag` cell marker, by the engine's list-text grammar | `checks-leading` `cellMarkerPrefix` |
| `ids` | `{ base }`: the string every id this slide mints starts with (the render prefix and the slide index the engine already pins, `render-ids.js` `${prefix}${family}-${slide}-`); a kind numbers its own ids per family from 1 | `render-ids` `nextRenderSeq`, `renderIdPrefix`, `trialIds` (8 imports) |

And through ctx, as data:

| ctx member | What it holds | Replaces |
|---|---|---|
| `ctx.marks` | the status-mark table: status → `{ name, d, w }` (`status-marks.js` `STATUS_MARK`, `MARK_PATH`), frozen. Placing a mark (translate, scale, the `<path>` attributes) is the plugin's own 6-line formula | `status-marks` `statusMarkSvg` (3 imports). Owner decision Q2 (2026-11-01) said the engine draws check marks; these are shapes as data, and the drawing call that ships in the figure is the kind's |
| `ctx.cells` | the matrix-grid cell shapes, marker → class (`matrix-grid-cells.js` `SHAPES`) | `matrix-grid-cells` (1) |
| `ctx.axes` | the axis catalog, as data from the manifests | `axis-catalog.generated.js` (7) |
| `ctx.service(plugin, name)` | unchanged: one plugin asking another (the icons plugin draws an icon), the channel the contract already has | `plugin-services` (2) |

Not in this note: the chart grammars and models the engine also reads (`label-set`, `legend`, `flowchart-grammar`,
the 18 model modules). They move into the plugin, its `lint` role and a service for the narrator, as
`2026-11-01-charts-one-plugin.md` §2 D decides (step 12c).

## 3. What a kind returns, and what stays the dispatcher's

Unchanged: a figure (`html`), `{ html, cls }` when the kind also changes the slide's class list (roadmap), or
`null` to decline. The dispatcher (`chart-family.dispatch.js`) still finds the chart class, frames the figure
(eyebrow, title, subtitle, caption), splices it where the first list or table was, opens the label-drop bracket,
and on a decline leaves the author's list with its records settled to text. A kind never sees the section HTML.

## 4. One builder, at one point in the render

The builder is `slideFacts`, run by the dispatcher on the section it is about to transform. It already reads the
engine's HTML through one parser (`parseTree`) that a test pins for every kind of slide
(`test/unit/cli/slide-facts.test.js`), and code packages already depend on it. A second builder over
markdown-it's tokens was considered and refused: two builders of one description drift, and the HTML at dispatch
time is what the kinds read today, so it is what keeps the output byte-identical. The builder learns the pill
pass's record stamp, so `item.record` comes from the stamp the engine wrote rather than from re-reading braces.

## 5. Cost, measured

- **Time.** `slideFacts` over all 752 chart slides of 404 decks (examples, kind galleries, the chart gallery):
  263 ms against 3,245 ms of rendering, 0.35 ms a slide. An upper bound: measured on finished slides, which carry
  the drawn figure, and the kinds' own list parsing goes away. Record reading itself is 10 ms of the same render
  (5,097 `takeRecord` calls, 5.8 ms), the same work wherever it runs.
- **Bundle.** The builder and the record reader already ship in the engine bundle; kind chunks lose their reader
  imports. `engineJsGz`, `chartKernelGz`, `chartKernelsGz` must not rise.
- **Work.** Each of the 28 kinds rewrites its input half; about 55 test files that call a kind's parser with
  HTML get a helper that renders markdown through the real engine and hands the kind its facts. Tests then pass
  data, which is simpler than HTML.

## 6. How it lands, and how it is checked

One kind per commit, in the order that retires the most imports first (the 16 that read records). Each commit:
348 decks of engine HTML byte-identical against `main`'s snapshot, `lint:deck --all` unchanged, the unit suite,
and that kind's MID-MOVE edges gone from the structure report. The sanctions in `tools/structure.js` shrink commit
by commit and are deleted with the last one (step 12e).

## 7. What this does not change

- No output byte moves. The host marker (`data-unit`, the slide tree's output half) and every narration change
  stay in their own PRs (`followups.d/2997-p1`, `-p2`, `-p3`), under export sign-off.
- `slideFacts`' published shape for code packages is unchanged; the four additions are new fields.
- Authoring is unchanged.

## 8. Open questions for review

1. **Label exactness.** Does every place a kind reads a label (an item's lead text before its sublist, a loose
   item's paragraphs, a table cell with inline markup) map to one `html` field without the kind re-cutting it?
2. **Nested rows and notes.** Detail sublists, `>` notes under a row (`mark-detail.js`), and markless depths
   (`chart-rows` `marklessDepths`): is the facts tree's nesting the same nesting the kinds read today?
3. **Ids across slides.** Is the slide index always pinned when a kind runs, so per-slide numbering from
   `ids.base` reproduces today's ids in every path (whole deck, one slide in the Studio, the runtime)?
4. **Tables.** `slideFacts` cells are text only today; heatmap and matrix-grid need cell HTML and cell markers.
5. **Escaped inline code.** `lift-bracket-span` skips code the author escaped (`data-lat-escaped`); facts runs
   need that flag.
6. **The browser path.** The docs site loads kinds on demand; the facts builder must be in the engine chunk, not
   in each kind's.

## References

- `lib/core/slide-facts.mjs`; `engineering/decisions/2026-09-24-code-package-contract.md` §11.
- `engineering/decisions/2026-11-01-charts-one-plugin.md` §2 D, E; §8.
- `engineering/decisions/2026-11-01-plugin-contract-alignment-audit.md` (ctx carries data and host capabilities,
  never an engine helper for the plugin to run).
- `engineering/decisions/2026-11-02-declared-figure-semantics.md` §3 (the slide tree as host data).
- `followups.d/2997-p1-slide-tree-and-host-marker.md`.
