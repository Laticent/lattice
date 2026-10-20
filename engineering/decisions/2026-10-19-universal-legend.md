---
status: in-progress
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

**2026-10-19.** Status: in progress. Waves 0, 1 and 2 are built (§§ 15, 16, 17); Waves 3 to 5 are not. § 18 records the owner's ruling on callout markers: shape and color, at most six. Facts in
§§ 3 to 13 come from three read-only audits of the tree and are cited by file and line; the lines
marked UNVERIFIED are the ones nobody opened. Where the build departed from §§ 4 to 10, § 15 says
how and why.

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

**Entry.** Two Segno record slots, tried in order (`bindPill` re-reads a span through a second compiled slot for an
icon-only pill, `inline-pills.js:134-170`; that retries after a successful read, ours after a
refusal, so it is an analogy and not the same logic):

1. `legend-entry`: ONE positional `text`, then bare words bound by type (`c1`-`c12`, a shape word,
   a size word) and named-only `detail="…"`, `mark=`, `for=`. This is the pill record with the
   extra named parameters, so `{Poor, c1}` and `{LIVE, tag, c4}` read as they do for a pill.
2. `legend-keyed`: on a refusal from slot 1 only, `key` and `text` as two positionals plus
   `detail` and `color`. This keeps every shipped `[{1, Cold}, {3, Warm}]` and the flowchart
   `[{"=>", Happy path}, {dashed, Sent back}]` working unchanged (spike 2 below).

Rejected design: ONE slot with two positionals. Segno fills positionals before it binds by
type, so `{Cold, c1}` read as text "Cold" plus text "c1" and silently lost the color (spike 2).

A label whose second word is a vocabulary word reads as an entry, so `{1, tag}` is text "1"
with a tag shape. Quote it, as the pill does, to keep it a keyed pair: `{1, "tag"}`.

Examples (proposed spelling):

```
[{1, Cold}, {3, Warm}, {5, Hot}]                       renames ramp steps (works today)
[{1, Cold, detail="Under 20 percent"}, {5, Hot}]       adds a detail line (new)
@legend{[{Poor, c1}, {Fair, c2}, {Good, c3}], key}     a free-standing key on any slide
@legend{{Month 2 drop-off, tag, c4, for=14}}           one anchored callout, with a plate
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
4. **Screen readers get a list from the HTML emitter only.** The SVG key sits inside the
   chart's `aria-hidden` group (`bar.transform.js:649-656` puts `legend.body` in `body`, and
   `ariaHiddenMarks` wraps it, `cartesian.js:1314`), so a `role="list"` on SVG rows would be
   inert. For SVG the `<desc>` stays the one reader route, and it now includes each entry's
   `detail`. Only the HTML emitter renders a real list.

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
- Motion (read from code, not driven): `chartToScene` animates only nodes with `data-mark` or
  `data-anima-role`, plus every `<text>` as role `label` (`chart-anima.ts:236, 256`). Legend
  swatches carry neither attribute, so they stay static, and legend text already animates in
  as a label. Driving it on the real Playground stays on the build's verification list.

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

## 13. Spikes, and what is still unknown

Four spikes ran against the real Segno compiler and reader (`compileSlot` from
`lib/core/segno-spec.js`, `read` / `tryRead`), with the shipped label-set spans as input. The
scripts are throwaway (`.scratch/`-style) and the results are the table below.

**Spike 1: a list of entry records inside a record parameter. PASS.**
`{[{1, Cold}, {3, Warm}, {5, Hot}]}`, `{[{Poor, c1}, {Fair, c2}], key}`,
`{[{1, Cold, detail="Under 20 percent"}], layout=key}` and `{[]}` all compile and read, with
`detail` and `layout` bound. So `@legend{…}` can carry its entries in a record slot and needs no
top-level list slot. Decision 1 stands.

**Spike 2: key + text beside the pill record. One design FAILED, the replacement PASSES.**

| Input | One slot, two positionals (rejected) | `legend-entry`, then `legend-keyed` retry (adopted) |
|---|---|---|
| `{Cold, c1}` | text "Cold", text "c1": color lost | entry: text "Cold", color 1 |
| `{LIVE, tag, c4}` | text "LIVE", text "tag": shape lost | entry: text, shape tag, color 4 |
| `{1, Cold}` | key "1", text "Cold" | keyed: key "1", text "Cold" |
| `{"=>", Happy path}` | not tried | keyed pair |
| `{dashed, Sent back}` | not tried | keyed pair |
| `{dotted, Waits for business hours}` | not tried | keyed pair |
| `{1, Cold, detail="Under 20, maybe"}` | key, text, detail | keyed pair with detail |
| `{1, Cold, c2}` | key, text, color | keyed pair with color |
| `{1, "tag"}` | not tried | keyed pair (quoting keeps it a pair) |
| `{1, tag}` | not tried | entry: text "1", shape tag (documented, quote it) |

A number-first key (`{1, Cold}` only when the first word is a number) was also tried and
rejected: it refuses `{Cold}` and `{done, Done}`, and flowchart keys are words and operators.
**Census of shipped spans (spike 4, re-counted by the independent checker).** A regex over
`lib/`, `design/`, `engineering/`, `examples/`, the docs content and the baseline decks found 121
inline `[{…}]` spans holding 187 records. The regex also catches axis specs, so the table
separates them:

| Records | Count | What they are |
|---|---|---|
| Real label-set records, read under the adopted design | 47 | `{1, Cold}`, `{"=>", Paging path}`, `{dotted, Waits for business hours}`, `{shipped, Enacted}`, `{applies, In force}` (8 read as entries, the rest as keyed pairs) |
| Axis specs | 114 | `{Effort, 0..10, 5}`, `{Timeline, 2026 Q1..Q4, today=Q3}`, `{Annual loss, log}`. 79 happen to read as an entry or pair; 35 do not. All are the axis grammar, none is a hidden label set |
| State-marker keys | 22 | `{[x], Enacted}`, `{[-], …}`, `{[ ], …}`, `{[/], …}` in roadmap, matrix-grid and obligation-matrix |
| Viewport debug records | 3 | `{w:1440,h:900}` in a decision note |
| Prose | 1 | `{el, label, hint?}` |

47 + 114 + 22 + 3 + 1 = 187. Every real label-set record in the repo reads, except the 22
marker keys, which need the compat arm below.

**The marker keys do not read unquoted.** `[` is a Segno stop character, so neither slot can
lex `[x]` as a bare key. Quoted, they read: `{"[x]", Enacted}`, `{"[ ]", Not started}`,
`{"[-]", In committee}` and `{"[/]", Cut}` all bind as keyed pairs.

**A label with a comma in it is a tested contract the adopted slots refuse.** `label-set.js:59-62`
splits only on the first comma, and `label-set.test.js:25-29` and `bracket-list.test.js:125-129,
142, 145` pin it (`{2, Holding, but watch it}` gives the label "Holding, but watch it"). No shipped
deck uses the shape, but it is a tested behavior.

**Decision 5 covers both.** The existing bracket reader (`parseBracketList`, which already runs
through Segno's generic parser without a slot schema, `bracket-list.js:27, 162`) stays as a
**fallback arm**: when both slots refuse a span, it reads the plain `{key, label}` pairs exactly
as today, which keeps the marker keys and the comma-in-label contract. Styling words and `detail`
need the Segno slots. The fallback is not a Segno slot, which sits against Segno decision 20
(`2026-09-28-segno-unified-inline-notation.md:71`) and decisions 9 and 24 (a clean break); it is
bounded to plain pairs and retires when those decks and tests move to the quoted spelling.

**One shape reads wrong silently, and the build adds a diagnostic for it.** A keyed pair whose
label is a pill word reads as an entry with no error: `{1, lg}` is text "1" with size lg,
`{2, c3}` is text "2" with color 3. None of the 47 real records has this shape, and today's
reader takes `{1, Cold, c2}` as the label "Cold, c2". The legend plugin emits a lint diagnostic
for a two-word record whose second word is a vocabulary word and says to quote it.

**Settled by reading the code:** SVG keys sit inside the `aria-hidden` group (section 7); legend
swatches carry no motion attribute (section 8).

**Still unknown, and none of it bears on the grammar or the model:**

- "Byte-identical port" rests on reading call shapes, not on a diff. Wave 1's first port is
  its test.
- iOS touch and the real-Playground gestures are driven in the build, not here.
- `chart-detail-layer.tsx` sanitizing was not read; a legend that injects popover markup must
  be listed under `SANCTIONED_RUNTIME_MARKUP_SINKS` with its justification (HARD RULE #22).
- Census caveats: risk-matrix and slope line counts are estimates; one of eight manifests with a
  `gesture` block was sampled.
- The adversarial trio (HARD RULE #25) has not run. This note is a design, so the trio runs on
  the build that ships, not on the note.

## 14. Decisions (confirmed by the owner, 2026-10-19)

| # | Decision | Outcome |
|---|---|---|
| 1 | Where the grammar lives | Core slots beside `pill`, plus a plugin shell reached by `@legend{}`. The Segno tag set is not widened |
| 2 | Series toggling | Left out. Revisit with its own note |
| 3 | Size ramps, risk-matrix index and slope | Out of Waves 0-4; decided per proof in Wave 5 |
| 4 | Where a free-standing `@legend{}` lands when the slide has no key slot | Below the figure in the body, using the lift logic `liftLabelSet` already has |

The spikes ran (section 13). Spike 1 passed. Spike 2 rejected the one-slot, two-positional
binding and adopted the entry-then-keyed retry. Decision 1 stands.

| # | Decision | Outcome |
|---|---|---|
| 5 | How shipped state-marker keys (`[x]`, `[-]`, `[ ]`, `[/]`) and comma-in-label pairs keep working | Default taken: keep the bracket reader as a fallback arm for plain `{key, label}` pairs when both slots refuse, accept the quoted spelling, migrate decks and tests later. The owner can veto; the alternative is a breaking migration of three components' decks and two tested contracts in the first port |

## 15. Wave 0, as built (2026-10-19)

What shipped, and the four places it departs from the design above.

| Part | Where |
|---|---|
| Model, reader, `for=` on a grid | `lib/core/legend.js` |
| HTML `key` emitter | `lib/core/legend-key.js` (shared), `lib/core/legend-html.js` (the legend's own classes) |
| Diagnostic words | `lib/authoring/legend-messages.js` |
| Mark slot | `lib/core/legend-mark.js` |
| The two entry slots and the `legend` record | `lib/core/segno-slots.js` (`legend-entry`, `legend-keyed`, `legend`) |
| SVG `anchored` emitter | `lib/components/chart/_chart-family/legend-svg.js` |
| The lift of a `@legend{…}` paragraph | `lib/core/lift-label-set.js` `liftLegends` |
| Plugin shell (on by default, `legend:` register) | `lib/plugins/legend/` |
| First reader | `heatmap` (`resolveCallouts`, `calloutLane`) |
| Narration | `lib/core/chart-narration.js` `gridCalloutSentences` |
| Lint | `lib/authoring/lint-core.js` `findLegendSpans`, rule `legend-span` |
| Demo deck | `examples/legend-anchored.md` |

**Departure 1: the SVG emitter's first strategy is a lane, not `placeLabels`.** § 6 handed an
anchored label to the placement pass. On a heatmap that fails: every cell is filled and prints its
number at its center, so a label set on the grid covers a number or sits on a fill its ink cannot
hold contrast against. The halo that would fix contrast (`paint-order: stroke`) paints in Chrome,
but the CLI's vector PDF writer draws SVG text as plain fill and drops the stroke
(`lib/core/pdf-compose/read-slide.mjs` `textRefusal` does not refuse a stroked SVG `<text>`).
Measured on the demo deck: the bare label read cleanly in `--chrome-pdf` and lost its halo in the
default PDF. So `laneSvg` sets labels in a lane beside the figure, on the canvas. A chart with open
space adopts `placeLabels` when it joins the legend. The halo
gap is pre-existing. Read from the code and not rendered: the same writer path draws the
stacked-bar, waterfall, scatter, radar and pie labels that carry a halo, so theirs is lost too. It
is logged as a followup rather than fixed here, because the fix moves export bytes on every one of
those charts and needs the owner's dark and light sign-off.

**Departure 1b: a number ties a lane label to its mark, not a leader (owner, #2798).** The first
build joined each label to its cell with a leader routed along the canvas-colored gap between two
rows, so it never crossed a cell. The owner found the line hard to see, and a prototype of four
forms in both modes showed why: a line in the gutter vanishes against the canvas, a line across the
grid covers values, and two callouts on one row put two lines in one gap, where they merge. The
owner chose numbers: the cell is ringed and carries a numbered marker in its top-left corner, and
the same marker leads the label in the lane. The marker IS the label's plate, so the pill words
(`circle` by default, `tag`, `c4`, …) style it and nothing new is added to the vocabulary; it sits
on a knockout of the canvas color, a filled shape the PDF writer keeps, so it reads on any cell.
It goes in the first spot that covers nothing (inside a corner, else on one, at full size and then
at the floor size), tested against every printed value, the row and column names and the markers
already placed; where no spot is clear, as on a grid whose four-digit values fill their cells, the
marker is left off and the ring alone marks the cell (the checker on #2798 found the first rule,
"on the corner when the cell is small", covered neighbors' values and the column names). Numbers run row by row, then left to right. On the owner's second look, two more: with no
color word a marker takes the slot of its number, so the numbers differ by color too; and the marker
on a cell is sized from the cell (a quarter of its shorter side, held between 0.75 and 1.1 of the
label size), while the lane's copy is sized from its label, as a pill is from its text. Making the
HTML pill itself size from its container is a pills-plugin change logged as
`followups.d/2798-p3-pills-size-from-their-container.md`.

**Departure 1c: a cell is named by `row=` and `col=`, not by `for="Row · Column"` (owner, #2798).**
The first build named a heatmap cell by the string the chart prints in `data-label`, `Row · Column`.
The owner pointed out nobody types a middle dot. The survey: a spreadsheet counts (`C2`, which also
collides with labels like `M2`), pandas' `.loc` and a reader name the row and the column by their
labels, and a chart grammar filters on fields. The owner chose the labels as two named words,
`{Dip, row="Feb 2026", col=M2}`: nothing to type between them, a label holding `/` or `·` is named
whole, and `row=` or `col=` alone leaves room for a whole-row or whole-column callout later. `for=`
stays as the short form, the mark's index (`for=14`) or `Row/Column`; `·` is still read and no
longer taught. The reader turns the pair into the entry's target, so every surface (render,
narration, lint) resolves it through the one `gridTarget`. A pair missing a half, and a label that
names its cell both ways, are diagnostics of their own.

**Departure 2: the `@legend{…}` paragraph is read by the component, not by an inline row.** The
plugin adds no row to the dispatcher (`inline-code-directives.js`). A row would have to draw a
legend in place, and an anchored label has no place of its own: it belongs to the chart. So the
component lifts the paragraph, the way it lifts a label set. `LEGEND_READERS` in `legend.js` lists
the readers (today, `heatmap`), and `lint:deck` warns on a legend anywhere else, where it renders
as code. When a second reader lands, that list moves to a manifest field the build collects.

**Departure 3: `for=` on a grid names a cell by its printed row and column.** `for=14` (the
`data-mark` index) works, but an author cannot count cells. `for="Feb 2026 · M2"` matches the
cell's own `data-label`; `/` works in place of the middle dot. `gridTarget` resolves both, and
the heatmap and the narrator share it.

**Departure 4: on by default, and the author can turn it off (owner, 2026-10-19).** The first build
made the plugin embedded, reading § 5's "an embedded plugin similar to pills". The owner then chose
otherwise on #2798: legends are on by default, and an author can turn them off. It is an essential
plugin with a front-matter register, `legend: off` for the deck and `legend-off` / `legend-on` per
slide, built by the same factory as `spark:` and `icon:` (`contributes.registers`). That reuses the
plugin system's existing switch rather than adding removal syntax to `plugins:`, which stays an
import list that only adds. A host can still turn it off with `--disable-plugin legend`, and the
heatmap lists it as optional, so either switch has the same effect. Off, a callout is not drawn,
described or narrated, so the slide reads as if the line were not there; its `detail` still joins
the cell's card and speaker note, and `lint:deck` notes it (`legend-off`, info). The owner chose the
switch and the hidden-when-off behavior in one round; the words `legend-off` / `legend-on` follow the
register factory's `<key>-<word>` pattern.

Every reader asks one question, `legendOff` in lib/core/legend.js, which reads the deck's value
through the register factory the render uses, so `legend: OFF` or `legend: [off]` means the same to
the render, the narrator and the linter. The narrator sees one split slide at a time, so its callers
(the CLI read-along, the Studio's Present and bake, the share export) hand it the deck's front matter
and the host's off-list. An exported runtime stamps `legend-off` on each slide when its host left the
plugin off. `lint:deck` gives the info note only on a slide whose component reads a legend; anywhere
else the span shows as code whatever the switch says, so the `legend-span` warning stands.

**The route budget (owner, 2026-10-19, D1).** The preview runtime carries the heatmap transform and
the Wave 1 keys, so the legend's reader and emitters ride into it. After the trims (the diagnostic
words moved to `lib/authoring/legend-messages.js`, the key emitter split into `legend-key.js`) the
getting-started route measured 311.4KB against a 309.7KB ceiling. The owner raised that ceiling by
4KB rather than keep callouts out of the runtime, which would have shown `@legend` as code in the
Marp export and the VS Code preview (`docs/route-budget.history.md`, 2026-10-19).

**Detail (§ 7 rule 3).** A callout's `detail` joins its cell's card and speaker-note line
(`cellMarks`), so the PDF carries it; narration speaks it as a `note` after the callout. A callout
that names no cell is not drawn and not spoken, and the chart's `<desc>` lists it.

**Not built in Wave 0:** the `key` and `along-path` layouts on any chart (the HTML key emitter
exists and is tested, with no caller yet), the front-matter register swap (§ 5), the
bracket-reader fallback arm (decision 5; it matters only once a label set is read through the
slots), gestures beyond tier 1 (a callout carries `data-mark-for`, so hover and tap reach the
cell's card through the existing proxy), and a website catalog page for the plugin.

## 16. Wave 1, as built (2026-10-19)

roadmap, matrix-grid and obligation-matrix draw their keys through `keyHtml` in `lib/core/legend-key.js`,
and `lib/core/html-legend.js` is gone. `keyHtml` has two modes with one markup shape: the legend's
own classes (the mark slot draws the mark, the text may carry a plate), and a component's own
classes, where the swatch is an empty span painted by the component's stylesheet from the row's
classes (`rowClass`) or the swatch's (`swatch`). The second mode is the old builder, moved.

**The byte-identical claim is now a diff, not a reading of call shapes (§ 10, § 13).** Every
tracked deck that uses one of the three classes (29 decks under `lib/`, `examples/`, the baseline
decks, `design/` and the docs content) was rendered through `createEngine().render()` plus the
`label-set-key` post-pass, at `main` (8933fad) and after the port. The 29 HTML files are identical
byte for byte; they carry 19 roadmap keys, 20 matrix-grid keys and 22 obligation-matrix keys.
`test/unit/core/legend-key-html.test.js` keeps every arm of the old builder's test, including the
one transcribed from roadmap's original `buildStatusLegend`.

## 17. Wave 2, as built (2026-10-20)

The nine SVG keys of the chart family (bar, stacked-bar, tower, piechart, map, quadrant, radar, the
heatmap key and the line fallback) draw through `keySvg`, the legend's SVG emitter for the `key`
layout. It lives in `lib/components/chart/_chart-family/legend-svg-key.js`, and `legend-svg.js`, home
of the `anchored` lane Wave 0 built, re-exports it, so the emitter has one front door. `buildSvgLegend`
is gone from `svg-legend.js`.

**The port is a move, not a wrapper.** § 10 said the SVG emitter "wraps it first". A wrapper would
leave two names for one builder and the key's code in a file the legend does not own, so the builder
moved whole: `keySvg` is the old `buildSvgLegend` with its row emitter, portrait column, band packer,
mark-contract stamp and `<desc>`, under the same signature and the same row shape. `svg-legend.js`
keeps what the key shares with the rest of the family: the font ratio and the spine's metrics,
`buildSpine` (scatter and word-cloud use it too), `wrapLabelToLines`, and `fitKeyToPane`, which takes
the caller's `keySvg` call as a callback and so never imported the builder. The dependency runs one
way, `legend-svg.js` to `legend-svg-key.js` to `svg-legend.js`, with no cycle. The row shape is
unchanged on purpose: translating rows into the legend model's entries is the step that would move
bytes, and it belongs to the wave that first needs a model field the rows lack.

**Why the key has a file of its own: the docs site ships each chart as its own kernel.** The first
build put `keySvg` inside `legend-svg.js`. The checker on this wave bundled each transform (esbuild,
minified, gzip -6) and found eight kernels about 2.2KB larger each, because the lane, plate and
marker code now rode into charts that draw only a key; `chart-map` is the kernel `chartKernelGz`
watches. Split out, as `lib/core/legend-key.js` is for the HTML key, the kernels move by tens of
bytes: map 96,820 to 96,889, bar 35,098 to 35,172, piechart 34,532 to 34,592, radar 57,928 to
57,989, line 36,818 to 36,903, heatmap 46,295 to 46,470. The key's own metrics (row gap, swatch
edge, column widths) moved with it rather than being exported from `svg-legend.js`, because the
minifier cannot inline a constant read across modules. The preview runtime
(`dist/lattice-runtime-min.js`) gzips to 425,943 bytes against 425,957 at `main`.

**One commit, not nine.** § 10 says one adopter per commit. The owner's brief for this session asked
for one commit per priority, and a move cannot land one caller at a time without a second copy of
the builder for the commits in between, so the nine callers moved in one commit.

**The byte-identical claim is a diff.** Every tracked Markdown file in the repository (3,707 of
them, which includes every deck under `lib/`, `examples/`, the baseline decks, `design/` and the docs
content) was rendered through `createEngine().render()` at `main` (2a8091b) and after the port, and
the two trees were compared with `diff -r`. The only differences are the prose of
`chart-family.docs.md` and of this record, whose text this commit edits. (One file, a math fixture,
throws the same KaTeX error on both sides.) The rendered decks carry 141 keyed sections:
44 piechart, 33 radar, 31 map, 13 tower, 7 quadrant, 6 bar, 6 heatmap and 1 stacked-bar, 5 of them
portrait. No tracked deck reaches line's key fallback or a keyed chart in a pane, so a synthetic deck
covered those (line's fallback, a pie and a radar in panes, and the same deck at 9:16); it too
rendered identically before and after. `test/unit/transformers/svg-legend.test.js` keeps every arm,
including the frozen landscape golden, now pointed at `keySvg`.

## 18. Callout markers: shape and color, at most six (owner, 2026-10-20)

**The question.** On a heatmap whose values fill their cells, a callout's numbered marker found no
clear spot and the cell kept its ring alone (§ 15, Departure 1b), so a reader matched ring to label by
row position only. The owner asked for a ruling: keep the ring alone, or go to a smaller value.

**What was measured first.** A 10-row, 12-column grid of four-digit values, the densest the heatmap
allows (`MAX_ROWS`, `MAX_COLS`), has cells of 17.5 by 14.9 units with the value set at 7. Lowering the
numbered marker's floor (`MARKER_MIN` in `heatmap.transform.js`, 0.75 of the 7.5-unit label) placed no
marker down to 0.45 and all three only at 0.4, a 3-unit numeral that the CLI's type check flags
(`TYPE FLOOR — … 5.2pt`, under its 5.4pt floor). Moving the ringed cell's value to its bottom edge to
free a corner helped only at 8 by 8. A sweep of 4 to 8 rows by 8, 10 and 12 columns of four-digit
values put the ring alone at 8 rows and up.

**The ruling (owner, on #2816).** Ring alone is not acceptable: with two callouts on one row, position
cannot tell them apart, which fails WCAG 1.4.1's requirement that information not rest on one channel.
A smaller numeral is not readable. So a marker is a **shape and a color**, with the digit inside only
when the mark has room, and a chart draws **at most six** callouts, one shape each. Three choices, all
the owner's pick of the recommended option:

| Choice | Ruling |
|---|---|
| When a marker uses shape and color | Always; the digit rides inside when it fits, and always in the lane |
| The cap | Six; the first six as written draw, the rest are listed as not drawn and `lint:deck` warns (never an error: decks are coached, not refused) |
| The six shapes | circle, square, triangle, diamond, hexagon, star. The owner's first list had a rectangle, which reads as the square at marker size; the star replaced it |

Six is a perception limit, not a space one: measured, the lane holds 10 short labels beside a 10-row
grid before it drops one. About six shapes are told apart at a glance at marker size, and a chart
making more points than that should be split.

**As built.**

| Part | Where |
|---|---|
| The cap, one constant read by the render, the narrator and the linter | `lib/core/legend.js` `MAX_ANCHORED` |
| Shapes, assignment, the digit-optional marker | `legend-svg.js` `MARKER_SHAPES`, `markerShapes`, `markerSvg` |
| Placement: digit at full size, digit at the floor, shape alone at the floor, shape alone at its own floor | `legend-svg.js` `laneSvg` |
| The shape's floor | `heatmap.transform.js` `SHAPE_MIN` at the time, 0.4 of the label size; replaced by the cell-based height below |
| Capped callouts: not drawn, in the description, detail kept in the cell's card | `heatmap.transform.js` `resolveCallouts`, `describeCallouts`, `cellMarks` |
| Narration stops at six | `chart-narration.js` `gridCalloutSentences` |
| The lint warning, counted across every span on the slide | `lint-core.js` `pastTheCap` |

**What it took to fit the densest grid.** Three measured steps, on a 10-row grid of four-digit values
that print (9 columns: at 12, six callout labels widen the lane until four-digit values no longer fit
their cells, before and after this change alike). With the shape floor at 0.5, one of six shapes
placed; the clear space on such a grid is a band about 6.5 units tall between one row's values and
the next, and a corner spot crosses a neighbor's value. Two changes made all six place: a shape
without its digit is sized to the circle's height rather than enlarged to hold a numeral, and a marker
may sit on the middle of its cell's top or bottom edge, in that band. At a floor of 0.4 all six shapes
place on that grid; at 8 rows, four of six keep their digit. A shape there is about 5.5 units
across. At 200 dpi the six outlines read as six; at slide size on a laptop screen they are small, and
that is the cost of putting a callout on a grid this dense.

**One width rule.** A triangle or a star drawn large enough to hold its digit is wider than the
circle, and the lane reserves its widest marker. So a marker with its digit is no wider than the
circle, and a wider shape scales down, digit included: the lane is as wide as it was, and the star's
numeral in the lane is about 3.9 units (about 6.7pt), above the type floor.

**The checker's findings (maker-checker on this change).** Three, all fixed or settled. (1) The lint
counted a `@legend` span written inside a sentence, which the chart does not lift and so does not draw,
so it could warn that the sixth drawn callout was a seventh; the lint now counts only a span that is a
paragraph of its own, the narrator's test (`lint-core.js` `liftedAlone`). (2) Two tests could not
fail; they now compare a shape at its floor with one at the digit's floor, and check every drawn
outline against the box `markerSvg` reports. The check also showed the try "shape alone at the digit's
floor" placed nothing the digit try did not, so it is gone. (3) A triangle's knockout edge was
three-eighths as thick on its slanted sides as a circle's; the knockout now grows by its width over the
shape's inset, held at 0.8 (`KNOCKOUT_INSET_MIN`), which brings it to five-eighths. The full correction
cost three of six shapes their spot on the densest grid, measured, so the compromise is deliberate.

**The owner's look (2026-10-20): edges too thick, digits too small.** Read at 400 dpi, the owner was
right on both. (1) The marker's edge was the plate's fixed one-unit stroke: a tenth of a lane marker and
nearly a fifth of a shape on a crowded grid, and in dark mode a pale rim around a jewel fill, so the
marker read as a sticker. The edge now scales with the marker, 7% of its numeral size with a floor of
0.4 units (`MARKER_EDGE` and `MARKER_EDGE_MIN` at the time; the edge was later dropped, below). (2) The
triangle's and star's digits were small and sat low, because those shapes shrank to the circle's width
around a digit sized for a thin star. A plumper star (inner radius 0.62, outer radius 1.0 of the
numeral) and a smaller triangle radius (0.95) let both hold a larger digit within the same width. (3)
The thinner edge exposed one more fault: a shape with no digit wore the pale pill fill, and on a light
cell it all but vanished. It now fills solid in its slot's strong tone, `mark` in light and `fill` in
dark (`light-dark()`, legend.styles.css), the same jewel the lane's marker wears in dark mode. Every
shape still places on the densest grid. The triangle's digit sits at the triangle's true middle, which
reads a little low because the top is a point; moving it up would put it on the slanted sides.

`test/unit/components/legend-anchored.test.js` pins the six shapes on the densest grid that prints
its values (each shape on its cell and in the lane, no numeral under the floor) and the cap (a seventh
callout not drawn, in the description, its detail in the cell's card); each fails when its rule is
broken (shape floor back at 0.75; the cap removed). `test/unit/authoring/legend-span-lint.test.js`
pins the warning.

**The owner's audit (2026-10-20): size, centering, edges and placement, settled in one round.** This
supersedes the sizing, the placement and the edge rules above; the six shapes and the cap stand. A test
sheet rendered every option with the real stylesheet and fonts, light and dark, before the choice.

| Question | Measured | Ruling (owner) |
|---|---|---|
| Lane marker size | The lane digit was 0.82 of the label (6.15 against 7.5), and the triangle and star shrank further to stay as narrow as the circle | The digit is as large as the label, and every shape is padded like the diamond, so the digit's cap height is a little under two-fifths of the shape's height (`DIGIT_OF_HEIGHT`, `SHAPE_HEIGHT`) |
| Why the diamond read best | It is symmetric top to bottom; its widest point is where the digit sits, and its slanted sides never run parallel to the digit's edges; and it had the most room, the digit filling about 35% of its height against 49% of the circle's | That padding became the rule for all six |
| Digit centering | `dominant-baseline: middle` centers on half the lowercase height; digits stand as tall as capitals, so they sat about a tenth of their size high, measured in the render | `central`, which leaves Outfit's digits 0.02 em off; a triangle's and a star's digit sit halfway between the shape's middle and its box's |
| Font | Outfit and JetBrains Mono both center well under `central`; JetBrains Mono ships only up to weight 600, so its digit reads thin beside the bold label; Playfair's digits descend below the baseline | Outfit |
| Callout vs the key | With a band key the key's labels were 8.1 and the callout 7.5 | A callout is never smaller than the key's labels (`calloutLane`) |
| Edges | The fixed one-unit edge was heavy; on a solid shape the edge is its own color, so the outline seen is the knockout | 4% of the digit size on a marker with its digit; none on a solid shape |
| Size on a cell | — | Height 0.42 of the cell's shorter side, never larger than the lane marker; the digit only at 0.5 of the label size or more |
| Placement | — | Only two places, and no border collisions: whole inside the cell's top-left corner, or a badge offset up and left of it |

**One setup per chart (`pinMarkers`).** Every marker on a chart shares one height, one place and one
choice of digit, so none jumps or shrinks against its neighbors. In this order: digit inside the
corner, digit on a badge two-thirds on the cell, digit on a badge centered where the gutters cross,
then the shape alone in the same three places; failing all six, the height steps down a tenth at a
time to the floor. The gutter-crossing badge is still "offset top-left": on a crowded grid the only
clear space is the band between one row's values and the next, which is centered on the gutter, not
on the cell's edge. The heatmap's avoid list now leaves free the strip between the grid and its row
and column names, which is the only room a badge on the top row or left column has.

**What the two-place rule costs, measured.** With six callouts on four-digit grids, every shape places
at 4, 6, 8 and 10 rows, with digits through 6 rows. On the densest grid, a callout in the top row has
only the strip under the column names, and every marker on that chart shrinks with it to the floor,
3.8 units (`MARKER_MIN_HEIGHT`). The mid-edge spots the earlier build used allowed about 5.5 there.
The shapes are small on that grid, but all six are there, the same size, in the same place.

**One color per callout, measured (owner, 2026-10-20).** The owner found a cell's marker and its
label's marker the same shape and different colors. The cause: the solid shapes on the cells took a
slot's `mark` tier and the lane's markers its `fill` tier, and a theme's two tiers of one slot need
not share a hue (indaco's slot 3 is pale pink `#E7BEBE` against olive `#7B772D`). Now every marker, on
a cell or in the lane, with or without its digit, is one solid shape in ONE tier per mode, the strong
one (`mark` in light, `fill` in dark), and its digit takes that tier's paired ink (`--cat-on-mark`,
`--cat-on-fill`), the pairs the theme's contrast gate already holds. With a solid fill an edge is
either invisible or a rim, so no marker has one; the knockout parts every shape from the cell. In
Chrome, every cell marker on the demo deck computes to exactly its lane marker's fill, in light and
in dark, with no stroke. The digits' ink first came out dark in light mode, 1.7:1 on the deep fills:
the Mermaid plugin's stylesheet paints every `text` and `tspan` under any `.legend` group with
`--cat-on-fill !important`, and the lane is a `.legend` group. The marker digit's rule now carries its
own `!important` on the text and its tspan; measured after, every digit is at least 4.55:1 against its
shape in light and 6.19:1 in dark. Scoping Mermaid's rules is logged as
`followups.d/2816-p2-mermaid-legend-rules-leak.md`. `legend-anchored.test.js` reads the stylesheet and fails if a slot's markers
are painted by more than one rule or tier.

**The checker on this round, three fixes.** (1) A solid shape's `stroke: none` lost to the slot rules
that came later at equal specificity, so it drew a one-unit edge past its knockout; the marker rules
now carry the higher specificity. (2) Growing the callout to the key's size broke labels: a portrait
figure's key is 13.5, and three-line labels in a lane capped at a quarter of the width were cut. The
callout now grows toward the key's size only while every label still sets whole at the lane width it
produces: with the demo deck's short label it reaches the key's 8.1; with long labels it stops at
7.85 in landscape and 8 in portrait (the key there is 13.5). (3) A top-row badge could touch a column
name's descenders; it now avoids each column name's own box, descenders included, with half a unit
to spare, and the row names with half a unit too. Every shape still places on every test grid.

**The ring takes the callout's color (owner, 2026-10-20).** After the color fix the owner asked whether
the ring around a called-out cell should match its marker. A prototype rendered both, light and dark;
the owner chose the colored ring over a canvas-color halo (`.legend-target-halo`, 2.6 units wide,
under a one-unit ring in the slot's strong tone). The halo is what keeps a slot-1 ring, whose blue is
the heatmap ramp's own hue, from vanishing into a blue cell; in light mode it shows as a thin white
frame. The alternatives were a colored ring with no halo, and the old body-ink ring, which always
contrasted but carried no link to its marker.
