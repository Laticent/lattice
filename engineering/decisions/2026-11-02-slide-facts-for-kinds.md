---
status: in-progress
summary: >
  A chart kind stops reading the engine's HTML. The engine's chart frame turns each chart slide into our own tree
  (an adapter at the boundary: blocks, items, runs, tables, each with an address and opaque inline markup), on every
  render path including the browser and Export-to-Marp bundles. A kind gets that tree, one ctx built from what its
  manifest declares, and a unique id prefix; it reads its own idioms with shared libraries (`@laticent/segno`,
  `@laticent/markup`) and draws. The engine knows no chart by name and runs no chart grammar. Delivery is split: #2997
  merges at the folder move plus the host-run frame, with the remaining engine imports as counted debt that can only
  fall, and the id prefix, the tree, a three-kind pilot and each shared-reader conversion land as small PRs. Two
  adversarial trios (2026-11-02) shaped it; the second judged it by Robert C. Martin's and Martin Fowler's standards.
---

# Chart kinds read a tree, not HTML (2026-11-02)

**Answer.** A chart is a small program that is handed everything and does one job: draw. It gets three things
from the host and imports nothing from `lib/`:

1. **Its content, as a tree.** Our own model of the slide (blocks, items, runs, tables), built once by the host.
2. **One ctx**, built from what the kind's manifest declares: resolved values (`view: { orientation, aspect, pane }`,
   the modifiers it declares as booleans, whether callouts are on), and the capabilities it declares
   (`ctx.service`). Never raw class tokens, never the list of plugins switched off.
3. **Its id prefix**, unique to this figure, under which it names its own parts.

The kind splits into `read(tree) → model` (pure) and `draw(model, ctx) → { html, cls? }`. It recognizes its own
idioms (a `{…}` record against its row shape, an axis span, a label set, a callout) in `read`, with shared libraries
it may import (`@laticent/segno`, `@laticent/markup`), so a 29th kind never changes the engine. The owner's words:
"a chart needs the chart markdown and a way to parse it and the ctx which contains metadata… With respect to an id
it should be handed one too… so every chart can focus on value-added work."

## 1. Why

Today the engine renders the author's list to HTML, and each of the 28 kinds parses that HTML again with its own
string walking. Because a kind reads the engine's private markup, it borrows the engine's readers for it: about 93
imports of `lib/core` from 35 files of the plugin, admitted under a MID-MOVE sanction since step 12a. Passing those
readers in through ctx was rejected (a reader handed in is still the engine giving the plugin a utility). Having the
engine run each kind's declared grammars was rejected too (every new chart idiom would mean an engine change). The
cause in both cases is that HTML is the interface between the engine and a kind.

## 2. The tree, and where it comes from

**One builder, at the boundary.** The host's chart frame (`lib/transformers/chart-frame.js`) runs on every path:
the engine and CLI render, the Studio's single-slide render, and the browser runtime (`applyToDom`), which also
rebuilds charts in Export-to-Marp bundles, where Marp renders the markdown and no Lattice engine runs. The page's
HTML is the one input every path has, so the frame builds the tree from the section it holds. It is an adapter in
Robert Martin's sense: HTML is a detail, kinds never see it, and the builder can later take a better source (the
engine's own parse on the paths that have one) with no kind changing. One builder serves all paths (HARD RULE #1).

**Our own model, not markdown-it's or the DOM's shape.** Blocks (heading, paragraph, list, table, quote, code), list
items with nested items, runs with their marks, and tables with cells. Every node carries:

- `path`: its address (`[block, item, …]`), stable for the slide, so a kind can say which blocks it consumed and a
  later step (`followups.d/2997-p1`) can point units back at authored items;
- `text`: plain text, entities decoded;
- `html`: its inline content as the host rendered it, **opaque**. A kind places it and never parses it; it is
  handed as a branded value with no string methods, which the host unwraps on output, so the rule is enforced by the
  type, not by a lint.

A `{…}` record arrives as its own run, split out generically (the record stamp is the host's format). Binding it to
the kind's row shape is the kind's job, in `read`, through `@laticent/segno`. The engine no longer holds per-chart
row schemas or chart-name lists; the lists it still needs (`CHART_LAYOUT_ORDER`, `QUOTE_CHARTS`, `CALLOUT_READERS`,
the render-id families) are generated from the manifests.

**Exactness.** The builder slices source markup for `html`, so labels stay byte-identical. A field that cannot
stay byte-identical is not given a fallback reader: it becomes an explained output change under the owner's export
sign-off.

**Internal until proven.** The tree is a typedef in the plugin contract, `version: 0`, unpublished. It is published
when a second figure plugin (Mermaid) reads it.

## 3. One ctx, built from the manifest

There is one ctx builder for every plugin (`lib/core/plugin-ctx.js`), and each member reaches a plugin only when its
manifest declares it, the way `ctx.service` is already gated by `requires` and `optional`. The renderer ctx's members
(`wall`, `provider`, `hydrateAttrs`, …) follow the same rule. A kind's ctx carries resolved values, not raw inputs:

| Today a kind reads | It gets instead |
|---|---|
| `cls` and `classTokens` (the same thing twice), then parses modifier strings itself | the modifiers its manifest declares, as booleans |
| `pluginsOff`, then works out callout state from register classes | `callouts: on \| off`; other plugins through `ctx.service`, which already respects off |
| `orientation`, `aspect`, `paneView` | `view: { orientation, aspect, pane }` |
| `readsHandBody(classTokens)` (the sketch face) | `face` |

## 4. What a kind returns, and what the host does

A kind returns `{ html, cls? }` or `null`. The host knows which blocks it handed over (the manifest's `reads:
list | ul | table`) and which paragraphs the kind's `read` consumed; `read` reports them in its model, and the host
removes exactly those and places the figure. The host frame keeps the chart chrome (eyebrow, title, subtitle,
caption), split into a section adapter, a pure `frameFigure`, and the record bridge. It is selected by a manifest
role from the dispatch table rather than by naming the chart family, so a second figure family can use it.

Label drops come back in the kind's result instead of through a module-global collector, and the kinds a render
could not draw yet come back in the frame's result instead of module state.

## 5. Ids

Each figure gets a unique prefix as data (`lat-r<render>-s<slide>-f<figure>-`) and names its parts under it. The
id state becomes a per-render object the host creates, not module globals (`lib/core/render-ids.js`), which also
makes kinds testable without resets. This changes every chart id's spelling, so it lands first, as its own small PR
with dark and light exports for the owner's sign-off. Kinds are converted once, straight to the prefix.

## 6. Where every lib/core import goes

| Module | Destination |
|---|---|
| `chart-rows` (records) | the host splits records into runs; kinds bind them with `@laticent/segno` |
| `render-ids` | the per-figure prefix (§5) |
| `lift-bracket-span`, `lift-label-set`, `flowchart-html`, `checks-leading` | kind-side, in `read`, on the tree; shared parsing goes to `@laticent/*` where the engine also reads it |
| `status-marks`, `axis-catalog.generated`, `matrix-grid-cells` | the plugin's own code and generated data (owner decision 2026-11-02 for status marks) |
| `plugin-services` | `ctx.service` |
| the chart grammars and models (`chart-values`, `axis-member`, `label-set`, `legend`, `flowchart-grammar`, the 18 model modules) | the plugin, with its `lint` role and a service for the engine's narrator (`2026-11-01-charts-one-plugin.md` §2 D); each grammar takes neutral values, so the linter and the kind share one reading |

Code outside the plugin that imports its files (the CLI's label drops, layout engines and SVG export; the runtime's
layout engines; the Playground's callout placer; the linter's and the Playground's basemaps) moves to plugin roles
or declared host API.

## 7. Delivery: small PRs on trunk

1. **#2997 merges at the folder move plus the host-run frame.** The remaining edges stay as named debt that can
   only shrink: every sanctioned import, the kinds' `lib/core` imports and the inbound edges, is listed one by one in
   `tools/structure.sanctioned.json`, so a new one fails by name and a gone one must be pruned, each entry naming
   the step that removes it.
2. **The id prefix** (§5), its own PR, export sign-off.
3. **The tree and one ctx** (§2, §3), with the host able to call either contract: a kind that exports `read` and
   `draw` gets the tree, one that exports `transformSection` gets HTML. A gate counts the kinds still on the old
   contract, and that count can only fall.
4. **The pilot:** bar, heatmap and journey, one PR, with go and no-go criteria written before it starts: byte-identical
   on the corpus and every path; no HTML parsing and no `lib/` import in the three; no chart name added to the engine.
   A no-go reverts the three.
5. **One PR per shared reader** (`cartesian`, `mark-detail`, the callout lift, the table reader, the label-set lift),
   converting every kind that uses it. A shared module never holds both input styles.
6. **The grammars and models into the plugin, its lint role and a narrator service; the reverse edges; the old
   contract deleted.**

## 8. How each step is checked

- **A committed characterization test**: every deck's engine HTML and `lint:deck --all` output compared against a
  baseline from `main`, as a script anyone can run, not a sentence in a commit message.
- Per step, also: `npm run equiv:check` (the Studio single-slide path), a fixture through the runtime's `applyToDom`,
  a two-pane fixture for ids, and a differential test of a converted reader against the old one on its fixtures
  plus mutated inputs.
- **Tests check behavior, not just bytes.** Each converted kind gets a committed JSON snapshot of `read(tree)`'s
  model over its fixtures, built from literal trees (a fixture builder in the plugin contract, no engine needed), plus
  one engine contract test. The snapshots survive the id prefix and the slide tree's output changes.

## 9. Cost, measured

- **Time:** building the tree costs 0.06–0.35 ms per chart slide (measured on the corpus: 757 kind inputs in 48–69 ms;
  752 finished slides in 263 ms against 3.2 s of rendering), and it replaces each kind's own parsing.
- **Bundle:** the builder runs in the host frame, which is already in the engine bundle; kinds drop their reader
  imports.

## 10. Owner decisions (2026-11-02)

1. **Pragmatic, not purist:** "as long as things are not junky and are sustainable and scalable."
2. **Status marks** move into the charts plugin.
3. **Up to about 4 KB** of bundle for the tree, declared with measurements (the builder now in the frame should need
   far less).
4. **Pilot first:** bar, heatmap, journey.
5. **The tree is built from the slide HTML, behind an adapter** (§2). Export-to-Marp bundles have no engine, so the
   page's HTML is the one input every path has. Chosen after the second trio, over the engine writing the tree into
   the page (which cannot serve Marp bundles) and the browser no longer building charts.
6. **Ids are handed over as a per-figure prefix, first**, in its own PR under export sign-off (§5).
7. **The lint core takes 1 KB of the engine's ceiling** (#3003): the host-run frame moved the chart value readers out
   of the engine closure.
8. **Split the PR** (§7): #2997 merges at the move plus the frame.
9. **Charts parse their own idioms with libraries**; the engine runs no chart grammar and names no chart (§2, §6).

## Found on the way (off-path)

`risk-band` ids are minted through `nextRenderSeq`, but the family is missing from the anti-squat probe in
`render-ids.js` (`FAMILIES`). Logged in `followups.d/2997-p3-risk-band-anti-squat.md`.

## References

- `lib/core/slide-facts.mjs` (code-package facts, unchanged); `engineering/decisions/2026-09-24-code-package-contract.md`.
- `engineering/decisions/2026-11-01-charts-one-plugin.md` §2 D, E; §8.
- `engineering/decisions/2026-11-01-plugin-contract-alignment-audit.md`.
- `engineering/decisions/2026-11-02-declared-figure-semantics.md` §2, §3.
- [#3008](https://github.com/Laticent/lattice/issues/3008).
- Two adversarial trios, 2026-11-02 (red team, inversion, checker): the first on the draft, the second by Robert C.
  Martin's and Martin Fowler's standards.
