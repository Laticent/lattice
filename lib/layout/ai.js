/**
 * Component Studio — the AI tier's PURE pieces (the component analog of
 * lib/theme/ai.js). Building the model prompt and coercing the model's reply
 * into a gate-ready draft are deterministic and `fs`-free, so they live here
 * (bundled into the browser layout-core and unit-tested with a fake reply); the
 * actual model call + the gate run stay in the controller (architect.ts).
 *
 * The architecture mirrors the shipped Theme AI (#613): the model only ever
 * PROPOSES — here, a {manifest, css, skeleton} grounded in a CONCRETE knowledge
 * file (`COMPONENT_CANON`, the analog of `THEME_CANON`) — and deterministic code
 * DISPOSES (`gateComponent` + `findCssExfil` in the bridge). The structural
 * contract is gateable (var(--…)-token-only, no hex, `--fs-*` type, no margin,
 * `section.<name>` scoping, the `> .cell-stage` root, card-as-`<li>`); the
 * aesthetic residue rests on this knowledge file + the model + human review.
 * See engineering/decisions/2026-06-29-ai-component-generation.md.
 *
 * SCOPE: the transform-free subset only (pure CSS over native `ul>li`/prose DOM —
 * `substance: prose | structure`). A request that implies a chart, a Mermaid
 * diagram, codegen, or a non-`ul>li` shape must DECLINE and route to a first-party
 * build / the #618 DSL, never emit a broken transform-free fake.
 */

const { NAME_RE, FUNCTIONS, BUCKETS, FORMS, CSS_ONLY_SUBSTANCES, findUnscopedSelectors } = require('./gate.js');

// The legible-ceiling + reflow shapes from manifest.schema.json (§6 audit).
// Derived from the manifest schema (the contract's source of truth) — was a
// hand-mirror. Order-insensitive use only (snapEnum membership test).
const ADAPT_MODES = require('../components/manifest.schema.json').properties.adapt.properties.mode.enum;
// The two collection axes the per-element word counter actually measures
// (manifest.schema.json `density.axis`); validate() rejects col/cell/line, so the
// generator only ever emits these two — default `item` (list/grid entries).
const DENSITY_AXES = ['item', 'row'];
// A generated stylesheet shouldn't smuggle a multi-MB `data:` payload past the
// exfil denylist (which allows inline data: URIs) — cap the whole sheet (§7).
const MAX_CSS_BYTES = 24 * 1024;

/**
 * The knowledge file — concrete the way THEME_CANON is (exact identifiers,
 * literal recipes, fully-worked examples), because that concreteness is *why*
 * the Theme AI worked. Distilled from a profile of the 53 shipped components.
 */
const COMPONENT_CANON =
  'HOW A LATTICE COMPONENT IS BUILT (so your draft feels native, not generic CSS):\n' +
  '\n' +
  '• FORM VOCABULARY. A slide is a Frame divided into Cells; the content Cell hosts a Tile — your component. ' +
  'The Frame auto-supplies the chrome: the masthead band lifts the eyebrow + the `h2` title; the footer supplies ' +
  'running text, section progress, and the page number. NEVER re-implement chrome (no title bar, no page number, ' +
  'no progress rail). Your CSS targets ONLY the body, which lives under `section.<name> > .cell-stage` — a flex column.\n' +
  '\n' +
  '• ROOT. Always `section.<name> > .cell-stage { display:flex; flex-direction:column; }` plus `flex:1; min-height:0` ' +
  'on the list so rows distribute into the bounded stage (the stage clips + measures overflow — without `min-height:0` a ' +
  'dense deck overruns and clips).\n' +
  '\n' +
  '• CARDS ARE LIST ITEMS, never `<div>`s. Author markdown is `- Label` (one line) with an optional nested `  - body`. ' +
  'The list is `ul/ol > li` with `list-style:none; padding:0; margin:0`; the lead text AUTO-BOLDS via CSS — the author ' +
  'writes `- Signal custody`, NEVER `- **Signal custody.** body`. The body is a nested list that spans a full-width row ' +
  'below the header (`flex:0 0 100%`).\n' +
  '\n' +
  '• AUTHOR WITH THE MARKDOWN STRUCTURE THAT FITS THE DATA — and it MUST be valid markdown. Your choices, all transform-free ' +
  '(no custom code, just CSS over the native DOM the markdown produces):\n' +
  '   – LIST (`ul/ol > li`) — a SET of items (cards, rosters, checklists, glossaries).\n' +
  '   – TABLE (a GFM markdown table: a header row, a `| --- | --- |` divider, then rows) — a GRID of values that reads ACROSS ' +
  'columns (features × plans, duties × parties). It renders to a native `<table>`; style `section.<name> table`, ' +
  '`section.<name> thead th`, `section.<name> td` with tokens + `border-bottom:1px solid var(--border)` (NEVER margin, ' +
  '`border-collapse:collapse`). When the data is a matrix, USE A TABLE — do not fake it with a list or a grid of divs.\n' +
  '   – PROSE paragraph — a statement / callout. FENCED CODE (```lang) — a code sample (the engine highlights it; do not ' +
  'restyle the tokens). MATH (`$$…$$`) — the engine renders it. Pick lists vs tables vs prose by the shape of the content.\n' +
  '\n' +
  '• STATE MARKERS ARE A UNIVERSAL GRAMMAR — use them when a ROW carries done/partial/pending status; never re-invent status. A ' +
  'leading bracket marker on a list item OR a table cell is AUTO-CHROME the engine decodes into a colour-blind-safe status disc ' +
  '(a shape + a state token): `[x]` = done/pass, `[-]` = partial/qualified, `[ ]` = todo/pending (neutral; "not met" only in a ' +
  'verdict grid), `[/]` = out of scope/waived. Author `- [x] Item` (or `| Clause | [x] | [ ] |`); do NOT style the `.state` disc ' +
  'yourself (it is universal), and do NOT fake status with a raw emoji, a colored hex, or a bare bullet. Reach for markers on a ' +
  'readiness checklist, a coverage/obligation matrix, or a criteria verdict — NOT on a plain inventory list (a status PILL fits ' +
  'a one-word label; a MARKER fits a true status axis).\n' +
  '\n' +
  '• THE SLIDE GRAMMAR — ORDER IS LOAD-BEARING. The chrome slots are AUTO-DETECTED by POSITION, so a block in the wrong ' +
  'place is read as a different slot (or breaks). Emit the skeleton in THIS order:\n' +
  '   1. EYEBROW — an inline-code-ONLY paragraph (a line that is just `` `Label` ``) placed IMMEDIATELY ABOVE the `##` heading.\n' +
  '   2. TITLE — the `## heading` (the Frame lifts it into the masthead; never style it).\n' +
  '   3. SUBTITLE — a plain (or `_italic_`) paragraph IMMEDIATELY AFTER the heading.\n' +
  '   4. CONTENT — your list / table / prose (the body you actually style).\n' +
  '   5. KEY-INSIGHT — a TRAILING `> blockquote` at the very end → the accent takeaway bar (auto-chrome; do not draw it).\n' +
  '   6. BELOW-NOTE — a final short paragraph led by an em-dash (`— …`), or a trailing `_italic_` annotation paragraph.\n' +
  'INLINE CODE means different things BY POSITION: a `code`-only paragraph above the heading is the EYEBROW; a TRAILING ' +
  '`code` on a list row is a PILL (a one/two-word status chip); `code` elsewhere is a label/citation chip. Same token, ' +
  'different slot — the position decides.\n' +
  '\n' +
  '• THE SKELETON IS PURE MARKDOWN — NO RAW HTML TAGS. The engine builds every structure from the markdown DOM, so you NEVER ' +
  'need a tag. Do not emit `<div>`, `<span>`, `<br>`, `<table>` (write a GFM pipe table instead), and ABSOLUTELY never `<script>`/' +
  '`<style>`/`<iframe>` (an XSS/style-override vector — the gate rejects ANY raw tag). To SHOW code, use inline `` `code` `` or a ' +
  '```fence (there the `<tag>` is escaped text, not live HTML). The ONE allowed HTML is the `<!-- … -->` comment — the ' +
  '`<!-- _class: <name> -->` directive, and any other `<!-- presenter / reader note -->` you want to leave; comments are kept.\n' +
  '\n' +
  '• ZERO non-reset `margin`. A bare `margin:0` reset is the ONLY margin allowed; all real spacing is `gap` (between flex/grid ' +
  'children) or `padding` (inside a box), sized with `--sp-*`. Right-anchor a pill with `justify-content:space-between` or a ' +
  '`flex:1` spacer — NEVER `margin-left:auto` or `margin:auto`. (margin is invisible to the height math the stage depends on.) ' +
  'The #1 recurring trap is a CUSTOM `::before` MARKER (a `content:"•"`/dot/icon bullet): space it from the text with ' +
  '`padding-right`, or make the row `display:flex; gap:…` — NEVER `margin-right` on the pseudo. (Spacing columns/cards is the ' +
  'same rule: `gap` on the grid/flex CONTAINER, never a `margin` on the child.) BEFORE you return, scan your own CSS: if any ' +
  '`margin` appears that is not `margin:0` — including on a `::before`/`::after` — it is a bug; rewrite it as `gap`/`padding`.\n' +
  '\n' +
  '• COMPOSE ONLY FROM TOKENS — never invent a value. Color: `--bg`, `--bg-alt`, `--border`, `--text-heading`, `--text-body`, ' +
  '`--text-secondary`, `--text-muted`; accent `--accent`, `--accent-soft`, `--on-accent`, `--on-accent-soft`; state `--pass`, ' +
  '`--warn`, `--fail`; categorical `--cat-1-mark … --cat-12-mark`. ZERO hex. Type is the 12-token `--fs-*` ROLE system — pick ' +
  'by role, never a raw px/cqi/rem: `--fs-meta` (11pt chrome) · `--fs-body-compact` (13pt dense cells) · `--fs-body` (16pt default) ' +
  '· `--fs-message` (21pt statement) · `--fs-emphasis` (30pt lead); headings `--fs-h1 … --fs-h6` (`--fs-h2` 28pt = standard title); ' +
  '`--fs-hero` (86pt, the one monumental number). Spacing `--sp-3xs … --sp-2xl`; geometry in `cqi`/`cqh`; radius `--radius-sm/-md`; ' +
  'pills inherit the `--pill-*` family.\n' +
  '\n' +
  '• PREFER FLEX — reach for `grid` only with a proven reason. `display:flex` is the DEFAULT layout primitive for a component body: ' +
  'a single row/column (`flex-direction`), a wrapping multi-column deck (the "matrix" idiom), an evenly-split comparison (`flex:1` per ' +
  'side) — flex handles them all, and it reflows for portrait with a one-line `flex-direction:column` / `width:100%`. MULTI-COLUMN is the ' +
  'flex matrix: `display:flex; flex-wrap:wrap; gap:var(--sp-md)` on the list + `box-sizing:border-box; width:calc(50% - var(--sp-md)/2)` ' +
  'on the cards (NEVER a flex-`basis` calc — proven unreliable). An EVEN split is even simpler: `display:flex; gap` on the list, `flex:1 1 0; ' +
  'min-width:0` on each child. Reach for `display:grid` ONLY when the layout genuinely needs TWO-dimensional alignment that flex cannot give — ' +
  'cells that must line up across BOTH rows AND columns simultaneously (a real matrix). But a true matrix is almost always tabular DATA, which ' +
  'belongs in a `<table>` (see the table guidance) — so in practice flex covers nearly every card/panel/split layout, and an unexamined ' +
  '`grid-template-columns` is a smell. If you do use grid, justify it to yourself first; otherwise rewrite it as flex.\n' +
  '\n' +
  '• BOX-LOCAL REFLOW for portrait/tall frames: `@container lattice (aspect-ratio <= 1.05) { … width:100% … }` to drop to a single ' +
  'column. Use the DOUBLED-CLASS specificity trick — `section.<name>.<name> > .cell-stage > ul > li` — so the reflow rule outranks ' +
  'the base multi-column rule (the `width:calc(50% …)` on the flex cards, or a `flex-direction` on an even split). This is the single ' +
  'most error-prone idiom; copy it exactly.\n' +
  '\n' +
  '• THE SLOT VOCABULARY (auto-detected from markdown — author the CONTENT slots; NEVER re-draw a CHROME slot). CHROME (the Frame ' +
  'supplies these — do not style them): the masthead lifts the EYEBROW (`p > code:only-child` ABOVE the `h2`) + the TITLE (`h2`); the ' +
  'SUBTITLE is inline `code` just BELOW the heading; the FOOTER band carries running text, the PAGINATION (page number) and the PROGRESS ' +
  'mark; the LOGO is the author brand mark, top-right, from front-matter. CONTENT slots you DO author: the METADATA PILL (a trailing inline ' +
  '`code` on a card line → a chip), the KEY-INSIGHT (a trailing `blockquote`), the BELOW-NOTE (an em-dash `<p>`). RAIL IS NOT ONE SLOT — three ' +
  'things share the word, do not confuse them: (a) the PROGRESS rail = the footer\'s section-progress mark, auto-chrome you must NOT draw; ' +
  '(b) a SPLIT/SOVEREIGN rail = a dark side column only a `form: split` component owns; (c) an agenda-style `.rail` = a per-component variant ' +
  'class. A side rail is a split-form or a variant concern — never a universal slot you hand-author.\n' +
  '\n' +
  '• TAXONOMY — classify the component correctly (drives the manifest + dedup). The buckets and what each is FOR: anchor (title/section/closing ' +
  'covers) · statement (one big idea / KPI / quote) · INVENTORY (lists, cards, rosters, ledgers, glossaries — your home bucket) · comparison ' +
  '(two-or-more options side by side) · progression (steps/stages/phases over time) · evidence (proof: tables, stats, citations) · imagery ' +
  '(photo-led) · chart · diagram · math · code · legal · connect (contact / QR / wifi cards). Pick the `function`/`form`/`substance` that ' +
  'matches; for a transform-free CSS component stay in inventory/comparison/evidence/legal/connect (+ code/math prose).\n' +
  '\n' +
  '• RESTRAINT (the 10/10 rubric, checkable not vibes): one accent, reserved for the verdict — not decoration; SIX distinct hierarchy levels ' +
  '(if two adjacent levels look the same it is broken); cards never touch the stage edges (always `padding`); ≤ ~6 cards, ≤ ~40 words, ≤ 6 ' +
  'bullets; state carried by SHAPE + a state token, not color alone; categorical hues capped ~6–8 (Wong 2011); contrast checked against ' +
  '`--bg-alt`, not just `--bg`.\n' +
  '\n' +
  '• DESIGN FOR FIT — the structure must EARN its capacity, not just declare one. Reason about how the content fills the bounded stage ' +
  'BEFORE you pick a layout, because the #1 generated-component failure is a sparse, dead-space slide (a few small cards adrift in a sea of ' +
  'empty, or a KPI number left body-sized). Two rules: (a) the SWEET count must FILL the stage handsomely — choose the column/row count so a ' +
  'sweet-many tiles cleanly (2 items → one row of two big panels, 4 → a 2×2, 6 → 2×3), and let the cards GROW into the space (`flex:1; ' +
  'min-height:0` on the list so rows distribute; the cards stretch, they do not float at intrinsic size). (b) the HARD count must sit just ' +
  'BELOW overflow — past it the stage clips. Match `capacity` to what THIS layout legibly holds, never a boilerplate `{4,6,8}`: a two-panel ' +
  'comparison is `{sweet:2,soft:2,hard:3}`, a single monument is `{sweet:1,soft:1,hard:1}`. And SIZE TO THE ROLE — when the payload is ONE ' +
  'number or a short verdict, make it MONUMENTAL (`--fs-hero` / `--fs-emphasis`), not a lonely `--fs-body` line; a statement component that ' +
  'reads small in a big frame is the dead-space defect by another name.\n' +
  '\n' +
  '• SHAPE MUST EARN THE STAGE — a NON-RECTANGULAR or FIXED-ASPECT shape (hexagon, disc, stamp, film frame, photo) has its OWN aspect ' +
  'ratio that fights the 16:9 stage; the fix is the SAME flex-fill mechanism as a card grid, applied to the shape. NEVER size the shape ' +
  'by its intrinsic proportion (that leaves small shapes adrift in empty, or a tall shape clipping the bottom — the dead-space and ' +
  'overflow defects share this one root). Instead make the shapes a ROW that FILLS the stage as a band: `display:flex; gap` on the list, ' +
  '`flex:1 1 0; min-width:0; min-height:0` per item so the band grows to the full stage height, then give the SHAPE its ratio INSIDE that ' +
  'grown cell (`aspect-ratio:1` for a disc, `clip-path:polygon(…)` + `aspect-ratio:0.87` for a hexagon, `aspect-ratio:0.7` for a stamp) ' +
  'sized in `cqh`/`%` of the cell — so N discs/hexagons/stamps sit edge-to-edge in ONE stage-filling band, not a thin ribbon mid-slide. ' +
  'A STRIP/BAND form (filmstrip, ticker, timeline) GROWS its frames to the stage height with `flex:1` frames (or STACKS two bands) — ' +
  'never a short strip floating in a sea of empty. If one row of the sweet count would leave the shapes short, use fewer-and-bigger or ' +
  'WRAP to a filling grid (`flex-wrap` + `align-content:stretch`). (A tilt for character is still a static `transform:rotate()`, never a ' +
  'margin — see the DARE bullet\'s positional-play rule.)\n' +
  '\n' +
  '• WRITE TO THE WORD BUDGET — density is a contract, not a suggestion. Each element along the collection axis gets a TIGHT words-per-element ' +
  'budget: a label + a short clause, NEVER a sentence that wraps to three lines. Declare it as `density:{"axis":"item","soft":S,"hard":H}` ' +
  '(`item` = list/grid entries, `row` = table rows — the only two the counter measures) where `soft` is the editorial target (the count you ' +
  'design the card WIDTH around) and `hard` is the wall-of-text ceiling. Then HONOR it in your own skeleton: the sample rows you emit must ' +
  'themselves sit within `soft`, so the component demonstrates the brevity it asks for — a card built for 6-word labels but seeded with a ' +
  '20-word paragraph teaches the wrong shape and overflows the moment it is reused. (This is per-ELEMENT; the slide-level ≤~40-word budget in ' +
  'RESTRAINT still holds on top.)\n' +
  '\n' +
  '• RESPONSIVE BY CONSTRUCTION — design the reflow up front, do not bolt it on. Every component must stay legible in a WIDE box AND a ' +
  'TALL/strip one, because the same Tile is dropped into landscape decks, portrait/social frames, and narrow nested cells. Bake in the ' +
  '`@container lattice (aspect-ratio <= 1.05)` single-column drop (the BOX-LOCAL REFLOW idiom above) as part of the FIRST draft, not a ' +
  'follow-up — a multi-column grid with no portrait rule is an unfinished component. Size with `cqi`/`cqh` and the `--fs-*` roles (which already ' +
  'scale with the box) so the body reflows fluidly between the two extremes, and keep `capacity` honest about it: a strip honestly holds fewer ' +
  'than a wide, so the count that fills a landscape row must still clip cleanly when it stacks.\n' +
  '\n' +
  '• START BOARDROOM, ESCALATE ON DEMAND. The DEFAULT is the killer boardroom framework — clean, restrained, one accent, no gimmicks; ' +
  'that is the FLOOR and the right answer for a plain ask ("a list of risks", "three KPIs", "a quarterly summary"). Do NOT decorate a ' +
  'neutral request. But MATCH the visual ambition to the concept: a request that names a distinctive form or feel ("like a boarding ' +
  'pass", "a honeycomb of skills", "terminal-style", "a vintage receipt", "a polaroid wall") UNLOCKS proportionally more creative ' +
  'freedom — go as far as the concept earns, no further. At every level the result stays BOARDROOM-READY: legible first, on-palette, ' +
  'restrained accent, nothing that fights the brand. Creativity SERVES the concept; it never overrides clarity.\n' +
  '\n' +
  '• DARE A DISTINCTIVE VISUAL IDENTITY (when the concept calls for it, per the rule above) — rich CSS is IN SCOPE, not just bordered ' +
  'boxes. "Transform-free" bars generated GEOMETRY / ' +
  'codegen, NOT decorative CSS. For a request with a strong visual concept (a boarding pass, a receipt, a terminal/console panel, a ' +
  'polaroid, a luggage tag, a wax-seal stamp, a filmstrip) you SHOULD reach for the full pure-CSS toolkit to make it unmistakable: ' +
  '`linear/radial/conic-gradient` + `repeating-linear/radial-gradient` (a BARCODE is a `repeating-linear-gradient`; a ticket ' +
  'PERFORATION is a `radial-gradient` of evenly-spaced dots), `::before`/`::after` pseudo-elements (badges, ribbons, corner folds, ' +
  'edge notches), `clip-path` (a ticket stub, a chevron, a torn edge), `mask`, layered `box-shadow` (elevation, inset rules), ' +
  '`border`/`outline`/`border-radius` tricks, and a static `transform` for ALL POSITIONAL PLAY — `rotate()` a stamp/ribbon, ' +
  '`translate()` to scatter polaroids, overlap cards, hang a luggage tag, or nudge a pushpin. EVERY decorative offset, tilt, ' +
  'scatter, or overlap is a `transform` — NEVER a `margin`: a non-zero margin both corrupts the height math the bounded stage ' +
  'measures AND is rejected by the gate, so a margin-nudged layout LOOKS fine in your head but never actually ships. SHAPE IS YOURS TOO — ' +
  'a card need not be a rectangle: `border-radius:50%` + `aspect-ratio:1` makes a DISC (circular avatars, a radial badge), ' +
  '`clip-path:polygon(…)` cuts a HEXAGON, TRIANGLE, DIAMOND, or chevron TAB, a pill is a fully-rounded rect. Reach for an odd shape ' +
  'when it serves the concept (a honeycomb of capabilities, circular team avatars, diamond milestones, a hexagon skill grid) — ' +
  'TASTEFULLY, never gratuitously, and mind legibility (text stays inside the safe rectangle of a clipped shape, via `padding`). ' +
  'This is all PURE ' +
  'CSS over the markdown DOM — NEVER a reason to decline. The rails still bind every pixel: type is `--fs-*`, spacing is ' +
  '`gap`/`padding` and decorative offset is `transform` (no margin, ever), all selectors under `section.<name>`, and colors are `var(--…)` tokens (ZERO hex) — ' +
  'EVEN WHEN THE CONCEPT NAMES A COLOR. The colors creative concepts reach for all have a token PATH, so a hex is never needed: ' +
  'a DARK panel (a terminal/console/night surface) INVERTS the existing tokens — `background:var(--text-heading); color:var(--bg)`, ' +
  'with a `--bg-alt`/`--border` inset title bar — NOT a hardcoded charcoal; STATUS / traffic-light dots are `--fail` (red), ' +
  '`--warn` (amber), `--pass` (green); and a distinctive MATERIAL TINT (post-it yellow, kraft/manila, a colored stamp or sticky) is ' +
  '`color-mix(in srgb, var(--cat-3-mark) 12-22%, var(--bg))` — any hue off the categorical ramp (`--cat-1-mark` … `--cat-12-mark`) supplies the color, ' +
  '`color-mix` dilutes it to a paper tint, and the text on top stays `--text-heading`/`--text-body`. Restraint governs the ACCENT ' +
  '(one, for the verdict) — but TEXTURE and FORM (a perforation, a stub edge, a barcode, a scanline) are free; spend them when the ' +
  'concept earns it. The neutral surface/border/`--text-muted` tokens carry most decorative work without touching the accent.\n' +
  '\n' +
  '• THE OTHER INVARIANTS (with the why): SCOPING (#7) — every selector starts `section.<name>` so styles can never leak onto another slide; ' +
  'the gate rejects a bare `ul`/`h2`. US ENGLISH (#21) — every word a human reads (class names, comments, copy) uses the US spelling (`color`, ' +
  '`gray`, `behavior`, `center`), never the British form. card-nesting (#5) — `- Title` / `  - body`, never inline `- **Title.** body` (the title ' +
  'is a structural slot the CSS bolds, not editorial `**`).\n' +
  '\n' +
  '• MANIFEST IS THE CONTRACT. Always declare `adapt` (how the component reflows — `{"mode":"native"}` when it relies on the universal cqi ' +
  'scaling + the `@container lattice` reflow above; `{"mode":"reflow"}` once it ships per-family layouts) and `capacity` (its legible ceiling — ' +
  '`{"sweet":4,"soft":6,"hard":8}`: the comfortable, the stretched, and the hard cap on cards/rows before it should escalate to a denser sibling) ' +
  'and `density` (the words-per-element budget — `{"axis":"item","soft":6,"hard":12}` — that keeps each card terse; see WRITE TO THE WORD ' +
  'BUDGET above). `capacity` budgets the element COUNT; `density` budgets the words inside each one. ' +
  'A component that never declares how it adapts will overflow a portrait frame — declare it.\n' +
  '\n' +
  '• DECLINE only when COMPUTED GEOMETRY or CODEGEN is required — never for a LOOK. You author from the native DOM valid markdown ' +
  'produces (lists, TABLES, prose, fenced code, math), and you may style it with the full pure-CSS toolkit incl. gradients, ' +
  'pseudo-elements, `clip-path`, masks, and odd shapes (the DARE bullet). A distinctive VISUAL IDENTITY — a boarding pass, a barcode, ' +
  'a perforation, a hexagon card, a terminal panel — is ALWAYS buildable in pure CSS, so it is NEVER grounds to decline. Decline ONLY ' +
  'when the structure itself must be COMPUTED or GENERATED: a chart (data plotted to axes/bars/arcs), a diagram (nodes + drawn ' +
  'connectors), a 2-D positioned MAP (items placed by an x/y value — a quadrant/scatter), a timeline/roadmap/journey (a positioned ' +
  'track), generated/highlighted source beyond a plain fenced block. A matrix is a TABLE, not a decline. When a transform is ' +
  'genuinely required, return a decline (see the output contract) routing to a first-party build, NOT a broken fake.\n';

/** A distilled, gate-clean worked example: a 2-up card grid (the matrix idiom). */
const EXAMPLE_CARDS =
  'WORKED EXAMPLE A — a 2-up card grid ("a grid of capability cards, each a title and a one-line note").\n' +
  'manifest: {"name":"capability-cards","function":"inventory","form":"grid","substance":"structure","bucket":"inventory",' +
  '"tags":["cards","grid","capabilities"],"description":"A 2-up grid of capability cards — a title over a one-line note.",' +
  '"adapt":{"mode":"native"},"capacity":{"sweet":4,"soft":6,"hard":8},"density":{"axis":"item","soft":12,"hard":20}}\n' +
  'css:\n' +
  'section.capability-cards > .cell-stage { display:flex; flex-direction:column; }\n' +
  'section.capability-cards > .cell-stage > ul {\n' +
  '  display:flex; flex-wrap:wrap; gap:var(--sp-md); flex:1; min-height:0;\n' +
  '  list-style:none; padding:0; margin:0;\n' +
  '}\n' +
  'section.capability-cards > .cell-stage > ul > li {\n' +
  '  box-sizing:border-box; width:calc(50% - var(--sp-md) / 2);\n' +
  '  background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius-md);\n' +
  '  padding:var(--sp-sm) var(--sp-md);\n' +
  '  font-size:var(--fs-body); font-weight:700; color:var(--text-heading); line-height:var(--lh-snug);\n' +
  '}\n' +
  'section.capability-cards > .cell-stage > ul > li > ul {\n' +
  '  list-style:none; padding:var(--sp-xs) 0 0 0; margin:0;\n' +
  '  font-weight:400; color:var(--text-body); font-size:var(--fs-body-compact);\n' +
  '}\n' +
  '@container lattice (aspect-ratio <= 1.05) {\n' +
  '  section.capability-cards.capability-cards > .cell-stage > ul > li { width:100%; }\n' +
  '}\n' +
  'skeleton:\n' +
  '<!-- _class: capability-cards -->\n\n## What the platform does\n\n- Ingests any source\n  - CSV, API, or stream — no schema up front.\n' +
  '- Scores in real time\n  - Sub-second decisions on every record.\n';

/** A distilled, gate-clean worked example: a single-column responsibility ledger. */
const EXAMPLE_LEDGER =
  'WORKED EXAMPLE B — a responsibility ledger ("who owns what — a responsibility on the left, an owner chip on the right, a one-line note below").\n' +
  'manifest: {"name":"owner-ledger","function":"inventory","form":"ledger","substance":"structure","bucket":"inventory",' +
  '"tags":["ownership","roster","ledger"],"description":"A roster of responsibilities, each with an owner chip and a one-line note.",' +
  '"adapt":{"mode":"native"},"capacity":{"sweet":4,"soft":6,"hard":8}}\n' +
  'css:\n' +
  'section.owner-ledger > .cell-stage { display:flex; flex-direction:column; }\n' +
  'section.owner-ledger > .cell-stage > ul {\n' +
  '  display:flex; flex-direction:column; gap:var(--sp-xs); flex:1; min-height:0;\n' +
  '  list-style:none; padding:0; margin:0;\n' +
  '}\n' +
  'section.owner-ledger > .cell-stage > ul > li {\n' +
  '  display:flex; flex-wrap:wrap; align-items:center; column-gap:var(--sp-md); row-gap:var(--sp-xs);\n' +
  '  flex:1; min-height:0;\n' +
  '  background:var(--bg-alt); border:1px solid var(--border); border-left:3px solid var(--accent);\n' +
  '  border-radius:var(--radius-md); padding:var(--sp-sm) var(--sp-lg);\n' +
  '}\n' +
  '/* the lead text auto-lifts to <strong> because each card carries a nested body list */\n' +
  'section.owner-ledger > .cell-stage > ul > li > strong {\n' +
  '  flex:1 1 auto; font-size:var(--fs-body); font-weight:700; color:var(--text-heading);\n' +
  '}\n' +
  'section.owner-ledger > .cell-stage > ul > li > code {\n' +
  '  flex:0 0 auto; font-size:var(--fs-meta); color:var(--text-body);\n' +
  '}\n' +
  'section.owner-ledger > .cell-stage > ul > li > ul {\n' +
  '  flex:0 0 100%; list-style:none; padding:0; margin:0;\n' +
  '  font-size:var(--fs-body-compact); color:var(--text-body);\n' +
  '}\n' +
  'skeleton:\n' +
  '<!-- _class: owner-ledger -->\n\n## Who owns what\n\n- Signal custody `Data lead`\n  - Owns intake quality and source diversity.\n' +
  '- Scoring policy `Risk lead`\n  - Owns calibration cadence and version floors.\n';

/** A gate-clean worked example that REUSES the card-grid matrix pattern (§4.8 — reuse, don't reinvent). */
const EXAMPLE_REUSE =
  'WORKED EXAMPLE C — REUSE a near neighbor. When dedup surfaces a similar component (e.g. "capability-cards"), adapt ITS pattern rather than ' +
  'invent a new structure. Request: "status cards — each capability with a pass/warn/fail status". This reuses the SAME card-as-li matrix grid ' +
  'and adds ONLY a status accent (state carried by a left border + a state token, not a new layout).\n' +
  'manifest: {"name":"status-cards","function":"inventory","form":"grid","substance":"structure","bucket":"inventory",' +
  '"tags":["cards","status","grid"],"description":"A 2-up grid of capability cards, each carrying a pass/warn/fail status accent.",' +
  '"adapt":{"mode":"native"},"capacity":{"sweet":4,"soft":6,"hard":8}}\n' +
  'css:\n' +
  'section.status-cards > .cell-stage { display:flex; flex-direction:column; }\n' +
  'section.status-cards > .cell-stage > ul {\n' +
  '  display:flex; flex-wrap:wrap; gap:var(--sp-md); flex:1; min-height:0;\n' +
  '  list-style:none; padding:0; margin:0;\n' +
  '}\n' +
  'section.status-cards > .cell-stage > ul > li {\n' +
  '  box-sizing:border-box; width:calc(50% - var(--sp-md) / 2);\n' +
  '  background:var(--bg-alt); border:1px solid var(--border); border-left:3px solid var(--text-muted);\n' +
  '  border-radius:var(--radius-md); padding:var(--sp-sm) var(--sp-md);\n' +
  '  font-size:var(--fs-body); font-weight:700; color:var(--text-heading);\n' +
  '}\n' +
  '/* status = SHAPE (the left border) + a state token, never color alone */\n' +
  'section.status-cards > .cell-stage > ul > li.pass { border-left-color:var(--pass); }\n' +
  'section.status-cards > .cell-stage > ul > li.warn { border-left-color:var(--warn); }\n' +
  'section.status-cards > .cell-stage > ul > li.fail { border-left-color:var(--fail); }\n' +
  '@container lattice (aspect-ratio <= 1.05) {\n' +
  '  section.status-cards.status-cards > .cell-stage > ul > li { width:100%; }\n' +
  '}\n' +
  'skeleton:\n' +
  '<!-- _class: status-cards -->\n\n## Capability status\n\n- Ingest pipeline\n- Scoring engine\n- Audit trail\n';

/** A gate-clean two-column COMPARISON — two sides side by side via FLEX + gap (NEVER margin, NEVER grid for a plain split). */
const EXAMPLE_COMPARE =
  'WORKED EXAMPLE D — a two-column comparison ("build vs buy", "pros and cons", "two plans side by side"). The two sides are the TWO ' +
  'top-level list items; FLEX splits them evenly (`display:flex` on the list, `flex:1 1 0` per side) with `gap` — NEVER `margin` to space the ' +
  'columns (the #1 mistake here), and NEVER `grid` for a plain even split (flex is the default — PREFER FLEX bullet). Each side is a panel; its ' +
  'points are the nested list. Portrait collapses to one column with a one-line `flex-direction:column`.\n' +
  'manifest: {"name":"build-buy","function":"comparison","form":"split","substance":"structure","bucket":"comparison",' +
  '"tags":["comparison","two-column","tradeoff"],"description":"Two options side by side — a titled panel each, the points listed below.",' +
  '"adapt":{"mode":"native"},"capacity":{"sweet":2,"soft":2,"hard":3}}\n' +
  'css:\n' +
  'section.build-buy > .cell-stage > ul {\n' +
  '  display:flex; gap:var(--sp-lg); align-items:stretch; flex:1; min-height:0;\n' +
  '  list-style:none; padding:0; margin:0;\n' +
  '}\n' +
  'section.build-buy > .cell-stage > ul > li {\n' +
  '  flex:1 1 0; min-width:0;\n' +
  '  background:var(--bg-alt); border:1px solid var(--border); border-radius:var(--radius-md);\n' +
  '  padding:var(--sp-md);\n' +
  '  font-size:var(--fs-message); font-weight:700; color:var(--text-heading);\n' +
  '}\n' +
  'section.build-buy > .cell-stage > ul > li > ul {\n' +
  '  list-style:none; padding:var(--sp-sm) 0 0 0; margin:0; display:flex; flex-direction:column; gap:var(--sp-xs);\n' +
  '  font-size:var(--fs-body); font-weight:400; color:var(--text-body);\n' +
  '}\n' +
  '@container lattice (aspect-ratio <= 0.9) {\n' +
  '  section.build-buy.build-buy > .cell-stage > ul { flex-direction:column; }\n' +
  '}\n' +
  'skeleton:\n' +
  '<!-- _class: build-buy -->\n\n## Build vs buy\n\n- Build\n  - Full control of the roadmap\n  - Higher upfront cost\n' +
  '- Buy\n  - Faster to launch\n  - Vendor lock-in\n';

/** A gate-clean MATRIX rendered as a native GFM table — when data reads ACROSS columns, USE A TABLE (don\'t fake it with lists). */
const EXAMPLE_TABLE =
  'WORKED EXAMPLE E — a feature MATRIX as a real table ("compare three plans across a set of features", "a duties-by-party grid"). The data ' +
  'is a GRID read ACROSS columns, so the skeleton is a GFM markdown table (header row, a `| --- |` divider, then one row per feature) — NOT a ' +
  'list or a grid of divs. It renders to a native `<table>`; style `section.<name> table/thead th/td` with tokens and `border-bottom` (NEVER ' +
  'margin), `border-collapse:collapse`.\n' +
  'manifest: {"name":"plan-matrix","function":"comparison","form":"matrix","substance":"structure","bucket":"comparison",' +
  '"tags":["comparison","table","matrix","pricing"],"description":"A feature matrix — features down the rows, plans across the columns.",' +
  '"adapt":{"mode":"native"},"capacity":{"sweet":4,"soft":6,"hard":8},"density":{"axis":"row","soft":6,"hard":10}}\n' +
  'css:\n' +
  'section.plan-matrix > .cell-stage { display:flex; flex-direction:column; }\n' +
  'section.plan-matrix table {\n' +
  '  width:100%; border-collapse:collapse; table-layout:auto; flex:1;\n' +
  '  font-size:var(--fs-meta);\n' +
  '}\n' +
  'section.plan-matrix thead th {\n' +
  '  text-align:left; padding:var(--sp-xs) var(--sp-sm);\n' +
  '  font-size:var(--fs-meta); font-weight:700; color:var(--text-label);\n' +
  '  border-bottom:2px solid var(--border);\n' +
  '}\n' +
  'section.plan-matrix tbody td {\n' +
  '  padding:var(--sp-xs) var(--sp-sm); border-bottom:1px solid var(--border);\n' +
  '  color:var(--text-body);\n' +
  '}\n' +
  'section.plan-matrix tbody td:first-child {\n' +
  '  font-weight:600; color:var(--text-heading);\n' +
  '}\n' +
  'skeleton:\n' +
  '<!-- _class: plan-matrix -->\n\n## Plans at a glance\n\n' +
  '| Feature | Starter | Team | Scale |\n' +
  '| --- | --- | --- | --- |\n' +
  '| Seats | 3 | 25 | Unlimited |\n' +
  '| SSO | — | Yes | Yes |\n' +
  '| Audit log | — | 30 days | 1 year |\n';

const ASK_SYSTEM =
  'You are a component designer for the Lattice slide engine. Given a request, you propose ONE local component as a ' +
  'compact JSON object — a manifest + scoped CSS + a skeleton slide — that feels native to Lattice\'s boardroom-quality set.\n\n' +
  COMPONENT_CANON +
  '\n' +
  EXAMPLE_CARDS +
  '\n' +
  EXAMPLE_LEDGER +
  '\n' +
  EXAMPLE_REUSE +
  '\n' +
  EXAMPLE_COMPARE +
  '\n' +
  EXAMPLE_TABLE +
  '\n\nOUTPUT CONTRACT. Return ONLY a compact JSON object — no prose, no markdown fences — with EXACTLY these keys:\n' +
  '  "name": a short lowercase slug (a–z, 0–9, hyphens; starts with a letter), evocative of the component — e.g. "verdict-grid".\n' +
  '  "description": ONE sentence describing what it shows and when to use it.\n' +
  `  "function": one of ${FUNCTIONS.map(f => `"${f}"`).join(', ')}.\n` +
  `  "form": one of ${FORMS.map(f => `"${f}"`).join(', ')}.\n` +
  `  "substance": one of ${CSS_ONLY_SUBSTANCES.map(s => `"${s}"`).join(', ')} (transform-free only).\n` +
  `  "bucket": one of ${BUCKETS.map(b => `"${b}"`).join(', ')}.\n` +
  '  "tags": 3 to 5 lowercase-slug tags.\n' +
  '  "adapt": {"mode":"native"} (or {"mode":"reflow"} only if you ship per-family @container layouts).\n' +
  '  "capacity": {"sweet":N,"soft":N,"hard":N} — the legible card/row counts (comfortable, stretched, hard cap), e.g. {"sweet":4,"soft":6,"hard":8}. ' +
  'Set it to what THIS layout truly holds (a two-panel split is {"sweet":2,"soft":2,"hard":3}; a single monument is {"sweet":1,"soft":1,"hard":1}) — never a boilerplate copy.\n' +
  '  "density": {"axis":"item"|"row","soft":N,"hard":N} — the words-per-element budget (a label + short clause is ~`soft`; `hard` is the wall-of-text ceiling, ≥ soft), ' +
  'e.g. {"axis":"item","soft":6,"hard":12}. Author the skeleton sample to sit within `soft` so it demonstrates the brevity. Omit only when no element carries prose.\n' +
  '  "css": the scoped stylesheet — every selector under `section.<name>`, palette-blind (var(--…) tokens only, no hex), ' +
  '`--fs-*` type only, NO non-reset margin, the `> .cell-stage` root, cards as `<li>` (or a `<table>` styled via `thead th`/`td`).\n' +
  '  "skeleton": a PURE-MARKDOWN slide (no raw HTML tags — only the `<!-- _class: <name> -->` comment) that invokes the component ' +
  'and exercises it (lists as `- Title` / `  - body`, or a GFM pipe table for a matrix).\n' +
  'Decline ONLY when a TRANSFORM is required — a chart, a diagram, generated/highlighted code, a math render, or a positioned ' +
  'track (timeline/roadmap/journey). Lists, TABLES, prose, and plain fenced code are IN SCOPE — never decline a matrix (it is a ' +
  'table). To decline, return `{"decline": true, "reason": "<one sentence>", "route": "<chart|diagram|code|math|dsl>", ' +
  '"suggestion": "<an existing component or a first-party build>"}`.';

/**
 * Messages for ONE generation request. `similar` (optional, from the dedup pass)
 * is threaded so the model can reuse a near neighbor's pattern rather than
 * reinvent it.
 */
function askComponentMessages(prompt, { similar = [] } = {}) {
  const msgs = [{ role: 'system', content: ASK_SYSTEM }];
  if (similar.length) {
    msgs.push({
      role: 'assistant',
      content: 'Near-neighbor components already in the set (reuse a pattern where it fits):\n' +
        similar.map(s => `• ${s.name} (${s.bucket}) — ${s.description || ''}`).join('\n'),
    });
  }
  msgs.push({ role: 'user', content: String(prompt || '').trim() || 'a clean inventory component' });
  return msgs;
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    const m = String(s).match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

// Turn arbitrary model text into a valid component slug, or '' when unusable.
function slugifyName(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z]+/, '');
  return s.slice(0, 40).replace(/-+$/, '');
}

// Snap a model value to a known enum (forgiving), else the fallback.
function snapEnum(value, allowed, fallback) {
  const v = String(value || '').toLowerCase().trim();
  return allowed.includes(v) ? v : fallback;
}

// Only operate on actual strings — a non-string model value (number/object)
// must degrade to '' (a fallback), never stringify to "42"/"[object Object]".
const clean = t => (typeof t === 'string' ? t : '').replace(/\s+/g, ' ').trim();
const asStr = (...cands) => { for (const c of cands) if (typeof c === 'string') return c; return ''; };

/**
 * HARD RULE #5 safe auto-fix (spatially-neutral): rewrite an inline card line
 * `- **Title.** body` (or `- **Title** body`) to the nested `- Title` / `  - body`
 * form the engine bolds. This changes markdown STRUCTURE, never layout geometry,
 * so it can't shift the render — the one class of fix the design auto-applies
 * (every SPATIAL fix is flagged + regenerated instead). Returns { skeleton, fixed }.
 */
function fixCardNesting(skeleton) {
  const lines = String(skeleton || '').split('\n');
  let fixed = false;
  const out = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)([-*+])\s+\*\*(.+?)\.?\*\*\.?\s+(.+)$/);
    if (m) {
      const [, indent, bullet, title, body] = m;
      out.push(`${indent}${bullet} ${title.trim()}`);
      out.push(`${indent}  - ${body.trim()}`);
      fixed = true;
    } else {
      out.push(line);
    }
  }
  return { skeleton: out.join('\n'), fixed };
}

// Capture the manifest `adapt` block — mode snapped to a known value (default
// `native`, the universal cqi-scaling + @container reflow path).
function coerceAdapt(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const adapt = { mode: snapEnum(o.mode, ADAPT_MODES, 'native') };
  if (Array.isArray(o.priority)) adapt.priority = o.priority.map(slugifyName).filter(Boolean);
  return adapt;
}

// Capture the `capacity` block (the legible ceiling). Returns null when the model
// gave nothing numeric — the audit then flags it as missing.
function coerceCapacity(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sweet = num(o.sweet), soft = num(o.soft), hard = num(o.hard);
  if (sweet == null && soft == null && hard == null) return null;
  const cap = {};
  if (sweet != null) cap.sweet = sweet;
  if (soft != null) cap.soft = soft;
  if (hard != null) cap.hard = hard;
  return cap;
}

// Capture the `density` block (the words-per-element prose budget — phase 2 of the
// content-capacity contract). `axis` is snapped to the two the per-element counter
// actually measures (item|row; default item — the others validate() rejects). Returns
// null when the model gave no numbers, so the audit can leave it advisory rather than
// invent a budget. Mirrors coerceCapacity's "null when empty" shape.
function coerceDensity(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const soft = num(o.soft), hard = num(o.hard);
  // Both are required (manifest.schema.json `density.required:["soft","hard"]`), and
  // a one-sided word budget is meaningless — drop a partial block so the emitted
  // shape is always schema-valid (stricter than coerceCapacity, whose rungs are
  // independently optional).
  if (soft == null || hard == null) return null;
  return { axis: snapEnum(o.axis, DENSITY_AXES, 'item'), soft, hard };
}

/**
 * Spatially-neutral safe auto-fix (§6): add the missing `section.<name>` scope
 * prefix to any selector that doesn't already target the component. Narrowing
 * where a rule applies can't shift geometry WITHIN the component, so it's safe to
 * auto-apply — UNLIKE a margin→padding rewrite. SELF-VERIFYING: the rewrite is
 * accepted ONLY if it provably scopes every selector (re-checked with the gate's
 * own `findUnscopedSelectors`) and the braces stay balanced; otherwise the
 * original is returned untouched and the gate flags the leak (never a corrupting
 * rewrite). Returns { css, fixed }.
 */
function addScopePrefix(css, name) {
  if (!NAME_RE.test(name || '') || !findUnscopedSelectors(css, name).length) return { css, fixed: false };
  const scope = `section.${name}`;
  const scopedRe = new RegExp(`\\.${name.replace(/[-]/g, '\\$&')}(?![\\w-])`);
  let ok = true;
  // The next UNquoted/uncommented `{` at or after `from`, or -1. String- and
  // comment-aware so a brace inside `content:"}"` or a `/* { */` can't be mistaken
  // for a rule opener (the corruption the naive scanner allowed).
  const nextOpen = (s, from) => {
    let str = null, com = false;
    for (let i = from; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      if (com) { if (c === '*' && n === '/') { com = false; i++; } continue; }
      if (str) { if (c === '\\') { i++; } else if (c === str) str = null; continue; }
      if (c === '/' && n === '*') { com = true; i++; continue; }
      if (c === '"' || c === "'") { str = c; continue; }
      if (c === '{') return i;
    }
    return -1;
  };
  // Index just past the `}` matching the `{` at `open`, string/comment-aware; -1 if unbalanced.
  const matchClose = (s, open) => {
    let depth = 0, str = null, com = false;
    for (let i = open; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      if (com) { if (c === '*' && n === '/') { com = false; i++; } continue; }
      if (str) { if (c === '\\') { i++; } else if (c === str) str = null; continue; }
      if (c === '/' && n === '*') { com = true; i++; continue; }
      if (c === '"' || c === "'") { str = c; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return i + 1;
    }
    return -1;
  };
  const rewrite = (str) => {
    let res = '', pos = 0;
    while (pos < str.length) {
      const open = nextOpen(str, pos);
      if (open < 0) { res += str.slice(pos); break; }
      const close = matchClose(str, open);
      if (close < 0) { ok = false; return str; }
      const lead = str.slice(pos, open).match(/^\s*/)[0];
      const prelude = str.slice(pos, open).trim();
      const inner = str.slice(open + 1, close - 1);
      if (prelude.startsWith('@')) {
        const at = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
        res += lead + prelude + ' {' + (/keyframes|font-face/.test(at) ? inner : rewrite(inner)) + '}';
      } else if (/["']/.test(prelude)) {
        // A quoted attribute selector (e.g. [data-x="a,b"]) can't be comma-split
        // safely — bail the whole fix rather than risk corrupting it (the canon
        // never teaches these; the gate still flags the leak).
        ok = false;
        return str;
      } else {
        const parts = prelude.split(',').map(p => p.trim()).filter(Boolean);
        res += lead + parts.map(p => (scopedRe.test(p) ? p : `${scope} ${p}`)).join(', ') + ' {' + inner + '}';
      }
      pos = close;
    }
    return res;
  };
  const next = rewrite(css);
  // Accept only a provably-clean rewrite — else leave it for the gate to flag.
  if (!ok || findUnscopedSelectors(next, name).length) return { css, fixed: false };
  return { css: next, fixed: true };
}

/**
 * Design audit — the native-ness checks beyond the structural gate, applied to AI
 * output (§6). Advisory findings (the gate is what hard-blocks): a manifest with no
 * `adapt` block (won't reflow for portrait/tall), an incoherent `capacity`
 * (soft ≥ hard), and an oversized stylesheet (a multi-MB `data:` payload slips the
 * exfil denylist). Returns `[{ level, rule, message }]` — shown, never papered over.
 */
function auditComponentDesign(manifest, css) {
  const out = [];
  const m = manifest && typeof manifest === 'object' ? manifest : {};
  if (!m.adapt || !ADAPT_MODES.includes(m.adapt.mode)) {
    out.push({ level: 'warn', rule: 'adapt', message: 'No adapt mode declared — the component may not reflow on a portrait/tall frame. Add adapt:{mode:"native"}.' });
  }
  const cap = m.capacity;
  if (!cap || (cap.sweet == null && cap.soft == null && cap.hard == null)) {
    out.push({ level: 'warn', rule: 'capacity', message: 'No capacity declared — state its legible ceiling, e.g. capacity:{sweet:4,soft:6,hard:8}.' });
  } else {
    // The thresholds must climb: sweet ≤ soft ≤ hard (comfortable → stretched → cap).
    const rungs = [cap.sweet, cap.soft, cap.hard].filter(v => v != null);
    const climbs = rungs.every((v, i) => i === 0 || rungs[i - 1] <= v);
    if (!climbs) out.push({ level: 'warn', rule: 'capacity', message: 'capacity must climb sweet ≤ soft ≤ hard (comfortable → stretched → hard cap).' });
  }
  const den = m.density;
  if (den && den.soft != null && den.hard != null && den.soft > den.hard) {
    // The words-per-element budget must climb soft ≤ hard ('reads well' → 'reads heavy').
    out.push({ level: 'warn', rule: 'density', message: 'density.soft must be ≤ density.hard (the editorial target sits below the wall-of-text ceiling).' });
  }
  if (typeof css === 'string' && css.length > MAX_CSS_BYTES) {
    out.push({ level: 'error', rule: 'css-size', message: `Generated CSS is ${Math.round(css.length / 1024)}KB (cap ${MAX_CSS_BYTES / 1024}KB) — likely an embedded data: payload; trim it.` });
  }
  return out;
}

/**
 * Coerce a model reply (object, or JSON string) into a gate-ready draft. Shapes
 * the manifest (slugged name, enum-snapped axes, adapt/capacity), applies the
 * spatially-neutral safe fixes (card-nesting + scope-prefix), and detects a
 * decline. The bridge runs the actual gate
 * (gateComponent + findCssExfil) on the returned css/skeleton — this layer never
 * fakes a pass. Returns:
 *   { ok, decline, manifest, css, skeleton, fixes }
 * where `decline` is `{ reason, route, suggestion }` (or null), `fixes` lists the
 * safe auto-fixes applied, and `ok` = a usable, non-declined draft with a valid name.
 */
function coerceComponent(raw) {
  const obj = (typeof raw === 'string' ? safeParse(raw) : raw) || {};

  if (obj.decline === true || obj.decline === 'true') {
    return {
      ok: false,
      decline: {
        reason: clean(obj.reason) || 'This component needs behavior a transform-free CSS component can’t provide.',
        route: snapEnum(obj.route, ['chart', 'diagram', 'code', 'math', 'dsl'], 'dsl'),
        suggestion: clean(obj.suggestion),
      },
      manifest: null, css: '', skeleton: '', fixes: [],
    };
  }

  const name = slugifyName(obj.name ?? obj.slug ?? obj.title);
  const func = snapEnum(obj.function ?? obj.fn, FUNCTIONS, 'inventory');
  const manifest = {
    name,
    function: func,
    form: snapEnum(obj.form, FORMS, 'panel'),
    substance: snapEnum(obj.substance, CSS_ONLY_SUBSTANCES, 'structure'),
    bucket: snapEnum(obj.bucket, BUCKETS, func),
    tags: Array.isArray(obj.tags) ? obj.tags.map(slugifyName).filter(Boolean).slice(0, 5) : [],
    description: clean(obj.description ?? obj.desc),
    adapt: coerceAdapt(obj.adapt),
    capacity: coerceCapacity(obj.capacity),
    density: coerceDensity(obj.density),
  };

  const fixes = [];
  // Safe fix 1 (text): card-nesting.
  const { skeleton, fixed: nestFixed } = fixCardNesting(asStr(obj.skeleton, obj.markdown, obj.sample).trim());
  if (nestFixed) fixes.push('card-nesting');
  // Safe fix 2 (structural): add a missing section.<name> scope prefix (self-verifying).
  const { css, fixed: scopeFixed } = addScopePrefix(asStr(obj.css, obj.styles).trim(), name);
  if (scopeFixed) fixes.push('scope-prefix');

  return {
    ok: NAME_RE.test(name) && !!css && !!skeleton,
    decline: null,
    manifest, css, skeleton, fixes,
  };
}

// Lowercase word tokens for lexical overlap (≥ 3 chars, dedup'd).
function tokenize(text) {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z][a-z0-9]{2,}/g) || [])];
}

/**
 * Lexical dedup ranking — the fallback path when the on-device embedder is
 * unavailable (Safari/mobile/no-CDN/model-off). Scores the request against each
 * catalog component's TOP-LEVEL `name`/`description`/`purpose`/`tags` (the
 * `name` recurs on slots — use the top-level fields only) by token overlap, with
 * a small bucket/tag boost. Returns the top `limit` as
 * `[{ name, bucket, description, score }]` (score > 0 only). Pure + testable; the
 * bridge swaps in cosine ranking over bge-small embeddings when `embed()` works.
 */
function rankSimilar(prompt, catalog, { limit = 3 } = {}) {
  const q = new Set(tokenize(prompt));
  if (!q.size || !Array.isArray(catalog)) return [];
  const scored = catalog.map(c => {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    const hay = tokenize(`${asStr(c.name)} ${asStr(c.description)} ${asStr(c.purpose)} ${tags.join(' ')}`);
    let overlap = 0;
    for (const t of hay) if (q.has(t)) overlap++;
    // A token shared with the name/tags is a stronger signal than one in prose.
    const tagHit = tags.some(t => q.has(String(t).toLowerCase())) ? 1 : 0;
    return { name: c.name, bucket: c.bucket, description: c.description || '', score: overlap + tagHit };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score || String(a.name).localeCompare(b.name)).slice(0, limit);
}

module.exports = {
  ASK_SYSTEM, COMPONENT_CANON, askComponentMessages, coerceComponent, rankSimilar,
  auditComponentDesign, addScopePrefix, slugifyName, fixCardNesting, MAX_CSS_BYTES,
};
