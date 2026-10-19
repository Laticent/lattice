---
status: proposed
summary: >
  Charts draw their keys, value labels, callouts and edge names through 11 separate key
  implementations and no shared label model, and none of it narrates a detail line or responds to
  a gesture beyond pie and map. The proposal is one built-in `legend` plugin: a legend is a group
  of labels, a label has three optional slots (mark, text, plate), and a legend draws in one of
  three layouts (key, anchored, along-path) through one HTML emitter and one SVG emitter. Authors
  write it in Segno. Narration and gestures are designed in from the start, in three tiers, with
  series toggling deliberately left out. Existing keys port over one adopter per commit,
  byte-identical; the placement geometry in `svg-label.js` stays.
---

# One legend plugin: labels, marks, plates, narration, gestures

**2026-10-19.** Status: proposed. Nothing in this note is built. Facts below come from three
read-only audits of the tree and are cited by file and line; the lines marked UNVERIFIED are
the ones nobody opened.

## 1. The ask

Every chart should take custom labels. Heatmap has none. One plugin should replace the labels
and keys we have today, work in HTML and SVG, scale with the slide, serve every current and
future component, work on any component, be authored through Segno, and support narration and
gestures. The default render is a bare label: no background, no border, no icon.

## 2. Names (settled by the owner)

- **Legend** is the plugin and the whole model.
- **Label** is one entry in a legend.
- **Key** is the layout that decodes an encoding (swatch + text, apart from the marks). It is
  the sense `svg-legend.js` uses today.

## 3. Audit: what exists

### 3.1 Keys and labels

21 components draw a key. They use 11 separate implementations: 4 shared builders and 7 private
ones (command: per-symbol `grep -rln` over `lib/components` and `lib/core`, per-chart `grep -c`
of each builder). Bullet, funnel and waterfall mention a legend only in comments.

| Implementation | Components | Medium |
|---|---|---|
| `buildSvgLegend` (`svg-legend.js`) | bar, stacked-bar, line (fallback only), tower, piechart, map, quadrant, radar, heatmap (only with `scale`) | SVG |
| `buildHtmlLegend` (`html-legend.js`) | roadmap, matrix-grid | HTML |
| `label-set-key.js` post-pass | obligation-matrix (the one manifest with `keyedBy: "transformer"`) | HTML |
| `graph-key.js` `buildKey` | flowchart, state-chart | HTML |
| Private builders | journey (23 lines), gantt (~62), hub-spoke (~29), risk-matrix (~17), scatter (89, a size ramp), word-cloud (~141, a size ramp), slope (~60) | mixed |

Components with no key by design: waterfall, funnel, bullet, progress, kanban, timeline-list,
histogram, ep-curve (they label their own marks). Heatmap's key is opt-in, so a five-band ramp
has no key by default (`heatmap.docs.md:38`).

Size of the layer, measured with `wc -l`:

- Shared emit layer: 2,857 lines (`svg-legend.js` 637, `svg-label.js` 1,195, `label-drops.js`
  187, `label-set.js` 264, `label-set-catalog.generated.js` 138, `label-set-key.js` 178,
  `html-legend.js` 111, `graph-key.js` 76, `lift-label-set.js` 71).
- Private key code: about 421 lines across seven components (journey 23, scatter 89 and
  word-cloud about 140 measured; gantt, hub-spoke, risk-matrix and slope are estimates).
- Shared label kernels in `cartesian.js`: `buildCategoryLabels` (`:1052-1155`) and
  `buildValueLabel` (`:1204-1215`), about 116 lines.

Only 5 manifests declare `labelSet`.

### 3.2 Doc drift found on the way

These four statements are wrong today and get fixed in the same change that touches the code:
`chart-family.docs.md:165` says journey's keys are "CSS-only" (the transform builds them);
`:167-168` says state-chart has "no key" (it calls `buildKey`); `:143` says "13 members" and `:146-147` lists four integrated
SVG-key charts (bar, line, stacked-bar, tower and heatmap now call it too);
a comment at `tools/check-ownership.js:5470` puts gantt's swatch at `gantt.transform.js:586`
(it is at `:879`).

### 3.3 Authoring today

An author can name a key three ways: derived (nothing written), inline
(`[{1, Cold}, {3, Warm}]`), and a front-matter register. The facts that matter:

- The inline form is **not read by a Segno slot.** `parseInlineSet` (`label-set.js:79`) gates
  the span with a regex and calls `parseBracketList` (`bracket-list.js:155`), which uses
  Segno's parser but binds no slot. It returns `{key, label}` and never `detail`.
- `detail` comes only from `parseRegisterBlock` (`label-set.js:105`), a hand-written regex
  parser. No module in `lib/` calls it; only the generated playground bundles copy it. So a
  front-matter `detail` has no engine caller today.
- Segno's decision 20 says every new grammar is a Segno grammar, not a hand-written parser
  (`2026-09-28-segno-unified-inline-notation.md:71`).
- Per-mark notes ride separate doors: heatmap's cell `note=` span, and the sublist detail that
  `mark-detail.js` folds into the speaker note.

### 3.4 Narration today

- Each narrator re-derives the chart from the raw Markdown (`chart-narration.js:1-55`) and
  binds every sentence to `{act, unit, id, value, label}` (`:230-240`).
- A key is read by its words only. For journey, matrix-grid and roadmap, `keyedWords` merges
  author renames over the defaults and consumes the line (`:5857-5874`). Nothing in
  `chart-narration.js` reads `.detail`.
- A label-set `detail` becomes an HTML `title` attribute (`html-legend.js:95`) and nothing
  else. It reaches no speech, speaker note, PDF or `<desc>`.
- SVG keys give screen readers one `<desc>` ("Key — label value, …", `svg-legend.js:245`),
  not a list.
- A per-mark detail sublist, by contrast, is spoken and folded into the speaker note
  (`speakItemDetail` `:445-492`, `mark-detail.js:165-190`).

### 3.5 Gestures today

- A key row that names one mark carries `data-mark-for`. Pie (`piechart.transform.js:88`), map
  (`map.transform.js:286`) and risk-matrix's private numbered key (`risk-matrix.transform.js:198-206`)
  emit it; many non-key labels carry it too (category labels, hub-spoke, gantt, quadrant,
  scatter, heatmap). Such a row is a tap or hover proxy that opens the mark's card (`chart-interact.js` `namedMark`, `:409-425`).
- Series keys (line, stacked-bar, radar) are inert on purpose (`chart-interact.js:410-412`).
  No code highlights or toggles a series from its swatch. HTML keys have no handlers.
- The slide has no focus or tab stop for individual marks. Keys 1-9 reveal a mark, 0 or Esc
  clears (`handleKey`, `:791-797`).
- Interaction runs in the parent page; the slide iframe stays a pure paint surface
  (`chart-interact.js:1-21`). Input-verb parity requires keyboard, wheel and touch on every
  surface that shows a slide (`2026-08-10-input-verb-parity.md:10-17`).

### 3.6 Segno today

- A value is a record `{item, …}`, a list `[elem, …]` or a scalar. An item is a bare value or
  `name=value`. Bare words bind by type; a `named` parameter must be written `name=value`
  (`2026-09-28-segno-unified-inline-notation.md:80-170`).
- The `pill` core slot has an optional text, `shape` (8 words), `color` (`c1`-`c12`), `size`
  and a named-only `icon` (`segno-slots.js:49-58`).
- The JSON spec compiler always returns a record, so a top-level list slot is not expressible
  in JSON; a list of records is expressible as a parameter (`segno-spec-core.js:43-47` and `:56-77`).
- An inline plugin through `contributes.inline` needs a one-character sigil, and all three
  Segno tag characters are taken: `!` avatars, `^` icons, `~` sparks (`resolve.js:421-438`).
  The kind names `state` and `pill` are refused. The named form `@kind{…}` reaches a kind
  without a sigil (`inline-code-directives.js:99-130`).
- Whitespace is space, tab and U+00A0, so there is no multi-line inline form. A comma separates
  items, so detail prose containing commas must be quoted.

## 4. The model

```
legend  = { entries: label[], layout: key | anchored | along-path }
label   = { text, key?, detail?, mark?, plate?, tone?, for? }
mark    = none | swatch(fill|outline) | line(solid|heavy|dashed|dotted [+ head open|dot|cross|arrow])
          | icon(name) | ramp-step(n)
plate   = none (default) | pill | chip | tag | tag-bordered | circle | chevron-* | diamond
tone    = c1..c12 or a semantic tone (pass, warn, fail, info, mute)
for     = a mark | a series | a ramp step | nothing
```

Rules:

1. **Text is the only required slot.** A bare label is text with no mark and no plate. That is
   the default the owner asked for.
2. **The plate is the pill.** It reuses the pill's shape words, color slots and `--pill-*`
   geometry. The pill grammar does not grow a mark slot, a dash pattern or an arrow; a pill
   stays "text on a plate".
3. **The mark is a new shared kernel**, `lib/core/legend-mark.js`. It absorbs the three copies
   of the swatch vocabulary (`keySwatch` in `graph-key.js`, `swatchClass` in `svg-legend.js`,
   the `--mark-*` and `--shape-*` lookups) and draws shapes, never typed glyphs (HARD RULE #29).
   Color comes from the element, shape from us (HARD RULE #3).
4. **`for` is the link that makes a legend interactive and narratable.** It maps to the hooks
   that exist: `data-mark-for` (single mark; key rows in pie, map and risk-matrix today) and
   `data-series-for` (series; line and ep-curve emit it on direct series labels, and no key row
   carries it today).
5. **`detail` is first-class** and reaches narration, the speaker note and the PDF (section 7).

Three layouts, one model:

| Layout | Draws | Example |
|---|---|---|
| `key` | Labels with marks, apart from the figure, stacked or flowed | The five-step ramp key |
| `anchored` | Labels placed at a mark, handed to `placeLabels` | A heatmap callout, a bar value |
| `along-path` | A label riding a line | A flowchart edge name |

A plain label on a chart is a one-entry legend in `anchored`. There is no second plugin for it.

## 5. Authoring through Segno

**Entry.** An entry is a Segno record that extends the pill record. In a legend context the
binding is:

- one bare non-vocabulary word: `text`
- two bare non-vocabulary words: `key`, then `text`. This keeps every shipped
  `[{1, Cold}, {3, Warm}]` working unchanged (the heatmap docs teach exactly this at
  `heatmap.docs.md:39`).
- `c1`-`c12`, a shape word or a size word: bound by type, as the pill does
- `detail="…"`, `mark=`, `for=`: named-only, so they never collide with a bare word

Examples (proposed spelling):

```
[{1, Cold}, {3, Warm}, {5, Hot}]                       renames ramp steps (works today)
[{1, Cold, detail="Under 20 percent"}, {5, Hot}]       adds a detail line (new)
@legend{[{Poor, c1}, {Fair, c2}, {Good, c3}], key}     a free-standing key on any slide
@legend{{Month 2 drop-off, tag, c4, for=mark 14}}      one anchored callout, with a plate
```

**Where the grammar lives.** Three facts shape this:

- No tag character is free, so `contributes.inline` with a sigil cannot carry `legend` without
  widening the tag set. Widening touches the grammar (`notation-grammar.ts:25`, `isDirective`
  at `notation.ts:414`, the copy at `resolve.js:421` and the test that pins it).
- The pill is a **core slot**, not a plugin, and the owner asked for "an embedded plugin
  similar to pills".
- A list of records is expressible as a slot parameter, not as a top-level slot.

So: the `legend-entry` slot and a `legend` record slot (with an `entries` list parameter) live
in `lib/core/segno-slots.js` beside `pill`. The plugin under `lib/plugins/legend/` supplies the
manifest, docs, fixtures, styles and the `chart-family` extension-point wiring. The `@legend{}`
named form reaches it without a sigil. The tag-character widening is not taken. This is
decision 1 below.

**Register.** The front-matter register becomes a Segno-read block, replacing the regex
`parseRegisterBlock` (which has no engine caller today, so the swap changes no shipped output).
`label-set.js` becomes the data layer of the plugin: `resolveLabelSet` keeps its merge by key
and its drop of authored keys the chart did not derive.

**Diagnostics.** Segno returns `{code, severity, message, from, to, fix?}` and leaves the span
literal on error. The plugin adds codes for a `for=` that names nothing, a `detail` on a layout
that cannot show it, and a ramp key that no cell uses (heatmap already drops it and says so).

## 6. Rendering: two emitters, one model

- **HTML emitter.** A flex row of `[mark][text][plate]`, sized in `cqi` and `em` so it scales
  with the slide. Replaces `html-legend.js`, `graph-key.js`, `label-set-key.js` and the HTML
  private builders. Output stays class-for-class what each caller emits today until its port.
- **SVG emitter.** A `<g>` with `<tspan>` text from `wrapSvgLabel`, the mark as SVG path or
  rect, an optional `<rect>` plate sized from `measureLabel`. Everything is viewBox units;
  the legend font is a fixed fraction of the diagram height (`FS_OF_HEIGHT = 9/200`,
  `svg-legend.js`) so the key is the same physical size on every chart.
- **Why two, not one.** `<foreignObject>` is unreliable in the Chromium-to-PDF path and the
  motion system cannot animate an HTML node inside an SVG
  (`2026-07-26-svg-chart-labels-motion.md` §2). One model, two emitters is the only shape that
  keeps both.
- **Kept as is:** `svg-label.js` wrap, measure, de-collide, leader lines and eight-position
  placement; `label-drops.js` drop reporting. They become the SVG emitter's back end.
- **Held by tests that stay green:** `svg-label-css-mirror.test.js` (kernel font size must equal
  the CSS size), the drop census, `checkChartMarks` (a class must appear whole in a string
  literal, so classes are spelled out in full, never composed from a prefix).

## 7. Narration

A legend becomes a first-class narration unit instead of a consumed line.

1. **Every entry binds with `said()`** to `{act, unit:'key', id, value, label}`, so the
   timeline can address it. The manifest gets a `gesture.units.key` block with the selectors
   (`select` and `labels`), as pie's `labels: [data-mark-for="{mark}"]` does today.
2. **A key reads as one sentence by default** ("Poor is 1, Fair is 2 … Exceptional is 5"),
   replacing the consumed-line behavior in `keyedWords`, with each entry's words unchanged so
   existing narration stays word-for-word.
3. **`detail` is spoken only when asked** (`act:'note'`, the way `speakItemDetail` treats a
   mark's detail), and always folded into the speaker note, so the PDF carries it. This closes
   the gap where `detail` reaches nothing but a tooltip.
4. **Screen readers get a list.** The HTML emitter renders a real list; the SVG emitter keeps
   `<desc>` for the figure and adds the entries as `role="list"` children where the group is
   not `aria-hidden`. UNVERIFIED: whether the legend body sits inside the `aria-hidden` mark
   group depends on each caller in `cartesian.js` and the hand-rolled roots.

## 8. Gestures

Three tiers, each gated by what the surface can do. The PDF has no JavaScript, so tier 0 must
carry full meaning.

| Tier | Behavior | Needs |
|---|---|---|
| 0 Static | Meaning is in the drawing, narration and speaker note. | Section 7. No code beyond the emitters. |
| 1 Proxy | Hover (fine pointer) or tap (coarse) on an entry with `for` opens that mark's card and dims the rest. Keys 1-9 already reveal a mark. | Generalize `data-mark-for` from pie, map and risk-matrix key rows to every `for` entry. Reuses `chart-interact.js`. |
| 2 Series | Hover or tap an entry highlights its series and dims the others. | `data-series-for` on key rows for every series chart (today only line and ep-curve emit it, and only on direct series labels). |

**Left out on purpose: toggling a series on and off.** In a presented deck it changes the data
the audience sees from a swatch tap, nothing in the export records it, and the verb-parity rule
would require keyboard, wheel and touch versions of it. It can be revisited with its own note.

Constraints that bind every tier:

- Interaction stays in the parent page; the slide iframe remains a paint surface.
- Hover alone does not satisfy parity. Every entry with `for` also needs a keyboard route.
  The slide has no focus handling today, so this is new work and is stated as such.
- Do not put `data-mark` on a legend row. It would shift the popover's index map; the radar
  precedent is `2026-07-26-svg-chart-labels-motion.md` §5. Use `data-mark-for`.
- Popover HTML comes from templates through `templateSafe` (`mark-detail.js:131-136`); legend
  text is escaped (`html-legend.js:53-60`, `svg-legend.js:100`). A legend that injects markup
  after the sanitizer must be listed in `SANCTIONED_RUNTIME_MARKUP_SINKS` with its
  justification (HARD RULE #22).
- Any change to the exported player changes export bytes and needs the owner's sign-off with a
  dark and a light render.
- UNVERIFIED: whether legend swatches stay static during motion. They carry neither `data-mark`
  nor `data-anima-role`, but `chartToScene` treats every `<text>` as role `label`
  (`chart-anima.ts:256`), so legend text already animates in.

## 9. What retires, what stays

| Retires after its port | Lines |
|---|---|
| `svg-legend.js` | 637 |
| `html-legend.js` | 111 |
| `graph-key.js` | 76 |
| `label-set-key.js` | 178 |
| Private key code (seven components) | about 421 |
| **Total** | **about 1,423** |

`label-set.js` (264) and `lift-label-set.js` (71) fold into the plugin's data layer rather than
retire. Stays: `svg-label.js` (1,195), `label-drops.js` (187), computed axis ticks (`line`,
`histogram`, `ep-curve` thinning), narration and `<desc>` text.

Two kinds of key are not swatch keys and should not be forced in: the size ramps in `scatter`
and `word-cloud`, and `risk-matrix`'s numbered index. Risk-matrix's rows are already tap
proxies (`data-mark-for`), so a port must keep them. Each is ported only if the `mark` kernel
expresses it without bending (a size ramp as a `ramp-step` mark; a numbered index as a `circle`
plate with a number). Otherwise it stays a private builder and the note says why. This is
decision 3.

## 10. Migration plan

Rule: **a port is byte-identical or it is an export change.** The legend port already proved the
method: `buildHtmlLegend` matched `buildStatusLegend` against a committed PDF. A port that
changes bytes stops for the owner's dark and light sign-off (QUALITY BAR).

| Wave | Components | Why this order |
|---|---|---|
| 0 | `legend-mark.js`, both emitters, `legend-entry` slot, plugin shell, heatmap anchored labels (first PR) | The kernel, plus one visible new capability that proves it end to end |
| 1 | roadmap, matrix-grid, obligation-matrix | Already on `buildHtmlLegend` or the post-pass; HTML; lowest risk |
| 2 | bar, stacked-bar, tower, piechart, map, quadrant, radar, heatmap key, line fallback | Nine callers of `buildSvgLegend`; the SVG emitter wraps it first |
| 3 | flowchart, state-chart | `graph-key` groups entries by tone; renaming lives in the grammar, not `labelSet` |
| 4 | journey, gantt, hub-spoke | Private builders. Journey does not use `buildHtmlLegend`, so its markup changes; treat as an export change |
| 5 | scatter, word-cloud, slope, risk-matrix | Only if the mark kernel expresses them (section 9) |

One adopter per commit; one PR for the session's line of work (CLAUDE.md). "Byte-identical
plausible" in the census is a reading of call shapes, not a diff, so Wave 1's first port
doubles as the test of that claim.

## 11. Gates this touches

`checkChartMarks` (`check-ownership.js:5497`, class list), `checkFontMetricsPin` (`:13137`,
`GLYPH_UPPER` imported from `svg-label.js`), the label-drop notes (`:5638-5733`), and the
tests: `svg-legend`, `svg-label`, `svg-label-css-mirror`, `svg-tspan-baseline`, `label-drops`,
`chart-label-drop-census`, `html-legend`, `label-set`, `label-set-key` (unit and parity),
`chart-mark-contract`, `chart-marks-gate`, `chart-finish-css` and `chart-tap-proxies`. Also
HARD RULE #20 (no margin), #21 (US English), #22 (escaping) and #29 (no typed glyphs).

## 12. How each claim gets verified (HARD RULE #23)

| Claim | Surface | Artifact |
|---|---|---|
| A port is byte-identical | Engine HTML/SVG output | Diff of the rendered SVG/HTML, before and after, per adopter |
| Export unchanged | PDF | Rendered demo deck, dark and light, sent for sign-off |
| Narration reads a key and a detail | Narration output for a demo deck | The spoken script, with the `detail` sentence present |
| Hover/tap works | The real Playground | `tools/screenshot.js` at 1440, 820 and 390 widths, plus a driven tap |
| Keyboard parity | The real Playground | A keyboard-only run that reaches an entry with `for` |
| Responsive | Docs site | Screenshots at three widths |

CI green and unit tests do not verify any row above. iOS touch is UNVERIFIED until driven in
the installed WebKit project.

## 13. Risks and unknowns

- **Segno list slot.** A top-level list is not expressible in JSON specs. The design wraps
  the list in a record parameter; this needs a spike before Wave 0 commits to it.
- **Two-bare-word binding** (`{1, Cold}` as key + text) must be proven not to collide with a
  pill (`{LIVE}`) in the same span family. The spike reads every shipped label set.
- **Census caveats.** Risk-matrix and slope line counts are estimates; only one of eight
  manifests with a `gesture` block was sampled; `chart-detail-layer.tsx` sanitizing was not read.
- **Scope.** The plugin touches 21 components and the player. The waves keep each step
  reversible by one commit.

## 14. Decisions

| # | Decision | Recommendation |
|---|---|---|
| 1 | Where the grammar lives: core slots plus a plugin shell reached by `@legend{}`, or widen the Segno tag set to give the plugin a sigil | Core slots plus shell. Widening the tag set changes the grammar for everyone |
| 2 | Series toggling | Leave out (section 8) |
| 3 | Size ramps, risk-matrix index and slope in scope | Out of Wave 0-4; decide per proof in Wave 5 |
| 4 | Where a free-standing `@legend{}` lands on a slide with no key slot | Below the figure in the body, using `liftLabelSet`'s existing slot logic |
