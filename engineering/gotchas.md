# Gotchas

Things in this codebase that look wrong but aren't, plus workarounds
whose rationale lives in commit messages and would otherwise be lost.

This is a **living index**. When you hit something surprising — a hack
in the code, a quirk in a dependency, a behavior that took a bisect to
understand — add an entry. Future-you and future-collaborators (human
or LLM) will thank you.

## How to use this file

Read top-to-bottom when something breaks in an unfamiliar way; the
symptoms in the headings are searchable. When fixing or working around
something subtle, add an entry **before** committing the fix so the
commit message can link to it.

Each entry has the same shape:

- **Symptom** — what you'd see if you didn't know about this
- **Cause** — root cause, in one paragraph
- **Mitigation** — what the code does about it (with file:line links)
- **Triggered by** — what flow exercises this path
- **Removable when** — what upstream change would let us delete the
  workaround (often "never", which is fine to say)
- **Commits** — the SHAs that introduced or fixed this

Keep entries terse — one screen each. If something needs a deep dive,
spin out a `engineering/decisions/YYYY-MM-DD-topic.md` and link to it from here.

---

## Charts

### Pie wedge borders off-by-one (`nth-child` vs `<defs>`)

- **Symptom:** A pie wedge's border doesn't match its fill — most
  visibly, the small teal slice rendered a rose/red border, drawing a
  stray red line at the 12-o'clock seam. Every wedge border was actually
  one slot ahead of its fill (blue wedge → orange border, etc.).
- **Cause:** The piechart SVG is `<svg><defs>…gradients…</defs><path
  class="wedge"/>…</svg>`. The `<defs>` block is the SVG's **first
  child**, so the wedge paths are children 2…N+1. Wedge fills are set
  inline per slice (correct), but wedge *borders* were assigned by
  `.wedge:nth-child(6n+k)` — and `nth-child` counts `<defs>` as #1, so
  every wedge picked up the *next* slot's `--catN-ink`. The 5th wedge
  landed on `nth-child(6)` → `--cat6` (rose).
- **Mitigation:** Wedge borders count by `nth-of-type` instead, which
  considers only `<path>` siblings and ignores `<defs>`
  (`lib/components/chart/piechart/piechart.styles.css`). Legend swatches
  keep `nth-child` — their flex container has no leading non-swatch
  sibling.
- **Triggered by:** Any piechart render (the `<defs>` is always emitted
  for the per-wedge radial gradients).
- **Removable when:** Never, while the gradients live in an in-SVG
  `<defs>`. (Moving wedges into a `<g>` wrapper would also fix it.)
- **Commits:** the per-color-mode audit fix.

---

### Chart renders as a thumbnail after an ancestor gains `container-type` (cqh re-basing)

- **Symptom:** A chart that used to fill its slide renders tiny — correct
  proportions, correct chrome, just a fraction of its intended size. Every
  automated gate stays green (the regression goldens were blessed *with* the
  shrunken render, so nothing drifts). Hit the common quadrant
  (default/magic/bubble/trail/threshold): it shrank to ~a third of its size
  and shipped that way in the blessed gallery PDFs.
- **Cause:** `cqi`/`cqh` resolve against the **nearest** `container-type`
  ancestor, so giving any intermediate box size containment silently
  re-bases every container unit below it. The quadrant SVG carried
  `max-height: 50cqh` written when the slide `section` was the only query
  container ("cap at half the slide"). The Form work later made
  `.chart-body` a size container (`chart-family.css` §IN-FORM — needed so
  in-form SVGs can size off the real available area), and the same `50cqh`
  became "half the chart-body" ≈ a sixth of the slide. The cohort variant
  was already on the Form-aware `100cqh` pattern and never shrank — the
  discrepancy between variants is the tell.
- **Mitigation:** The common quadrant now mirrors the pie's in-form pattern
  (`piechart.styles.css` §IN-FORM, `2026-06-15-form-chart-clip.md`): figure
  collapsed with `display:contents`, SVG `height:100cqh` off the chart-body
  (`quadrant.styles.css`). When adding a `container-type` to any wrapper,
  grep the subtree for `cq*` units first — each one's basis just changed.
- **Triggered by:** Adding `container-type` to an element whose descendants
  already use container units sized against a higher container; blessing
  goldens without eyeballing the pages (HARD RULE #23 — a bless is a claim
  you looked).
- **Removable when:** Never — it's how container units scope. The guard is
  the grep habit plus actually looking at re-blessed goldens.
- **Commits:** the quadrant in-form fill fix.

---

### Chart caption swallowed when `_footer` is set

- **Symptom:** A trailing caption paragraph on a chart-frame slide
  (piechart, gantt, radar, timeline-list, …) renders as a raw,
  full-width, body-size `<p>` flush against the slide's **left edge**
  instead of the centred, mono, meta-size `.chart-caption` with its
  hairline. Looks like content "overflowing" the chart. Reproduced on
  the `gallery-jargon.md` donut slide; the per-component galleries
  never tripped it because none pairs a trailing caption with a footer
  on a non-`cover` chart.
- **Cause:** `wrapChartFrame` lifts the caption from the last `<p>` in
  the post-body region with an **end-of-string** anchor
  (`/<p…>(…)<\/p>\s*$/`). A `_footer:` directive makes Marpit append
  `<footer>…</footer>` after the user's paragraph, so the section ends
  `…</p><footer>…</footer>` — the `$` never matches, the caption is
  never lifted into `.chart-caption`, and it survives as a bare
  `<section>`-level paragraph (full content width, left-aligned).
- **Mitigation:** `wrapChartFrame`
  (`lib/components/chart/_chart-family/chart-family.js`) peels a
  trailing `<footer>…</footer>` off before matching the caption, then
  re-appends it so footer order is preserved. The fix is single-source
  — the emulator and runtime bundle the same kernel, so all three
  render paths and all 13 chart-frame layouts are covered by the one
  change.
- **Triggered by:** Any chart-frame slide that has BOTH a trailing
  caption paragraph AND a `_footer` (or deck-level `footer:`) — i.e.
  essentially every real deck slide that wants a caption.
- **Removable when:** Never, while a `_footer` directive can follow the
  caption in the section body.
- **Commits:** the chart caption + footer fix.

---

## Marp / Marpit

### Marp Preview emits `<marp-pre>`, marp-cli emits `<pre is="marp-pre">`

- **Symptom:** A CSS rule scoped to `pre` works in marp-cli HTML output
  but not in VS Code Marp preview.
- **Cause:** The marp-vscode extension's preview path uses a custom
  element `<marp-pre>` for fenced code blocks, while marp-cli renders
  them as `<pre is="marp-pre">` (a plain `<pre>` with an `is` attribute).
  Element-name selectors (`pre`) match the latter but not the former.
- **Mitigation:** Use `:is(pre, marp-pre)` for any rule that needs to
  hit both render paths. Currently applied to the inline-code chip
  reset at [lattice.css:114-120](../dist/lattice.css#L114-L120).
- **Triggered by:** Any fenced code block — including mermaid sources
  before they're upgraded to SVG.
- **Removable when:** marp-vscode unifies on `<pre is="marp-pre">`.
  Unlikely; they use the custom element for their own DOM hooks.
- **Commits:** `17784c2`.

### Marp Core wraps emoji in `<img class="emoji">` (twemoji)

- **Symptom:** A line like `Hello 👋 there!` renders with the wave on
  its own line — heading wraps, card body breaks, footer chrome shifts
  vertically. Affects every text element (header, footer, title, card
  heading, card content, eyebrow, key insight, below-note, etc.).
- **Cause:** Marp Core's built-in emoji plugin rewrites every unicode
  emoji in source markdown to `<img class="emoji" data-marp-twemoji
  src="https://cdn.jsdelivr.net/gh/jdecked/twemoji@…/<cp>.svg">`. That
  img then gets picked up by the catch-all rule
  `section img { …; display:block; max-width:100% }`, which is intended
  for author-inserted figures. Block + 100% width = own line, full slide
  width. The VS Code Marp preview (and any marp-cli-rendered Export-to-Marp
  bundle) hits this; lattice-emulator leaves emoji as raw text (no rewrite) but inherits
  the inline alignment issue when no emoji font is in the stack.
- **Mitigation:** Two parts in [lattice.css](../dist/lattice.css):
  1. Exempt the emoji class from the block image rule — the catch-all
     is now `section img:not(.emoji)`, and `section img.emoji` is set
     to `display:inline-block; height:1em; vertical-align:-0.1em`.
  2. Append `'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'`
     to every `--font-*` stack in `:root` so the lattice-emulator path
     (raw unicode) also has a defined emoji font and doesn't fall back
     to a glyph with wildly different metrics.
- **Triggered by:** Any unicode emoji anywhere in a deck.
- **Removable when:** Never — Marp Core's emoji rewrite is built in
  and on by default. The `:not(.emoji)` carve-out is the correct shape.
- **Commits:** `claude/fix-emoji-rendering-WO4vI`.

### Color emoji needs an installed font on the owned render paths

- **Symptom:** Emoji render as monochrome glyphs or tofu boxes (▯) in
  PDFs produced by `lattice-engine` or `lattice-emulator` on a bare
  host (CI runner, server, a freshly-provisioned desktop WebView) — even
  though they look fine on a Mac/Windows dev machine.
- **Cause:** Unlike the marp-core-based surfaces — the VS Code Marp
  preview and a marp-cli-rendered Export-to-Marp bundle — which rewrite
  emoji to twemoji `<img>` (see the entry above), the **owned paths
  emit emoji as plain unicode text**. Headless Chromium then needs a
  *color* emoji font to be available to render them. The `--font-*`
  stacks name `'Noto Color Emoji'` and `lattice.css` now also loads it
  as a webfont via the Google Fonts `@import`, **but Chromium is
  unreliable about honoring `@font-face` for emoji presentation
  sequences** — it frequently bypasses the webfont and uses the
  platform emoji font. So the webfont is a portable bonus, not a
  guarantee; an *installed* color emoji font is the reliable mechanism.
- **Mitigation:** Install `fonts-noto-color-emoji` (Debian/Ubuntu) in
  every environment that renders Lattice PDFs:
  - **CI** — `.github/workflows/ci.yml`, the integration job's apt step.
  - **Cloud sessions** — `.claude/hooks/session-start.sh` (step 2b).
  - **The SlideWright desktop app** — its WebView/packaging must ship or
    install a color emoji font; the engine alone can't guarantee it.
- **Triggered by:** Any unicode emoji in a deck rendered through
  `lattice-engine` / `lattice-emulator` on a host without a color
  emoji font.
- **Removable when:** Never fully — it's inherent to emitting emoji as
  text. The webfont `@import` and the font installs together are the
  correct shape. (Note: this sandbox's headless Chromium loads **no**
  webfonts at all, so verify emoji rendering relies on the *installed*
  font here, not the `@import`.)
- **See:** `engineering/decisions/2026-06-10-marp-replacement-proposal.md`
  (the twemoji-drop decision).

### Marpit "spot replaces global" for the `class:` directive

- **Symptom:** Adding `class: dark` to front matter does nothing on a
  deck where every slide carries `<!-- _class: foo -->`.
- **Cause:** Marpit's directive spec is documented as "spot replaces
  global." A per-slide `_class:` directive *replaces* the deck-wide
  `class:` value entirely on that slide rather than composing with it.
  In a layout-heavy deck (every slide has a `_class:` for layout
  selection), the deck-wide directive lands on zero sections.
- **Mitigation:** The `deckClassPropagate` markdown-it plugin in
  `lib/integrations/markdown-it/plugins.js` (run by the owned engine)
  reads the front-matter `class:` line directly from source and *appends*
  its tokens to every section. The lattice-emulator front-matter parser
  mirrors this in [lattice-emulator.js](../lattice-emulator.js).
  This intentionally diverges from Marpit's spec.
- **Triggered by:** Any `class: <value>` in deck front matter.
- **Removable when:** Never — Marpit's spec won't change. Could be
  retired if all decks moved to `theme: <name>-dark` or `style:` for
  whole-deck modifiers, but the directive is a real convenience.
- **Commits:** `f9068a7` (plugin), `b502bcc` (emulator parsing).

### Chromium blocks `file://` URLs as `mask-image` sources

- **Symptom:** A CSS rule like `.foo { background: white; mask: url("./asset.svg") center / contain no-repeat; }` works in HTTP-served pages and in dev tools, but the masked element renders completely invisible in headless Chromium loading from `file://` (which is how every lattice-emulator PDF build works).
- **Cause:** Chromium treats each `file://` URL as its own origin and refuses to load mask sources cross-origin, even within `file://`. The same URL works fine as `<img src>` or as `background-image` — only `mask-image` is restricted. No console error; the mask just resolves to fully-transparent.
- **Mitigation:** Don't use `file://` URLs as `mask-image`. Inline the source as a `data:` URL (works), use an inline SVG `<mask>` element reference (works), or do the visual treatment via a different mechanism (`filter`, `mix-blend-mode`, etc.). The custom-logo feature went through three iterations on this: `::before` pseudo with `var(--deck-logo)` mask → real `<img>` with mask → final filter-only approach with no mask, because filter has none of the origin restrictions and works equally well in lattice-emulator, the VS Code Marp preview, exported HTML, and a marp-cli-rendered Export-to-Marp bundle.
- **Triggered by:** Any author writing `mask-image: url("./local.svg")` and building locally.
- **Removable when:** Chromium relaxes the file-origin policy for mask sources. Unlikely.
- **Commits:** This branch (the custom-logo redesign).

### Chromium PDF output of CSS `mask-image` renders inconsistently across viewers

- **Symptom:** A `::before` with `mask: url("data:image/svg+xml,…") center / contain no-repeat` renders correctly in the browser AND in the owned engine's headless-Chromium PDF render, but the resulting PDF, when opened in Apple PDFKit (macOS Preview, iOS), Skia (Chrome's built-in PDF viewer), or PDFium (Edge / VS Code), sometimes drops the mask entirely — the `::before` rectangle appears as a solid tinted block the size of its bounding box, filled with the paint colour, with no shape clipping. Failure is viewer-specific and shape-specific: identical CSS, one mask drops on one viewer and renders fine on another, or the same mask drops only on certain `::before` sizes.
- **Cause:** Chromium emits masks in the vector PDF stream using a combination of soft-mask groups and clip paths that the spec permits but that not every PDF reader implements identically. Apple PDFKit is the strictest — it ignores constructs that Skia/PDFium accept, falling back to the unmasked source rectangle. Has held across multiple Chromium versions; not a regression.
- **Mitigation:**
  - **Cropped `::before` bbox.** Size the `::before` to the shapes' bounding box, not the full slide. When the mask drops, the failure surfaces as a small tinted patch (degradation) rather than a slide-spanning panel of paint (slide-breaking artifact). This is what the orbit-pattern refactor in the treatments library does for the 8 mask-based marks.
  - **Box-shadow stack.** For marks whose geometry is "one shape repeated at evenly-spaced offsets" (e.g. `mark-ticks` — 5 ticks down the right margin), drop the mask entirely and paint via one `::before` plus N `box-shadow` copies. `border-radius` on the `::before` propagates to the shadows, so rounded shapes work (`mark-pills`).
  - **Stacked radial gradients in a slot.** For marks whose geometry is "many small shapes scattered across multiple corners" (e.g. `mark-seeds` — 12 ellipses across all four corners), drop the mask and write to `--_bg-radial` as N stacked `radial-gradient(...)` values. Gradients are native rendering primitives with no mask to drop.
- **Triggered by:** Any `::before` (or `::after`) carrying `mask` / `mask-image` that the author opens in a PDF viewer. The browser preview never reveals this failure mode; only the rendered PDF does. The catalog rebuild on the treatments-rename branch was the forcing function.
- **Removable when:** Apple PDFKit gains parity with Skia/PDFium for the soft-mask constructs Chromium emits. No timeline.
- **Commits:** This branch (treatments rename; the cropped-bbox + box-shadow + gradient-slot escape hatches). See `engineering/treatments.md` → "Mark rendering" for the rendering-mechanism breakdown.

### SVG images in the exported PDF partially render or vanish in iOS Quartz viewers

- **Symptom:** A slide whose photo is an **SVG file** (`![bg](photo.svg)` or an inline `![](photo.svg)`) renders perfectly in poppler (CI rasterization, desktop viewers) but breaks in iOS Safari's built-in PDF viewer and other Quartz-based viewers: the image draws only partially (a top band) or the photo column is dropped entirely, showing bare canvas. Other SVG placements on the same device can draw fine — the failure is construct-specific (clipped/cropped placements), not SVG-wholesale. First observed on-device reviewing the full-coverage gallery (#690).
- **Cause:** Chromium prints an SVG `<img>`/`background-image` into the vector PDF as shading patterns and transparency groups; the clipped/cover placements emit combinations Quartz mishandles (the same viewer-strictness family as the `mask-image` gotcha above). Poppler renders them correctly, which is why single-renderer verification never caught it.
- **Mitigation:** Since #690 landed, **lattice-emulator rasterizes SVG `<img>`/`background-image` references at export time by default** — each unique SVG becomes a 2× PNG twin (a plain image XObject, the universally supported construct) swapped into the loaded page before `page.pdf()`. Inline `<svg>` (Mermaid, charts, logo marks) stays vector. Opt out with `--keep-vector-images` if you need the vector construct and control the viewers. For decks rendered by other paths (marp-cli), prefer raster assets (`.jpg`/`.png` twins), as the baseline gallery does (#681).
- **Triggered by:** Any deck embedding `.svg` images, opened on an iPhone/iPad or macOS Preview — which is exactly where a shared `/gallery.pdf` link gets opened first.
- **Removable when:** Quartz gains parity with poppler/Skia for Chromium's SVG-image print constructs. No timeline; treat SVG-in-PDF as a portability hazard.
- **Commits:** The pdf-export-portability branch (#690); the deck-side raster twins landed in #681.

### Flex-centred caps read high in JetBrains Mono (and `text-box-trim` can't fix it here)

- **Symptom:** A pill/badge laid out as `display:inline-flex; align-items:center; line-height:1` in **JetBrains Mono** looks like its text sits slightly HIGH — more empty space below the glyphs than above — even though the box is centred. Adding `text-box-trim:trim-both; text-box-edge:cap alphabetic` (the spec-correct fix) changes nothing in the rendered PDF.
- **Cause:** `align-items:center` centres the line BOX, but a font's baseline sits asymmetrically inside it — the descender space below the baseline is reserved even for caps/digits that never use it. The magnitude is **font-specific**: JetBrains Mono seats caps badly (caps land ~7px high, mixed-case ~15px high, in a 60px test pill), while the body sans Outfit lands caps ~1px off — imperceptible. `text-box-trim` would trim the box to the cap/baseline edges and fix it for any font, but it shipped unprefixed only in **Chrome 133** (Feb 2025); the puppeteer-cached Chromium that lattice-emulator renders with is **131**, where the property is silently ignored (a `text-box-trim` pill is pixel-identical to one without).
- **Mitigation:** Don't centre small caps labels in JetBrains Mono. The universal pill uses the **body sans** (`--pill-font: var(--font-body)`), whose metrics centre caps correctly with plain symmetric padding — no optical nudge, no `text-box-trim`. This was the fix for the pill family; it also suits a pill better (a status chip is a label, not code). Measured by rasterising caps pills in both fonts and comparing the ink-gap above vs below. If you must centre caps in mono somewhere, either accept the ~7px lean or wait for `text-box-trim`.
- **Triggered by:** Any small flex-centred caps label set in JetBrains Mono.
- **Removable when:** The render Chromium reaches ≥133 — then `text-box-trim:trim-both; text-box-edge:cap alphabetic` becomes the general, font-agnostic fix.
- **Commits:** The universal-pill branch.

### Custom `logo:` front-matter directive shows nothing in marp-vscode preview

- **Symptom:** A deck with `logo: ./acme-logo.svg` in front matter
  builds a correct PDF (logo visible top-right of every slide) and
  appears correctly in exported HTML viewed in a browser, but the
  marp-vscode preview pane shows no logo at all.
- **Cause:** The convenience `logo:` directive is handled by
  `applyDeckLogoToHtml` in `lib/integrations/markdown-it/plugins.js`
  (run by the owned engine) plus the post-render hook in
  [lattice-emulator.js](../lattice-emulator.js) and the runtime
  mirror `applyDeckLogoFromFrontMatter` in
  [lattice-runtime.js](../dist/lattice-runtime.js). The owned-engine and
  emulator paths run at build time; the runtime path fetches the
  source `.md` from the same origin as the rendered HTML. The VS Code
  Marp preview runs marp-core directly, without Lattice's markdown-it
  plugins, so the build-time hook never fires there, AND the runtime's
  `fetch()` can't reach workspace files in
  the `vscode-webview://` sandbox — same limitation
  `applyDeckClassFromFrontMatter` documents at
  [lattice-runtime.js:3463-3465](../dist/lattice-runtime.js#L3463-L3465).
  Net result: no path works in the marp-vscode preview.
- **Mitigation:** None inside marp-vscode preview today. The author
  sees the logo only when they build the PDF or view the exported
  HTML in a browser. Authors who need live-preview validation can
  manually add `<img class="deck-logo" src="…" style="--deck-logo-src:url('…')">`
  as the first child of a single slide for spot-checking.
- **Triggered by:** Any `logo: <path>` in deck front matter when
  authoring inside marp-vscode.
- **Removable when:** marp-vscode adds workspace-config plugin
  loading. Unlikely in the near term.
- **Commits:** This branch.

### Marpit theme prefixer mangles `:is(...)` and `:where(...)` as a leading selector

- **Symptom:** A CSS rule like `:is(section.A, section.B) > p { … }`
  or `:where(.chart-frame) > .chart-status { … }` silently fails when
  applied via Marpit's themeSet, even though the same rule works in
  plain CSS. No build error; the rule just never fires.
- **Cause:** Marpit's prefixer rewrites every theme rule to scope it
  to the slide root, prepending `div#:$p > svg > foreignobject >
  section`. Its pattern only recognises a single leading `section` or
  known type — when the selector starts with `:is(...)` or `:where(...)`,
  the prefixer treats the function as a *descendant* of the slide
  root (`section :is(...)`), producing a selector that matches a
  section nested inside another section (which never exists).
- **FIXED in the owned engine (2026-07-13).** Our browser render path
  (playground / Studio / Player) does NOT use Marp's `<foreignObject>`, so it
  re-scopes every selector under `div.lattice > section` via `packTheme` in
  [lib/engine/css.js](../lib/engine/css.js) — a *mirrored port* of Marpit's
  prefixer, which inherited the **same** leading-`:is()` bug. `packSelector` now
  **distributes** a leading `:is(a, b, …)` before scoping, so each arm scopes by
  its own leftmost combinator (`section.X` → `div.lattice > section.X …`;
  `figure.Y` → `div.lattice > section figure.Y …`). A leading `:is()` is
  therefore SAFE on our engine now; the chart family relies on it (every
  component leads with `:is(section.<comp>, figure.chart-frame)`, the Read·Article
  re-host broadening). Guard: [test/unit/engine/css-scope.test.js](../test/unit/engine/css-scope.test.js).
- **⚠️ The earlier claim here that this was "VS Code Marp preview-only / PDF
  export looks correct" was WRONG, and that false sense of immunity is exactly
  what let it ship.** It ALSO broke our own deployed playground/Studio/Player:
  the mis-scoped rule never applied, a component-local token it defined
  (`--map-base`, quadrant's `--cell-*`, radar's base) stayed undefined, and every
  SVG fill reading it fell to SVG's **black** initial value — the map/quadrant/
  radar "black tiles." (PDF/emulator was genuinely fine: there each `section` IS
  the page, so no `div.lattice > section` re-scoping happens.)
- **Mitigation (only for decks EXPORTED to real marp-cli / VS Code Marp**, which
  still use Marpit's own unpatched prefixer): expand to a comma-separated union
  with the leading `section.X` repeated for each branch —
  `section.A > p, section.B > p { … }`. Note `section:where(:not(.A)…)` is OK —
  the leading combinator is `section`, not `:where()`.
- **Triggered by:** Any theme CSS rule whose first selector is
  `:is(...)` or `:where(...)`, rendered through Marpit's own prefixer
  (our engine now handles it).
- **Removable when:** Marpit's prefixer changes its leading-selector
  detection (the export-to-marp caveat); the owned-engine fix is permanent.
- **Commits:** `434c2f5c` (annotation/below-note expansion), `225cea0`
  (commit body §"Marpit theme-scoper"), `43df18b` (owned-engine `packTheme`
  distribution + regression test).

### Front-matter `style:` directive specificity vs. theme :root

- **Symptom:** Author writes `style: ":root{color-scheme:dark}"` to
  flip the deck dark, but the theme's own `:root { color-scheme: light }`
  wins and the deck stays light.
- **Cause:** Both rules have selector specificity (0,0,1) and are
  scoped identically by Marpit. Source order then decides — and the
  theme CSS often appears AFTER the user's `style:` block in the
  rendered output, so the theme wins.
- **Mitigation:** Theme defaults that are meant to be overridable use
  `:where(:root) { … }` in [themes/cuoio.css:64](../themes/cuoio.css#L64)
  and [themes/indaco.css:58](../themes/indaco.css#L58). `:where()`
  has zero specificity, so any plain `:root` declaration the author
  injects wins regardless of source order.
- **Triggered by:** `style:` directive in deck front matter.
- **Removable when:** Marp guarantees user `style:` content always
  appears after theme CSS (it doesn't, intentionally).
- **Commits:** `6276665`.

### lattice-emulator doesn't auto-load `style:` from front matter

- **Symptom:** Same `style: ":root{…}"` works in the VS Code Marp
  preview but was silently ignored by `lattice-emulator.js`.
- **Cause:** The emulator hand-rolls its front-matter reader (it
  doesn't use markdown-it / Marpit for parse). Until recently it only
  looked for `paginate:`, `header:`, `footer:`, `class:`, and
  `headingDivider:`.
- **Mitigation:** Front-matter reader in
  [lattice-emulator.js:773-792](../lattice-emulator.js#L773-L792)
  now parses both inline (`style: "..."`) and YAML block scalar
  (`style: |`) forms and injects the content into the `<style>` block
  after the theme CSS so author overrides win.
- **Triggered by:** Any `style:` directive in front matter when
  rendering through `lattice-emulator.js`.
- **Removable when:** The emulator switches to a real Marpit/Marp
  engine. Tracked separately.
- **Commits:** `6276665`.

### Rendering in the cloud sandbox needs `CHROME_PATH`

- **Symptom:** Rendering a deck in a Claude Code on Web session fails
  with "No suitable browser found. Please ensure one of the following
  browsers is installed: chrome, edge, firefox." A new session might
  conclude no browser is available and skip rendering entirely.
- **Cause:** The headless-Chromium browser auto-detection (the owned
  engine's Puppeteer launch, and anything marp-cli-based) looks in the
  standard system locations
  (`/usr/bin/google-chrome`, etc.) and doesn't know about the
  puppeteer-cached chromium binary that the sandbox ships with. The
  binary IS present at
  `/root/.cache/puppeteer/chrome/linux-<version>/chrome-linux64/chrome`
  — auto-detection just can't find it on its own.
- **Mitigation:** Set `CHROME_PATH` in the env before rendering. The
  canonical render is the owned emulator:

  ```bash
  CHROME_PATH=$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome | head -1) \
    node dist/lattice-emulator.js <deck>.md <deck>.pdf
  ```

  The integration test helper at
  [test/helpers/render.js](../test/helpers/render.js) inherits
  `process.env`, so the same env var works for tests too. If you
  install marp-cli yourself (`npm install @marp-team/marp-cli`) to
  render an Export-to-Marp bundle — marp-cli is **no longer bundled**
  (P4 retired it as a render path; the owned engine renders every
  first-party path) — the identical `CHROME_PATH` discovery issue
  applies to that `npx marp` invocation.
- **Triggered by:** Any render (owned emulator, or an ad-hoc marp-cli
  invocation) in a fresh cloud-sandbox session.
- **Removable when:** The launcher adds puppeteer-cache discovery, or
  the sandbox ships chromium at one of the canonical system paths.
- **Commits:** documentation-only — captured here so future sessions
  don't conclude no browser is available.

### A rendered PDF shows serif/fallback type, not the design fonts

- **Symptom:** A committed deck PDF (e.g. `examples/sketch.pdf`) opens
  with serif headings and a plain sans body — none of the design's
  Playfair/Outfit, or under `sketch` none of the Caveat/Shantell hand
  type. It looks the same no matter where you open the PDF.
- **Cause:** Fonts are embedded into a PDF **at render time**, never
  fetched when viewed. The engine loads its faces from a Google-Fonts
  `<link>`/`@import`, which needs the network. A render with no network
  — the pre-commit PDF rebuild offline — silently embeds a system
  fallback instead. In the **cloud sandbox** specifically the network is
  present but a **TLS-intercepting (MITM) proxy** sits in front of CDNs,
  so the webfont fetch fails the certificate check and falls back the
  same way — i.e. "the sandbox has network" does not mean CDN webfonts
  resolve. The page-count tests don't catch it (font
  swaps don't change slide count), so the broken PDF ships green. The
  trap: "open it on a networked device and the fonts resolve" is FALSE
  — a fallback-font PDF is fallback forever.
- **Fix:** `lattice-emulator.js` base64-injects the self-hosted woff2 in
  `assets/fonts/` (Caveat, Shantell Sans, Outfit) as an inline
  `@font-face` block that wins over the `@import`, and waits on
  `document.fonts` before `page.pdf()`. So the repo's own renders embed
  the real type offline. `assets/` is excluded from the npm tarball, so
  the shipped bin still uses Google fonts for end users.
- **Coverage:** the whole engine stack is self-hosted — Playfair Display
  (incl. italics), Outfit, JetBrains Mono, Caveat, Shantell Sans — so a
  network-less render embeds every face. To add a weight/family, drop its woff2
  into `assets/fonts/`, add a row to `SELF_HOSTED_FACES`, **and** vendor it for
  the web-export path too (`docs/src/playground/font-embed.js` + its `./fonts/`).
  The `fonts:check` gate (`tools/check-fonts.js`, run by `build:check` and
  pre-commit) enforces that the `@import` demand and both offline supplies stay
  in lockstep — half-update one and the build fails.
- **Verify the right way:** check the *rendered pixels* (rasterize a
  page), not `pdffonts`/`get_fonts()` — a subset-embedded face often
  reports an empty name and reads as "missing" when it's actually there.

### A false "Overflows" ring appears on the exported `.html` sidecar for a slide that actually fits

- **Symptom:** a deck's exported `.pdf` renders fine and `lattice-emulator.js`'s
  own console warning names the right pages — but opening the alongside
  `.html` sidecar in a plain browser shows a red inset ring (and, for the
  live-preview runtime, an "OVERFLOWS" tab) on a slide that isn't actually in
  that warning list. It doesn't self-correct on its own; resizing the browser
  window does clear it.
- **Cause:** a font-loading race, not a measurement bug. Marp's template
  lazy-loads a `@font-face` only when the browser first tries to PAINT text
  using it — so `document.fonts.ready` can resolve "loaded" for the page
  overall before a specific slide's own text has actually triggered its
  font's fetch. The exported `.html`'s embedded overflow-watcher script used
  to measure on `DOMContentLoaded` with no font-forcing step at all, so a
  borderline slide (content within a few px of the frame) could get measured
  against a wider/taller FALLBACK-font layout and cross the 12px tolerance —
  a false positive that then never re-measures (the embedded script only
  re-checks on `window resize`). `measureOverflow()` (the pass that generates
  the actual PDF-export console warning) was never affected — it already
  force-loads every declared font before its first measurement, which is why
  the two disagreed. The live-preview runtime (`lib/runtime/index.js`) had
  the identical gap on its very first paint, though its continuous
  mutation-triggered re-checks usually self-correct within a keystroke.
- **Fix:** both watchers now force every declared font to `load()` and await
  `document.fonts.ready` (bounded by a timeout — a hung fetch must not
  suppress the ring forever either) before their first measurement, via a
  shared, unit-tested `lib/core/font-settle.js` helper. Watch the exact
  form: `document.fonts` is iterable (`.forEach`/`.size`) but NOT array-like
  (no `.length`) — `Array.prototype.map.call(document.fonts, fn)` silently
  loops ZERO times and never calls `fn`, no error, no warning. The first cut
  of this fix shipped exactly that bug (caught by a pre-merge adversarial
  review, not CI — nothing in the test suite exercised the real
  `FontFaceSet` shape). Use `fontSet.forEach(...)` or `[...fontSet].map(...)`
  (spread), never any bare `Array.prototype` method called on the set
  itself. See `engineering/decisions/2026-07-10-overflow-cause-highlighting.md`
  §14-15 and issue #894.
- **Verify the right way:** don't compare Puppeteer's numbers against a
  DIFFERENT automation library's numbers (Playwright vs. Puppeteer can
  render the SAME Chrome binary's fonts slightly differently depending on
  what each has settled by the time you measure) — that's a red herring.
  Compare the SAME tool's measurement before vs. after an explicit
  `document.fonts.load()` + `document.fonts.ready` wait on the SAME page.

### Exported fluid viewer: an overflowing slide shows NO marker tab, or the red author ring leaks to a reader

- **Symptom:** in the opt-in `--fluid` viewer, either (a) a genuinely over-dense
  slide shows the ring but **no** "More below" reader cue / tab, or (b) the
  **author's loud red** overflow ring + "OVERFLOWS" banner appears to a *reader* —
  specifically in the viewer's FIXED state (an ultrawide default, or after
  toggling Fluid: off) — instead of the calm reader cue.
- **Cause:** two separate traps, both specific to the exported viewer (neither
  reproduces in the live author preview).
  - **(a)** the export STAMPS `.overflow` at build time (the emulator's measured
    pass), so on a pre-stamped slide the runtime watcher's class never **flips** —
    and the tab-add used to live inside the `classList.contains('overflow') !== over`
    flip guard, so it never fired. A build-baked slide got a ring but no tab.
  - **(b)** the reader restyle (drop the red ring → calm cue) was gated on
    `:root[data-lattice-view="fluid"]`, which is only set while FILLING. The
    watcher runs for the whole capable export, so in the fixed state the reader
    gate was inert and the **ungated** author red ring (`base.modifiers.css`) won.
- **Fix:** (a) track the tab on the measured `over` state **independent of the
  class flip** — add when `over && !tab`, remove when `!over && tab` (presence-
  guarded, so the mutation loop still settles). (b) Gate reader-facing viewer
  styling on `:root[data-lattice-fluid-capable]` — the export-viewer marker, set in
  BOTH fill and fixed states — NOT `data-lattice-view="fluid"`; the author preview
  has no capable marker, so it keeps the red ring. Both caught by maker-checker,
  not CI (no committed test exercises the fluid viewer yet — #1138). See
  `lib/runtime/index.js` `startOverflowWatcher`, `lib/base/base.fluid-view.css`,
  `engineering/decisions/2026-07-20-adaptive-viewport-fill.md`.

### A committed render golden doesn't match a fresh render — check staleness FIRST

- **Symptom:** a committed gallery golden
  (`lib/components/**/*.gallery.{light,dark}.pdf`, or any committed PDF) diffs
  against a fresh render — text-heavy pages show a few percent of changed pixels,
  even at `compare -fuzz 3%`. Two fresh renders in the *same* session are
  pixel-identical (AE=0), so it is not session noise, and fuzz/blur can't
  tolerate it away.
- **Do NOT conclude the renderer is non-deterministic.** Self-hosted fonts
  (`assets/fonts/`, embedded by `lattice-emulator.js`) + pinned Chromium make
  cross-session renders deterministic *by design* (the P4 §7.1 spike measured 0px
  drift). A cross-*artifact* diff is almost always a **stale golden**, not jitter.
  Relitigating a de-risked design (CI-blessed goldens / an AA-tolerant comparator
  / dropping pixel-gating) before excluding staleness is the wasted-cycle trap
  this entry exists to stop.
- **Diagnose the boring cause first, in this order:**
  1. `pdffonts <committed-golden>` vs `pdffonts <fresh-render>` — **different
     embedded font subsets ⇒ the golden was blessed before a font change** (e.g.
     #226 added Outfit 300/500/600 + Shantell 500). That alone explains a
     text-only pixel delta.
  2. `git log -1 -- <golden>` vs the history of `assets/fonts/`,
     `lib/base/base.tokens.css` (the `@import`), and `lattice.css` — if the
     golden's commit predates a font/CSS change, it is stale.
  3. Confirm determinism is intact: render the same deck twice → AE=0; render
     against the golden's **exact** tree (`git show <golden-commit>:dist/lattice.css`
     …) — if it *still* differs, the delta is environmental (fonts/assets), not
     CSS. That is the self-hosted-font story, not non-determinism.
- **Fix:** re-bless — rebuild + commit the goldens (`node tools/build-galleries.js
  [--only <name>]` + `node tools/build-bucket-galleries.js`). Confirm
  `npm run regress` is green first (fresh render == the committed golden).
  Re-blessing changes exported PDFs (font embedding), so per the
  QUALITY BAR show before/after (dark + light) for sign-off. See
  `engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md` §9.
- **The one real exception — cross-*machine* mermaid AA (not stale, not same-machine).**
  Determinism is 0px cross-*session* on one machine class, but **fine mmdc-SVG
  vector/text is not bit-identical across machine *classes***. A golden blessed
  in the cloud sandbox drifts ~0.4–0.5% on a GitHub CI runner — below
  human-visible, but it tripped the regression gate's 0.05% floor on the
  `diagram` bucket on its first CI run. Fonts, Chromium, and CSS were all
  verified identical; the residue is sub-pixel anti-aliasing of fine vectors.
  **This is why `tools/regression-gate.mjs` gives the chart + diagram (mermaid)
  buckets a wider `FAIL_FRACTION_MERMAID` (1%) while flat galleries keep 0.05%.**
  If a *flat* gallery diffs, it's still a stale golden (diagnose as above); only
  fine mermaid content has this cross-machine floor.
- **Lesson:** a stale artifact is not a broken renderer. Exclude the boring cause
  before relitigating a settled design decision.

### A manifest slot's `selector` describes AUTHORING input — a transform may consume it

- **Symptom:** the semantic-invariant suite
  (`test/integration/invariants/component-invariants.test.js`) reports a required
  slot's selector resolving to **0** elements in the rendered DOM, for a component
  that clearly renders fine — e.g. `funnel`'s `stages: "ul > li"`, `glossary`'s
  `entries: "ul > li"`, `compare-code`'s `left: "section > h3 + pre"`.
- **Cause:** `<name>.manifest.json` `slots[].selector` documents the **authoring
  contract** (the markdown you *write*), not the rendered output. For
  CSS-styled components the authored markup survives (`cards-grid`'s `ul > li`
  becomes the cards), so the selector matches the rendered DOM. But **transforming
  components consume their input**: a chart's `ul > li` becomes a `.chart-body`
  SVG/HTML frame, `glossary`'s list becomes a `<table>`, `compare-code`'s fences
  become code panels. The authored selector is gone from the render.
- **Fix:** those components live in the `TRANSFORM` set
  (`component-invariants.layer3.js`); layer-1's slot check is skipped for them and
  layer-3 asserts the **rendered** contract instead. Add a new transforming
  component to that set + give it a layer-3 entry.
- **Also:** manifest selectors are written against the slide `<section>` *root*, so
  a leading `section` IS that element — the suite normalises it to `:scope` per
  comma-group. A bare `section > p, section > ul` queried unscoped leaks its second
  clause and false-fails. (And note `roadmap`/`state-chart` pass layer-1 only by
  tag-shape luck — `roadmap`'s `horizons` modifier transposes its `<table>` away.)
- **Lesson:** "the slot selector doesn't match the render" usually means the slot
  documents *input*, not *output* — not that the component is broken.

### Charts export black/unstyled from the Studio / Drawing Board image PDF or PPTX

- **Symptom:** A deck exported through the browser's one-click image PDF (or PPTX) renders every CSS-only slide perfectly, but SVG **chart** slides come out corrupted: radar/pie shapes solid black, gradient fills gone, the chart drawn at the wrong scale, axis/label text huge and overlapping in default black. The same deck renders the charts perfectly in the live preview AND through lattice-emulator.
- **Cause:** html-to-image (the export rasterizer's clone step) inlines computed styles onto **HTMLElements only** — nested `SVGElement`s keep just their classes/attributes. Chart styling lives in the stylesheet (`chart-family.css`) and gradient `<stop>`s carry raw `var()` expressions, so the serialized clone loses all of it: unspecified `fill` paints SVG-default black, unresolvable `var()` stops go black, the CSS-sized root (viewBox, no width/height attributes) rescales, and label font-sizes vanish. Mermaid/function-plot survive because they embed their own `<style>` **inside** the svg, which `cloneNode` keeps.
- **Mitigation:** `flattenChartSvgs` (drawing-board-export.js `sectionsOf`) bakes every stylesheet-styled chart `<svg>` in the capture frame with `flattenSvgStyles` — the "download chart as SVG" kernel (`standalone-svg.js`): computed paint/text inlined, gradient stops probe-resolved to literal rgb — and pins the root's layout box. Skips svgs that carry their own `<style>`. If you add a NEW way for deck content to depend on document-level CSS from inside an `<svg>` (or a new svg-emitting component), it must either self-style or be covered by this flatten; the `chart-export` e2e journey pins the mechanism. For any export-pipeline change, eyeball `test/fixtures/export-coverage-deck.md` through the real Share → PDF (see `engineering/visual-review.md` § The export surface).
- **Triggered by:** Any stylesheet-styled inline `<svg>` (the chart family) in a deck exported via the browser image pipeline. Found exporting the jargon gallery on an iPhone — masked until the export-crash fix (#709) let large decks finish; pre-existing all along.
- **Removable when:** html-to-image inlines computed styles for SVGElements too (upstream), or the capture pipeline is replaced by something that carries the document stylesheet.
- **Commits:** The chart-flatten branch (#715); mechanism regression-pinned by `docs/e2e/journeys/chart-export.spec.ts` (verified to fail on the pre-fix build).

### Drawing Board PDF/PPTX export shows fallback type on some slides

- **Symptom:** A deck exported from the docs-site Drawing Board (Export →
  PDF or PowerPoint) renders *most* type correctly but a face drops to a
  system fallback on a subset of slides — classically, a `finish: sketch`
  deck keeps its Caveat headings but the Shantell Sans **body** goes clean
  Outfit. The live preview looks right; only the exported file is wrong.
  This is the **web-export** twin of the offline-font fallback gotcha
  above ("A rendered PDF shows serif/fallback type") — same symptom,
  different render path and fix.
- **Cause:** The image exporters (`docs/src/playground/drawing-board-
  export.js`) rasterize every slide through `html-to-image`, including
  off-screen ones they force-visible mid-loop. Marp's template lazy-loads
  each web-font face only when the *active* slide needs it, and the export
  awaited `document.fonts.ready` **once**, up front — before those
  off-screen slides requested their faces. A face first needed by an
  off-screen slide hadn't finished loading from Google Fonts when its slide
  rasterized, so that slide baked in a fallback. Headings survived only
  because a bookend slide was active at export time. Letting
  `html-to-image` chase the cross-origin Google-Fonts `@import` itself is
  also unreliable (its `cssRules` read is CORS-blocked).
- **Fix:** `docs/src/playground/font-embed.js` vendors every engine text
  face (latin subset, in `docs/src/playground/fonts/`), builds **one**
  data-URI `@font-face` sheet, and hands it to every `html-to-image` call
  as `fontEmbedCSS` — so each rasterized slide is self-contained, no
  network, no race. It also injects the faces into the preview doc and
  awaits them so the cloned nodes lay out with real metrics. The module is
  lazy-`import()`ed (its `.woff2` imports aren't Node-loadable, which would
  break the export module's unit tests). Covers PDF + PPTX (shared
  rasterizer); the vector `Print` path renders through the browser's own
  engine and was never affected.
- **Verify the right way:** rasterize a body slide of an exported sketch
  deck and read the pixels — `pdffonts` is useless here (the export is an
  *image* PDF; text is baked into PNGs, not embedded as PDF fonts).
- **Note:** This is docs-export-scoped. The published engine and its
  Google-Fonts `@import` are unchanged; npm consumers load from Google.

### Drawing Board / playground LIVE PREVIEW shows hand-body decks in a system sans

- **Symptom:** A `finish: sketch` deck in the docs-site live preview shows
  hand-drawn *headings* but a clean-sans *body* (and clean eyebrows, pills,
  bullets) — it looks like "only headings are styled." It is the same
  fallback-asymmetry as the export, but visible on screen, before any export.
- **Cause:** The preview renders each slide into an `srcdoc` iframe whose
  `<style>` is `frame-CSS + theme-CSS` concatenated. The engine's Google-Fonts
  `@import` rides at the top of the theme CSS, but once it's concatenated
  **after** the frame rules it is no longer the first rule in the sheet — and
  **CSS silently ignores an `@import` that isn't first.** So the iframe
  registers *none* of its own webfonts; it renders only the faces the **parent
  docs page** already loaded into the shared same-origin font cache
  (Playfair/Outfit/JetBrains, from `styles/landing.css`). The docs UI never
  loads Caveat/Shantell, so the sketch faces are simply absent in the iframe —
  headings fall to the system hand font in the `--sketch-font-display` stack
  (`'Bradley Hand', cursive`) and so still *look* hand, while body falls to
  `system-ui, sans-serif` and looks clean. The split is a fallback artifact, not
  a missing CSS rule: the token re-pointing (`--font-body` → Shantell) is
  correct and reaches every element; the font just wasn't loaded.
- **Diagnosis tip:** In the iframe, `document.fonts` will list KaTeX faces but
  **not** Caveat/Shantell/Outfit/Playfair, and `document.fonts.load("16px
  'Shantell Sans'")` resolves to `0 face(s)` — proof the face isn't registered.
  `document.fonts.check(...)` is a trap here: it returns `true` for an
  unregistered family (it reports the system fallback as "ready").
- **Fix:** Register the vendored faces in the iframe directly. The Drawing Board
  passes a `@font-face` block (built from `previewFontFaceCss()`, referencing the
  bundled woff2 by URL) through `data.previewFontCss` into `writeFrame`'s srcdoc;
  `single-slide-render.ts` (hero / restyle / field-card islands / specimens)
  lazy-imports the same builder.
  The faces are now genuinely present in the iframe regardless of the inert
  `@import` or what the parent loaded.

### marp-cli ignores `theme:` front matter unless the theme is registered (Export-to-Marp bundles)

- **Symptom:** A recipient renders an Export-to-Marp bundle with
  marp-cli and the deck specifies `theme: mustard` (or any other named
  theme), but the marp-cli PDF render comes out with white background,
  black text, and no palette tokens — looks like dark mode is broken,
  or like the theme silently failed. The same deck rendered through the
  owned engine (`lattice-emulator.js`) looks fine.
- **Cause:** marp-cli only resolves theme names to files registered in
  its `themeSet` (or passed via `--theme-set`). If the theme file isn't
  registered, marp-cli falls back to no theme — every color token
  (`--bg`, `--text-body`, etc.) is undefined and the defaults render as
  browser defaults. The owned-engine path doesn't have this problem:
  theme registration is handled by the engine's ThemeStore
  (`lib/engine/themes.js`), which loads `lattice.css` (which `@import`s
  the theme via the palette positional argument) directly.
- **Mitigation:** The `lib/core/marp-bundle.js` exporter emits an
  Export-to-Marp bundle that registers every bundled theme so a
  recipient's marp-cli render resolves the named theme. A bundle that
  ships a new theme must register it the same way, or the recipient's
  marp-cli won't find it.
- **Triggered by:** A recipient rendering an Export-to-Marp bundle
  whose front-matter `theme:` names a theme marp-cli can't resolve.
- **Removable when:** marp-cli supports theme auto-discovery from a
  directory glob.
- **Commits:** `3fa0462`, `6aad1e6`.

---

## Mermaid

### Playground: Mermaid (and all DOM transforms) stop rendering after the first edit

- **Symptom:** In the docs playground, add a ```mermaid fence and nothing
  renders — the source stays a code block. `window.mermaid` is loaded and there
  are no console errors. Charts/badges added after the first render also fail.
- **Cause (two compounding bugs):**
  1. `writeFrame` rebuilt the preview with `document.open()/write()/close()`,
     which clears the *document* but reuses the iframe *window*.
     `lattice-runtime.js` is one IIFE guarded by
     `globalScope.__llMermaidBootstrapLoaded` (set once per window); the starter
     render set it, so every later render short-circuited the whole runtime.
  2. `runAllContentTransforms()` called `transformStripHeadingPeriods` /
     `transformAddHeadingPeriods` / `applyGlossaryListTable` /
     `applyGlossaryRangePills`, and bootstrap called `startObserver` — undefined
     leftovers from the registry migration (`690835d`). The first threw a
     ReferenceError that aborted the pass *before* `wrapFences()`. (Masked until
     bug #1 was fixed, since the guard meant bootstrap rarely re-ran.)
- **Mitigation:** Playground `writeFrame` uses `iframe.srcdoc` (fresh browsing
  context per render → guard resets). Dead calls removed (heading periods are a
  render-time markdown-it concern; glossary likewise); `startObserver()`
  replaced with the Mermaid-fence `MutationObserver` it was meant to be (wired
  to `scheduleRun`). Rebuild `dist/lattice-runtime.js`.
- **Applies to:** any embedder reusing one iframe via `document.write`. The
  landing's live showcase (`index.astro`) already uses `srcdoc` for this reason.

### The preview `<iframe>` — trap catalog (read this first: surfaces × workarounds)

Every live preview is a **same-origin, un-sandboxed `srcdoc` iframe** — load-bearing
for export fidelity + the untrusted-content security boundary (why:
`engineering/decisions/2026-07-02-preview-iframe-vs-shadow-dom.md`). It charges a
recurring "tax": a class of **iOS-Safari / WebKit-only** bugs that **headless
Chromium — every CI gate — cannot reproduce** (it handles `foreignObject`, delivers
iframe touch, and re-resolves `cqi` under `zoom`; real iOS does none of these). So
"CI green" is NOT verification of preview behavior on a device (HARD RULE #23). This
is the index; each row points to its detailed entry below.

**The preview builders** (`SANCTIONED_PREVIEW_BUILDERS`, `tools/check-ownership.js`):
`deck-preview.js` (Playground + Drawing Board filmstrip — scales each `<section>`),
`single-slide-render.ts` (Studio — scales the iframe ELEMENT), `presenter-window.js`
(Present), `drawing-board-practice.js` / `drawing-board-focus.js` (rehearsal/focus).
Non-browser render paths (the emulator/PDF export, VS Code marp preview) have their
own traps, flagged where relevant.

**A. Scaling & layout — the fixed-1280×720-box tax**

| Trap | Surfaces | Workaround |
|---|---|---|
| Section collapses (`container-type:size` won't size from contents) → cqi/cqh layouts render tiny + jump | all scaled | `slideBox` pins `width/height` before FIT scales (§ "Playground math … renders tiny") |
| **`cqi`/`cqh` COLLAPSE under CSS `zoom` on iOS** (poster → fragment, text → one word/line) | any scaled | **NEVER `zoom` — keep `transform: scale()`** (§ "Preview slides collapse … CSS `zoom`"; decision doc `2026-07-02-preview-scale-zoom.md`, REJECTED) |
| `:root` cqi tokens don't relocate onto `section` on mobile WebKit → spacing collapses | engine playground | delegate CSS packing to marp-core (§ "collapses on mobile WebKit") |
| Scaled `foreignObject` breaks CSS counters / cqi / mask (WebKit) → "00", overlaps, dropped marks | any `inlineSVG` path | render `inlineSVG:false` plain sections (§ "renders broken in mobile Safari/WebKit") |
| 4K decks render oversized / cropped | docs-site, VS Code | `GEOM` globals + fixed-box FIT scale (§ "4K decks oversized"; "Mermaid HD in 4K") |
| **Pane-splitter drag over the preview** — the iframe swallows `pointermove` mid-drag, and every drag frame that resizes the iframe re-runs the FIT agent per section (a 60Hz reflow storm on large decks); a pane expanded from a 0-width collapse hits the FIT bail like the mobile-tab reveal | Playground + Studio (`ui/split.tsx`) | `setPointerCapture` on the handle (`lostpointercapture` = authoritative end-of-drag) + `[data-split-dragging] iframe { pointer-events: none }` belt; the parent calls `__latticeFitSuspend()` during drag and `__latticeFitResume()` (one fit) on release; expands re-fit via the proven reveal path + `onFrameLoad`; renders DEFER while the preview is collapsed (decision `2026-07-02-resizable-editor-preview-panes.md`) |

**B. Interaction — touch / tap / scroll (iOS Safari)**

| Trap | Surfaces | Workaround |
|---|---|---|
| iOS won't deliver a touch **INTO** a transform-scaled iframe | any scaled | **parent-hosted capture surface** + `elementsFromPoint` mapping (undo scale with math, not event delivery) — `debug-overlay.js`; decision `2026-07-01-debug-bounding-boxes.md` |
| `position:fixed` doesn't track an iframe's **internal** scroll on iOS → overlay strands | filmstrip | `position:absolute` at **document coordinates** (`getBoundingClientRect + scrollY`) so it scrolls with content |
| Tapping an in-slide external `<a href>` **navigates the frame → blank** (frame-blocked site) | filmstrip (Playground + Drawing Board) | preview-only **link guard** (`linkGuardAgent`) opens `http(s)` taps in a real top-level tab (§ "Tapping an in-slide link blanks") |
| Preview won't scroll after opening a modal sheet on iOS | Playground | make preview-side sheets **non-modal** (§ "won't scroll after … settings sheet") |
| Focusing a **sub-16px text control auto-zooms the whole page** on iOS | any standalone page | global coarse-pointer ≥16px net in `landing.css` + per-CodeMirror-theme bump (§ "Tapping an input zooms the page on iOS") |

**C. Document / realm / content — the #22 boundary**

| Trap | Surfaces | Workaround |
|---|---|---|
| **Live iframe embeds (video playback, arbitrary HTML) are stripped from slide HTML** | all | `sanitizeSlideHtml` `FORBID_TAGS` (`iframe`/`object`/`embed`) + the DSL gate — **BY DESIGN** (HARD RULE #22). You can NEVER put a live embed inside a slide. **To play video anyway → mount the player in the PARENT, over the poster** (`docs/src/playground/video-overlay.js`, `createVideoOverlay`): the in-iframe link guard calls `window.__videoPlay(poster)`, the parent builds an **allow-listed** provider embed (`embedSrc` — nocookie URL from the parsed video id ONLY, never the raw href) and positions a real `<iframe>` player over the poster's mapped rect. Sidesteps #22 (player isn't slide HTML → never sanitized), the iOS scaled-iframe touch trap (player is unscaled parent DOM — works over the scaled filmstrip, no unscaled-Present surface needed), and nested-iframe (no embed inside the srcdoc). Export keeps the static poster. Same parent-hosted pattern as debug-overlay / chart-interact. |
| `@font-face` `@import` order in the srcdoc drops the vendored sketch faces | Drawing Board | register the vendored faces in the iframe directly (§ "shows hand-body decks in a system sans") |
| Reusing one iframe via `document.write` strands window state | any embedder | use `iframe.srcdoc` (a fresh browsing context per write) |
| A new preview builder that skips `sanitizeSlideHtml` | all | run it before injecting (gate: § "not a sanctioned preview builder") |

**D. Staleness / loading** — previews 404 the engine CSS/runtime, or serve a STALE
200 bundle: re-stage/rebuild (§§ "previews 404 on the engine"; "serves a STALE
engine bundle"). A committed golden mismatch → check staleness FIRST (§ that entry).

**The meta-lesson:** the sandbox's engine (headless Chromium) is precisely the one
engine that can't surface most of the above. Drive the **real** surface on the
**real** device; when iOS can't be reached from here, say so and mark it UNVERIFIED —
never turn "passed in headless" into "works on iOS."

### Playground renders broken in mobile Safari/WebKit (counters "00", chart text overlaps, marks drop)

- **Symptom:** On the live docs playground (`/lattice/playground/`) in mobile
  Safari / iOS / any WebKit browser: numbered components (`list principles`,
  `list-criteria`) show `00` for every counter instead of `01 02 03…`; charts
  (`state-chart` etc.) render with giant labels overlapping each other; SVG
  state marks (checklist/verdict-grid/obligation-matrix discs) lose their
  in-disc symbol or show as a clipped half-shape. The SAME deck renders
  perfectly in Chrome, in the exported PDF, in the per-component gallery
  baselines, and in marp-vscode. CI is green throughout.
- **Cause:** Marp's default `inlineSVG` wraps every slide in
  `<svg><foreignObject><section>…` (this is *why* Marp ships a Safari
  `marpit-svg-polyfill`). WebKit cannot reliably lay out HTML inside a *scaled*
  `<foreignObject>`, and the engine leans on exactly the features that degrade
  there: CSS counters (style containment from `container-type` makes WebKit
  drop the increment → value 0 → `decimal-leading-zero` renders "00"),
  container-query units (`container-type` / `cqi` / `cqh` can't resolve a
  container size inside the foreignObject → fall back to the ICB → labels
  balloon and overlap), and CSS `mask` (the `var(--state-mark)` masks on the
  state discs drop). Crucially, **every Lattice regression gate renders via
  headless Chromium** (puppeteer), which handles foreignObject natively, so the
  whole WebKit failure class is invisible to `npm test` / the integration tier.
  The deployed assets being byte-identical to `main` (verify with `md5sum`
  against the live `playground/themes/lattice.css`, `lattice-runtime.js`,
  `lattice-playground.js`) is the tell that it's a render-context bug, not
  staleness.
- **Mitigation:** The playground engine (`lib/playground/index.js`) renders
  with `inlineSVG: false`, so slides are plain `<div class="lattice"><section>`
  HTML with no foreignObject; `writeFrame` in `docs/src/pages/playground.astro`
  scales each fixed-size `<section>` to the iframe width with a CSS `transform`
  (a negative `margin-bottom` collapses the gap the un-scaled box would leave),
  re-fitting on resize + content-height change. The Safari foreignObject
  polyfill is removed (nothing left to polyfill). The PDF/emulator path KEEPS
  `inlineSVG` — fixed-page rendering needs it, and it renders server-side via
  Chromium so it never hit this. Rebuild the bundle: `npm run playground:build`.
- **Triggered by:** Any new component that relies on `container-type`/`cqi`,
  CSS counters, or `mask` — i.e. nearly all of them. The fix is structural (no
  foreignObject) rather than per-feature, so new components inherit it.
- **Removable when:** WebKit gains reliable layout for HTML in a scaled SVG
  `<foreignObject>`. No timeline; don't count on it.

### lattice-engine: deck looks fine on desktop but collapses on mobile WebKit (no `:root` token relocation)

- **Symptom:** A deck rendered through the owned engine on mobile Safari/iOS:
  spacing collapses (cards/list rows overlap with ~0 gap),
  `list-criteria`/`list principles` counters vanish, title/KPI slides don't centre
  with breathing room. The SAME engine output renders perfectly in headless
  Chromium and on desktop WebKit. Looks like the foreignObject WebKit class above,
  but the engine already renders `inlineSVG:false` plain sections — so that's not it.
- **Cause:** Lattice declares its cqi spacing/radius scale on `:root`
  (`dist/lattice.css` `:root { --sp-md:1.875cqi; … }`). A `cqi` unit resolves
  against the element's nearest `container-type` ancestor; `:root` has none, so
  it falls back to the viewport. Marpit's theme `pack()` quietly rewrites every
  theme `:root` selector onto the slide `section` (the `container-type:size`
  query container) — so on the marp path the tokens resolve against the SLIDE.
  The engine's first clean CSS emitter (P1.1) inlined `@import 'lattice'` with no
  selector rewrite, leaving the tokens trapped on `:root`. Desktop Chromium
  re-resolves cqi at the use-site so it looks fine; mobile WebKit does not, and
  every `--sp-*` collapses toward 0 (counters sized in `cqh` of a now-zero-height
  row disappear). **Headless-Chromium gates can't see this** — same blind spot as
  the entry above.
- **Fix (the reliable one):** the playground's lattice-engine path
  (`lib/playground/index.js render()`) keeps the engine's owned HTML but
  **delegates CSS theme-packing to marp-core's packer** — pairing the owned HTML
  with marp's exact, mobile-WebKit-correct stylesheet, byte-identical to the
  default path. The engine's own emitter (`composeCss`) was the suspect, and
  relocating its `:root` token blocks onto `:where(section)` (`rootToSection`)
  made the CSS *closer* to marp's, but that change alone is **not** the
  mechanism — real desktop WebKit renders both placements identically, so the
  iOS-only divergence was never localized to a single rule. Emitting marp's CSS
  verbatim sidesteps the whole question. Reimplementing a mobile-correct owned
  packer (so the engine drops the marp-core CSS dependency) is tracked as P5.
- **Why headless gates miss it:** every regression gate renders via headless
  Chromium; the divergence only manifests on real iOS Safari, and even
  Playwright's Linux WebKit does not reproduce it. The only true test is an iOS
  device. Rebuild after touching the engine CSS path: `npm run playground:build`.
- **Triggered by:** Any theme that declares cqi-valued custom properties on
  `:root` — i.e. all of them.

### Playground math (and any cqi/cqh layout) renders tiny + "jumps/rescales"

- **Symptom:** In the docs playground, `math` variants — especially
  `matrix` and `compare` — render shrunk to an unreadable size and visibly
  jump/rescale a few times after the slide first appears. `math stats`
  looks fine. Same source renders correctly in the PDF gallery and on the
  component-page specimens.
- **Cause:** The playground engine renders `inlineSVG:false` (no
  `<svg><foreignObject>` wrapper — see the WebKit entry above), so the
  bare `<section>` must get its box from the host page. But
  `dist/lattice.css` sets `section{container-type:size}`, and **size
  containment refuses to size the box from its contents** — without an
  explicit width/height the section collapses (height→0) and every
  `cqi`/`cqh` the layouts rely on resolves against a broken box. KaTeX-heavy
  variants overflow, and because the KaTeX stylesheet streams in from the
  CDN async, each pass of the `FIT` routine (60/300/1200/2500 ms + every
  ResizeObserver tick) measures a *different* `section.offsetWidth` and
  recomputes `scale(w/sw)` — hence the jumping + tiny render. `stats`
  survives because it's content-light and mostly `em`-driven. This is NOT a
  math-layout bug; the CSS contract and the PDFs are correct.
- **Mitigation:** `docs/src/playground/frame-css.js` is the SINGLE SOURCE OF
  TRUTH for the `.lattice>section{width:1280px;height:720px}` pin (`SLIDE_BOX`)
  and the single-slide wrapper (`SINGLE_SLIDE_FRAME` / `singleSlideFrame(geom)`).
  All `inlineSVG:false` hosts import it — `single-slide-render.ts` (the shared
  hero / restyle / field-card / specimen renderer) calls `singleSlideFrame(geom)`
  directly, `playground.astro` (playground) through the page's JSON data channel
  — so `container-type:size` always gets a definite box and
  the playground `FIT` is deterministic at `scale(w/1280)`. The three used to
  inline the dimensions independently and drifted (the hero pinned the wrapper
  but not `>section`; the playground pinned neither) — which is how this bug
  entered. Any new `inlineSVG:false` host must import from `frame-css.js`, not
  re-type the dimensions.
- **Triggered by:** A new playground/specimen host that renders
  `inlineSVG:false` without importing `frame-css.js`, or any layout leaning on
  `cqi`/`cqh` for sizing.

### Mermaid's color parser rejects `light-dark()`

- **Symptom:** `[pageerror] Unsupported color format:
  "light-dark(#FAF7F2, #15110D)"`. Mermaid bootstrap halts; mermaid
  blocks stay in `data-mermaid-state="pending"` showing source code.
- **Cause:** When `lattice-runtime.js` reads palette tokens via
  `getComputedStyle().getPropertyValue('--bg')`, it gets the *raw
  token stream*, not the resolved color. After the light-dark() refactor,
  surface tokens are stored as `light-dark(<light>, <dark>)`. Mermaid's
  color parser only accepts hex / rgb / hsl / named colors and throws
  on the function form.
- **Mitigation:** `buildMermaidThemeVars` in `lattice-runtime.js`
  attaches a hidden probe element to the scope section, sets its `color`
  to `var(--token)`, and reads back `getComputedStyle(probe).color`.
  Browsers DO resolve `light-dark()` (and `color-mix()`) on real color
  properties — only the custom-property accessor returns unresolved tokens.
  If the probe still returns `rgba(0,0,0,0)` (older Chromium that doesn't
  support `light-dark()`), `vc()` now manually parses the raw token and
  picks the correct arm based on the section's `colorScheme`.
- **Triggered by:** Any palette using `light-dark()` for surface
  tokens — currently cuoio and indaco.
- **Removable when:** Mermaid's color parser supports `light-dark()`.
  Unlikely soon.
- **Commits:** `5e47ff3` (probe approach), theme-cleanup commit (fallback parser).

### Mermaid kanban applies a lighten step to cScale

- **Symptom:** Categorical colors in kanban swimlane headers come out
  too pale; configured cScale values look nothing like the rendered
  result.
- **Cause:** Mermaid's kanban renderer internally lightens the cScale
  inputs by ~10-15 lightness points before painting swimlane headers.
- **Mitigation:** The cat-* tokens in [themes/indaco.css:286-294](../themes/indaco.css#L286-L294)
  are pinned at L≈60 specifically so kanban's lighten step lands at
  L≈70 (where dark text reads cleanly). Mindmap and other diagrams
  that read cScale directly get a CSS override in the per-diagram
  Mermaid CSS section to use the pale-band tints instead. See
  [engineering/mermaid.md](./mermaid.md).
- **Triggered by:** Kanban diagrams.
- **Removable when:** Mermaid exposes a per-diagram cScale that
  bypasses the lighten step.
- **Commits:** Original palette commit; mindmap override now lives in
  `lattice.css`'s DIAGRAM OVERRIDES section.

### Mermaid timeline + journey are tile-stack, not card-on-band

- **Symptom (the trap):** Side-by-side with kanban (which has `--bg-alt`
  tickets visibly lifted off band-tinted lanes), a timeline or journey
  looks "flat" or "uncoloured." Tempting to apply the same `--bg-alt`
  inner-card rule to fix the inconsistency. **It does not work** — the
  inner cards become indistinguishable from the white slide canvas
  because there is no band underneath them.
- **Cause:** Kanban tickets physically sit *inside* a `<g class="cluster
  section-N">` whose `<rect>` is painted with `--cN-light`. The
  `--bg-alt` card-on-tinted-lane reading is real. Timeline and journey
  do NOT have this structure: the period/section header is a single
  small `--cN-light` rect at the *top* of a column, and the tasks/events
  stack *below* it on the slide canvas (`--bg` white). `--bg-alt` on
  `--bg` is virtually invisible (#F2F5FA on #FFFFFF in indaco), so the
  cards disappear.
- **Mitigation:** Timeline events and journey tasks keep the
  `.section-N rect/path { fill: --cN-light }` rule and inherit their
  period/section's pale tint. `--c-stroke` provides the card outline
  against the canvas. If a pale tint reads too pale against the canvas
  in a given palette, the right fix is to deepen the slot itself, not
  to introduce a structural override that doesn't apply.
- **Triggered by:** Mistaking syntactic nesting (event-in-period in
  Mermaid source) for visual nesting (card-on-tinted-surface in the
  rendered SVG).
- **Removable when:** Mermaid restructures timeline/journey to render
  a band-tinted column behind each period's task/event stack. Not on
  the roadmap.
- **Commits:** Initial misapplication + audit + revert; see
  `engineering/decisions/2026-05-12-diagram-elevation.md`.

### ~~Mermaid's `%%{init}%%` directive is intolerant of CSS comments~~ (RESOLVED)

- **Status:** No longer applicable as of 2026-05-12. Lattice no longer
  uses Mermaid's `themeCSS` init parameter; per-diagram CSS lives in
  `lattice.css`'s DIAGRAM OVERRIDES section and reaches the inline SVG
  via the host page cascade. CSS comments and the `>` child combinator
  are both safe to use again.
- **Historical context:** Mermaid's `%%{init}%%` JSON parser silently
  dropped `themeCSS` payloads containing `/* … */` comments, and
  similarly rejected the `>` combinator. Both restrictions are gone
  with the new architecture.
- **See:** `engineering/decisions/2026-05-12-diagram-tokens.md`.

### Mermaid frontmatter must be FIRST; `%%{init}%%` injection comes after

- **Symptom:** Mermaid renders without our themeVariables even though we
  appear to be passing them.
- **Cause:** Mermaid requires the frontmatter (`---\n…\n---\n`) to be
  the very first thing in the diagram source. Naive prepending of a
  `%%{init}%%` directive breaks frontmatter detection.
- **Mitigation:** `lattice-emulator.js:renderMermaid` detects an opening
  frontmatter block and injects the `%%{init}%%` AFTER the closing
  `---\n` rather than at the top.
- **Triggered by:** Mermaid sources that include a `title:` or
  `displayMode:` frontmatter block.
- **Removable when:** Never — this is correct per Mermaid's spec.
- **Commits:** Original mermaid renderer commit.

### Mermaid `mermaid.run()` is async; restoration logic must wait

- **Symptom:** A loop that runs synchronously after `mermaid.run()`
  sees diagrams with `data-processed="true"` but no SVG yet. If that
  loop "restores" the source text on empty containers, it overwrites
  in-flight renders, so SVGs disappear and source text reappears.
- **Cause:** `mermaid.run()` sets `data-processed` synchronously then
  starts SVG generation asynchronously (~500ms for complex diagrams).
  Mermaid clears the container's `innerHTML` *before* injecting SVG
  to avoid stale content collisions. So during the render window:
  data-processed=true + innerHTML empty + no svg yet — looks like a
  failure to a synchronous observer.
- **Mitigation:** [lattice-runtime.js](../dist/lattice-runtime.js) wraps
  any post-render restoration in `Promise.resolve(_runPromise).then()`
  so the loop only fires after the render promise resolves. Per-fence
  `mermaid.render` with try/catch is the structurally cleaner pattern
  (see commit `c57366bf`).
- **Triggered by:** Anything that walks `[data-processed]` immediately
  after calling `mermaid.run()`.
- **Removable when:** Never — Mermaid's render is async by design.
- **Commits:** `8677868d`, `c57366bf`, `7079e65c`.

### Mermaid's built-in error renderer breaks slide layout

- **Symptom:** A diagram with a parser error renders an SVG with the
  error icon/text appearing in the upper-right corner of the slide,
  far from the diagram's actual position.
- **Cause:** Mermaid's built-in error renderer emits an SVG with a
  hardcoded `viewBox="0 0 2412 512"` — designed for a full-page web
  context, not a fixed-height slide. The icon sits at `x=1440`. Inside
  Marp's `foreignObject` slot, the SVG height resolves to `0/auto`
  and content overflows visually.
- **Mitigation:** [lattice-runtime.js](../dist/lattice-runtime.js) sets
  `suppressErrorRendering: true` in `mermaid.initialize()`, then saves
  raw source as `data-ll-source` before `mermaid.run()` clears
  innerHTML. A post-run loop restores `textContent` on any
  `[data-processed]` element that ended up with no SVG, so the
  `:not(:has(svg))` CSS fallback shows the broken diagram source as a
  styled code block instead of the chrome-breaking error SVG.
- **Triggered by:** Any mermaid diagram with a parser error.
- **Removable when:** Mermaid's error renderer respects container
  geometry.
- **Commits:** `12fd6804`.

### Mermaid `themeVariables` must come from a `<section>`, not `:root`

- **Symptom:** `buildMermaidThemeVars()` reads CSS custom properties
  from `document.documentElement` and gets empty strings for every
  theme token. Mermaid falls back to its yellow/orange built-in
  defaults; preview shows wrong cluster colors and broken cScale.
- **Cause:** Marp scopes theme custom properties to `<section>`
  elements, not `:root` / `<html>`. The themeSet rules become
  `div#:$p > svg > foreignobject > section { --bg: …; }`, never
  `:root { --bg: …; }`. Reading from `documentElement` returns the
  unset value (empty string).
- **Mitigation:** `buildMermaidThemeVars` in
  [lattice-runtime.js:31](../dist/lattice-runtime.js#L31) reads from
  `document.querySelector('section') ?? document.documentElement`. A
  sentinel-color guard before `mermaid.initialize()` retries until
  the stylesheet has applied (the first tick can fire before
  paint).
- **Triggered by:** Any deck through Marp preview where the JS reads
  theme tokens.
- **Removable when:** Marpit hoists theme variables to `:root`.
- **Commits:** `f7f6558c`, `7079e65c`.

### `:where(:root)` token blocks are dropped from every rendered slide

- **Symptom:** Tokens declared in a `:where(:root) { … }` block are
  `getComputedStyle(section).getPropertyValue(...)` → `""` (undefined)
  on any Marpit-scoped surface (the VS Code Marp preview, and the PDF
  export of a marp-cli-rendered Export-to-Marp bundle), even though a
  sibling plain `:root { … }` block works. A no-fallback consumer like `color:
  var(--on-dark-secondary)` then inherits whatever the cascade gives
  (dark body ink), so title/closing/divider eyebrows + subtitles and
  every split-* dark panel go invisible — on every theme except the
  one that locally redefines the token (cuoio masked this for the
  whole `--on-dark-*` ramp). The emulator path is immune: it injects
  the bundle into a global `<style>` with no scoping, so `:where(:root)`
  matches the real `<html>` — which is why the committed (emulator-built)
  gallery PDFs looked fine and the bug only showed in PDF export /
  desktop.
- **Cause:** Same Marpit scoping engine as the entry above, but the
  `:where()` wrapper defeats the root-replacement. Marpit rewrites a
  **bare** `:root` (or `section`) to target the slide `<section>`
  directly. Wrapped in `:where()`, it is treated as an ordinary
  selector and the slide path is PREFIXED as a descendant:
  `:where(:root)` → `… > section :where(:where(section):not([root]))`
  and `:where(section)` → `… > section :where(section)`. Both mean "a
  section nested inside a section", which never exists in Marp, so the
  block matches nothing.
- **Mitigation:** Declare universal token defaults in a **plain
  `:root`** block (see `lib/base/base.tokens.css` `--on-dark-*` / hljs
  ramp). A palette's own `:root` override is the identical selector at
  equal specificity and loads after the base bundle (themes
  `@import 'lattice'` first), so source order — not zero-specificity
  `:where()` — resolves "any palette override wins". Do NOT reach for
  `:where(:root)`/`:where(section)` to get low specificity; neither
  scopes.
- **Triggered by:** Any token-defining block authored as
  `:where(:root)` (or `:where(section)`) in the bundle.
- **Removable when:** Marpit applies root-replacement inside `:where()`.
- **Commits:** _(this fix)_.

### Mermaid had `layout: 'tidy-tree'` — silent diagram loss

- **Symptom:** Specific diagram types (state, ER, class) showed as
  `data-processed="true"` but had no SVG content. Other diagrams
  (flowchart, sequence) rendered fine.
- **Cause:** Earlier code passed `layout: 'tidy-tree'` to
  `mermaid.initialize()`. Mermaid 11.x recognizes only `'dagre'`
  (built-in) and `'elk'` (separate package) — any other value throws
  `Unknown layout algorithm` mid-render. With `suppressErrorRendering:
  true`, the throw is swallowed; the diagram stays "processed" but
  empty.
- **Mitigation:** Removed the bogus option. Each diagram now picks its
  native layout. **Lesson:** when adding Mermaid options, every value
  must be from the official list; "looks plausible" silently kills
  diagrams.
- **Triggered by:** Mermaid options outside the documented enum.
- **Removable when:** N/A (anti-pattern, don't reintroduce).
- **Commits:** `c57366bf`.

### `mmdc` / Puppeteer flakes intermittently on cold starts

- **Symptom:** First mermaid diagram in a build run fails with
  "browser startup race" or empty SVG output; subsequent diagrams
  succeed.
- **Cause:** Mermaid CLI uses Puppeteer to rasterize diagrams.
  Puppeteer has known startup races, especially under contention
  (parallel CI, tight resource limits) and when fetching CDN-hosted
  icon sets for architecture/c4 diagrams.
- **Mitigation:** [lattice-emulator.js:683-707](../lattice-emulator.js#L683-L707)
  retries up to 3 times with a 1s backoff between attempts. Each
  attempt is fully isolated (stale outputs deleted between tries).
- **Triggered by:** Cold builds, slow networks, contended hosts.
- **Removable when:** Puppeteer / mmdc release without the race.
  Realistically: never; retries are cheap.
- **Commits:** Original renderer commit.

---

## VS Code / marp-vscode

### The VS Code Marp preview runs marp-core directly, without Lattice's markdown-it plugins

- **Symptom:** Lattice's authoring plugins (e.g., `splitPanelCounter`,
  `verdictGridBadges`, `deckClassPropagate`) work in the owned engine
  and the lattice-emulator pipeline but never fire in the VS Code Marp
  preview.
- **Cause:** marp-vscode 3.5.1 has no `markdown.marp.engine` setting.
  It loads themes via `markdown.marp.themes` but uses the bare Marp
  Core engine for rendering. There is no extension point for engine
  plugins from the workspace, so the preview never runs Lattice's
  `lib/integrations/markdown-it/plugins.js`.
- **Mitigation:** Behaviors that need to fire in VS Code preview must
  be mirrored as DOM transforms in
  [lattice-runtime.js](../dist/lattice-runtime.js) (loaded into the
  preview via `<script src="../lattice-runtime.js">` at the end of
  every deck). Maintained as a separate code path; see the
  comments above each `transform*()` function.
- **Triggered by:** Any deck opened in VS Code Marp preview.
- **Removable when:** marp-vscode adds engine config support.
- **Commits:** Original `lattice-runtime.js` design.

### Known preview gaps — transforms shipped without a `lattice-runtime.js` mirror

Since `engineering/workflow.md`'s Two-renderer rule was demoted to opt-in
(2026-07-09, `engineering/decisions/2026-07-09-marp-legacy-audit.md` §5(a)),
a new transform is not required to get a `lattice-runtime.js` DOM mirror —
only add one when an author actually needs it to look right in the VS Code
preview. Nothing automated catches the case where a mirror *would* have been
worth adding and nobody did it, so this register is the discipline-only
substitute: **when you ship a transform engine-only and know it won't render
correctly (or will render differently) in the VS Code preview, add one line
below.** Nothing enforces this — an empty table means either "no known gaps"
or "nobody's logged one," and there's no way to tell which from the table
alone. Don't read empty as reassurance; the real backstop is the calendar,
not this list: the audit doc §5(b) re-evaluates whether marp-vscode is still
worth supporting as a live-preview surface at a fixed 90-day mark regardless
of how many rows are here.

| Transform | Symptom in VS Code preview | Added |
|---|---|---|
| — none logged yet — | | |

- **Removable when:** never fully — it's a living list, not a one-time
  migration. Individual rows retire if the underlying transform is dropped
  or a mirror is later added for it.

### `git worktree` doesn't share `node_modules`

- **Symptom:** Inspecting a historical commit via
  `git worktree add ../inspect <sha>` and opening the deck in
  preview, mermaid never renders. The same commit checked out in
  the main directory works fine.
- **Cause:** Worktrees share `.git` but not working files. `node_modules/`
  isn't tracked, so the worktree has no installed deps. The script
  tag `<script src="../node_modules/mermaid/...">` 404s.
- **Mitigation:** Mermaid is now vendored at the repo root as
  `mermaid-v11.min.js` and committed. Worktrees and fresh clones see
  it at the right relative path without `npm install`. See
  [engineering/decisions/2026-04-30-mermaid-theming.md](decisions/2026-04-30-mermaid-theming.md)
  for the full rationale.
- **Triggered by:** Any worktree or clone where `npm install` hasn't
  been run; any deck not under `examples/`.
- **Removable when:** Never — worktrees are designed not to share
  build deps.
- **Commits:** `8607e65`.

### marp-vscode webview CSP blocks `<script>` — structural transforms must use the engine render hook

- **Symptom:** A DOM transform authored in `lattice-runtime.js` (or any
  `<script src="...">` tag in the markdown) works in PDF export and the
  browser but never fires in VS Code Marp preview. The slide HTML looks
  correct in the build output but wrong in preview.
- **Cause:** marp-vscode loads preview content in a sandboxed webview with
  a strict Content Security Policy that disallows script execution. Even
  with `enableHtml: true`, relative `<script src="...">` paths do not
  resolve reliably inside the webview context.
- **Mitigation:** Structural DOM transforms (split panels, chart-family)
  are implemented as HTML-string rewrites in `lib/core/split-panels.js` and
  `lib/components/chart/_chart-family/chart-family.js`, run at render time
  by the owned engine (wired through `lib/integrations/markdown-it/plugins.js`).
  Because they run at build time — before the webview CSP applies — the
  HTML is baked correctly before any preview displays it. `lattice-runtime.js`
  DOM transforms remain as a fallback for the web-export path only.
- **Triggered by:** Any new structural transform that needs to work in the
  VS Code Marp preview.
- **Removable when:** marp-vscode lifts its CSP for trusted workspace
  scripts. No indication this is planned.
- **Commits:** Split-panel feature commit.

### marp-cli timeouts under load (60-90s on small fixtures)

- **Symptom:** Rendering an Export-to-Marp bundle with `npx marp ...`
  runs for >60s on a fixture with two slides and times out.
- **Cause:** marp-cli fetches Google Fonts on cold starts (the
  Playfair / Outfit / JetBrains-Mono imports we use). Slow network or
  DNS resolution makes this multiply. The lattice-emulator pre-emits
  the font links the same way but doesn't block on them at render time
  (and self-hosts the woff2 for offline renders — see the offline-font
  entry above), so the owned engine doesn't hit this.
- **Mitigation:** Run with longer timeouts (`timeout 90`) when testing a
  marp-cli render. For a deterministic owned-engine render, the fonts are
  already vendored and inlined.
- **Triggered by:** Cold marp-cli runs against an Export-to-Marp bundle,
  slow networks.
- **Removable when:** N/A for the owned engine (fonts already vendored);
  inherent to marp-cli's CDN font fetch.
- **Commits:** Observed in dev; not yet addressed.

### VS Code's built-in PDF preview hue-shifts our gradients (pink/magenta)

- **Symptom:** A chart-frame's accent-tinted gradient header (or any
  CSS gradient using `color-mix(in oklab, …)` and `transparent` stops)
  reads pink/magenta in VS Code's built-in PDF preview, in both light
  and dark mode. Same PDF in Chrome / Firefox / macOS Preview /
  Acrobat looks correct (blue-tinted).
- **Cause:** VS Code's built-in preview is PDF.js. PDFs don't carry
  CSS — Chromium resolves gradients at print time to PDF shading
  objects (Type 2/3 axial-radial, plus soft-mask groups when stops
  are transparent). PDF.js implements those operators in pure
  JavaScript with no native color management. Wide-gamut color spaces
  (oklab, p3) and alpha across shading boundaries hit known gaps —
  the bytes get sRGB-misread and produce hue shifts. We're not doing
  anything wrong; we're using standards-compliant CSS that produces
  a standards-compliant PDF a behind-the-spec viewer can't render.
- **Mitigation:** Don't review in VS Code's built-in preview. Open
  the PDF in Chrome, install the "vscode-pdf" extension (different
  renderer), or use the marp-vscode preview pane for visual checks
  (CLAUDE.md's documented inner loop). The chart-frame's lucent-strip
  gradient was retired for design reasons (treatments are opt-in via
  the universal `tint-*` / `mark-*` modifiers); that incidentally
  removed one source of the symptom, but other gradients in the
  codebase (`--spectrum`, `.below-note::before`, the `tint-*`
  treatments themselves) keep exercising the same PDF.js gap.
- **Triggered by:** Any CSS gradient that uses `color-mix(in oklab,
  …)` or `transparent` stops. Affects only PDF.js-based viewers.
- **Removable when:** PDF.js gains real color-management and improves
  shading + transparency rendering. Don't hold your breath.
- **Commits:** `39e3351` (chart-header refactor that incidentally
  removed one source).

---

## Browser engine (Chromium quirks observed in Marp Preview / Puppeteer)

### RETIRED (2026-07-10) — `:not(:has(...))` / `:is(:has(...))` were believed unreliable inside Marp's webview Chromium

- **Original claim:** a selector like `p:not(:has(+ h2))` silently
  misfired in the VS Code Marp preview, and `p:is(:has(+ h1), :has(+ h2))
  > code` matched but silently dropped specific property declarations.
  Both were attributed to a Chromium engine quirk in the "Marp for VS
  Code" extension's bundled webview browser, and gated project-wide via
  HARD RULE #12 (`checkThemeHasSelectors` in `tools/check-ownership.js`,
  scoped to `themes/*.css`).
- **Why retired:** re-tested empirically against a real, current Chromium
  build (131.0.6778.204 — the same one `lattice-emulator.js`/CLI/docs
  playground render with) — both forms behaved exactly per spec, 5/5
  test cases. No corroborating Chromium bug report was found anywhere.
  The gate's own "Removable when: verified across all Marp/Electron
  versions" condition had never actually been checked since the rule was
  written. See `engineering/decisions/2026-07-10-hard-rule-12-retirement.md`
  for the test artifact and full reasoning.
- **If this resurfaces:** it's possible an old/unpatched VS Code install
  still carries the bug even though current ones don't — if you see a
  `:has()`-related selector silently misbehave specifically in the vscode
  Marp preview and nowhere else, that's the symptom to look for. The fix
  pattern that worked before (now undocumented as a live constraint,
  kept here for reference): for `:not(:has(X))`, restructure as an
  ordering/specificity decision (declare overrides after bases, or
  enumerate cases explicitly) rather than negating; for
  `:is(:has(A), :has(B))`, expand to a top-level comma list —
  `:has(A), :has(B)` — which is exactly equivalent CSS.
- **Commits:** `e0fe9b1d`, `5a98bc66` (original mitigations, both now
  historical).

### Marp / Chromium `foreignObject` creates anonymous grid items

- **Symptom:** A grid container inside a section places its children
  in unexpected rows. Inline `<code>` or text adjacent to a block
  child (like `<ul>`) wraps to the next row instead of staying on
  the title line.
- **Cause:** Marp wraps each slide in `<svg><foreignObject>`. Inside
  that foreignObject, Chromium creates separate **anonymous** grid
  items for each inline element when a block child is present in the
  same parent. Anonymous items are auto-placed and don't share rows
  with their siblings the way they would in a normal HTML context.
- **Mitigation:** Use **explicit** grid placement: pin the inline
  element with `grid-column: N; grid-row: N`. The block child then
  spans `grid-column: 1 / -1` for full width on the next row.
- **Triggered by:** Any layout that mixes inline + block children
  inside a grid container.
- **Removable when:** Chromium changes its anonymous-grid-item
  behavior in foreignObject (don't bet on it).
- **Commits:** `b8fecac2`.

### Sub-pixel rounding diverges across Chromium platforms

- **Symptom:** A layout with `calc()` expressions mixing units
  (`calc(50% - 4px)`, `calc(50vw - 1em)`) renders slightly differently
  on Chromium-on-Windows vs. Chromium-on-Linux/macOS. Sometimes a
  pseudo-element gets clipped; sometimes a hairline shifts by a pixel.
- **Cause:** Mixed-unit `calc()` values can resolve to fractional
  pixel coordinates. Different Chromium build targets round
  differently at the rasterization stage.
- **Mitigation:** Avoid mixed units in geometry-critical `calc()`.
  When pattern fills are involved, use a tile size that's a power of
  2 (or at least an integer that divides evenly into the slide
  dimensions) so the tile origin always lands on integer pixels. See
  the rhombic-cell pattern at `--lattice-pattern` (`80×80` SVG).
- **Triggered by:** Layouts with sub-pixel `calc()` results, especially
  those with background patterns or hairline rules.
- **Removable when:** Never reliably — keep sizes integer-friendly.
- **Commits:** `263269dc` (image layout simplification).

### MutationObserver fires on its own writes (self-triggering loop)

- **Symptom:** A debounced render runs twice per change instead of
  once. The second run's restoration loop overwrites the first run's
  in-flight render. SVGs flicker and sometimes vanish.
- **Cause:** `MutationObserver(callback).observe(body, { subtree: true,
  childList: true, characterData: true, attributes: true })` fires on
  ANY DOM change inside `body` — including the writes the callback
  itself makes. If the callback adds or replaces nodes, the observer
  re-fires.
- **Mitigation:** **Narrow the observer** to just the mutations you
  actually need. For mermaid bootstrap that means matching only code
  fence additions (`pre > code.language-mermaid`,
  `marp-pre > code.language-mermaid`) — childList only, not attributes
  or characterData. **Drop `characterData: true`** unless you genuinely
  need text-content updates; SVG text creation during Mermaid render
  fires it constantly.
- **Triggered by:** Any broadly-scoped MutationObserver.
- **Removable when:** Never — observer scope is always a tradeoff.
- **Commits:** `f347baf8`, `997a5726`.

---

## Memory profiling (perf-torture / CDP)

### A CDP/DevTools memory profile shows a "leak" that vanishes off-inspector

- **Symptom** — `perf-torture` (or any HeapProfiler-based measure) reports a rising
  retained heap — often realm scaffolding (`NativeContext` / `FunctionTemplateInfo`)
  — that a real user's browser never actually accumulates. (The Playground
  light/dark toggle read **361 KB/lap** this way; the truth was ~16 KB/toggle.)
- **Cause** — the verdict trends `JSHeapUsedSize` after `HeapProfiler.collectGarbage`,
  a V8 GC that does **not** force Blink's detached-context disposal. A detached iframe
  REALM stays counted across the CDP GC even though a real idle GC reclaims it. The
  retainer walk bottoming out at native `V8PerContextData` / `gin::ContextHolder`
  Global handles does **not** distinguish "pinned forever" from "detached, awaiting
  reclamation." Tell: retainedHeap RISING while `documents`/`frames` are flat.
- **Mitigation** — re-measure WITHOUT a heap client:
  `performance.measureUserAgentSpecificMemory()` (own GC; needs COOP:same-origin +
  COEP:credentialless → `crossOriginIsolated`). baseline → drive N× → measure →
  idle ~30 s → measure; recovers on idle ⇒ reclaimable, not a leak. perf-torture flags
  realm-class growth `⚠ … UNCONFIRMED` and points here (`tools/perf-torture/README.md`
  §Limits; the realm-class gate in `engine.mjs` `realmClassGrowth`).
- **Triggered by** — any theme/mode change or navigation that rewrites an iframe
  `srcdoc` (mints a fresh realm), measured under CDP.
- **Removable when** — never; it's inherent to HeapProfiler vs. real GC. Confirm off-CDP.
- **Commits** — `3d59f1dc` (retraction), `af37dd64` (gate). Deep dive:
  `engineering/decisions/2026-07-20-playground-theme-toggle-not-a-leak.md`.

### A heap retainer walk names `<DevTools console>` / `ScriptStateProtectingContext` as the holder

- **Symptom** — `--retainers` (or a DevTools retainer path) reports the holder of a
  leaked object as `<DevTools console>` or `blink::ScriptStateProtectingContext`, not
  an app structure — so you can't name the real culprit.
- **Cause** — the inspector retains console-logged / `evaluate`-returned references, so
  a nearest-GC-root BFS lands on the inspector's own refs when they outrank the real
  app holder. The retainer graph is inspector-contaminated for *naming*.
- **Mitigation** — use the right tool for the leak class. For a LISTENER leak, don't
  walk the heap: patch `EventTarget.prototype.add/removeEventListener` via
  `page.evaluateOnNewDocument`, tally net `(type @ target)` + first add-site, drive the
  cycle, report net-positive keys. (Magnitude caveat: add-*calls* over-count vs. live
  listeners — the browser dedups identical, transient targets GC; trust the
  `JSEventListeners` counter for size.)
- **Triggered by** — any Puppeteer/CDP-driven heap-snapshot retainer walk.
- **Removable when** — never while measuring through an attached inspector.
- **Commits** — `6a6b8c28`. Deep dive:
  `engineering/decisions/2026-07-21-studio-compose-listener-leak.md`.

### perf-torture says `RISING` but memory isn't leaking (JIT warmup)

- **Symptom** — a cycle's `retainedHeap`/`peakHeap`/`heapTotal` reads `RISING` at low
  `--k`, but it's not a real leak.
- **Cause** — V8 JIT warmup: the growers are `code:system/*`
  (`FeedbackVector` / `BytecodeArray` / `TrustedByteArray` / instruction streams),
  which accumulate as hot paths tier up and then plateau.
- **Mitigation** — confirm at `--k 40`: a warmup's Sen slope **decays** (often goes
  negative) vs. k=15 → plateau, not a leak. Trust the non-`code` signals
  (`JSEventListeners`, `nodes`) judged against the flat idle control, not the raw heap.
- **Triggered by** — any short (`--k ≤ ~15`) run over a JIT-heavy path (editor toggles,
  full re-renders).
- **Removable when** — never; inherent to short-run heap measurement.
- **Commits** — `6a6b8c28`. Example:
  `engineering/decisions/2026-07-21-studio-compose-listener-leak.md` (compose/insert).

---

## CSS

### `margin` corrupts measured layout (virtual lists, the Fit Spine) — HARD RULE #20

- **Symptom:** A measuring layout places boxes wrong — rows in a virtualised /
  windowed list overlap or leave gaps, the Fit Spine's collapse/shed/split fires at
  the wrong height, two stacked elements sit closer together than their declared
  spacing, or a measured slide's content height comes back short. The CSS "looks
  right," and a static screenshot can look fine, but anything that *reads* an
  element's box gets the wrong number.
- **Cause:** `margin` lives *outside* the border box. `getBoundingClientRect()` and
  `offsetHeight` report the border box, so they **do not include margin** — code that
  sums measured heights to position the next element silently loses every margin. On
  top of that, adjacent vertical margins **collapse** into one (the larger wins, not
  the sum), and a parent can collapse its child's margin through itself — so even the
  visual gap isn't the number you wrote. Both effects make `margin` un-measurable, and
  un-measurable spacing is poison to any layout that computes positions from sizes.
- **Mitigation:** Don't use `margin` for spacing in engine CSS. Put space *inside* a
  box with `padding`, and *between* flex/grid children with `gap` — both are part of
  the border box / the container's own geometry, so they measure cleanly and never
  collapse. `checkMarginDiscipline` in `tools/check-ownership.js` (HARD RULE #20)
  enforces a layout budget of **0** plus the enumerated `SANCTIONED_MARGINS` allowlist,
  hard-failing `build:check` on any unsanctioned margin (and on a *stale* sanction, so the
  list can't rot); a bare `margin: 0` reset is exempt (it adds no space).
- **Triggered by:** Any code path that measures an element to lay out another —
  virtual/windowed lists, the Fit Spine solver, fit-to-height scaling, export
  pagination.
- **Removable when:** Never — this is a property of the CSS box model, not a bug to
  be fixed upstream. The gate is the durable guard.
- **Commits:** HARD RULE #20 + the margin-discipline gate.

### A finish `::after` EDGE layer is clobbered by the pagination marker

- **Symptom:** A finish preset's `edge` layer (the vignette in `halo`, the corner
  fold in `ledger`) renders in a standalone HTML mock but is **invisible in the real
  engine/emulator render** (PDF and on-page) whenever the deck shows page numbers.
  The wash/texture (section background) and the mark (`::before`) all paint normally;
  only the `::after` edge vanishes.
- **Cause:** `section.finish::after` (specificity 0,1,1) is the SAME pseudo-element as
  the engine's pagination marker, `div.lattice > section::after` (0,1,2), which sets
  `position:absolute; bottom/right: …` for the page number. The higher-specificity
  scaffold rule wins, so the finish edge pseudo collapses to the page-number box
  (top/left resolve to `auto`, width/height to `auto`) and its background never fills.
- **Mitigation (used by the `frame` edge / `gallery` preset):** Draw an edge that
  must survive the real render on the **section itself**, not the `::after` pseudo —
  e.g. the `gallery` keyline frame is stacked **solid, blur-free inset `box-shadow`s**
  on `section.finish` (`--fin-frame`), which paint reliably in the vector PDF and carry
  no alpha. (A *solid* opaque inset shadow is PDF-safe; only a *blurred / alpha* one
  grays — different from the vignette caveat above.) The frame rule is scoped
  `section.finish:not(.overflow)` so it **yields to the overflow-debug red ring**
  (`section.overflow { box-shadow: inset 0 0 0 4px … }`): both are `(0,1,1)` box-shadow
  and `base.finish` loads *after* `base.modifiers`, so an unscoped finish box-shadow
  would win on an overflowing finish slide and silently kill the red ring (a deck-wide
  finish would broadly defeat the overflow signal). With `:not(.overflow)` the finish
  rule stops matching once a slide overflows.
- **Off-path note (HARD RULE #18):** The pre-existing `--fin-edge` (`::after`) layer in
  `halo`/`ledger` is affected by this same collision and is logged here rather than
  reworked inside the nimbus/loom/savile/gallery preset change; relocating those edges
  off `::after` is a separate fix.

### `white-space:nowrap` on `section code` collapsed code blocks + overflowed eyebrows

- **Symptom:** Every fenced code block (`code`, `compare-code`) rendered as a
  single clipped line instead of its authored multi-line source, and slides
  whose eyebrow was a long backtick label (e.g. `` `SECTION 02 EVALUATES …` ``)
  ran the eyebrow off the right edge and tripped the overflow ring.
- **Cause:** A `white-space:nowrap` was added to `section code` in
  base.elements.css to stop hyphenated identifier chips (`--bg-alt`, `var()`)
  from breaking at the hyphen under the wider hand font. But `section code`
  also matches `<code>` inside `<pre>` (block code) and the `<code>` of a
  backtick eyebrow/label — and `nowrap` collapses newline runs to spaces and
  forbids wrapping. So block code flattened and long inline code overflowed.
- **Mitigation:** The blanket nowrap is removed — inline code wraps normally;
  the `section :is(pre, marp-pre) code` reset pins `white-space:pre` so block
  code keeps newlines (`lib/base/base.elements.css`). Accept that a hyphenated
  chip may wrap at the hyphen under sketch — far cheaper than the two bugs the
  nowrap caused. The page-count gates never caught it (collapsed code is still
  one slide); only a visual spot-check does.
- **Triggered by:** Any deck with a `code`/`compare-code` slide, or a long
  eyebrow/label authored as inline code.
- **Removable when:** Never — do not re-add `white-space:nowrap` to
  `section code`; scope any chip-specific treatment so it cannot reach
  `pre code` or eyebrow code.
- **Commits:** introduced c5512e04, reverted in this change.

### Drawer close buttons jammed left — a `.db-spacer` flex rule scoped to the wrong parent

- **Symptom:** In the Drawing Board's slide-in drawers (Settings, Decks),
  the close button (`×`) sat immediately to the right of the panel title
  instead of being pushed to the far right edge of the drawer head — most
  obvious on mobile, where the title and `×` huddle on the left and a wide
  gap yawns to the right.
- **Cause:** Each drawer head (`.db-drawer-head`) is a flex row that uses a
  `<span class="db-spacer">` to shove the close button to the end. But the
  only rule giving the spacer flex-grow was scoped **`.db-panel-head
  .db-spacer { flex: 1 1 auto }`** — i.e. only when the spacer's parent was
  `.db-panel-head` (the editor/Architect/Slides panel headers). Inside a
  `.db-drawer-head` the same `.db-spacer` had zero growth, collapsed to 0px,
  and the close button fell back against the title.
- **Mitigation:** Generalize the rule to plain **`.db-spacer { flex: 1 1
  auto }`** (`docs/src/styles/drawing-board.css`). A "spacer" should grow in
  *any* flex row; in a non-flex parent `flex` is simply inert, so the
  un-scoping is safe. Both drawer heads now right-align their close buttons.
- **Triggered by:** Opening the Settings or Decks drawer in the Drawing
  Board (`docs/src/pages/drawing-board.astro`).
- **Removable when:** Never — this is the correct rule, not a workaround.

### `var(--fg)` is undefined — SVG `fill`/`stroke` silently falls back to black/none

- **Symptom:** An SVG element styled with `fill: var(--fg)` renders solid
  **black**; a `stroke` derived from a `--fg`-based token (e.g.
  `color-mix(in srgb, var(--fg) 15%, transparent)`) renders as if
  `stroke: none` — the shape, ring, or gridline disappears.
- **Cause:** `--fg` is **not defined anywhere in the repo** — not in
  `lattice.css`, not in any theme. It looks like a base ink token (and
  the journey CSS uses it heavily: `--journey-timeline`, `--journey-plumb`,
  `--journey-axis`, `--journey-task-fg`, `.journey-actor-name` colour),
  but nothing declares it. A `var(--fg)` with no fallback is a
  guaranteed-invalid substitution: `fill` then takes its *initial* value
  (`black`), and `stroke`, being inherited, takes the inherited value
  (effectively `none`). On an HTML element with dark body text the black
  fallback is often invisible-by-luck; on SVG it is not.
- **Mitigation:** Use the real ink-ramp tokens that themes actually
  define — `--text-heading`, `--text-body`, `--text-label`,
  `--text-muted`, `--border`, `--bg`. The radar chart was caught on this
  pre-merge and uses them ([lattice.css](../dist/lattice.css), the `RADAR`
  block). **The journey `--fg` references are still live and unaudited** —
  its low-opacity gridlines/plumb-lines likely render wrong.
- **Triggered by:** Any CSS — especially SVG `fill`/`stroke` — that
  references `var(--fg)`. Grep before copying colour code out of the
  journey block.
- **Removable when:** Either a theme defines `--fg`, or the journey CSS
  is migrated off it. Until then, treat `--fg` as a dead token.
- **Commits:** Radar feature commit; see
  [engineering/decisions/2026-05-15-radar-chart.md](decisions/2026-05-15-radar-chart.md).

### State disc never paints — a recipe var that embeds `--state-color` was defined at `:root`/section

- **Symptom:** The state-token disc (checklist/verdict-grid/obligation-matrix)
  renders with **no fill and no ring** — only the knockout mark floats on the
  row. A knockout mark that should adapt to dark mode stays **frozen white** on
  a dark canvas.
- **Cause:** The disc recipe is driven by custom properties. If one of them
  *embeds* `var(--state-color)` (or `var(--bg)`) and is **declared on an
  ancestor** — `:root`, or a `.checks-*` section variant — the inner `var()`
  resolves **there**, where `--state-color` is undefined → the property
  computes to the *guaranteed-invalid value* and inherits down as invalid, so
  the disc's `background`/`box-shadow` paints nothing. A var that embeds the
  *defined-at-root* `--bg` instead freezes to root's light-mode value and never
  re-resolves in a dark scope (hence the white mark). Same family as the
  `var(--fg)` trap above — invalid substitution, silent fallback.
- **Mitigation:** Keep the variant/`:root` knobs **scalar-only** — numbers,
  lengths, percentages (`--state-fill-pct`, `--state-ring-outer-w`,
  `--state-mark-pct`, …). Do the `color-mix(... var(--state-color) ...,
  var(--bg))` **at the leaf** (the `.state` row / `.badge` / `td .state`),
  where `--state-color` and `--bg` are in scope and re-resolve per element and
  per canvas. See `base.tokens.css` (the "SCALAR KNOBS" block) and
  `base.modifiers.css` (the `.checks-*` variants).
- **Triggered by:** Putting `var(--state-color)`/`var(--bg)` inside any custom
  property set above the leaf. Caught during the checkbox redesign; a
  scratch prototype showed discs missing in light *and* a frozen-white mark in
  dark before the knob split.

### Blurred `box-shadow` → opaque grey box around the element in some PDF viewers

- **Symptom:** A small element with a soft drop-shadow (e.g. the state-token
  disc) renders cleanly in the browser, in PNG rasterizations of the
  emulator PDF (`tools/rasterize-for-review.sh`), and in MuPDF/PyMuPDF
  rasterization — but in **mobile / Quartz PDF viewers** (iOS
  Files/Preview, some Android apps) a **solid grey square** appears around the
  element's bounding box.
- **Cause:** Chromium `printToPDF` exports a *blurred* `box-shadow` as a
  transparency-group / soft-mask (SMask) image sized to the element's expanded
  box. Viewers with incomplete transparency-group support paint the image's
  bounds with an opaque grey matte instead of applying the alpha — so the soft
  shadow becomes a hard grey rectangle. Spread-only shadows (`0 0 0 Npx`, no
  blur radius) are exported as plain vector strokes and are safe; only the
  blur triggers it.
- **Mitigation:** Keep small-element chrome **vector-only** — solid fills and
  0-blur spread rings/borders. For depth, use a darker *spread* ring
  (`box-shadow: 0 0 0 1.6px <darker>`) rather than a blurred lift. The state
  disc recipe (base.tokens.css / the three checkbox consumers) is deliberately
  blur-free for this reason.
- **Triggered by:** Any blurred `box-shadow`/`filter: drop-shadow()` on small
  repeated elements destined for PDF. Verify in an actual mobile PDF viewer —
  PyMuPDF/Chromium screenshots will NOT reveal it.
- **Caught:** checkbox redesign — discs showed a grey square in the iOS PDF
  viewer while every local raster looked clean.

### CSS custom properties return raw token stream via `getPropertyValue`

- **Symptom:** Reading `--bg` via `getComputedStyle(el).getPropertyValue('--bg')`
  returns `"light-dark(#FAF7F2, #15110D)"` instead of the resolved color.
- **Cause:** Per CSS spec, custom properties are inherited as their
  *tokenized text*, not their computed value. Resolution of any
  embedded function (`light-dark()`, `color-mix()`, `var()` chains)
  happens at the use site of the substitution, not at declaration time.
  `getPropertyValue('--name')` returns the declared value.
- **Mitigation:** When you need a resolved color out of JS, set a
  real color property (`element.style.color = 'var(--name)'`) and
  read `getComputedStyle(element).color`. The browser resolves
  everything for actual color properties. See `vc()` helper in
  [lattice-runtime.js:46-58](../dist/lattice-runtime.js#L46-L58).
- **Triggered by:** Any JS read of a custom property whose value
  contains a CSS function.
- **Removable when:** Never — this is by design.

### G-generation `--c-ink-dark: var(--text-heading)` breaks contrast in both canvas modes

- **Symptom:** Contrast test suite reports `--cN-dark / --c-ink-dark` AA
  failures in both light and dark mode for any theme whose G-generation
  block sets `--c-ink-dark: var(--text-heading)`.
- **Cause:** The contract is: `--c-ink-dark` must be *white-ish* on
  light canvas (for text on the dark `--cN-dark` fills) and *dark-ish*
  on dark canvas (for text on the pale `--cN-dark` flipped fills).
  `var(--text-heading)` resolves to dark ink on light canvas (dark-on-dark
  → fail) and, because the `parsePaletteVars` chain breaks at
  `--dark-text-heading` if that token isn't resolved yet, it falls back to
  the previously-set `#FFFFFF` — white-on-pale → also fail.
- **Fix:** Use an explicit `light-dark()` pair:
  `--c-ink-dark: light-dark(#FFFFFF, #0A1628)` (indaco),
  `--c-ink-dark: light-dark(#FFFFFF, #1E1A15)` (cuoio).
  The rule: light-canvas arm is WHITE; dark-canvas arm is the theme's
  primary dark ink.
- **Companion trap:** `--c-alarm` in the G-generation block must also
  be dark enough for white ink on light canvas (L ≤ 0.18) and bright
  enough for dark ink on dark canvas (L ≥ 0.25). The original indaco-G
  alarm `#D15A62` is too light (L≈0.22); use `#A91C2A` (L≈0.10).
- **Triggered by:** Merging a G-generation block into a base theme
  file when `--c-ink-dark` was left as `var(--text-heading)`.
- **Commits:** theme-cleanup commit.

### CSS `ul > li` matches nested sublists — chain `> ul > li` for top-level-only styling

- **Symptom:** A `border-left` (or any decoration) intended for top-level
  list items in a layout also appears on sub-items nested inside those
  items.
- **Cause:** `section.foo .container ul > li` uses a descendant combinator
  before `ul`. It matches any `ul > li` at any depth within `.container` —
  including `.container > ul > li > ul > li` (the nested items). The `> li`
  only constrains the item being a direct child of its own list; it says
  nothing about where that list sits in the tree.
- **Mitigation:** Chain the direct-child combinator from the container:
  `section.foo .container > ul > li`. This requires the `ul` to be a direct
  child of `.container` AND the `li` to be a direct child of that `ul`.
  Nested sublists live at `> ul > li > ul > li` and do not match.
- **Triggered by:** Any layout where top-level `li` items have nested
  `ul`/`ol` sublists and the container receives descendant-scoped styling.
  Hit on the `split-panel` right-panel border-left accent.
- **Removable when:** Never — this is correct CSS scoping; note it here to
  avoid the same mistake in future layouts.
- **Commits:** Split-panel feature commit.

### `:where(:root)` zero-specificity defaults

- **Symptom:** Theme defaults that should be overridable lose to
  user `style:` overrides only sometimes; appears specificity-related.
- **Cause:** Both `:root { color-scheme: … }` rules have specificity
  (0,0,1). Cascade order then decides — fragile.
- **Mitigation:** Wrap defaults in `:where(:root) { … }` to give them
  specificity (0,0,0), so any plain `:root` author override wins
  regardless of source order. Used in
  [themes/cuoio.css:64](../themes/cuoio.css#L64) and
  [themes/indaco.css:58](../themes/indaco.css#L58).
- **Triggered by:** Any author-overridable default.
- **Removable when:** Never — this is the correct CSS pattern.

### `font-size: 0` collapses `em` width/height on the same element

- **Symptom:** A state-token disc (or any size-from-em element) renders
  with zero dimensions and disappears entirely. Most visible in
  `obligation-matrix` cells where the `<span class="state …">` should
  be a 1.4em coloured circle but is invisible.
- **Cause:** `em` resolves against the element's own computed
  `font-size`. Setting `font-size: 0` (a common trick to hide a
  trailing inline label like `[x] Applies fully`) drops the computed
  font-size to `0`, so `1.4em` becomes `0px` — the disc is sized to
  nothing and renders empty.
- **Mitigation:** Hide the label via `overflow: hidden; text-indent:
  200%; white-space: nowrap` and keep `font-size` inherited. The disc
  stays sized from the cell's font-size; any trailing label is pushed
  out of the box and clipped. Used in
  [lattice.css](../dist/lattice.css) (`section.obligation-matrix td
  .state`). See the UNIVERSAL STATE TOKEN block.
- **Triggered by:** Combining `font-size: 0` (label-hiding) with `em`
  width/height on the same element.
- **Removable when:** Never — `em` is the right unit for state tokens
  (scales with the layout's body font); `font-size: 0` is the wrong
  tool to hide inline text.

### KaTeX math extractor splices error spans into inlined Mermaid SVG CSS

- **Symptom:** Mermaid diagrams in the produced PDF render as raw
  stylesheet text — `.actorPopupMenu{position:absolute;}` etc. printed
  inline in the slide body instead of the rendered diagram. Most
  visible on sequence / class / state diagrams; flowcharts may
  partially render. The `<svg>` and `<style>` tags are present in the
  HTML but contain `<span class="katex-error" title="…">` injected
  inside CSS selectors, which makes the `<style>` block invalid and
  Chromium's PDF renderer treats the content as text. Unit tests pass;
  page counts unchanged.
- **Cause:** The build pipeline runs `preprocessMermaid(md)` BEFORE
  `extractMath(raw)` — Mermaid SVG is inlined into the markdown as
  `<div class="mermaid-svg"><svg>…<style>…</style></svg></div>`. Then
  `extractMath` walks the source looking for `$…$` math delimiters
  and skips fenced code blocks — but does NOT skip the inlined SVG.
  Mermaid stylesheets contain CSS attribute selectors like
  `[id$="-sequencenumber"]{…}` whose `$` characters match as math
  delimiters; KaTeX is asked to render the captured content (which is
  CSS, not LaTeX), throws errors, and emits
  `<span class="katex-error">…</span>` back into the SVG's `<style>`
  block.
- **Mitigation:** Add `<div class="mermaid-svg">…</div>` to the skip
  pattern in `extractMath` so math extraction does not reach inside
  inlined SVG. See
  [lattice-emulator.js extractMath](../lattice-emulator.js).
- **Triggered by:** Any deck containing both a `$…$` candidate AND a
  Mermaid diagram with a CSS attribute selector using `$`. Latent
  since main's KaTeX-for-math feature landed; only surfaces visually
  (page-count regression test does not catch it).
- **Removable when:** Never — `$` is a meaningful CSS operator (ends-
  with attribute match) and a meaningful KaTeX delimiter; extractor
  must treat HTML blocks injected before math extraction as opaque.

### `100dvw`/`100vw` includes the scrollbar — a full-width child of a scroll container clips when centered

- **Symptom:** a full-width element sized `width: 100dvw` (or `100vw`) inside a
  vertically-scrolling container looks fine while it's left-aligned, but the
  moment it's centered (e.g. `align-items: center` on the scroll container) a
  sliver of **both** the left and right edges is clipped. Invisible on
  macOS/mobile overlay scrollbars (width 0); visible on Windows/Linux desktop or
  any pinned classic scrollbar.
- **Cause:** `100dvw`/`100vw` is the full **viewport** width — it **includes** the
  vertical scrollbar. The scroll container's **content box** is narrower by the
  scrollbar's width, so a `100dvw` child is ~scrollbar-width wider than its
  container's content box. Left-aligned, that overflow all falls on the right and
  is hidden by `overflow-x: hidden`; centered, it splits across both edges and
  clips symmetrically.
- **Fix:** size a child of a scroll container `100%` (the container's **content**
  width, which excludes its own scrollbar), not `100dvw`/`100vw`. Keep viewport
  units for elements with no scrolling ancestor. The fluid-box viewer's slide cap
  is `width: min(100%, 100dvh × var(--fill-max-aspect))` for exactly this reason
  (`lib/base/base.fluid-view.css`; caught by an adversarial review, not CI —
  `engineering/decisions/2026-07-20-adaptive-viewport-fill.md`).

---

## Lattice internals

### Editing a manifest `sample` staled the bucket survey gallery

- **Symptom:** `npm run test:integration` fails in `bucket-galleries`
  with `<bucket> gallery .md drifted from manifests — re-run npm run
  build:bucket-galleries`, even though the component's OWN gallery is
  fresh and `npm run build` / `build:check` reported nothing stale.
- **Cause:** A component's `manifest.sample` feeds two generated decks:
  its per-component `<name>.gallery.md` (regenerated by `npm run build`
  via `docs:components`) AND the per-bucket survey `<bucket>.gallery.md`,
  which embeds one `sample` per member. The survey is regenerated only
  by `tools/build-bucket-galleries.js` and is deliberately NOT part of
  `npm run build` — re-rendering the 18 bucket PDFs is slow, so it lives
  in CI. Editing a `sample` refreshes the per-component gallery but
  leaves the survey stale until CI notices.
- **Mitigation:** `npm run build:bucket-galleries --only <bucket>`
  regenerates the survey `.md` + its light/dark PDFs; commit the result.
  See development.md → Cross-cutting rules → "Editing a component
  manifest." (`galleryAuthored` buckets/components — `legal`, `diagram` —
  are skipped by both generators and gated only by light/dark page-count
  parity, so they don't hit this.)
- **Triggered by:** Changing any manifest field the survey reads (today
  just `sample`) without rebuilding the bucket galleries.
- **Commits:** `29c3022` (regen chart survey after the word-cloud
  `sample` 1–5 normalization).

### Legacy `--fs-*` token names retired

- **Symptom:** Component CSS or theme using `var(--fs-md)`,
  `var(--fs-2xl)`, `var(--fs-3xl)`, `var(--fs-display)`,
  `var(--fs-stat)`, `var(--fs-watermark)`, `var(--fs-quote)`,
  `var(--fs-label)`, `var(--fs-xs)`, `var(--fs-sm)`,
  `var(--fs-lg)`, `var(--fs-xl)`, or `var(--fs-content)` resolves
  to `0` (or inherited size) because the variable is undeclared.
- **Cause:** The typography token system was rewritten on
  `claude/typography-redact-proposal-V4Ocx` (May 2026). The
  legacy 16-token t-shirt-named scale was retired in favour of
  11 role-named tokens: `--fs-meta`, `--fs-body-compact`,
  `--fs-body`, `--fs-emphasis`, `--fs-h1` … `--fs-h6`, `--fs-hero`.
- **Mitigation:** Replace per the migration map in
  `engineering/decisions/2026-05-19-typography-token-refactor.md` §6 and the
  one-line summary in `CLAUDE.md`. Slide-level prose →
  `--fs-body`; card-style / table / dense-list inner prose →
  `--fs-body-compact`; chrome and labels → `--fs-meta`. HTML
  headings auto-resolve via `base.elements.css` so authors don't
  pick the heading size.
- **Triggered by:** Reading any code older than the refactor that
  still uses the legacy names, or grabbing a snippet from
  archived notes / old PRs.
- **Commits:** Phase 1–4 of the refactor land in the branch
  above; the final cleanup commit removed the alias declarations.

### Two render paths — land transforms in the shared kernel, not one path

- **Symptom:** A new authoring transform (e.g., chart-family layouts,
  slot-label lift) appears to work in the owned engine / emulator output
  but is missing in the `lattice-runtime.js` path, or vice versa.
- **Cause:** Lattice has two render paths (HARD RULE #1):
  1. The **owned engine** (`lib/engine`, bundled as `dist/lattice-emulator.js`)
     — the `lattice` CLI/emulator and the docs playground.
  2. **`dist/lattice-runtime.js`** — the VS Code Marp preview + published-HTML
     runtime (DOM transforms).
  Both consume the shared transform kernel (`lib/integrations/markdown-it/plugins.js`,
  `lib/transformers/*`, `lib/core/*`); landing a transform in one path
  only (e.g. the emulator's inline code but not the runtime's DOM mirror)
  drifts them.
- **Mitigation:** Land authoring transforms in the shared kernel so both
  paths stay in step; each kernel documents its siblings in a header
  comment (see `liftSlotLabel`, `chartFamily`, `splitPanelCounter` for the
  pattern). The integration test tier asserts cross-renderer parity on
  slide count.
- **Triggered by:** Adding any new authoring-time transform.
- **Removable when:** Never — the shared kernel is the standing contract,
  not a workaround.
- **Commits:** Pattern established by original `splitPanelCounter`.

### Chart-family observer's broad `MutationObserver` scope

- **Symptom:** None observed yet, but worth knowing.
- **Cause:** [lattice-runtime.js:1005-1011](../dist/lattice-runtime.js#L1005-L1011)
  observes `document.body` with `subtree: true, childList: true,
  attributes: true, characterData: true`. Every attribute mutation
  in the DOM fires it. Idempotent (re-applies are no-ops on already-
  transformed sections), but causes a `querySelectorAll` per
  mutation. Layout reads can interleave with mermaid's render writes
  in pathological cases.
- **Mitigation:** Apply is idempotent. Cost is a single querySelectorAll
  per mutation, which is fast.
- **Triggered by:** Any DOM mutation while the runtime is loaded.
- **Removable when:** We narrow the observer to chart-family-relevant
  mutations (e.g., `attributeFilter: ['class']`).
- **Commits:** `225cea0`.

### A fixed-size slide frame silently truncates content past 1280×720

- **Symptom:** Authors lose hours debugging clipped content because the
  render prints / exports cleanly but is visually missing the bottom of
  a slide. Nothing in the build output flags it.
- **Cause:** Each slide renders into a fixed-size viewport (the owned
  engine's `@page`/Puppeteer viewport; the SVG viewport in the VS Code
  Marp preview). Anything past the bottom of the viewport gets clipped
  at the rasterization step with no warning.
- **Mitigation:** [lattice.css](../dist/lattice.css) defines
  `section.overflow` as a 4px inset red ring (via `box-shadow`, no
  layout shift). [lattice-runtime.js](../dist/lattice-runtime.js)
  `startOverflowWatcher()` tags the class on every section whose
  scrollHeight/Width exceeds clientHeight/Width by more than 12px
  (the tolerance filters sub-pixel rounding noise from nested flex/
  grid). The lattice-emulator does the same check in the rendered
  HTML AND via `page.evaluate()` before `page.pdf()`, so the ring
  is burned into the printed deck.
- **Triggered by:** Any slide with content past the 720px height (or
  whatever your `@size` is set to).
- **Removable when:** A render path adds native overflow detection (the
  fixed-viewport clip has no built-in warning).
- **Commits:** `0da73e59`.

### Stray colors escape the palette via Mermaid's hardcoded defaults

- **Symptom:** Periodic visual audit finds X11 named colors, Tableau-10
  palette values, or Mermaid built-in defaults appearing in rendered
  diagrams despite the palette setting `themeVariables` correctly.
- **Cause:** Different Mermaid diagram types ignore different theme
  variables. Some hardcode X11 names directly (journey actor faces:
  `cornsilk`, `darkseagreen`, `lawngreen`, `cyan`); some emit
  Tableau-10 categorical fills (sankey nodes, link gradients); some
  apply internal lightening or darkening to themeVariable inputs
  (kanban cScale lighten step). The themeVariables API is partial.
- **Mitigation:** Per-diagram-type CSS overrides in
  [lattice.css](../dist/lattice.css)'s "DIAGRAM OVERRIDES" section (at
  the bottom of the file). Palette-blind — every rule consumes
  `var(--diagram-*)`, so new palettes inherit coverage by defining the
  token contract. Coverage is audited periodically — the most recent
  audit (commit `c57366bf`) identified 35 stray colors across 5 decks
  / 37 diagrams and added overrides for journey, c4, mindmap, timeline,
  sankey, packet, architecture, and ER alternation. The 2026-05-12
  refactor moved these rules out of each palette's post-sentinel
  section into the layout engine to make new-palette authoring purely
  token-declaration.
- **Triggered by:** Any new Mermaid diagram type, any Mermaid version
  bump that adds new internal styling.
- **Removable when:** Mermaid's themeVariables surface becomes
  comprehensive (every visible color is configurable).
- **Commits:** `c57366bf` (audit + 8-diagram override sweep);
  ongoing.

### `liftSlotLabel` idempotency contract

- **Symptom:** Re-running the slot-label transform on already-lifted
  list items would produce nested `<strong>` tags.
- **Cause:** The transform wraps the leading inline content of each
  top-level `<li>` in `<strong>`. Without idempotency, every
  MutationObserver fire would re-wrap.
- **Mitigation:** Each implementation (`liftSlotLabel` in
  `lib/slot-label-lift.js`, the shared-kernel plugin in
  `lib/integrations/markdown-it/plugins.js`, the runtime function in
  `lattice-runtime.js`) checks whether the first element child is
  already `<strong>` and bails. Idempotency is *required* — the runtime
  fires on every preview re-render.
- **Triggered by:** Every VS Code Marp preview re-render (one per keystroke).
- **Removable when:** Never — idempotency is a permanent invariant.
- **Commits:** Original slot-label-lift commit.

### `image museum` slides inherit the anchor `border-left` via cascade

- **Symptom:** A slide with `<!-- _class: image museum -->` shows a
  6px left border and a squished text panel — as if the museum modifier
  is not applied. Mirror variant affected in the same way.
- **Cause:** The base rule `section.image:not(.full)` carried
  `border-left: 6px solid var(--accent)` and `padding-left:
  calc(var(--sp-2xl) + 6px)`. The museum override at higher specificity
  cleared the border with `border-left: none`, but the `padding-left`
  adjustment (the extra 6px) still leaked through in practice, and any
  future reordering of rules could let the border re-emerge. The emulator
  path also had a missing `!important` on the museum frame box-shadow,
  so the base hairline shadow (`!important` at lower specificity) won.
- **Mitigation:** Anchor decoration moved into a guarded rule
  `section.image:not(.full):not(.museum)` — museum slides structurally
  never receive the border or its padding offset. Museum rules no longer
  need explicit `border: none` resets. Museum emulator box-shadow
  promoted to `!important` ([lattice.css](../dist/lattice.css), image
  half-canvas block).
- **Triggered by:** Any `image museum` or `image museum mirror` slide.
- **Removable when:** Never — the guard is cheap and the alternative
  (cascade-order dependence) is fragile.
- **Commits:** `d3ffaca`

### Section geometry AND body font (padding, border, body text) look wrong in any non-canonical preview

- **Symptom:** In a preview where the viewport width ≠ the slide width —
  VS Code marp preview, AND the docs-site iframe preview/export (Drawing
  Board, Playground) — slide padding on all four sides and the top accent
  border are narrower than expected, and **body copy is undersized** (it
  collapses toward a fixed ~10px regardless of `@size`, so headings scale
  but paragraphs/lists/tables do not — egregious on a 4K slide, where body
  text renders at a third of its intended size). Divider slides have a
  noticeably tight left-indent. Applies to HD too (just a smaller delta);
  the canonical emulator/print PDF is always correct.
- **Cause:** `section { container-type:size }` makes the section element
  its own cqi container. CSS spec forbids an element from using cqi to
  query its own size (circular dependency), so any `Xcqi` value *on
  section itself* (padding, border-width) falls back to the **ICB**
  (Initial Containing Block) instead. In VS Code screen mode the ICB is
  the editor viewport (arbitrary width), not the slide. Elements *inside*
  section query section correctly — the self-reference issue only affects
  properties on the container element itself. In PDF/print mode the ICB
  is set by `@page { size: WIDTHpx HEIGHTpx }` so the fallback resolves
  correctly; the emulator sets `page.setViewport({ width: slideW, height:
  slideH })` for the same reason.
- **Fix:** `lattice.css` expresses every direct-cqi property on `section`
  as `calc(var(--_sec-1cqi, 1cqi) * X)` where `X` is the original cqi
  coefficient (e.g. `padding: calc(var(--_sec-1cqi,1cqi)*6.875)
  calc(var(--_sec-1cqi,1cqi)*5)`). **This includes the `--fs-*` typography
  tokens** (`base.tokens.css`): the section's own `font-size:var(--fs-body)`
  — which every gfm body element inherits — is a direct-cqi property and so
  routes through the same hook (`--fs-body: calc(1.67 *
  var(--_sec-1cqi,1cqi) * var(--fs-scale))`), **as do the `--sp-*` spacing
  tokens** — a `section.kpi{padding:var(--sp-lg)}` / `section.math{gap:var(--sp-md)}`
  is exactly the same section-own self-reference, so the whole `--sp-*` scale is
  declared on `:root, section` and routed through `--_sec-1cqi`. Child consumers
  (`h2{font-size:var(--fs-h2)}`, inner flex/grid gaps, …) inherit the section's
  already-substituted value, so they resolve identically; padding and border
  were converted years before the fonts and spacing tokens joined. The `1cqi`
  fallback fires
  only in the emulator/print path where the ICB is already correct. In any
  iframe/VS Code preview, `patchSectionGeometry()` in `lattice-runtime.js` sets
  `--_sec-1cqi = section.offsetWidth / 100` as a concrete `px` value
  (e.g. `38.400px` for a 3840 px 4K slide) so every `calc()` resolves
  against the real slide width. Any new direct-cqi property added to
  `section` or `section.*` — or any token consumed as a section-OWN property —
  must follow the same pattern: `calc(... * var(--_sec-1cqi,1cqi) * ...)`,
  never a bare `Xcqi`. The `--fs-*` and `--sp-*` tokens already carry the hook,
  so consuming them on a section is safe; a bare `Xcqi` literal on a section
  (e.g. `section.chart-frame{padding:0 0 4.375cqi}`) is the trap — wrap it.
- **Triggered by:** Any slide in a preview whose viewport ≠ the slide width
  (marp-vscode, the docs-site srcdoc iframes). The PDF and emulator paths are
  unaffected because their ICB/viewport matches the slide size.
- **Commits:** `334434f` (initial fix, top/bottom only); `fe6f894`
  (extend to padding-left/right); `41ef9e1` (extend to divider
  padding-left); `1bf458c` (unify all under `--_sec-1cqi`); the `--fs-*`
  typography and `--sp-*` spacing tokens plus the remaining bare-cqi
  section-own literals (`chart-frame`, `citation-card.margin`, `accent`)
  joined the hook later (this branch).

### Layout components inherit line-height silently from the section body default

- **Symptom:** Text in a layout (cards, stats, timeline, quote, code subtitle,
  etc.) looks optically tight or loose even though no explicit line-height is
  set. The issue is proportionally the same at every resolution because `cqi`
  scaling preserves the relative value.
- **Cause:** `section` sets `font-size: var(--fs-body); line-height: var(--lh-base)`
  as a body default. Any component that sets a custom `font-size` but omits
  `line-height` silently inherits `--lh-base (1.6)`, which is the right value
  for paragraph body text but wrong for heading-weight card titles (`--lh-snug`),
  small captions (`--lh-snug`), or wrapping descriptive text (`--lh-relaxed`).
  Because `cqi` scales everything proportionally, the wrong ratio looks equally
  wrong at HD, 4K, and standard — it's a semantic mismatch, not a size mismatch.
- **Mitigation:** Every element that sets an explicit `font-size` must also set
  an explicit `line-height`. The pairing rule: heading-weight text → `--lh-snug`;
  small labels/captions → `--lh-snug`; wrapping prose/cards → `--lh-relaxed`.
  `--lh-base` is only for unstyled paragraph inheritance. Eight sites were fixed
  in one pass (diagram > p, stats > p/em, cards-grid/side li and .card, quote > p,
  timeline li, list-steps li, code > em).
- **Triggered by:** Adding a new layout component with a custom `font-size`
  and no `line-height`.
- **Removable when:** Never — this is an authoring discipline rule.
- **Commits:** `828f6fb` (bulk fix); `9327c78` (cards-stack, the original
  discovery).

### Emulator line-by-line builder only supports 2-deep list nesting by default

- **Symptom:** In `kanban` slides (or any layout that parses 3-level nested lists),
  sub-sub-bullets (4-space indent, `- item`) appear as siblings of their parent
  bullet rather than nested children. In kanban this means label text like `compliance`
  becomes a separate card box instead of the meta row inside its parent card.
- **Cause:** `lattice-emulator.js` builds HTML from raw markdown line-by-line
  (`raw.split('\n')`). The original loop tracked only `inList` (level 1) and
  `inSubList` (level 2). The 4-space sub-sub-item matched the same `/^ {2,}- /`
  regex as 2-space items, so it was treated as another level-2 sibling.
- **Fix:** Added `inSubSubList` (level 3) and a `/^ {4,}- /` check that runs
  **before** the `/^ {2,}- /` check in the `else if` chain. The level-2 handler
  was also changed to defer its `</li>` close (checking whether the next line is
  a level-3 item), mirroring the same lookahead the level-1 handler already used.
  All blank-line, paragraph-break, and end-of-content close-out paths updated.
- **Affects:** `lattice-emulator.js` only. Marp-core-rendered HTML (the
  VS Code Marp preview, a marp-cli-rendered Export-to-Marp bundle) nests
  correctly from CommonMark; `lattice-runtime.js` uses the DOM so nesting
  is also correct there.
- **Triggered by:** Any layout that requires 3-level list nesting in the emulator.
  Currently only `kanban` (column → card → meta/body).
- **Commits:** `277a2c3` (feat(kanban): structured authoring convention and card layout redesign)

### Mermaid diagrams render at HD size inside 4K slides in VS Code preview

- **Symptom:** Mermaid diagrams on 4K slides look small in VS Code
  preview — they appear to be sized for 1280px rather than 3840px.
- **Cause:** The non-slide-host fallback rule
  `:is(pre, marp-pre)[data-mermaid-state="rendered"] + .mermaid { width:1152px; height:480px }`
  and the slide-context rule `section.diagram > .mermaid { width:calc(100cqi - 2*sp-2xl) }`
  had **identical specificity** (0,2,1). Because the non-slide rule
  appeared later in the file, it won the cascade and clamped the
  container to 1152px regardless of slide size. At HD (where
  calc(100cqi - …) = 1152px) this was invisible; at 4K the container
  was stuck at 1152px instead of 3456px, making diagrams occupy ~30%
  of the slide width and appear small.
- **Fix:** Wrapped the non-slide fallback in `:where()` to collapse its
  specificity to 0. Added `height:auto` to the slide-context rule so
  the flex-1 distribution, not the fixed 480px, governs the container
  height. The slide-context rule at (0,2,1) now always wins.
- **Triggered by:** Any `size: 4K` (or 4:3) slide with a Mermaid
  diagram in marp-vscode preview. HD unaffected because both values
  agreed at 1152px.
- **Commits:** `d91decc` (px→cqi refactor); fixed in the commit that
  wraps the non-slide fallback in :where().

### Docs-site preview/export rendered 4K decks oversized + cropped

- **Symptom:** A `size: 4K` deck in the docs-site **Drawing Board** or
  **Playground** (not VS Code — the browser preview) rendered ~3× too large and
  overflowed the pane; the Drawing Board's PDF/PPTX export captured only the
  top-left ninth of each slide. HD looked fine.
- **Cause:** The owned engine resolves `@size` correctly and emits a real
  `div.lattice > section { width: 3840px; height: 2160px }`, but every browser
  host that fit-scales and exports the slide **hardcoded 1280×720**: the Drawing
  Board FIT used `sc = w / 1280`, `frame-css.js` pinned `.lattice>section{width:
  1280px}` (which silently LOST to the engine scaffold's `div.lattice > section`
  at 0,1,2 vs 0,1,1 — so the box was really 3840 but scaled as if 1280), and the
  exporter rasterized a 1280×720 crop onto a 1280×720 jsPDF page. At HD every
  hardcoded 1280/720 happened to be correct, hiding the bug.
- **Fix:** The render reports its resolved box — `playground render()` →
  `{ html, css, width, height }` (px), from `lib/engine` `resolveSize`. Every
  host derives its fit divisor, intrinsic/`contain-intrinsic-size` box, `@page`
  size, and export raster/page size from that. `frame-css.js` exposes
  `slideBox(w,h)` / `singleSlideFrame(w,h)` (the HD constants stay for the
  fixed-specimen studios). The Drawing Board + Playground inject
  `window.__SLIDE_W/H` into the iframe for FIT/SYNC; the Drawing Board also folds
  the geometry into its preview rebuild `sig`, so a `size:` edit triggers a full
  srcdoc rewrite (not a section-only patch that would leave stale globals).
- **Triggered by:** Any non-HD `size:` (`4K`, `standard`/4:3) in a browser host.
  The owned engine's emulator PDF path was unaffected (it sizes the Puppeteer
  viewport from `@size`).
- **Don't reintroduce:** never hardcode `1280`/`720` in a preview/export host —
  thread the geometry from the render result through `frame-css.js`.

### Playground preview won't scroll on iOS after opening a settings sheet

- **Symptom:** On the **/playground** (Workbench) — NOT the Drawing Board — load a
  deck (e.g. the jargon gallery), scroll the preview (fine), open **Galleries** or
  **Deck setup**, change something (e.g. slide size), close the sheet → the preview
  is now frozen. It scrolls again only once focus leaves it (tap elsewhere) or after
  a prolonged delay (10s+). iOS Safari only; desktop Chromium never shows it (faster
  + off-main-thread scrolling), which is why headless wheel tests can't repro it.
- **Cause:** The playground is the React/shadcn surface; its panels are shadcn
  **Sheets** (Radix Dialog), which default to `modal`. A modal Radix dialog engages
  `react-remove-scroll` — it sets `body[data-scroll-locked]` and, crucially on iOS,
  adds non-passive `touchmove` `preventDefault` listeners to block background scroll
  (iOS ignores `overflow:hidden` for touch). On iOS Safari that touch-block lingers
  after the dialog closes until a focus change or a long timeout, freezing the
  preview. The vanilla **Drawing Board** uses no Radix dialog, so it's immune — the
  tell that distinguished the two surfaces. Confirmed in Playwright WebKit:
  `body[data-scroll-locked]` was `"1"` while the modal Deck-setup sheet was open.
- **Fix:** Make the playground's preview-side sheets **non-modal** — `modal={false}`
  on the `<Sheet>` Root + `overlay={false}` on `<SheetContent>` (a new opt-out prop
  on the shared `ui/sheet.tsx` primitive; default keeps the modal behaviour for
  every other sheet). A live-tool side panel shouldn't lock the page anyway, and
  non-modal lets you watch the preview update as you change front matter. Files:
  `docs/src/components/playground/{DeckSetupSheet,GalleriesSheet}.tsx`,
  `docs/src/components/ui/sheet.tsx`.
- **Don't reintroduce:** any sheet/dialog that overlays a surface the user still
  needs to scroll (the live preview) must be non-modal, or it will scroll-lock iOS.

### Preview slides collapse (cqi shrinks to near-zero) on iOS if scaled with CSS `zoom`

- **Symptom:** Down-scaling the preview with CSS `zoom` instead of `transform: scale()`
  renders **perfectly in Chromium** (and every headless gate) but on a **real iPhone**
  collapses every `cqi`/`cqh`-sized dimension — a `46cqi` poster shrinks to a fragment,
  flex text columns wrap to one word per line, the slide under-fills the pane.
- **Cause:** iOS Safari does **not** re-resolve `container-type: size` + `cqi`/`cqh`
  against a `zoom`-scaled container — the container-query lengths resolve against a
  wrong/near-zero effective container. Chromium re-resolves them proportionally, so the
  headless spike looks clean and misleading (adjacent to the mobile-WebKit `:root` cqi
  entry above; both are headless-Chromium blind spots). `transform: scale()` is immune —
  it scales the *paint* of an already-resolved layout (cqi resolves once against the
  intrinsic 1280×720 box), which is exactly why the preview uses it.
- **Fix / don't reintroduce:** keep `transform: scale()` for preview down-scaling. Do
  NOT swap in `zoom` on headless evidence alone — verify `46cqi` on a real iOS device
  first. Full post-mortem: `engineering/decisions/2026-07-02-preview-scale-zoom.md`
  (REJECTED).

### Tapping an input zooms the page on iOS (sub-16px text controls)

- **Symptom:** On an iPhone, tapping into a text field — a search box, a settings
  input, or a CodeMirror editor — makes iOS Safari zoom the whole page in, leaving
  the layout cropped and forcing a pinch-out. Desktop and Android never show it.
- **Cause:** iOS Safari auto-zooms on focus when the **focused element's computed
  font-size is under 16 CSS px**. The trigger is per-element — the base body font,
  viewport meta (`initial-scale=1`), and `-webkit-text-size-adjust` are all
  irrelevant to it. Dense desktop-friendly controls (12–14px) are exactly the ones
  that trip it.
- **Why it regressed:** the first fix bumped *individual* offenders (docs search
  boxes, the Playground editor's `.cm-content`) to 16px on coarse pointers. Every
  NEW surface then had to remember the rule — and the Studio didn't: it forked its
  own CodeMirror theme (`editor-theme.ts`, 13px) and shipped a set of 12–13.5px
  raw inputs. Spot fixes don't survive new surfaces.
- **Fix / don't reintroduce:** two layers, both keyed on `(pointer: coarse)`:
  1. a **global net in the `landing.css` reset** (shared by every standalone
     page) — all text-entry `input`/`textarea`/`select` compute
     `max(16px, 1em)`; being unlayered it beats Tailwind's `@layer`-ed `text-*`
     utilities, so a dense one-off input can't undercut it;
  2. **each CodeMirror theme carries its own 16px `.cm-content` block**
     (`docs/src/playground/editor.js`, `docs/src/components/studio/editor-theme.ts`)
     — the scoped theme classes out-specify the global net, so a new CM surface
     MUST copy the block.
  Guard: `docs/e2e/ios-zoom.spec.ts` (touch-emulating; sweeps every mounted text
  control on Studio + Playground and probes the net with a fresh input). The
  emulated check pins the CSS contract; the zoom itself is only observable on a
  real device (HARD RULE #23). Do NOT "fix" this with `maximum-scale=1` — it
  degrades pinch-zoom accessibility instead of removing the trigger.

### Tapping an in-slide link blanks the live preview on iOS

- **Symptom:** On the **/playground** (or Drawing Board filmstrip) on an iPhone,
  pick a component that carries a real link — the `video` poster is the obvious one
  (a big `<a href="https://youtube…">` tap target), but `contact`/`qr`/`closing`
  links do it too — the slide renders fine, then **tapping the link blanks the whole
  preview** and it never comes back. Desktop Chromium never shows it (it opens a new
  tab), so headless click tests can't repro it — the iOS-only trap again.
- **Cause:** The slide's `<a>` is a genuine link (correct for the exported
  HTML/PDF), but the preview is a CSS-transform-**scaled** `srcdoc` iframe. iOS
  Safari follows the tap *into the iframe* and navigates the FRAME itself to the
  external URL; the external site frame-blocks (X-Frame-Options / CSP), so the
  iframe goes blank — and nothing re-renders it. Same "the frame is the wrong place
  for the interaction" class as the debug-overlay touch saga
  (`2026-07-01-debug-bounding-boxes.md`).
- **Fix:** A preview-only **link guard** injected into every filmstrip srcdoc
  (`linkGuardAgent` in `docs/src/playground/deck-preview.js`): a capture-phase click
  listener that, for any `http(s)` anchor, `preventDefault()`s the frame navigation
  and opens the URL in a real **top-level** tab (`window.top.open`) instead. In-page
  (`#id`), `mailto:`, and `tel:` links are left alone; the **exported** artifact's
  link is untouched (preview-only). If the popup is blocked the frame is still
  preserved, so the worst case is an inert tap, never a blank.
- **Don't reintroduce:** never let a preview iframe follow an external link — a
  navigated preview frame can't recover. Any new preview builder that renders slide
  links must carry the same guard (the single-slide Studio path,
  `single-slide-render.ts`, scales the iframe ELEMENT rather than each section, but
  is the same class — add the guard there if a linked component surfaces the blank
  in Studio).

### A blurred `box-shadow` renders as a flat grey block in Apple PDFKit

- **Symptom:** A soft drop-shadow (any `box-shadow` with a blur radius) that
  looks fine in Chrome / poppler renders in **Apple PDFKit** (iOS/macOS Preview,
  the iOS share-sheet viewer) as an opaque grey **rectangle** filling the
  shadow's footprint — not a soft gradient. Caught on the focus `pop`/`blur`
  lift: the focused card showed a hard grey box behind it on iPhone while the
  sandbox raster (poppler) looked correct.
- **Cause:** PDFKit does not composite the soft transparency group Chromium
  emits for a blurred shadow — the same soft-compositing weakness that makes it
  drop SVG `mask-image` (see the mask gotcha). poppler/Chrome composite it, so
  the sandbox raster hides the bug — **verify shadow-bearing exports on an Apple
  viewer.**
- **Fix / don't reintroduce:** for anything that must survive PDF, lift with
  **hard-edged** shapes only — a crisp border, or a **zero-blur** offset shadow
  (`box-shadow: Xcqi Ycqi 0 <color>`), which is a solid vector fill. Keep the
  colour **opaque** (mix toward `--bg`, not `transparent`) to avoid alpha
  compositing too. This is why `--focus-lift` is an opaque hard offset, not a
  soft elevation shadow (`lib/base/base.focus.css`).

## G-gen merge must use non-G file's G-gen block, not the G-file's block

- **Symptom:** After promoting G-files to canonical (merging cuoio-G.css
  into cuoio.css etc.), contrast tests for cuoio fail with `--cN-dark`
  resolving to pale fills against `--c-ink-dark` white (1.38:1 instead
  of ≥4.5:1). Alarm colours also shift from deep crimson to medium red.
- **Cause:** cuoio.css and indaco.css already contained a correct,
  tested G-gen `:root` block (the `/* ── G-generation: categorical … */`
  section). The G-files (cuoio-G.css, indaco-G.css) had a *different*
  version of the same block — `--cN-dark` identical to `--cN-light`
  (both `light-dark(pale, deep)`) instead of the inverse
  `light-dark(deep, pale)`. A merge script that takes the G-file's
  block as authoritative overwrites the correct values.
- **Mitigation:** When merging G-files into their base counterparts, for
  themes that already have a G-gen block (cuoio, indaco), preserve the
  non-G file's G-gen block verbatim. Only import the G-file's block for
  themes that had no G-gen content in their non-G base (ardesia,
  atelier, brina, …).
- **Removable when:** The G-files are permanently deleted and no
  automated merge is needed again.
- **Commits:** Fixed alongside the G-gen promotion commit in the
  `refactor(themes)` session on 2026-05-15.

## Docs site (Astro + GitHub Pages)

### `astro dev` serves stale assets after previewing a production build (service worker)

- **Symptom:** After running `astro preview` (or the e2e suite) and then
  switching to `astro dev` on the same port, the dev site shows stale modules,
  `504 Outdated Optimize Dep`-style noise, or edits that don't take. Hard
  refresh doesn't help; an incognito window does.
- **Cause:** The docs site ships a **service worker** (`docs/public/sw.js` —
  offline cache, see `engineering/decisions/2026-07-02-docs-pwa.md`). It
  registers on **production builds only**, but `astro preview` and `astro dev`
  share the `localhost:4321` origin, so a worker registered while previewing
  keeps controlling the dev server's pages and serves its
  stale-while-revalidate cache — including Vite's module URLs.
- **Fix:** Usually none needed — dev builds emit a self-destroying script
  (`docs/src/components/site/PwaHead.astro`) that unregisters any worker on
  load; one reload after switching to dev clears it. If a worker somehow
  lingers: DevTools → Application → Service Workers → Unregister (or
  `navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()))`
  in the console), then reload. In Playwright, workers are blocked globally in
  `docs/playwright.config.ts` (`serviceWorkers: 'block'`) so route mocks keep
  seeing same-origin GETs; only `e2e/pwa.spec.ts` opts back in.

### Installed iOS PWA: "Connect OpenRouter" doesn't stick

- **Symptom:** On an iPhone with the docs site added to the home screen, a
  user connects OpenRouter in the Playground/Studio, but the installed app
  keeps asking them to connect (or the reverse: connected in the app, not in
  Safari).
- **Cause:** iOS gives an installed (standalone) PWA **separate storage**
  from Safari. The OAuth round-trip can bounce through Safari proper, so the
  key lands in Safari's `localStorage` — invisible to the installed app. Not
  fixable site-side; it's platform storage partitioning.
- **Fix:** connect from inside the surface you'll actually use. Related iOS
  limits (the 7-day storage eviction — Safari tabs only, installed apps are
  exempt — and the fixed `theme_color`):
  `engineering/decisions/2026-07-02-docs-pwa.md` § iOS caveats.

### `build:check` fails: "builds a live preview frame … not a sanctioned preview builder" (HARD RULE #22)

You added (or refactored into) a `docs/src` module that assembles a live slide
preview — i.e. it concatenates the runtime `<script>` injection into an iframe
`srcdoc`. Untrusted engine HTML (a shared / AI-generated deck or component
skeleton, rendered with `html:true`) reaching that **same-origin, un-sandboxed**
frame un-sanitized is XSS → OpenRouter-key theft (#616,
`engineering/decisions/2026-06-29-component-transformer-threat-model.md`). Fix:
run the slide HTML through `sanitizeSlideHtml` (`docs/src/lib/sanitize-slide-html.js`,
DOMPurify) **before** it enters the frame, then add the file to
`SANCTIONED_PREVIEW_BUILDERS` in `tools/check-ownership.js` with a one-line
justification. The same gate also fires if a *listed* builder drops its
`sanitizeSlideHtml` call, or if a sanction goes stale — keep both in sync. A file
that only assigns a builder's output to `.srcdoc` (no `<script>` injection of its
own) is not a builder and needs no entry.

### Drawing Board Architect/Coach panels dead in `astro dev` (CJS over `/@fs`)

- **Symptom:** In `astro dev` (local docs preview), the Drawing Board's whole
  left rail — the Architect, the Coach chips, the config drawer — is inert:
  `window.__dbArchitect` and `window.__dbConfig` are `undefined`, while
  `__dbStore`/`__dbEditor` are fine. The console shows
  `The requested module '/@fs/.../lib/authoring/lint-core.js' does not provide
  an export named 'default'`. The **deployed/built** site works — it's dev-only.
- **Cause:** That `<script>` block imported the repo's pure CommonJS authoring
  engines directly (`import lintCore from '../../../lib/authoring/lint-core.js'`,
  + review-core, scorecard). Rollup's `commonjsOptions` converts CJS→ESM in the
  **build**, but Vite's **dev** server serves a source CJS file fetched over
  `/@fs` (above the docs root) *without* that transform, so its `module.exports`
  surfaces no `default` export. The first such import (lint-core) throws and
  aborts the entire block, taking every panel mounted in it down with it. The
  config comment claiming the build nudge fixed dev was wrong — it never covered
  dev. (Leaf-or-not is irrelevant; the `/@fs` source-CJS serve is the trap.)
- **Fix:** Consume the cores through a committed esbuild bundle —
  `tools/build-authoring-core.js` → `docs/src/playground/authoring-core.generated.js`
  (one in-root ESM module, real named exports `{ lintCore, reviewCore,
  scorecard }`) — exactly as the Theme Studio (`theme-core.generated.js`) and
  Layout Studio (`layout-core.generated.js`) already do. Importers switch to
  `import { … } from './authoring-core.generated.js'`. A lefthook
  `authoring-core-bundle-freshness` gate (glob on the three sources +
  the tool) byte-diffs via `npm run authoring-core:check`. The now-needless
  `commonjsOptions` for `lib/authoring` is removed.
- **Removable when:** the authoring cores become real ESM (then a direct import
  works in dev and the bundle/gate can go). Until then the bundle is the contract.
- **Commit:** `fix(docs): load Architect authoring cores via an esbuild bundle so
  they work in astro dev`.

### Playground/specimen previews 404 on the engine CSS + runtime

- **Symptom:** On the *deployed* docs site (slidewright.github.io/lattice),
  every live preview — the Playground page and every component-page
  specimen — fails with a red status like `theme lattice (404)`. The
  rendered page references `…/playground/themes/lattice.css` and
  `…/playground/lattice-runtime.js` (UNVERSIONED), and both 404. Yet the
  deploy succeeded and the build artifact *does* contain the assets, under
  `playground/v/<hash>/themes/…`. Works fine in `astro dev` locally.
- **Cause:** `docs/src/playground/asset-version.mjs` discovers the staged
  `v/<hash>/` dir to build cache-busted URLs. It derived the lookup path
  from `import.meta.url`. Astro/Vite **bundles** that module for the
  production SSR build and relocates it, so the `import.meta.url`-relative
  path no longer points at `docs/src/playground/`. `readdirSync` throws,
  the `catch` swallows it, `assetVersion()` returns `''`, and `assetBase()`
  falls back to the bare `playground/` prefix. But sync only ever writes
  the *versioned* tree (`sync-playground-assets.mjs`), so the unversioned
  fallback URLs point at files that don't exist → 404. `astro dev` doesn't
  bundle frontmatter modules, so `import.meta.url` stays correct there —
  the failure is build-only, which is why it never showed up locally.
- **Fix:** Anchor the lookup to the **project root** via `process.cwd()`
  (the `docs/` dir under both `astro build` and `astro dev`, and any
  `docs/`-scoped npm script), which survives bundling. The
  `import.meta.url` path is kept as a belt-and-braces fallback. Verify by
  inspecting built HTML: `grep themeBase dist/components/<bucket>/<name>/index.html`
  must show `playground/v/<hash>/themes/`, not the bare `playground/themes/`.
  `assetBase()` now also **throws during a production build** (`import.meta.env.PROD`)
  when no hash resolves — so a future regression fails the deploy loudly instead
  of silently emitting the unversioned 404 URLs. `astro dev` and bare Node
  imports still degrade to the unversioned base.
- **Removable when:** Never silently — if the cache-bust scheme is replaced
  by a generated importable version constant (Vite would inline it, no fs
  read), this whole class of path-resolution failure goes away.
- **Commit:** `fix(docs): resolve the playground asset-version dir from the
  project root, not import.meta.url`.

### Playground preview serves a STALE engine bundle (a 200, not a 404)

- **Symptom:** In `astro dev`, after you rebuild the engine (`npm run build`
  at the repo root, or any edit under `lib/`), the Playground/Workbench preview
  renders with the **old** engine: front matter shows up as visible text,
  `finishes:` / deck-class directives don't apply, and `window.LatticePlayground`
  is missing newer API. Nothing 404s — the network tab is all 200s — so it
  looks like *your* code is broken, and you can burn an hour bisecting source
  that's actually correct.
- **Cause:** The preview loads the engine from a **content-hashed** copy at
  `docs/public/playground/v/<hash>/lattice-playground.js`, staged by
  `sync-playground-assets.mjs` (`npm run sync:playground`, which `npm run dev`
  runs as a `predev` step). When you start the server via the **bin directly**
  (`./node_modules/.bin/astro dev` — the documented workaround for
  `astro: not found`), that predev step is skipped, and rebuilding the engine
  afterward updates `dist/` but **not** the staged `v/<hash>/` copy. The page
  keeps serving the previously-staged bundle: a valid file (200), just stale.
  This is the sibling of "Playground/specimen previews 404…" above — that one
  is the *deploy-time, unversioned-URL* failure; this is the *dev-time,
  stale-versioned-copy* failure.
- **Mitigation:** After rebuilding anything under `lib/` (or running
  `npm run build`), re-stage before reloading: `node
  docs/scripts/sync-playground-assets.mjs` (or `cd docs && npm run
  sync:playground`). **Confirm stale-bundle vs real code-bug** without
  bisecting source: re-stage, hard-reload, and see if the symptom clears — if
  it does, it was the served copy, not your code. In-browser, the preview's
  `window.LatticePlayground.render(md, 'indaco')` reflects the *loaded* bundle,
  so its output changing only after a re-stage is the tell. (Don't reach for
  `lib/engine/index.js` as a Node oracle — it's the EXPERIMENTAL P1 core, not a
  shipping render path; see HARD RULE 1's three paths.)
- **Triggered by:** Editing the engine, then previewing via the directly-invoked
  `astro dev` bin (which skips `predev` sync). `npm run dev` would have re-synced.
- **Removable when:** Never, while the preview loads a content-hashed staged
  copy rather than importing `dist/` live — the staging step is the contract.



- **Symptom:** An agent concludes a web-UI change (Drawing Board, Workbench,
  landing) is "unverifiable in this headless environment" and hands off to a
  desktop session for the visual check. **This is wrong** — the sandbox can
  build, run, and screenshot the Astro site.
- **Cause:** False assumption. The sandbox has Node, the puppeteer-cached
  Chromium (used for the owned engine's PDF rendering), and can serve `astro dev` on
  localhost. The visual loop is: serve → `tools/screenshot.js <url> <png>` →
  view the PNG with the Read tool (renders inline) or `SendUserFile`.
- **Mitigation:** Documented as a first-class loop in
  `engineering/development.md` § "Previewing the docs site (Astro) +
  screenshots" and summarized in `CLAUDE.md` § "You CAN see the web app".
  The reusable tool is `tools/screenshot.js`.
- **Triggered by:** Any change to `docs/src/**` you want to eyeball.
- **Removable when:** Never — this is the standing capability, not a
  workaround.

### Docs `npm run dev` → `sh: 1: astro: not found`

- **Symptom:** `cd docs && npm run dev` (or `npm run start`) prints the
  sync-step output then dies with `sh: 1: astro: not found`; no server.
- **Cause:** Two compounding things. (1) `docs/` is a **separate npm
  package, not a root workspace**, so a fresh sandbox's root `npm install`
  (and the SessionStart hook) never installs `docs/node_modules` — run
  `cd docs && npm install` once. (2) Even installed, the `dev`/`start`
  scripts chain `… && astro dev` and `astro` doesn't resolve on PATH in
  this sandbox's script shell.
- **Mitigation:** Install docs deps once, then invoke the binary directly:
  `cd docs && ./node_modules/.bin/astro dev --host 127.0.0.1 --port 4321`
  (run `npm run sync:portal && npm run sync:playground` first if you need
  fresh portal/playground assets). Pages serve under the `/lattice` base.
- **Triggered by:** Starting the docs site for a preview/screenshot.
- **Removable when:** docs becomes a real workspace AND the script PATH
  resolves — until then, the direct-bin invocation is the reliable path.

### `pkill -f astro` kills the shell that's launching astro

- **Symptom:** A launch script that does `pkill -f "astro"` then starts
  `astro dev` exits with a non-zero signal code (e.g. 144) and the server
  never comes up — even though astro is installed and works.
- **Cause:** `pkill -f` matches on the **full command line**, and the very
  shell running the compound command has "astro" in its argv (the
  `… astro dev …` it's about to exec), so `pkill` terminates itself.
- **Mitigation:** Don't broad-match-kill from inside the launching shell.
  Stop a stale server by **PID** (saved at launch) or by **port**, or use a
  pattern that can't match the current command line.
- **Triggered by:** "Restart the dev server" one-liners.
- **Removable when:** Never — inherent to `pkill -f` self-matching.
