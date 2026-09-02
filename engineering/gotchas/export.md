# Gotchas — Export (PDF, PPTX, the HTML player)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## Chromium PDF output of CSS `mask-image` renders inconsistently across viewers

- **Symptom:** A `::before` with `mask: url("data:image/svg+xml,…") center / contain no-repeat` renders correctly in the browser AND in the owned engine's headless-Chromium PDF render, but the resulting PDF, when opened in Apple PDFKit (macOS Preview, iOS), Skia (Chrome's built-in PDF viewer), or PDFium (Edge / VS Code), sometimes drops the mask entirely — the `::before` rectangle appears as a solid tinted block the size of its bounding box, filled with the paint color, with no shape clipping. Failure is viewer-specific and shape-specific: identical CSS, one mask drops on one viewer and renders fine on another, or the same mask drops only on certain `::before` sizes.
- **Cause:** Chromium emits masks in the vector PDF stream using a combination of soft-mask groups and clip paths that the spec permits but that not every PDF reader implements identically. Apple PDFKit is the strictest — it ignores constructs that Skia/PDFium accept, falling back to the unmasked source rectangle. Has held across multiple Chromium versions; not a regression.
- **Mitigation:**
  - **Cropped `::before` bbox.** Size the `::before` to the shapes' bounding box, not the full slide. When the mask drops, the failure surfaces as a small tinted patch (degradation) rather than a slide-spanning panel of paint (slide-breaking artifact). This is what the orbit-pattern refactor in the treatments library does for the 8 mask-based marks.
  - **Box-shadow stack.** For marks whose geometry is "one shape repeated at evenly-spaced offsets" (e.g. `mark-ticks` — 5 ticks down the right margin), drop the mask entirely and paint via one `::before` plus N `box-shadow` copies. `border-radius` on the `::before` propagates to the shadows, so rounded shapes work (`mark-pills`).
  - **Stacked radial gradients in a slot.** For marks whose geometry is "many small shapes scattered across multiple corners" (e.g. `mark-seeds` — 12 ellipses across all four corners), drop the mask and write to `--_bg-radial` as N stacked `radial-gradient(...)` values. Gradients are native rendering primitives with no mask to drop.
- **Triggered by:** Any `::before` (or `::after`) carrying `mask` / `mask-image` that the author opens in a PDF viewer. The browser preview never reveals this failure mode; only the rendered PDF does. The catalog rebuild on the treatments-rename branch was the forcing function.
- **Removable when:** Apple PDFKit gains parity with Skia/PDFium for the soft-mask constructs Chromium emits. No timeline.
- **Commits:** This branch (treatments rename; the cropped-bbox + box-shadow + gradient-slot escape hatches). See `engineering/treatments.md` → "Mark rendering" for the rendering-mechanism breakdown.

## SVG images in the exported PDF partially render or vanish in iOS Quartz viewers

- **Symptom:** A slide whose photo is an **SVG file** (`![bg](photo.svg)` or an inline `![](photo.svg)`) renders perfectly in poppler (CI rasterization, desktop viewers) but breaks in iOS Safari's built-in PDF viewer and other Quartz-based viewers: the image draws only partially (a top band) or the photo column is dropped entirely, showing bare canvas. Other SVG placements on the same device can draw fine — the failure is construct-specific (clipped/cropped placements), not SVG-wholesale. First observed on-device reviewing the full-coverage gallery (#690).
- **Cause:** Chromium prints an SVG `<img>`/`background-image` into the vector PDF as shading patterns and transparency groups; the clipped/cover placements emit combinations Quartz mishandles (the same viewer-strictness family as the `mask-image` gotcha above). Poppler renders them correctly, which is why single-renderer verification never caught it.
- **Mitigation:** Since #690 landed, **lattice-emulator rasterizes SVG `<img>`/`background-image` references at export time by default** — each unique SVG becomes a 2× PNG twin (a plain image XObject, the universally supported construct) swapped into the loaded page before `page.pdf()`. Inline `<svg>` (Mermaid, charts, logo marks) stays vector. Opt out with `--keep-vector-images` if you need the vector construct and control the viewers. For decks rendered by other paths (marp-cli), prefer raster assets (`.jpg`/`.png` twins), as the baseline gallery does (#681).
- **Triggered by:** Any deck embedding `.svg` images, opened on an iPhone/iPad or macOS Preview — which is exactly where a shared `/gallery.pdf` link gets opened first.
- **Removable when:** Quartz gains parity with poppler/Skia for Chromium's SVG-image print constructs. No timeline; treat SVG-in-PDF as a portability hazard.
- **Commits:** The pdf-export-portability branch (#690); the deck-side raster twins landed in #681.

## A blurred `box-shadow` renders as an opaque gray block in Apple PDFKit and Quartz PDF viewers

- **Symptom:** Any `box-shadow` with a blur radius — or `filter: drop-shadow()` —
  looks correct in Chrome and in every local rasterization, but in **Apple PDFKit
  and Quartz viewers** (iOS Files/Preview, macOS Preview, the iOS share sheet, some
  Android apps) it paints a **solid gray rectangle** filling the shadow's footprint
  instead of a soft gradient. Seen twice, at both ends of the size range: the
  state-token disc showed a gray square around each small disc, and the focus
  `pop`/`blur` lift showed a hard gray box behind a whole card.
- **Cause:** Chromium `printToPDF` exports a blurred shadow as a transparency-group /
  soft-mask (SMask) image sized to the element's expanded box. Viewers with
  incomplete transparency-group support paint that image's *bounds* opaque instead of
  applying its alpha — the same soft-compositing weakness that makes PDFKit drop SVG
  `mask-image` (see the mask gotcha above). Spread-only shadows (`0 0 0 Npx`, no blur
  radius) export as plain vector strokes and are safe; **only the blur triggers it.**
- **Every local check passes, which is the trap.** The browser, PNG rasterizations of
  the emulator PDF (`tools/rasterize-for-review.sh`), MuPDF/PyMuPDF, and poppler all
  composite the group correctly — so the sandbox raster hides the bug. **Verify any
  shadow-bearing export on a real Apple/mobile viewer** (HARD RULE #23: a local
  raster is not that surface).
- **Fix / don't reintroduce:** keep chrome **vector-only** — solid fills and
  hard-edged shapes. For depth use a darker zero-blur *spread* ring
  (`box-shadow: 0 0 0 1.6px <darker>`) or a zero-blur *offset* shadow
  (`box-shadow: Xcqi Ycqi 0 <color>`), both of which are solid vector fills. Keep the
  color **opaque** — mix toward `--bg`, not `transparent` — to avoid alpha
  compositing as well. Two shipped recipes are deliberately blur-free for this
  reason: the state disc (`lib/base/base.tokens.css` plus its three checkbox
  consumers) and `--focus-lift` (`lib/base/base.focus.css`), which is an opaque hard
  offset rather than a soft elevation shadow.
- **Caught:** twice — the checkbox redesign (discs showed a gray square in the iOS PDF
  viewer while every local raster looked clean) and the focus lift (a hard gray box
  behind the focused card on iPhone, correct in the poppler sandbox raster).

## A JSON data block inside a `<script>` comes back with `&amp;` in every string

- **Symptom:** An inline data block (the manifest envelope, the baked-narration
  blocks) parses, but every caption containing `&` reads `&amp;` — and a `<` in
  deck text either survives or breaks the block in two.
- **Cause:** the content of a `<script>` element is **raw text**. The HTML parser
  does not decode character references there, so HTML-escaping the payload
  (`escapeText`, `&amp;`/`&lt;`/`&gt;`) puts the *literal* entity into the JSON
  string — `JSON.parse` returns `&amp;` because that is genuinely what is there.
- **Fix:** escape in the JSON layer, not the HTML layer:
  `JSON.stringify(payload).replace(/</g, '\\u003c')` (a literal backslash-u escape).
  The parser then never sees a
  `<` (so neither `</script` nor the `<!--` that flips it into script-data-escaped
  state can appear), and `JSON.parse` decodes it back to the real character.
  `lib/export/player-core.mjs` › `narrationBlocks`.

## The exported player has no front matter to read

- **Symptom:** A player-side feature written as "read the deck's `pace:` / `lang:`
  / any front-matter key at runtime" silently gets nothing.
- **Cause:** `assemblePlayer` strips every `<script>` that is not the manifest
  envelope, so the `application/lattice-front-matter` block the render emits never
  reaches the shipped file. A standalone artifact also has no workspace preset to
  fall back on.
- **Fix:** resolve it at ASSEMBLY and bake the value in
  (`lib/export/player-core.mjs`, `const paceName = frontMatterPace(source)`), or
  put it in the envelope, which does survive.

## A slide-level color-scheme pin has to be re-emitted for the exported player

- **Symptom:** A deck authored dark (`color-mode: dark`, or any `_class: dark`
  slide) opens correctly in the exported `.html` player — and goes blank the moment
  the viewer flips the player's light toggle. Title / divider / closing lose their
  words entirely; body slides just look "wrong but readable." Dark mode looks fine,
  which is what makes it easy to misread as a light-mode styling bug.
- **Cause:** the player cannot ship `light-dark()` (it does not exist before
  WebKit 17.5), so `themeDualMode` collapses every pair to its light arm and
  re-emits the dark values as a flat `:root[data-lp-scheme=dark]` block. That is a
  faithful emulation of a *document-level* scheme only. Lattice also pins the scheme
  per SLIDE — `section.dark`, `.light`, `.color-light`, `.print` set `color-scheme`
  on the section, which is what `light-dark()` actually resolves against — and
  collapsing the function away erased those pins. A `.dark` slide then took the
  viewer's light tokens while still painting `--text-display`, a constant `#FFFFFF`
  with no light-dark() pair for anything to rewrite: white ink on a white canvas.
  It read fine in dark only by luck — the page behind it was dark too.
- **Fix:** the dark block re-states each pin — `.dark` sections carry the dark
  literals in *both* player schemes, `.light`/`.color-light` are restored to the
  light literals when the player is dark, and `.print` is excluded from the blanket
  rule so its own `--print-*` band survives (it was previously overridden in dark
  mode too, printing `#111111` ink on a `#001D33` canvas). `.color-system` /
  `.color-inherited` are deliberately left unpinned: both defer, which in a
  standalone player IS the toggle. `lib/export/player-core.mjs` › `themeDualMode`.
- **The general shape:** anything that replaces `light-dark()` with static CSS has
  to answer *which element's* `color-scheme` each token was resolving against, not
  just "light or dark".

## A token flattened for the player took the print band's value

- **Symptom:** In an exported `.html` player, one token family is wrong in dark
  mode — and wrong in a specific direction: near-white or near-gray where the theme
  says a color. `examples/accent-on-accent.md` slide 5 shipped its headline, eyebrow,
  watermark and counter chip as `#ECECEC` on the cream accent rail — **1.24:1**, on the
  deck whose subject is on-accent contrast (13.0:1 in the reference render). On a
  chart deck the whole categorical ramp went gray in dark mode.
- **Cause:** `themeDualMode` flattens each dark value's `var()` chain to a literal, so
  the player never depends on a custom property resolving to another custom property
  (fatal on an older in-app WebKit). The map it flattened against was built by scanning
  the WHOLE stylesheet, last declaration wins — but the last declaration of a token is
  often a COMPONENT-scoped one. `section.print{--surface-inverse: var(--print-surface-inverse)}`
  is the last `--surface-inverse` in the bundle, so `--on-accent: light-dark(#F0EDE6,
  var(--surface-inverse))` flattened its dark arm to the print band's `#ECECEC`, and the
  whole `--on-accent-*` family followed. Same mechanism gave `--state-pass-hue` the print
  band's gray and every `--chart-cat-N-hue` a grayscale value in dark mode.
- **Fix:** the map is scoped to `:root`-subject blocks (`rootScopedDecls`), the same
  scoping the derived-token closure beside it already had, and both now read ONE map.
  A component-scoped declaration is simply absent, so the chain stops and the `var()`
  ships intact — a missed flatten, never a wrong color. `lib/export/player-core.mjs`.
- **The general shape:** a flattener answers "what does this resolve to ON THE ELEMENT
  I am writing to". Scanning a whole sheet for the last declaration answers a different
  question, and the two agree only until some component declares the same token.

## Chart fills took one scheme while the page took the other

- **Symptom:** In an exported `.html` player, gantt bars / state-chart nodes / kanban cards
  paint with the DARK fills while the slide canvas, labels, axes, badges and legend dots
  beside them are all correctly light. Reported from a real iPad; not reproducible in a
  headless browser with default settings, which is what made it look like a theme bug.
- **Cause:** the player's contract is that nothing it ships depends on the `light-dark()`
  CSS function — `themeDualMode` collapses every pair to a light base plus a block keyed on
  the `data-lp-scheme` attribute. That contract had a hole the width of an attribute:
  `themeDualMode` only ever read `<style>` BLOCKS, and two chart components write their
  gradient stops as an inline `style` ATTRIBUTE
  (`lib/components/chart/_chart-family/chart-family.js`,
  `lib/components/chart/state-chart/state-chart.transform.js`). Those shipped verbatim — 22
  of them in `examples/data-viz-gallery.md` — so the fill was decided by the element's
  `color-scheme` and the page by `data-lp-scheme`. The two agree only because the player's
  script writes an inline `color-scheme` onto `<html>`; wherever that coupling does not hold
  (a script that never ran, a host that re-parents the SVG, an engine that resolves
  `light-dark()` inside a never-rendered `<defs>` subtree against the OS) they diverge. And
  on a pre-17.5 WebKit the declaration is invalid outright, so the fills fall back to black.
- **Reproduce it anywhere:** load the player, `data-lp-scheme=light`, OS dark, then
  `document.documentElement.style.removeProperty('color-scheme')` — the page stays light and
  the gradient stops resolve dark. That is the whole bug, without an iPad.
- **Fix:** `hoistInlineLightDark` (`lib/export/player-core.mjs`) collapses each inline
  attribute to its LIGHT arm and returns the dark arms as scoped rules marked `!important`
  (nothing else outranks an inline style), under the same scheme scopes the token block uses.
  The arms stay ON the element deliberately — their inner `var()`s (`--chart-fill-top-l`,
  `--fill-hue`) are declared on `.chart-frame`, so lifting the whole expression to a `:root`
  token makes it invalid at computed-value time and every gradient renders BLACK. An
  integration test now fails on ANY `light-dark()` anywhere in a shipped player, not only in
  an attribute — a count over the whole file, because each of this contract's three holes was
  invisible to a gate written for the previous one.
- **The general shape:** an export that rewrites CSS has to answer for every place CSS can
  hide. A `<style>` sweep misses attributes, and the miss is invisible until the one signal
  that was silently holding it together stops holding.

## A player's dark toggle moved every color except the ones written in a real property

- **Symptom:** In an exported `.html` player, tapping the light/dark toggle re-themes the
  deck — canvas, ink, chart fills — but a handful of surfaces never move: kanban cards keep
  their light drop-shadow and hairline on a near-black slide, the progress fill and its
  percentage chip stay pale, the state-chart nodes and index disc keep their light gradient,
  and the spectrum ribbon on a `title` / `closing` bookend keeps the light ramp. Nothing
  looks broken; it looks like those components simply were not themed for dark.
- **Cause:** `themeDualMode` rebuilds the dark side of the player from CUSTOM-PROPERTY
  declarations only — it scans for `--x: …light-dark(…)` and re-emits those under the scheme
  scopes, which is complete for TOKENS because every dual-mode token is a `:root` custom
  property. The base beside it is the whole sheet with every pair collapsed to its LIGHT arm.
  A pair written straight into a real property (`box-shadow`, `background`,
  `background-image`, `border`, `fill`) is in neither set: the base keeps the light arm and
  nothing anywhere restores the dark one. 18 such declarations across 14 rules in
  `dist/lattice.css`. The kanban card is the clearest case — its four-layer elevation recipe
  uses DIFFERENT layers per canvas (a contact shadow in light, an inset top rim in dark, the
  inapplicable layer resolving to `transparent`), so the light-only export ships a card with
  the shadow that does not read on near-black and without the rim that does.
- **Reproduce it anywhere:** export `examples/kanban-chart-redesign.md` with `--player`, open
  it, read `getComputedStyle(document.querySelector('.kanban-card')).boxShadow`, click
  `#lp-mode`, read it again — byte-identical. The reference is the same deck with
  `color-mode: dark` in front matter, which shares none of the four layers.
- **Fix:** `hoistRuleLightDark` (`lib/export/player-core.mjs`) leaves the declaration in its
  own rule and moves only its VALUE, through a private custom property:
  `.kanban-card{box-shadow:var(--lp-ld-7-0,<light>)}` in the base, plus
  `:root[data-lp-scheme=dark] .kanban-card{--lp-ld-7-0:<dark>}` in the dual-mode block, under
  the same scheme scopes the token block uses.
- **Do NOT re-emit the rule itself under the scheme scope.** That is the obvious shape and it
  is wrong: the copy gains SPECIFICITY as well as a scheme condition, so every rule that
  legitimately beat the original by less than the prefix is worth now loses to it, in dark
  mode only. Measured on the first deck tried — `section.kanban.keyline .kanban-card
  {box-shadow:none}` (0,3,1) is what makes a keyline card flat, and the scoped copy of the
  base card's shadow (0,4,1) outranked it, so every keyline card came back elevated. There is
  no prefix small enough to be safe in general; any positive delta jumps SOME rule. Wrapping the
  scope in `:where()` would cost zero specificity and would work on a current engine — the
  engine sheet uses `:where()` freely — but the dual-mode block holds to the same
  pre-selector-list vocabulary as its sibling rules on purpose: an engine that cannot PARSE
  `:where()` drops the whole rule, and a dropped rule here is silently un-themed dark mode (see
  the `:is()`/`:not(a,b)` note in `themeDualMode`). Nothing else declares
  `--lp-ld-*`, so the indirection's own specificity is uncontested and the cascade for the
  real property is untouched.
- **The general shape:** when a transform has to make one declaration conditional, move its
  VALUE, not its RULE. Re-scoping a selector changes who wins, everywhere that selector
  applied — a much larger blast radius than the one declaration you meant to change.

## An exported player quietly dropped every `X :is(…)` rule the deck renders

- **Symptom:** A rule the PDF honors does nothing in the exported `.html` player. On a
  `split-panel watermark` slide the running header and footer paint the CANVAS's muted ink
  while sitting on the accent rail — 1.45:1 on `examples/gallery-jargon.md` p14 after the
  toggle, invisible — even though `section.split-panel.watermark :is(header, footer) {color:
  var(--on-accent)}` is right there in `dist/lattice.css` and the PDF obeys it. The same
  silence covers the `code`/`pre` chip inside a section and the list styling on `cards-grid`,
  `cards-stack` and `closing`.
- **Cause:** `minifyCss` tightened whitespace on BOTH sides of every `:`. To the left of a
  colon that opens a PSEUDO, that whitespace is a descendant combinator — so
  `section.split-panel.watermark :is(header, footer)` minified to
  `section.split-panel.watermark:is(header, footer)`, a compound asking for a section that is
  also a header. Still valid CSS, still parses, matches nothing. 59 rules in the bundle were
  re-meant this way. The CSS prune then removed them as unused — correctly, because by then
  they genuinely matched nothing — so the shipped file carried no trace of the rule at all,
  and the surface fell through to whatever generic rule was left.
- **Reproduce it anywhere:**
  `node -e "import('./lib/export/player-core.mjs').then(({minifyCss})=>console.log(minifyCss('.a :is(b){c:1}')))"`
  — the space is the whole bug.
- **Fix:** `:` now tightens on the RIGHT everywhere, and on the left only where a declaration's
  property name proves it is a declaration (the token immediately after a `{` or `;`). The
  selector side keeps its space. What it costs is nothing authored CSS here writes.
- **The general shape:** a minifier's contract is that meaning is preserved, and whitespace in
  a selector IS meaning. A transform that is "obviously safe" on declarations is not
  automatically safe on the other half of the grammar it runs over — and this one failed
  silently in both directions, because the output parsed and the prune then made the evidence
  disappear.

## A baked diagram label went dark-on-dark after the player's toggle

- **Symptom:** In an exported `.html` player, an EDGE label ("a case fails", "yes"/"no")
  is fine as exported and near-invisible after the viewer taps the light/dark toggle —
  around **1.1:1**. Node and container labels on the same diagram are fine.
- **Cause:** the label's halo. `foreignObjectToText` rewrites a Mermaid label into native
  `<text>` plus a `<rect>` carrying the label's HTML background, and that rect was written
  as a raw literal — the ONE paint in the bake that skipped the scheme-token matcher every
  other paint goes through. Mermaid paints an edge label's halo from the slide canvas, so
  it froze at the export scheme while the ink above it kept following
  `.label tspan:not(.lp-own-ink){fill:var(--text-heading)!important}`. Dark ink, dark halo.
- **Fix:** the halo is matched against the same follow-set (`followToken`), so it ships as
  `fill:var(--bg)` and moves with the toggle. When a halo matches NO token (an author's own
  background) the ink above it is frozen to its bake-time literal and marked `lp-own-ink`
  instead — frozen together. `lib/components/chart/_chart-family/standalone-svg.js`.
- **The general shape:** in a document with a runtime theme toggle, "frozen" and
  "following" are both fine; a frozen surface under a following ink is not. Freezing on
  ambiguity is not the safe default here — it was measured as strictly worse than the bug.

## `--strip-notes` deleted a comment out of a code fence

- **Symptom:** A deck that DOCUMENTS the note syntax exports with `--strip-notes` and the
  recipient re-imports a deck whose ```markdown sample has lost a line — while the slide
  they can see still shows it. Source destruction, not a leak.
- **Cause:** `stripNotesFromSource` matched whole-body set membership with no notion of
  where a comment sits, so any `<!-- X -->` ANYWHERE in the source was removed when `X`
  was a note body somewhere else — including inside a fenced block or an inline span.
- **Fix:** the scrub is position-aware. It shares `maskCodeRegions` with the envelope
  audit (which already had to skip the same regions to avoid a false privacy alarm), and
  removes a comment only where a note can actually live. A comment inside a code region
  can never be the secret the strip exists to protect: the audience is reading it off the
  slide. `lib/authoring/notes-core.js`.

## `--strip-notes` could not remove a note that opens with a directive keyword

- **Symptom:** `<!-- color: we should discuss the palette -->` survives a `--strip-notes`
  export verbatim — in the envelope source AND on the section as `data-color` / `--color`.
- **Cause:** the engine's directive test accepts ANY value after `key:`, so this is
  consumed as the deck-scope `color` directive. It never reaches rendered HTML, so it
  never enters the note set, so the source scrub has nothing to match.
- **Fix (a report, not a scrub):** the envelope audit now reports a directive whose value
  reads as prose — checked only for the directives whose value domain is tight enough to
  tell (`color`, `backgroundColor`, `theme`, `size`, `lang`, `marp`, `paginate`); free-text
  ones like `header:` are indistinguishable from prose and are never reported. Scrubbing it
  instead would corrupt every deck using the ordinary `<!-- paginate: true -->` idiom, and
  would not close the leak anyway, because the engine bakes the value onto the section. Only
  the author can fix it, by rewording the note — which is what the warning asks for.
  `lib/authoring/notes-core.js` › `directiveShapedProse`; `design/skills/speaker-notes.md`.

## `--strip-notes` shipped the note anyway — in the `.pptx`, and in the raster PDF's sidecar

- **Symptom:** `lattice deck.md out.pptx --strip-notes` produces a file whose
  `ppt/notesSlides/*.xml` still carries the speaker text, where PowerPoint shows it to
  anyone who opens the file. Same flag, same deck, `--raster` or `--paper`: the
  `<out>.notes.txt` sidecar carries it too, and the run's own log line claims "3 slides
  with speaker notes" on the render that just stripped all three.
- **Cause:** the emulator materializes two arrays — `slideNotes` (as authored) and
  `materializedNotes` (all-null under `--strip-notes`) — and each writer picks one. Three
  call sites still read `slideNotes`. Coverage was per-path, so each export path had its
  own test and a path nobody thought about was simply untested.
- **Fix:** every writer takes `materializedNotes`. The durable guard is
  `test/integration/export/strip-notes-every-format.test.js`, which drives ONE deck to
  every row of the emulator's closed `OUT_FORMATS` table — and to the flag variants that
  select a different write path, since the sidecar leak was in `.pdf`, the same table row
  as the vector path that was already correct. Adding a format row without a case fails
  the suite by name.
- **When you write that test yourself, do not grep the PDF.** `embedNotesInPdf` writes the
  note as an annotation and pdf-lib deflates the object stream carrying it, so a raw byte
  scan of a definitely-leaking PDF returns ZERO hits. Inflate every `stream…endstream`
  first. The same suite carries a control render WITHOUT the flag for exactly this reason:
  a probe that cannot see the note when it IS there proves nothing when it is gone.

## The exported player told the recipient a deck HAD notes, after `--strip-notes` removed them

- **Symptom:** a `--player` export made with `--strip-notes` carries no note text, but
  pressing `n` in Present view still slides up a 65px sheet reading "No notes for this
  slide." The recipient learns the deck had notes — which is what the flag exists to prevent.
- **Cause:** `player-core.mjs` hid the notes BUTTON when the file carried no
  `aside.lattice-notes`, but left the panel in the layout and the `n` key handler live.
- **Fix:** `hasNotes` gates the button, the panel and the key together. Verified on a real
  browser, not a harness (HARD RULE #23): panel `display:none`, `n` inert, 0px.
  `lib/export/player-core.mjs`.
- **A second tell in the same class, found by review:** the `lattice-doc` envelope's `notes`
  field was `!STRIP_NOTES` — set from the FLAG, not from the artifact. It sits in plain base64
  at the bottom of the shared file, so a deck that never had a note said `true` and only a
  stripped one said `false`: a one-bit answer to "were there notes here?". It now reads the
  materialized array, so both cases say `false`. Two writers, both changed —
  `lattice-emulator.js` and `docs/src/components/studio/share-export.ts`.
- **A third tell in the same class, now closed (#1985).** Stripping used to remove the comment
  NODE from already-rendered HTML and leave the whitespace around it, so re-rendering the deck's
  own embedded source and diffing showed a one-byte-per-slide residue naming WHICH slides
  carried a note — computable from the shipped file alone. The fix is NOT whitespace surgery in
  `stripCommentNodes`: that sits on the render path for every deck, and already-rendered HTML
  cannot tell a block comment from an inline one, so consuming the trailing newline would join
  two words in `a<!-- n -->\nb`. Instead `--strip-notes` scrubs the SOURCE and renders that —
  removing the comment before markdown-it ever sees it, which is how `directives.js` has always
  kept a consumed directive from leaving a trace. Costs one extra engine render on this flag's
  path only. Both writers changed, so the two paths stay in step — `lattice-emulator.js`
  ("PASS 2") and the Studio's Webpage export, whose half of the measurement lives in
  `docs/src/components/studio/strip-notes-guard.ts` (loaded on demand from `share-export.ts`;
  it is off the studio route's eager bundle deliberately). Pinned by
  `test/integration/export/strip-notes-no-fingerprint.test.js`, which exports the fixture and a
  committed note-free twin and compares the rendered section bytes.
- **A whole-line cut is not enough on its own, and the review of the fix found both halves.**
  (1) Taking only the note's line leaves the author's blank lines on BOTH sides, so a note
  between two blanks leaves a `\n\n\n` run in the embedded source. That was measured on 16 of
  the 23 decks this repo ships with notes, and it is a CHEAPER tell than the one #1985 closed —
  `grep -c` on the shipped file, no re-render needed. So a note between two blank lines takes one
  of them with it. (2) A comment line is an HTML BLOCK, so deleting it moves the deck: measured
  on the real CLI, `Some text` / `<!-- note -->` / `---` exported 3 slides where the author wrote
  2 (`Some text\n---` is a setext H2), and the `.vtt` bound the author's front-matter caption for
  slide 2 onto the phantom; separately, two paragraphs merged into one with a `<br>`. So a note
  between two lines of TEXT is replaced by a blank line, keeping the boundary. All three cases
  converge on `text\n\ntext`, which is why no shape is left that says a note was here.
- **And the export is fail-closed on fidelity.** Pass 2 renders a different markdown document,
  and no comment in this file can prove markdown-it will agree. So both paths compare the two
  renders ignoring whitespace — whitespace being exactly what pass 2 exists to drop. There are
  TWO candidate cuts and the right one is deck-dependent: a note above a `---` needs a blank line
  left in its place, a note indented inside a list item needs the line simply gone (a blank there
  turns a tight list loose). So both are rendered and the matching one is kept — and the SOURCE
  that ships is the one that was rendered, which review found was not true of the first cut: the
  envelope was scrubbed on an unguarded path, so a fallback shipped authored slides beside a
  restructured source and the "verbatim source for lossless re-import" re-imported as a different
  deck. If neither cut matches (a note at column 0 between two list items, where the comment is
  what splits them), the SLIDES ship as written and the warning says the embedded source will
  differ — because on such a deck no removal preserves the boundary. All 23 shipped noted decks
  take the first cut.
- **The two paths share the CANDIDATE LIST, not just the idea of one.** They are separate
  implementations in separate runtimes — a CJS CLI and a browser TS module — and the first port
  of the measurement to the Studio was a hand-written copy with nothing holding the two together,
  which is the mechanism that produced the divergence in the first place. The one piece they must
  agree on is the ordered candidates, so it is `notesCore.SCRUB_BOUNDARIES` and both read it
  from there. `test/unit/authoring/notes-core.test.js` fails if either caller writes the literal
  out again; `docs/src/components/studio/strip-notes-guard.test.ts` pins the three outcomes
  (preserve wins, drop wins, neither does) — without it, narrowing the loop back to one cut left
  every gate in the tree green, the strip-notes e2e included, because that spec asserts only that
  the note text is gone and that is true on all three.
- **`--strip-captions` carried the same tell for one release, and closing it merged the two
  passes (#2003).** The #1985 fix was note-only: `stripCaptionsFromSource` stayed a span-only
  replace and nothing re-rendered from it, so the caption comment's line was left behind as an
  empty one AND the authored render still went through `stripCommentNodes`. Measured on a
  three-slide deck — one caption, one note, one neither — exported with both flags and diffed
  against a re-render of its own envelope source: the captioned slide differed from its
  neighbours by one byte, and the note channel was clean. `--strip-captions` alone had it too.
  The fix gives the caption strip the same line-aware cut (both now go through one
  `removeCommentSpans` in `notes-core.js`, so the channels cannot drift apart again) and makes
  pass 2 render the composed source the export actually ships — under ONE measured cut for both
  channels, since they scrub one document. Two separately measured cuts would each describe a
  document nothing renders. Pinned by the caption arms of
  `test/integration/export/strip-notes-no-fingerprint.test.js`, against a committed
  caption-free twin.
- **"The two comment classes are disjoint, so the order is free" is HALF a truth, and the half
  it misses reintroduced the fingerprint.** Chaining the strips — scrub notes, then scrub
  captions — is what shipped first. Disjoint BODIES is real (a `caption:` body is never a note
  body) and it is not the whole interaction: once both cuts became line-aware the two channels
  meet through BLANK-LINE ACCOUNTING. The first scrub takes a line and, under `preserve`, may
  leave an empty one, so the second reads neighbours the author never wrote. Measured by an
  independent checker: 350 of 13,122 (source × cut) pairs come out differently depending which
  scrub runs first, and a note comment sitting directly above a caption comment shipped a 1-byte
  residue against the deck written with neither. The fix is `stripChannelsFromSource` — ONE pass
  with a combined predicate, so every comment is judged against the source's own neighbours and
  there is no order left to get wrong. `notes-core.test.js` pins the divergent shape as a guard:
  if chaining ever stops diverging, that test says so rather than passing quietly.
- **What is NOT closed, and is shared with the note channel:** two whole-line comments adjacent
  at the END of the input still leave one blank line under the `preserve` cut, where the
  counterfactual has none. `drop` reproduces it exactly, but both cuts render identically, so
  pass 2's render-equivalence measurement keeps `preserve` (tried first, deliberately — see the
  candidate-list note above). This predates #2003 and reproduces on `--strip-notes` alone with
  two adjacent notes; the residue is invisible to the re-render attack (it renders the same) and
  is not a `\n\n\n` run, so `grep -c` does not see it either. Recorded rather than fixed, because
  the fix is to change which cut wins a tie, and that preference is a decided thing with its own
  rationale.
- **The natural way to trim that residue is an exponential regex, and the input that proves it
  is not the one you would guess.** Dropping what a removed `captions:` block leaves behind reads
  as one regex over the rejoined body — `/(?:[ \t]*(?:\r\n|\r|\n))*$/` — and CodeQL failed the
  PR that shipped it. It has two backtracking behaviors. Polynomial on a long run of spaces with
  no newline (10k 163 ms, 20k 627 ms, 40k 2.5 s, 80k 10 s) is the one you find by reaching for a
  big string. The one that matters is EXPONENTIAL on repetitions of `\r\n`: the alternation is
  ambiguous — `\r\n` matches either as its own branch or as `\r` then `\n` on the next turn of
  the outer `*` — so a failing tail forces a 2^n search. 20 pairs 100 ms, 22 pairs 400 ms, 24
  pairs 1.6 s, i.e. **48 characters for a second and a half**; a hostile deck needs no size at
  all. A regression test written against the SPACES shape passes at any realistic size while the
  exponential bug is live, which is why the arm in `notes-core.test.js` uses `\r\n`. The fix is
  not a cleverer regex: `stripCaptionsFrontMatter` trims the line ARRAY it already has, which is
  linear on both (100k `\r\n` pairs in 99 ms). Same hazard class as the comment matcher's own
  quadratic note at the top of that file — this file has now produced it twice.
- **A scrub that rewrites front matter must scope the rewrite to the block it removed.** The
  first cut of the front-matter half normalized the rebuilt body's tail unconditionally, on the
  belief that `FRONT_MATTER_BLOCK`'s close fence always carries the last body line's terminator
  so `body` can never end with one. It can: the close group is a single `\r?\n---`, so an
  author's BLANK LINE before the fence leaves that newline inside `body`. A deck with **no
  `captions:` key at all** then came back a byte shorter — `themes/palette-audit.md`, shipped
  here, was the measured case — and a deck with an EMPTY front matter lost the whole fence.
  Neither changes the render, so the fidelity guard cannot see either, and the envelope's
  "verbatim source for lossless re-import" quietly was not. A source with no top-level
  `captions:` key now returns byte-identical from an early return, pinned across all 1306 `.md`
  files in the tree.
- **Front matter is part of the caption strip, and therefore part of pass 2's input.**
  `--strip-captions` also drops the top-level `captions:` map, so pass 2 renders a deck with
  different front matter. That is intended — it is why the map's text cannot survive in the
  envelope — and the fidelity guard covers it: the map is not a directive, so the rendered
  sections are unchanged and the two passes agree. A future front-matter key that DOES affect
  the render would show up as a guard fallback, not as a silent difference.

## A `tier:` / `galleryAuthored:` pragma shipped as the speaker note in every format

- **Symptom:** an exemplar deck exports and its presenter-notes field reads
  `"tier: short\n\ntier: standard\n\ntier: full…"`. A slide whose author never wrote a note
  ships one anyway, made of internal build markers — and where the author DID write a note,
  the pragma is prepended to it.
- **Cause:** the engine consumes only its own KNOWN directives; every other `key: value`
  comment survives into the rendered section, and `noteBodiesFromHtml` lifts any surviving
  comment as a speaker note. Lattice's own pragmas are not Marpit's, so the
  `MAGIC_COMMENT_MATCHERS` exclusion set — copied verbatim from Marpit and locked there by a
  parity test — never covered them.
- **Fix:** a separate `LATTICE_PRAGMA_MATCHERS` set beside it, covering `tier:`,
  `galleryAuthored:` and the comment form of the `color-mode:` register. Every matcher is
  VALUE-CONSTRAINED where a prose reading is possible (`tier:` takes only the three tier
  names), because over-stripping is the expensive failure: it eats a real note silently and
  the author has no way to tell what ate it. `lib/authoring/notes-core.js` ›
  `isLatticePragma`.
