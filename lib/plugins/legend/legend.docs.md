# legend

The **key**: what each color, swatch or line on a figure means. A **legend** is a group of
**labels**; a label is text with an optional **mark** (a swatch or a stroke) and an optional
**plate** (a pill's shape). A bare label, with no mark and no plate, is the default.

```markdown
`@legend{[{Poor, c1, mark=swatch}, {Good, c3, mark=swatch}], key}`
```

Design: `engineering/decisions/2026-10-19-universal-legend.md`. The owner split notes pinned to a
mark off into the callout plugin (`callout.docs.md`, and
`engineering/decisions/2026-10-20-callout-placement.md`). The notation is Segno's
(`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

## The author's contract

Write a legend as a paragraph holding one code span, `@legend{…}`. Inside, each label is a record in
braces; several go in a list, followed by the layout word `key`.

**A label** is the pill's record plus its named words:

- the **text** comes first, and is the only part you must write;
- **plate** shape: `pill`, `chip`, `tag`, `tag-bordered`, `circle`, `chevron-right`,
  `chevron-left`, `diamond` (the pill's words; no shape word means no plate);
- **color**: `c1` to `c12`; **size**: `sm`, `md`, `lg`;
- `mark=` draws a mark beside the text: `swatch`, `outline`, `line`, `heavy`, `dashed`, `dotted`;
- `detail="…"` is a longer line for the reader.

Quote any text holding a comma, `=`, `|`, a bracket or a brace: `{"Peak, then flat", c1}`.

**A keyed pair**, `{1, Cold}`, a key followed by its name, is the label-set form the charts already
read, and it still reads as one: when a record does not read as a label, it is read as a pair. One
shape reads the wrong way without an error: a number followed by a style word, `{1, lg}`, is the
label "1" in size lg. `lint:deck` warns on it; quote the word to keep the pair, `{1, "lg"}`.

**A label that pins a mark** (`row=`/`col=` or `for=`) is a callout. Before the split callouts were
written as `@legend{…}` spans, and those still draw as callouts; write `@callout{…}` instead.

## Where it draws today

The charts draw their own keys through the legend's key kernels: `keySvg`
(`lib/components/chart/_chart-family/legend-svg-key.js`) for bar, stacked-bar, tower, piechart, map,
quadrant, radar, heatmap and line, and `keyHtml` (`lib/core/legend-key.js`) for roadmap, matrix-grid
and obligation-matrix. Authoring a key through `@legend{…}`, to rename or reorder its entries, lands
one component at a time (`2026-10-20-callout-placement.md` § 7). Until a component reads it, a
`@legend{…}` key is not drawn: a heatmap lists it under "Not drawn" in its description, and on other
slides it renders as code and `lint:deck` says no component on the slide reads it.

The `legend:` register (`legend: off` in the front matter) still switches callouts off, as it did
before the split; `callout: off` is the spelling now.

## For components

The model and reader are `lib/core/legend.js`, shared with the callout plugin. The HTML key is
`lib/core/legend-key.js` (a component's own classes) and `lib/core/legend-html.js` (the legend's
own); the mark slot is `lib/core/legend-mark.js`; the SVG key is `keySvg` in
`lib/components/chart/_chart-family/legend-svg-key.js`. The emitters write classes and a `data-c`
color slot and never a color; this plugin's stylesheet paints them.
