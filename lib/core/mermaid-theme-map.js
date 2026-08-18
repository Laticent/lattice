/**
 * lib/core/mermaid-theme-map.js
 *
 * THE token → Mermaid `themeVariables` map. One copy, imported by every render
 * path (#1332 step 2, HARD RULE #1).
 *
 * It used to be two copies, kept in sync BY COMMENT — lib/runtime/index.js
 * literally said "see the `clusterBkg` note in the emulator's MERMAID_VAR_MAP",
 * a cross-file prose pointer where an import belonged.
 *
 * WHAT ACTUALLY DRIFTED, measured rather than assumed. #1332 reports the gap as
 * 166 keys against 132, the runtime a strict subset. That is not what was there:
 * both paths exposed the SAME 166 slots — a key-set gate has watched that since
 * #511 — and 38 of the VALUES had come apart, which the #511 gate could not see
 * and which its own comment conceded ("a few keys intentionally map to different
 * tokens per path"). 35 were `--text-heading` where the export used
 * `--cat-on-fill`; the two resolve identically in 27 of 32 palettes, but on the
 * five `a11y-*` palettes in a dark context that is #FFFFFF node ink on the pale,
 * textured categorical fills those palettes always use. The other 3 were the
 * gitgraph tag chip. A missing key would at least have fallen back to a Mermaid
 * default; a wrong value is confidently wrong.
 *
 * Both failure modes are now unrepresentable: there is one map, so a key exists
 * on both paths or on neither, and one set of values.
 *
 * THE PORT. Strip away the accidents and the two renderers differ in exactly one
 * respect: HOW YOU READ A TOKEN.
 *
 *   preview   getComputedStyle(section) — CSS inheritance, so the section's own
 *             classes (including a per-slide `_class: dark`) are already applied
 *   PDF path  resolve token expressions offline against the palette text, with
 *             that slide's scheme collapsed (mmdc is a separate process, so
 *             nothing can be read from a live DOM)
 *
 * So that difference is the parameter, and everything else — the map, the shape
 * of a nested key, how `joinVars` is serialized — lives here:
 *
 *   buildDiagramTheme(readToken)   // readToken: (tokenName) => string
 *
 * `readToken` also owns the MISS POLICY, because the right answer differs by
 * path and is load-bearing on both. The PDF path warns and substitutes a black
 * sentinel, so a palette gap is loud in the build log — and that sentinel SHIPS:
 * `prune()` drops only empty strings, so the element renders literally black
 * rather than falling back to a Mermaid default. The preview returns the empty
 * string and lets its own "theme CSS vars not resolved" retry budget handle it;
 * substituting black there would paint an entire deck's diagrams black on a
 * webview that is merely slow to apply its stylesheet.
 *
 * That the two policies differ is a real seam, and the parity test cannot see it
 * — its fake reader is total, so no key ever misses. It is enumerated here
 * instead: two paths, two documented answers, neither accidental.
 *
 * NO SANCTIONED DIVERGENCE — every key must match on both paths, and
 * test/unit/core/diagram-theme-parity.test.js fails if any does not.
 *
 * `fontFamily` used to be the one exception (`DIVERGENT_KEYS`), because the export
 * shipped its config inside a `%%{init}%%` directive and mermaid's
 * `sanitizeDirective` allow-list has no hyphen — so a stack containing `system-ui`
 * / `sans-serif` was blanked, and a blank font is worse than a wrong one (mermaid
 * then MEASURES in one face and PAINTS in another, clipping labels mid-word). The
 * export bought a monospace stack to stay inside that allow-list. #1674 removed the
 * constraint rather than the symptom: the export now renders in a page the engine
 * owns and configures it through `mermaid.initialize`, exactly as the preview does,
 * so the full hyphenated stack reaches both. The divergence was retired rather than
 * deleted quietly — see engineering/decisions/2026-08-17-mermaid-render-worker.md.
 *
 * Pure + dependency-free, so it bundles into the browser runtime.
 */

// Reference for the variable inventory: https://mermaid.js.org/config/theming.html
const MERMAID_VAR_MAP = {
  // Typography. A diagram speaks in the deck's own body face, on both paths — which
  // is also how `mode: sketch` reaches diagram labels without a single line of
  // sketch-specific code here: `base.sketch.css` re-points `--font-body` to
  // `--sketch-font-body`, and this entry follows the token. The PDF path's reader
  // has to be told about that re-point, because it resolves tokens offline and a
  // class-scoped rule is invisible to it (see `readBandToken` in lattice-emulator.js).
  // `text: true` — THIS TOKEN IS NOT A COLOR, and a path whose reader resolves colors
  // has to know. The preview's `read()` is a color resolver: it probes by assigning
  // `color: var(--token)` and reading the computed value back, which is what turns
  // `light-dark(...)` into a flat rgb Mermaid accepts. Handed a FONT STACK that
  // assignment is invalid, so the probe keeps its inherited color and the reader returns
  // `rgb(31, 74, 110)` — measured. Mermaid then gets a color as its font family, and the
  // damage hides because `mermaid.css` sets `font-family` on most label elements anyway;
  // it surfaced on gantt axis ticks, the one text our CSS does not cover.
  fontFamily: { var: 'font-body', text: true },
  fontSize:   { literal: '14px' },

  // Canvas
  background:               { var: 'bg' },

  // Primary/secondary/tertiary fills (pale band)
  primaryColor:             { var: 'cat-1-fill' },
  secondaryColor:           { var: 'cat-2-fill' },
  tertiaryColor:            { var: 'bg-alt' },
  primaryBorderColor:       { var: 'diagram-stroke' },
  secondaryBorderColor:     { var: 'diagram-stroke' },
  tertiaryBorderColor:      { var: 'diagram-stroke' },

  // Text — TWO tiers, by WHAT THE INK SITS ON. This used to be one token
  // (`--cat-on-fill` for every text element), on the reasoning that "the fills
  // flip with the canvas too, so ink and fill always stay matched". That holds
  // for 27 of the 32 shipped palettes and fails hard on the other five.
  //
  // The `a11y-*` family PINS its categorical tier mode-invariant — the chips are
  // fixed pale hexes carrying tested CVD-safe textures — while the canvas still
  // flips with `color-scheme`. So on an a11y palette in a dark context
  // `--cat-on-fill` is #000000 (right: the chips are pale) and `--bg` is also
  // #000000, and any ink sited on the CANVAS rather than on a chip renders at
  // 1.00:1. Rendered on a11y-deuteranopia: flowchart edge labels vanished
  // outright, black on black.
  //
  //   CHIP-SITED  → --cat-on-fill   text on a categorical fill (node, bar, slice,
  //                                 actor, band). Pairs with a --cat-* fill, so it
  //                                 must track the CHIP, pinned or not.
  //   MARK-SITED  → --cat-on-mark   text on a categorical MARK (the saturated
  //                                 mid-tone): the gitgraph branch chips, which are
  //                                 fed git0-7 from --cat-1..8-mark. A THIRD tier,
  //                                 added because the fill tier's ink was being used
  //                                 here — pale-band ink on the saturated band, 1.2:1
  //                                 to 3.0:1 in every palette, both schemes (#1348).
  //                                 The token already existed and nothing was pointing
  //                                 at it. Careful with "already gated", though:
  //                                 checkCatContrast holds --cat-on-mark >=4.5:1 against
  //                                 every --cat-N-mark on the 27 HUE palettes and skips
  //                                 a11y-*, which is exactly how 1.55:1 could ship there.
  //                                 The a11y side is held instead by this map's own gate,
  //                                 diagram-ink-contrast.test.js, which runs all 32.
  //   CANVAS-SITED → --text-heading  text on --bg / --bg-alt (edge labels, titles,
  //                                 legends, axis labels, margin text). Pairs with
  //                                 a surface that flips, so it must flip too.
  //
  // The FIRST TWO are chip inks and the third is a canvas ink: that is the whole
  // distinction. What a key is drawn ON decides its tier — never what it is called,
  // and never which tier happens to be convenient.
  //
  // --cat-on-fill and --text-heading resolve identically wherever a palette declares
  // `--cat-on-fill: var(--text-heading)`, which is every non-a11y theme — so that
  // split is a no-op there and load-bearing exactly where it is needed.
  // Gated per palette, per scheme, by test/unit/palette/diagram-ink-contrast.test.js.
  primaryTextColor:         { var: 'cat-on-fill' },
  secondaryTextColor:       { var: 'cat-on-fill' },
  tertiaryTextColor:        { var: 'text-heading' },   // CANVAS-SITED — pairs with tertiaryColor = --bg-alt, a surface not a chip
  textColor:                { var: 'text-heading' },   // CANVAS-SITED — mermaid's generic text, unassigned elements on canvas
  titleColor:               { var: 'text-heading' },   // CANVAS-SITED — diagram title, on canvas
  labelTextColor:           { var: 'text-heading' },   // CANVAS-SITED — edge label, on edgeLabelBackground = --bg
  loopTextColor:            { var: 'text-heading' },   // CANVAS-SITED — sequence loop label, on canvas
  classText:                { var: 'cat-on-fill' },
  labelColor:               { var: 'text-heading' },   // CANVAS-SITED — edge label, on edgeLabelBackground = --bg

  // Lines (near-black on white canvas)
  lineColor:                { var: 'diagram-line' },
  defaultLinkColor:         { var: 'diagram-line' },
  edgeLabelBackground:      { var: 'bg' },
  labelBackground:          { var: 'bg' },

  // Main background paths
  mainBkg:                  { var: 'cat-1-fill' },
  nodeBorder:               { var: 'diagram-stroke' },
  nodeTextColor:            { var: 'cat-on-fill' },   // flowchart node text, on fill
  // A subgraph box is a CONTAINMENT surface, not deck chrome: it sits behind the
  // categorical node fills and must not compete with them. That is what the
  // per-theme `--c-container` rung is curated for (its own declaration comment
  // names "flowchart cluster, sankey area, kanban column") — but nothing read it
  // until #1311, so the cluster borrowed `--bg-alt`, whose job is the CARD fill.
  // Theme authors were tuning a surface that never rendered. Note this only
  // reaches PLAIN clusters: a `.section-N` cluster (mindmap, timeline, kanban)
  // is overridden to `--cat-N-fill` by mermaid.css's band cycle.
  clusterBkg:               { var: 'c-container' },
  // The box's EDGE, not the universal band stroke. --diagram-stroke is a flat
  // saturated dark hex that does not flip with color-scheme, so on a dark
  // container it went dark-on-dark and no edge of the box reached 3:1 in 12 of
  // 14 themes. The containment tier carries its grouping semantic in this
  // boundary — the fill is deliberately barely-there — so it gets a scheme-aware
  // edge of its own, gated at 3:1 by containment-contrast.test.js.
  clusterBorder:            { var: 'c-container-edge' },

  // cScale (mid-tone band) — kanban lighten brings to L≈70
  cScale0:                  { var: 'cat-1-mark' },
  cScale1:                  { var: 'cat-2-mark' },
  cScale2:                  { var: 'cat-3-mark' },
  cScale3:                  { var: 'cat-4-mark' },
  cScale4:                  { var: 'cat-5-mark' },
  cScale5:                  { var: 'cat-6-mark' },
  cScale6:                  { var: 'cat-1-mark' },
  cScale7:                  { var: 'cat-2-mark' },
  cScale8:                  { var: 'cat-3-mark' },
  cScale9:                  { var: 'cat-4-mark' },
  cScale10:                 { var: 'cat-5-mark' },
  cScale11:                 { var: 'cat-6-mark' },

  // cScaleLabel — text fill in Mermaid's auto-generated
  // `.section-${r-1} text { fill: cScaleLabel${r} }` rule. Mermaid's own
  // contrast-aware derivation lands on white when fed mid-tone cScale,
  // which fails against our pale band fills. Setting each slot to the
  // paired band-text token (all map to --text-heading in shipped palettes)
  // ensures the auto rule renders dark ink, regardless of whether our
  // explicit CSS overrides match the diagram in question.
  cScaleLabel0:  { var: 'cat-on-fill' },
  cScaleLabel1:  { var: 'cat-on-fill' },
  cScaleLabel2:  { var: 'cat-on-fill' },
  cScaleLabel3:  { var: 'cat-on-fill' },
  cScaleLabel4:  { var: 'cat-on-fill' },
  cScaleLabel5:  { var: 'cat-on-fill' },
  cScaleLabel6:  { var: 'cat-on-fill' },
  cScaleLabel7:  { var: 'cat-on-fill' },
  cScaleLabel8:  { var: 'cat-on-fill' },
  cScaleLabel9:  { var: 'cat-on-fill' },
  cScaleLabel10: { var: 'cat-on-fill' },
  cScaleLabel11: { var: 'cat-on-fill' },

  // fillType (subgraph / mindmap-level fills, pale band)
  fillType0: { var: 'cat-1-fill' },
  fillType1: { var: 'cat-2-fill' },
  fillType2: { var: 'cat-3-fill' },
  fillType3: { var: 'cat-4-fill' },
  fillType4: { var: 'cat-5-fill' },
  fillType5: { var: 'cat-6-fill' },
  fillType6: { var: 'cat-1-fill' },
  fillType7: { var: 'cat-2-fill' },

  // Sequence diagram
  actorBkg:                 { var: 'cat-1-fill' },
  actorBorder:              { var: 'diagram-stroke' },
  actorTextColor:           { var: 'cat-on-fill' },   // sequence actor text, on fill
  actorLineColor:           { var: 'diagram-line' },
  signalColor:              { var: 'diagram-line' },
  signalTextColor:          { var: 'text-heading' },   // CANVAS-SITED — sequence message text, above the line on canvas
  labelBoxBkgColor:         { var: 'bg-alt' },
  labelBoxBorderColor:      { var: 'diagram-stroke' },
  activationBorderColor:    { var: 'diagram-stroke' },
  activationBkgColor:       { var: 'cat-1-fill' },
  sequenceNumberColor:      { var: 'cat-on-fill' },

  // Notes (yellow accent — category-distinct)
  noteBkgColor:             { var: 'diagram-note' },
  noteTextColor:            { var: 'cat-on-fill' },
  // The note's BORDER is structural chrome — the same job as a node's outline —
  // so it comes from the structural stroke, not from `--diagram-today`, which is
  // the gantt TODAY MARKER's own semantic color. Borrowing the marker put a
  // yellow rule around every sequence note and left the pair below 3:1 on 29 of
  // 64 contexts, because a marker hue is curated against the CANVAS and this rule
  // is drawn on `--diagram-note`. Same tier error as `gitBranchLabel` (#1348).
  noteBorderColor:          { var: 'diagram-stroke' },

  // Error (mermaid parse-error box). Uses the theme's gated "error chip" pair
  // — --bg text on the --fail alarm red (the ['bg','fail'] pair the slide-surface
  // audit holds to AA in both modes across every theme) — NOT --cat-on-fill on
  // --diagram-critical, which put near-black ink on the achromatic themes' mid-gray
  // critical (ardesia/concrete/onyx) below AA. Kept in lockstep with the runtime
  // path (lib/runtime/index.js) so both renderers share one mapping (HARD RULE #1).
  // Decoupled in #1181.
  errorBkgColor:            { var: 'fail' },
  errorTextColor:           { var: 'bg' },

  // Pie chart (pale band cycle — unified contract)
  pie1:  { var: 'cat-1-fill' },
  pie2:  { var: 'cat-2-fill' },
  pie3:  { var: 'cat-3-fill' },
  pie4:  { var: 'cat-4-fill' },
  pie5:  { var: 'cat-5-fill' },
  pie6:  { var: 'cat-6-fill' },
  pie7:  { var: 'cat-7-fill' },
  pie8:  { var: 'cat-8-fill' },
  pie9:  { var: 'cat-9-fill' },
  pie10: { var: 'cat-10-fill' },
  pie11: { var: 'cat-11-fill' },
  pie12: { var: 'cat-12-fill' },
  pieTitleTextSize:    { literal: '18px' },
  pieTitleTextColor:   { var: 'text-heading' },   // CANVAS-SITED — on canvas
  pieSectionTextSize:  { literal: '14px' },
  pieSectionTextColor: { var: 'cat-on-fill' },   // text on pie slices, on fill
  pieLegendTextSize:   { literal: '13px' },
  pieLegendTextColor:  { var: 'text-heading' },   // CANVAS-SITED — on canvas
  pieStrokeColor:      { var: 'bg' },
  pieStrokeWidth:      { literal: '2px' },
  pieOuterStrokeWidth: { literal: '2px' },
  pieOuterStrokeColor: { var: 'diagram-stroke' },
  pieOpacity:          { literal: '1' },

  // Gantt (pale bars, dark text, alarm-only saturation)
  sectionBkgColor:        { var: 'bg-alt' },
  altSectionBkgColor:     { var: 'bg' },
  sectionBkgColor2:       { var: 'cat-1-fill' },
  taskBkgColor:           { var: 'cat-1-fill' },
  taskTextColor:          { var: 'cat-on-fill' },   // text on task bar, on fill
  taskTextLightColor:     { var: 'cat-on-fill' },   // ditto, Mermaid's "dark bar" variant
  taskTextOutsideColor:   { var: 'text-heading' },   // CANVAS-SITED — text in the margin, on canvas
  taskTextClickableColor: { var: 'cat-on-fill' },   // text on task bar, on fill
  taskTextDarkColor:      { var: 'cat-on-fill' },   // Mermaid's dark-bar text variant — same ink contract
  taskBorderColor:        { var: 'diagram-stroke' },
  activeTaskBkgColor:     { var: 'diagram-active' },
  activeTaskBorderColor:  { var: 'diagram-active-mark' },
  // The grid is a RULE on the canvas, so it takes the graphical de-emphasis tier,
  // which is gated to 3:1 against the canvas in every palette. It used to borrow
  // `--diagram-done` — a documented value reuse (base.tokens.css group 3) that
  // shared one value between a pale gantt BAR FILL and a LINE. A fill may sit a
  // hair off the canvas; a line may not, and the pair cannot be correct for both:
  // measured at 1.30-1.62:1 on 49 of 64 contexts. `doneTaskBkgColor` below keeps
  // `--diagram-done`, which is the job that token is actually named for.
  gridColor:              { var: 'muted-mark' },
  doneTaskBkgColor:       { var: 'diagram-done' },
  doneTaskBorderColor:    { var: 'diagram-done-mark' },
  critBkgColor:           { var: 'diagram-critical' },
  critBorderColor:        { var: 'diagram-critical-mark' },
  todayLineColor:         { var: 'diagram-today' },

  // Git graph
  git0: { var: 'cat-1-mark' },
  git1: { var: 'cat-2-mark' },
  git2: { var: 'cat-3-mark' },
  git3: { var: 'cat-4-mark' },
  git4: { var: 'cat-5-mark' },
  git5: { var: 'cat-6-mark' },
  git6: { var: 'cat-8-mark' },
  git7: { var: 'cat-7-mark' },
  // MARK-SITED — the branch chips above are --cat-N-MARK, so their labels take the
  // mark tier's ink, not the fill tier's. Both render paths were wrong here from
  // opposite sides: the export fed --cat-on-fill (pale-band ink on the saturated
  // band) and the preview fed --text-heading (which fails the same chips from the
  // light end). See the three-tier note at the top of this map. (#1348)
  //
  // WHAT THIS FIXES IS THE BAKED SVG, AND ONLY THAT — verified by reading the
  // rendered output, not inferred. Mermaid bakes `.labelN{fill:<gitN>}` for the
  // chip and `.branch-labelN{fill:<gitBranchLabelN>}` for the text into the SVG's
  // own <style> (indaco light: #2E608A / now #FFFFFF, 6.65:1). On a Lattice SLIDE
  // that pair is then overpainted by mermaid.css, which repaints
  // `rect.branchLabelBkg.labelN` with --cat-N-FILL and `g.branchLabel text` with
  // --cat-on-fill, both !important — so the slide has always shown the pale chip
  // with its matching pale-band ink, and this change is INERT there (confirmed on
  // a rendered gitgraph in indaco light and a11y-deuteranopia dark: identical).
  // The two surfaces therefore disagree on the CHIP by design, and each is
  // internally AA-correct. Do not "fix" that by pointing git0-7 at the pale fill:
  // those same eight keys also color the branch LINES and commit bullets, which
  // need the saturated tier to read against the canvas.
  // WHERE THE BAKED PAIR STILL MATTERS, stated only as far as it was checked: the
  // two in-repo paths that might have carried it do NOT — PPTX ships rasterized PNGs
  // of the already-overpainted slide (lib/export/pptx-export.js), and the standalone
  // SVG lift copies COMPUTED fills (chart/_chart-family/standalone-svg.js), i.e. the
  // overpainted value too. So the concrete beneficiary is any consumer of this map
  // that renders WITHOUT lattice.css, which is the premise
  // test/unit/palette/diagram-ink-contrast.test.js is built on ("a Mermaid SVG bakes
  // its colors, so no CSS can fix this after the fact"). Keeping the baked pair
  // self-consistent is correctness-in-depth, not a fix for a rendered slide.
  gitBranchLabel0: { var: 'cat-on-mark' },
  gitBranchLabel1: { var: 'cat-on-mark' },
  gitBranchLabel2: { var: 'cat-on-mark' },
  gitBranchLabel3: { var: 'cat-on-mark' },
  gitBranchLabel4: { var: 'cat-on-mark' },
  gitBranchLabel5: { var: 'cat-on-mark' },
  gitBranchLabel6: { var: 'cat-on-mark' },
  gitBranchLabel7: { var: 'cat-on-mark' },
  commitLabelColor:      { var: 'text-heading' },   // CANVAS-SITED — on commitLabelBackground = --bg-alt
  commitLabelBackground: { var: 'bg-alt' },
  tagLabelColor:         { var: 'text-heading' },   // CANVAS-SITED — on tagLabelBackground = --bg-alt
  tagLabelBackground:    { var: 'bg-alt' },        // neutral label chip — distinct
  tagLabelBorder:        { var: 'diagram-stroke' },       // from the colour-coded branch chips

  // Quadrant chart
  quadrant1Fill:                    { var: 'cat-1-fill' },
  quadrant2Fill:                    { var: 'cat-2-fill' },
  quadrant3Fill:                    { var: 'cat-3-fill' },
  quadrant4Fill:                    { var: 'cat-4-fill' },
  // The quadrant LABEL, drawn on `quadrantNFill` (= --cat-N-fill, the pale band).
  // These fed from --cat-N-mark, the 3:1 STROKE token, which is the same tier
  // error #1263 retired everywhere else: measured 54 of 256 palette x mode x slot
  // pairs below AA, worst 2.77:1. --cat-on-fill is the ink curated for text on the
  // pale band, and `quadrantPointTextFill` two lines down already used it. Note
  // this could not be caught by the coverage assertion in
  // diagram-ink-contrast.test.js, which can only enumerate keys that ALREADY name
  // an ink token — a key painting text from the wrong tier is invisible to it.
  quadrant1TextFill:                { var: 'cat-on-fill' },
  quadrant2TextFill:                { var: 'cat-on-fill' },
  quadrant3TextFill:                { var: 'cat-on-fill' },
  quadrant4TextFill:                { var: 'cat-on-fill' },
  quadrantPointFill:                { var: 'cat-on-fill' },
  quadrantPointTextFill:            { var: 'cat-on-fill' },
  quadrantXAxisTextFill:            { var: 'text-heading' },   // CANVAS-SITED — axis label, on canvas
  quadrantYAxisTextFill:            { var: 'text-heading' },   // CANVAS-SITED — axis label, on canvas
  // BOTH of these are drawn ON the quadrant fills, not on the canvas, so they take
  // the tier curated for that surface: `--cat-on-fill` is gated legible against every
  // `--cat-N-fill` (measured worst 5.11:1 over all four quadrants, 32 palettes, both
  // schemes). They used to read `--cat-8-mark` — a SIBLING of the four fills, curated
  // to sit beside them rather than on them, which is why a data point could vanish
  // into the quadrant under it. `--diagram-stroke` is equally wrong here and worse:
  // it is curated against the CANVAS, so on a quadrant fill it measured 1.51:1.
  quadrantInternalBorderStrokeFill: { var: 'cat-on-fill' },
  quadrantExternalBorderStrokeFill: { var: 'diagram-stroke' },
  quadrantTitleFill:                { var: 'text-heading' },   // CANVAS-SITED — chart title, on canvas

  // State / class
  altBackground: { var: 'bg-alt' },

  // ── Keys Mermaid offers and we used to leave BLANK ────────────────────────
  //
  // A key we do not state is NOT a key we cannot state. Mermaid's
  // `base.getThemeVariables` honors every color key it emits — measured, 234 of
  // 234, with none of ours overridden (`tools/audit-diagram-contrast.mjs --report
  // levers`). What its `updateColors()` maths does is fill in the ones we leave
  // unstated, from `primaryColor`/`background`, which is where every "mermaid
  // invents off-brand colors" complaint actually comes from. These were unstated,
  // so a state diagram, a requirement diagram, an architecture group box, a venn
  // set and a C4 person each rendered in colors no palette chose.
  //
  // Each one is assigned by WHAT IT IS DRAWN ON, the same rule as everything above:
  // a chip takes the categorical fill tier, ink on that chip takes `--cat-on-fill`,
  // a line on the canvas takes `--diagram-line`, an outline takes `--diagram-stroke`,
  // and a grouping box takes the containment tier.

  // stateDiagram — the node, its ink, its transitions, and the composite box.
  stateBkg:                 { var: 'cat-1-fill' },
  stateLabelColor:          { var: 'cat-on-fill' },
  transitionColor:          { var: 'diagram-line' },
  transitionLabelColor:     { var: 'text-heading' },
  specialStateColor:        { var: 'diagram-stroke' },
  innerEndBackground:       { var: 'diagram-stroke' },
  // A composite state is a CONTAINER — same job as a flowchart subgraph, so the
  // same tier, which is the one already gated by containment-contrast.test.js.
  compositeBackground:      { var: 'c-container' },
  compositeTitleBackground: { var: 'c-container' },
  compositeBorder:          { var: 'c-container-edge' },
  labelBackgroundColor:     { var: 'bg' },

  // requirementDiagram
  requirementBackground:    { var: 'cat-1-fill' },
  requirementBorderColor:   { var: 'diagram-stroke' },
  requirementTextColor:     { var: 'cat-on-fill' },
  relationColor:            { var: 'diagram-line' },
  relationLabelBackground:  { var: 'bg' },
  relationLabelColor:       { var: 'text-heading' },

  // architecture-beta — its group box is a container, its edges are edges.
  archEdgeColor:            { var: 'diagram-line' },
  archEdgeArrowColor:       { var: 'diagram-line' },
  archGroupBorderColor:     { var: 'c-container-edge' },

  // venn-beta — eight sets on the pale categorical band, like every other
  // eight-way categorical in the engine.
  venn1: { var: 'cat-1-fill' },
  venn2: { var: 'cat-2-fill' },
  venn3: { var: 'cat-3-fill' },
  venn4: { var: 'cat-4-fill' },
  venn5: { var: 'cat-5-fill' },
  venn6: { var: 'cat-6-fill' },
  venn7: { var: 'cat-7-fill' },
  venn8: { var: 'cat-8-fill' },
  vennSetTextColor:   { var: 'cat-on-fill' },
  vennTitleTextColor: { var: 'text-heading' },

  // C4 — the person glyph. `personBkg` unstated is where C4's stock blue avatar
  // came from; every other C4 shape was already on-palette.
  personBkg:    { var: 'cat-1-fill' },
  personBorder: { var: 'diagram-stroke' },

  // erDiagram attribute rows. The `attributeBackgroundColor*` pair below already
  // states the same alternating contract; `rowOdd`/`rowEven` are the keys the
  // renderer reads for the ROW BANDS behind them, and left unstated they were
  // derived from `lighten(background)`.
  rowOdd:  { var: 'cat-1-fill' },
  rowEven: { var: 'bg-alt' },

  // flowchart leftovers. `nodeBkg` is the flowchart-specific twin of `mainBkg`,
  // `border2` the secondary outline, `arrowheadColor` the head on every edge —
  // which was deriving to near-black and so vanished on a dark canvas.
  nodeBkg:        { var: 'cat-1-fill' },
  border2:        { var: 'diagram-stroke' },
  arrowheadColor: { var: 'diagram-line' },

  // Entity-relationship diagram — the attribute-row band fills. Without these,
  // Mermaid derives them from `lighten(background)`, which renders off-brand in
  // the exported PDF (the deliverable). Pale band: odd rows on the primary fill,
  // even rows on the alt surface — the same alternating-band contract as gantt.
  attributeBackgroundColorOdd:  { var: 'cat-1-fill' },
  attributeBackgroundColorEven: { var: 'bg-alt' },

  // XY chart — nested object, expanded below. plotColorPalette joins
  // multiple palette vars into a comma-separated string (Mermaid's required
  // format for this key) so each palette's --cat-* hues drive the bars and
  // lines, not a hardcoded indaco-flavoured literal. The axis LINE + TICK keys
  // theme the axes themselves (without them Mermaid falls back to its own
  // primaryTextColor, leaving the axes subtly mis-toned in the PDF).
  xyChart: { nested: {
    backgroundColor:  { var: 'bg' },
    titleColor:       { var: 'text-heading' },
    xAxisLabelColor:  { var: 'text-heading' },
    xAxisTitleColor:  { var: 'text-heading' },
    xAxisLineColor:   { var: 'diagram-stroke' },
    xAxisTickColor:   { var: 'diagram-stroke' },
    yAxisLabelColor:  { var: 'text-heading' },
    yAxisTitleColor:  { var: 'text-heading' },
    yAxisLineColor:   { var: 'diagram-stroke' },
    yAxisTickColor:   { var: 'diagram-stroke' },
    // The in-bar value label is drawn ON a plot series, and the series come from
    // the MARK tier below — so its ink is `--cat-on-mark`, the tier gated against
    // exactly those values, not `--text-heading`, which pairs with the canvas.
    dataLabelColor:   { var: 'cat-on-mark' },
    plotColorPalette: { joinVars: ['cat-1-mark', 'cat-2-mark', 'cat-3-mark', 'cat-4-mark', 'cat-5-mark', 'cat-6-mark'] },
  }},
};

/**
 * RETIRED (#1674, 2026-08-17) — `DIVERGENT_KEYS` used to name `fontFamily` as the one
 * `themeVariables` key the two render paths were licensed to disagree on.
 *
 * It was never a preference. The export's config could only travel inside a
 * `%%{init}%%` directive (mmdc being a separate process), and mermaid's
 * `sanitizeDirective` allow-list for directive-borne values bars the hyphen, so the
 * export could not state a real font stack at all — it bought a monospace one to stay
 * inside the allow-list, and the preview kept `--font-body`.
 *
 * #1674 removed the cause: the export renders in an engine-owned page and configures
 * it through `mermaid.initialize`, whose `sanitize` is the permissive one the preview
 * has always used. Both paths now read `--font-body` through the same map entry, so
 * there is nothing left to sanction. The export retains the constant name nowhere —
 * an empty allow-list is a standing invitation to add to it, so the list is gone and
 * `test/unit/core/diagram-theme-parity.test.js` now asserts FULL parity with no
 * exception set at all.
 */


/**
 * Build a Mermaid `themeVariables` object from the map.
 *
 * @param {(tokenName: string) => string} readToken  Reads one CSS custom property
 *   (WITHOUT the leading `--`) in the scope of the slide being rendered, and owns
 *   what a miss returns. See THE PORT above.
 * @returns {object} themeVariables, ready for `mermaid.initialize` or an
 *   `engineInitConfig` directive.
 */
function buildDiagramTheme(readToken) {
  const resolve = (entry) => {
    if (entry.literal !== undefined) return entry.literal;
    if (entry.var !== undefined) return readToken(entry.var);
    // Mermaid keys like xyChart.plotColorPalette want a COMMA-SEPARATED STRING of
    // colors, not an array. Read each token through the same port so a miss is
    // handled by the same policy as any other.
    if (entry.joinVars !== undefined) return entry.joinVars.map((name) => readToken(name)).join(',');
    return undefined;
  };
  const result = {};
  for (const [key, entry] of Object.entries(MERMAID_VAR_MAP)) {
    if (entry.nested) {
      result[key] = {};
      for (const [nestedKey, nestedEntry] of Object.entries(entry.nested)) {
        result[key][nestedKey] = resolve(nestedEntry);
      }
    } else {
      result[key] = resolve(entry);
    }
  }
  return result;
}

/**
 * The tokens whose VALUE IS NOT A COLOR, so a color-resolving reader must fetch them
 * literally. Derived from the map's own `text` flags rather than listed separately —
 * a second list is how the two come apart.
 *
 * @returns {Set<string>} token names, without the leading `--`.
 */
function textValueTokens() {
  const names = new Set();
  const walk = (entry) => {
    if (entry.text && entry.var) names.add(entry.var);
    if (entry.nested) for (const nested of Object.values(entry.nested)) walk(nested);
  };
  for (const entry of Object.values(MERMAID_VAR_MAP)) walk(entry);
  return names;
}

/** Every palette token the map reads, deduped — for gates that audit coverage. */
function diagramThemeTokens() {
  const names = new Set();
  const walk = (entry) => {
    if (entry.var !== undefined) names.add(entry.var);
    if (entry.joinVars !== undefined) for (const n of entry.joinVars) names.add(n);
    if (entry.nested) for (const nestedEntry of Object.values(entry.nested)) walk(nestedEntry);
  };
  for (const entry of Object.values(MERMAID_VAR_MAP)) walk(entry);
  return [...names];
}

module.exports = {
  MERMAID_VAR_MAP,
  textValueTokens,
  buildDiagramTheme,
  diagramThemeTokens,
};
