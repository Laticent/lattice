# Gotchas — Marp / Marpit

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## Marp Preview emits `<marp-pre>`, marp-cli emits `<pre is="marp-pre">`

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

## Marp Core wraps emoji in `<img class="emoji">` (twemoji)

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

## Color emoji needs an installed font on the owned render paths

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

## Marpit "spot replaces global" for the `class:` directive

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
- **Triggered by:** Any `class: <value>` in deck front matter — except a value the
  register refuses: a COMPONENT name (it would claim every slide's layout, and collide
  with the ones naming their own) or a color token superseded by `color-mode:`. Both are
  filtered where the register is read and warned about by the deck linter
  (`deck-wide-component`); see `lib/core/deck-class-register.js`.
- **Removable when:** Never — Marpit's spec won't change. Could be
  retired if all decks moved to `theme: <name>-dark` or `style:` for
  whole-deck modifiers, but the directive is a real convenience.
- **Commits:** `f9068a7` (plugin), `b502bcc` (emulator parsing).

## Chromium blocks `file://` URLs as `mask-image` sources

- **Symptom:** A CSS rule like `.foo { background: white; mask: url("./asset.svg") center / contain no-repeat; }` works in HTTP-served pages and in dev tools, but the masked element renders completely invisible in headless Chromium loading from `file://` (which is how every lattice-emulator PDF build works).
- **Cause:** Chromium treats each `file://` URL as its own origin and refuses to load mask sources cross-origin, even within `file://`. The same URL works fine as `<img src>` or as `background-image` — only `mask-image` is restricted. No console error; the mask just resolves to fully-transparent.
- **Mitigation:** Don't use `file://` URLs as `mask-image`. Inline the source as a `data:` URL (works), use an inline SVG `<mask>` element reference (works), or do the visual treatment via a different mechanism (`filter`, `mix-blend-mode`, etc.). The custom-logo feature went through three iterations on this: `::before` pseudo with `var(--deck-logo)` mask → real `<img>` with mask → final filter-only approach with no mask, because filter has none of the origin restrictions and works equally well in lattice-emulator, the VS Code Marp preview, exported HTML, and a marp-cli-rendered Export-to-Marp bundle.
- **Triggered by:** Any author writing `mask-image: url("./local.svg")` and building locally.
- **Removable when:** Chromium relaxes the file-origin policy for mask sources. Unlikely.
- **Commits:** This branch (the custom-logo redesign).

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

## Flex-centered caps read high in JetBrains Mono (and `text-box-trim` can't fix it here)

- **Symptom:** A pill/badge laid out as `display:inline-flex; align-items:center; line-height:1` in **JetBrains Mono** looks like its text sits slightly HIGH — more empty space below the glyphs than above — even though the box is centred. Adding `text-box-trim:trim-both; text-box-edge:cap alphabetic` (the spec-correct fix) changes nothing in the rendered PDF.
- **Cause:** `align-items:center` centres the line BOX, but a font's baseline sits asymmetrically inside it — the descender space below the baseline is reserved even for caps/digits that never use it. The magnitude is **font-specific**: JetBrains Mono seats caps badly (caps land ~7px high, mixed-case ~15px high, in a 60px test pill), while the body sans Outfit lands caps ~1px off — imperceptible. `text-box-trim` would trim the box to the cap/baseline edges and fix it for any font, but it shipped unprefixed only in **Chrome 133** (Feb 2025); the puppeteer-cached Chromium that lattice-emulator renders with is **131**, where the property is silently ignored (a `text-box-trim` pill is pixel-identical to one without).
- **Mitigation:** Don't centre small caps labels in JetBrains Mono. The universal pill uses the **body sans** (`--pill-font: var(--font-body)`), whose metrics centre caps correctly with plain symmetric padding — no optical nudge, no `text-box-trim`. This was the fix for the pill family; it also suits a pill better (a status chip is a label, not code). Measured by rasterising caps pills in both fonts and comparing the ink-gap above vs below. If you must centre caps in mono somewhere, either accept the ~7px lean or wait for `text-box-trim`.
- **Triggered by:** Any small flex-centred caps label set in JetBrains Mono.
- **Removable when:** The render Chromium reaches ≥133 — then `text-box-trim:trim-both; text-box-edge:cap alphabetic` becomes the general, font-agnostic fix.
- **Commits:** The universal-pill branch.

## Custom `logo:` front-matter directive shows nothing in marp-vscode preview

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

## Marpit theme prefixer mangles `:is(...)` and `:where(...)` as a leading selector

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
  re-scopes every selector under `article.lattice > section` via `packTheme` in
  [lib/engine/css.js](../lib/engine/css.js) — a *mirrored port* of Marpit's
  prefixer, which inherited the **same** leading-`:is()` bug. `packSelector` now
  **distributes** a leading `:is(a, b, …)` before scoping, so each arm scopes by
  its own leftmost combinator (`section.X` → `article.lattice > section.X …`;
  `figure.Y` → `article.lattice > section figure.Y …`). A leading `:is()` is
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
  the page, so no `article.lattice > section` re-scoping happens.)
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

## A slide renders with NO canvas — white paper, invisible text — on a third-party theme

- **Symptom:** A `_class: dark` slide, a `divider`, or a `code` panel renders
  with no background at all: white paper, near-white display type on it,
  around 1:1 contrast. Only on some themes; the shipped palettes are fine.
  The ribbon/rail is missing too, but that is not the interesting part.
- **Cause:** The theme is missing a token the engine paints with — `--spectrum`,
  `--spectrum-vertical`, or `--accent` (which has no engine `:root` default at
  all) — and the engine read it inside a `background:` **shorthand** that also
  carried the canvas, e.g.
  `background: var(--spectrum) top / 100% 1px no-repeat, var(--bg)`.
  CSS invalidates the **entire declaration** when any `var()` in it is
  undefined, and the property then takes its **initial** value. It does *not*
  fall back to the earlier `section { background: var(--bg) }` rule, because
  the declaration is invalid rather than absent — so `var(--bg)` sitting next
  to the missing token goes down with it.
- **Mitigation:** Fixed in the engine (#1528) — the six canvas-bearing sites
  (`section.dark`, `section.accent.dark`, `section.divider`, and the `code` /
  `compare-code` panels) paint `background-color:` and `background-image:` as
  **longhands**, so a missing token costs the decoration alone. Pinned by
  `test/unit/palette/spectrum-shorthand-safety.test.js`. If you are writing a
  new rule: never put a theme token that may be absent in a shorthand
  alongside something load-bearing.
- **Triggered by:** any theme the generator's contract doesn't cover — a
  third-party theme, a hand-edited palette, an imported asset bundle. A
  Studio-generated theme also did this until #1535 taught `deriveTheme` to
  emit the family.
- **Removable when:** never — it is how `var()` is specified. The discipline
  is the mitigation.
- **See:** `decisions/2026-08-10-spectrum-out-of-the-background-shorthand.md`,
  `decisions/2026-08-10-no-safe-default-token-contract.md`.

## Front-matter `style:` directive specificity vs. theme :root

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

## lattice-emulator doesn't auto-load `style:` from front matter

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

## Rendering in the cloud sandbox needs `CHROME_PATH`

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

## A rendered PDF shows serif/fallback type, not the design fonts

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

## A slide loses its EYEBROW and HEADING off the top, and no ring / pill / console line fires

- **Symptom:** the top of a panel or card is simply gone in the render — the
  eyebrow, most of the `h2`, sometimes both — and every channel says the slide
  is fine. `over` is `false`, `npm run overflow:check` counts it clean, the
  export carries no "Content clipped" tag, and `lattice-emulator.js` prints
  nothing on stderr. Resizing does not change it; it reproduces in the PDF.
- **Cause:** a flex container that `center`s or end-aligns and then OVERFLOWS
  throws content off the **block-start** edge — and block-start overflow does
  NOT grow `scrollHeight`. `scrollHeight - clientHeight` reads 0, so every
  scroll-dims measure in the system reads zero too. A cut TAIL announces itself
  (it grows the scroll extent); a cut HEAD does not. Reproduced on
  `split-panel`, whose `.panel-left` is `justify-content: flex-end;
  overflow: hidden`: 24 text rects cut, the worst by 882px, at `over: false`
  (#1299). `wifi`'s `justify-content: center` card was the same defect in
  another component (#1278).
- **Fix, in the CSS:** `justify-content: safe center` / `safe flex-end`. `safe`
  falls back to `start` the instant content overflows and keeps the intended
  alignment while it fits — so a fitting slide is byte-identical and an
  overflowing one loses its LAST line instead of its first. **`safe` cannot be
  used with `space-between`/`space-around`/`space-evenly`**: those are
  `<content-distribution>` values and the grammar admits `safe` only before a
  `<content-position>`, so `safe space-evenly` is invalid CSS that drops the
  whole declaration. (`space-between` falls back to `start` by spec. `space-around`/`space-evenly`
  were ASSUMED to fall back to `center` and to shear; measured in Chromium 131 they
  resolve to `start` too, so they do not — the assumption was read off the grammar
  where a measurement was available.)
- **Fix, in the probe:** the box has to be PROBED at all. Both probes now
  discover clipping boxes instead of reading a hand-kept allowlist, and the
  geometry probe measures a discovered box by RECT SPILL (which sees a child
  sitting above the box's top) rather than by scroll dims. See
  `lib/core/overflow-probe.js` and
  `engineering/decisions/2026-07-30-overflow-marker-register.md`
  §"the signal did not reach every box that clips".
- **If you are adding a component:** any clipping box you center or end-align
  is this bug waiting to happen. `safe` costs nothing when the content fits.

## The overflow ring lags an edit, or a slide scrolled past keeps a ring it should have lost

- **Symptom:** you fix an overflowing slide and the red ring stays for a beat
  before clearing; or you scroll a long filmstrip and a slide well off-screen is
  still carrying the mark it had before you edited it.
- **Cause: both are the sweep model working as designed** (2026-08-11, see
  `engineering/decisions/2026-08-11-overflow-sweep-generation.md`). The watcher no
  longer re-measures every slide on every animation frame. It measures once per
  SETTLED render — the same 150ms debounce the content transforms use — over the
  slides in the viewport band whose verdict is stale.
  - **The lag** is that settle window — **about 320ms**, measured, not the 150ms
    you might infer from one debounce. It is two stacked trailing edges: the
    content pass waits 150ms, then the sweep waits 150ms after that.
  - **The stale off-screen mark** is deliberate: a slide that was not measured
    keeps whatever it had, because the only honest thing to say about an
    unmeasured slide is nothing. Clearing it would make a scroll look like a fix.
    Scroll it back into the band and it is re-measured within one settle window.
- **What is NOT this:** a ring that never appears at all on a slide you can see,
  or one that never clears after the slide re-enters view. Those are real. Check
  `window.latticeSweep.sweep()` in the preview frame's console — it returns
  `{ measure, skipped: { offBand, current }, total }`, so it will tell you whether
  the slide was probed, judged already-current, or ruled out of band.
- **If you are adding a surface that shows slides:** if it can change a slide's
  BOX without a DOM mutation or a window resize (its own zoom control, a pane
  drag), call `window.latticeSweep.schedule()` — nothing else will know.

## A false "Overflows" ring appears on the exported `.html` sidecar for a slide that actually fits

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

## One slide renders at ~2x type and overflows, but ONLY in a live preview — the PDF is perfect

- **Symptom:** a single layout looks right in the exported `.pdf` and right in
  CI, but in the Playground / Studio its type is roughly double size, one or
  two words wrap per line, and it carries an "OVERFLOWS" tab. Neighbouring
  slides in the same deck are fine. Because the preview scales the whole
  filmstrip assuming every section is exactly `SH` tall, the *other* slides'
  scroll and clip geometry goes wrong too — so the deck can look broken well
  past the one bad slide.
- **Cause:** a component stylesheet set a box dimension on the SECTION element
  — e.g. `section.premise { height: 100% }` — making a component a second
  source of truth for a value the DECK owns. The geometry has one source (the
  `size:` directive → a named `@size`), but each render path pins it onto the
  section differently, and they do **not** agree on who wins. The EXPORT
  survives only because `lattice-emulator.js` emits `section[data-lattice-slide]
  { width/height: !important }` — *importance*, not specificity, keeps the
  component declaration out, so the PDF looks correct. In a live DOM preview the
  percentage resolves against `article.lattice`, whose inline height the preview's
  `fit()` routine sets to the height of the **whole filmstrip**. Measured on the
  real Playground at 390px: the section became 2517px — exactly `.lattice`'s
  2517px — against ~667px of actual content.
- **The percentage did NOT fall back to content height.** It resolved against a
  perfectly definite containing block that simply was not the slide. Do not
  reason about this class as "the parent was auto-height"; and note that
  "it renders right in the export" proves nothing here.
  `stampOrientation()` (`lib/runtime/index.js`) then
  measures that box, reads the aspect as portrait, and stamps
  `data-orientation="portrait"`, which swaps in the portrait type scale
  (`--fs-h1` 9.05x vs landscape 5x) on a landscape slide — which grows the box
  again. The loop latches.
- **Why no gate caught it:** `golden-diff` compares PDFs, and the PDF is
  correct. Unit tests and `build:check` never lay the deck out in a browser.
  This class is invisible to CI by construction.
- **Fix:** never set a box dimension on the section itself — the deck owns the
  slide box. That includes the logical synonyms (`block-size`, `inline-size`
  and their min/max) and `aspect-ratio`, which re-derives one axis from the
  other. Place content with `align-items` / `justify-content` / `padding`, or
  scope the size to a descendant (`section.foo .card { height: 100% }` is
  fine). `checkSectionBoxOwnership` in `tools/check-ownership.js` (via
  `build:check`) now fails this at commit time, with
  `SANCTIONED_SECTION_BOXES` for the one legitimate case (the fluid **view
  mode**, which deliberately unpins the box and is gated on an attribute no
  export ever sets). Shipped as #1207, found in production; see `CHANGELOG.md`.

## A slide clips 30-70px in the Playground that the exported PDF renders whole

> **RESOLVED 2026-07-30** — the export now stamps the slide geometry too, so it renders at
> design size and the two paths agree. The ruling below ("the preview is honest, the export
> is the flattering one") is what the fix implemented; the 11% figure is exactly the
> 1280-vs-1152 basis. Kept because the symptom is the clearest description of the defect, and
> because any deck authored against the OLD export may now be over-full — that is real
> over-subscription surfacing, not a regression. See
> `engineering/decisions/2026-07-30-slide-geometry-emitted-not-measured.md`.


- **Symptom:** the live preview shows an "OVERFLOWS" tab and visibly cuts a
  line of the lede or a caption, but the same slide in the exported `.pdf` is
  complete. Distinct from the font-race false positive above: fonts are fully
  loaded (`document.fonts.status === 'loaded'`, same family, same measure) and
  the clipping is stable, not transient.
- **Cause: only one path stamps `--_sec-1cqi`.** The slide is **1280px wide in
  both** paths — an earlier version of this note claimed 1152 vs 1280 and that
  `--sp-*` was pinned to a fixed baseline; both were wrong. `--sp-*` is
  `cqi`-based like `--fs-*`, and *both* read the same token:

  ```css
  --fs-body: calc(1.67  * var(--_sec-1cqi, 1cqi) * var(--fs-scale));
  --sp-md:   calc(1.875 * var(--_sec-1cqi, 1cqi) * var(--canvas-scale, 1));
  ```

  The live preview **stamps** `--_sec-1cqi: 12.800px` (slide width / 100) on the
  section. The export leaves it **unset**, so the `1cqi` fallback resolves against
  the nearest query container — which for stage content is the stage box inside
  the section's `5cqi` side padding: 1280 − 2x64 = **1152px**. Measured: the same
  lede computes 21.376px in preview and 19.2384px in export, a ratio of exactly
  1280/1152 = **1.1111**.
- **Which path is right: the PREVIEW.** `--_sec-1cqi` exists precisely to anchor
  sizing to the SLIDE rather than to whatever nested container an element sits in
  (`lib/adaptive/families.js`: "anchored to the slide via `--_sec-1cqi`"). So the
  export is rendering stage content ~11% smaller than designed, and a slide that
  "fits in the PDF but clips in the Playground" is genuinely over-subscribed at
  design size. **Do not trim to the preview and assume the export is the truth —
  it is the flattering one.**
- **Scope:** systemic and long-standing, not specific to any one component.
  Measured in unscaled slide px on the same surface: `list-tabular` 72px,
  `roadmap` 45px, `matrix-grid` 59px, `compare-prose axis` 39px, `cards-stack`
  14px.
- **Status: the token mismatch is OPEN** (tracked separately — whether the export
  should stamp `--_sec-1cqi` or the preview should stop is an engine-wide call).
  Individual components can and should be fixed in the meantime by making the
  slide fit at DESIGN size — measure with `--_sec-1cqi` stamped, not in the
  export. `matrix-grid` and `compare-prose axis` were fixed that way; the others
  above remain.

## The Studio counts fewer slides than the deck renders — or an edit destroys a slide

- **Symptom:** the rail shows one slide where the exported PDF has two; the page number skips; a
  caret jump lands on the wrong slide; or — the worst of it — the chat rewrites "slide 1" and the
  deck's SECOND slide vanishes under a green "Applied" tick. All of it on a deck that looks
  perfectly ordinary. The tell is the separator: it is not a bare `---`.

- **Cause:** the engine breaks a slide on **every top-level markdown-it `hr`**
  (`splitOnHr`, `lib/engine/slides.js`). Every caller-side splitter used to derive that set from
  its own regex over `---`, and `/^---$/m` (or `/\r?\n-{3,}\r?\n/`) matches only a bare run of
  exactly three hyphens with nothing after it. Six forms therefore split for the renderer and were
  invisible to the rail, the editor sync, the Coach, the rehearsal planner and the chat edit path
  (measuring found eight, not the four the issue named):

  | written as | engine | the old caller-side splitters |
  |---|---|---|
  | `***` · `___` · `- - -` | 2 slides | 1 |
  | `--- ` (a trailing space) · `---` + tab | 2 slides | 1 |
  | `----` (four or more) | 2 slides | 1 |
  | `  ---` (indented 1–3 spaces) | 2 slides | 1 |

  And in the other direction — where the old splitters cut and the engine does not — a `---`
  directly beneath a line of text is a **setext heading**, and a `---` inside `$$` math, an HTML
  block, an HTML comment or a code fence is masked. Each made the rail offer a slide the deck does
  not render.

- **Fix (shipped, #1271):** `lib/core/slide-boundaries.mjs` is the ONE derivation, and it CALLS THE
  ENGINE'S PARSER — `md.block.parse` on `lib/core/boundary-parser.js`, memoized per source. Every
  caller reads it. If you are writing anything that asks "which slide is this?", **call that
  module** — do not add a regex, and do not write a scanner that imitates markdown-it. The first cut
  of this fix did exactly that and shipped six confirmed wrong answers behind a confidence flag; the
  decision record has the bill.

- **The one rule callers still share:** `splitOnHr` drops its first token group when that group is
  empty, so a body opening with a separator renders N sections from N+1 chunks. `dropLeadingEmpty`
  is that rule, exported once. It keys on the TOKEN stream rather than the text, because "produces
  no tokens" and "is blank" differ — a link reference definition is real source that produces
  neither.

- **There is no "unsure" any more, and that is deliberate.** An interim cut of this fix returned a
  `certain` flag for shapes a hand-written scanner could not settle, and two callers refused when it
  went false. A parse has no undecided answer: an unclosed fence, a half-typed HTML block, a deck
  caught mid-keystroke — each parses exactly as the engine parses it, so the boundaries are right
  rather than admitted-to-be-doubtful. The flag also gave false comfort, reading `true` on all six
  shapes the scanner got wrong.

- **Authoring note:** write separators as a bare `---` with a blank line on each side. Every other
  `hr` form works, but the blank lines are what keep a `---` from being read as the heading
  underline for the line above it — which is a different slide count, not a style preference.

## A `split-panel proof` run is one hue in the Studio, but only when the deck doesn't paginate

- **Symptom:** a leveled deck's `split-panel proof` slides each show their own categorical tint in
  the Playground and the exported PDF, but in the Studio (Present, its overview grid, the editor
  preview) they all paint the SAME hue, always `cat-1`. Add `paginate: true` to the front matter and
  the colors come right — which is the confusing part, because pagination has nothing to do with
  color.

- **Cause:** `cat-N` is **not authored** — the engine assigns it from the slide's ordinal among the
  deck's proof slides (`sequenceProofPanels`, `lib/core/split-panels.js`). The Studio's previews render
  the whole deck and display one section precisely so deck-derived facts resolve (#1265), but that
  costs a whole-deck parse, so it is gated by `needsDeckContext`
  (`docs/src/lib/single-slide-render.ts`). The gate's first cut listed pagination, running-global
  directives, dividers and `glossary: auto` — **not** proof runs. So a proof deck that paginates got
  the deck render (and correct hues) as a side effect, and one that didn't fell back to the lone
  slice, where every proof slide is "the first one".

- **Fix (shipped):** `split-panel proof` is a registered entry in `DECK_DERIVED_FACTS`. If you are
  adding a feature whose rendered value depends on other slides, **add an entry there** — name the
  fact and say why a lone slice can't produce it. The gate is a registry, not a regex chain, so this
  is one place and the tests assert every entry is named, justified and probed.

- **The trap to avoid repeating:** don't key the gate on a *visibility* switch. Pagination is the
  forgiving fact — a page number nobody displays can be wrong invisibly — so "is pagination on?"
  looked like a reasonable proxy for "does this deck need real context". Any fact that renders
  regardless of a toggle (a color, a rail, a glyph) breaks that proxy in plain sight.

- **Guard, and what it actually blocks:** `docs/e2e/proof-run-deck-context.spec.ts` drives the real
  Present overlay on an UN-paginated proof run and reads the painted fill. It fails if the registry
  entry is removed — but it is NOT `@smoke`, so it runs in the nightly suite and **does not block a
  merge**; `ci.yml` keeps `studio-smoke` out of `ci.needs` deliberately. What blocks a merge is the
  docs Vitest job, where `single-slide-render.deck-context.test.ts` pins the expected fact SET by
  name. That pin exists because the registry's other structural assertions iterate the registry, so
  deleting a fact deleted it from the check and the whole suite stayed green — verified against the
  `glossary: auto` entry. Unit tests assert the gate's answer; only the e2e asserts what the reader
  sees, and this bug class has been found twice by bug report, never by a passing unit suite.

## The Playground and the Studio disagree about which slides overflow (and a slide's own padding changes when the preview pane is resized)

- **Symptom:** the same deck, the same palette, the same slide — the Studio's
  preview shows one slide ringed "OVERFLOWS", the Playground shows two. Resizing
  the browser window (or opening the Playground on a phone) changes which slides
  are flagged. Distinct from the two entries above: fonts are loaded and identical, and
  the disagreement is between the two BROWSER surfaces. (The fix does move the preview's
  chrome berths relative to the export by 3px — disclosed below; the PDF does not move.)
- **Cause: two independent bugs that both key off the host, not the slide.**
  - **The section's own `cq*` units resolved against the ICB.** A
    `container-type: size` element cannot query itself, so a bare `cqi`/`cqh` in a
    declaration applied to the `<section>` falls back to the initial containing block
    — the HOST VIEWPORT in a browser. `docs/src/playground/deck-preview.js` (the
    filmstrip: Playground, Studio) gives its iframe the PANE's width and scales
    each `<section>` inside it, while `docs/src/lib/single-slide-render.ts` (the
    Studio, the landing hero, component specimens) pins its iframe to the slide box and
    scales the IFRAME ELEMENT. So `--frame-inset-y` — and `--footer-reserve`, which is
    the section's `padding-bottom` — computed 24px in one surface and 14.4px in the
    other. Measured on the filmstrip: the content stage grew from 405.9px to 423.2px as
    the pane narrowed from 900px to 355px, and **2 of the 117 gallery slides changed
    their overflow verdict on pane width alone**. Descendants and pseudo-elements were
    never affected — their `cq*` resolves against the section — so the same token was
    simultaneously right on the footer berth and wrong on the reserve meant to hold it.
  - **The overflow probe mixed visual and layout pixels.** `getBoundingClientRect()`
    is transform-scaled; `scrollHeight`/`clientHeight` are not; `lib/core/overflow-probe.js`
    adds them together. On the filmstrip's scaled sections the same over-stuffed
    matrix-grid measured 30px over at scale 1 and 17px at scale 0.543 — across the 12px
    tolerance. The figure-legibility probe had the same mix, and reported glyphs at the
    pane's scale against a floor derived from the unscaled slide height.
- **Fix:** anchor every section-own `cq*` to the slide —
  `calc(N * var(--_sec-1cqi, 1cqi))`, or `--_sec-1cqh` on the height axis (both stamped
  per-section by `lib/runtime/index.js` `patchSectionGeometry`; the bare fallback keeps
  the export byte-identical, since there the ICB IS the slide box). The probe now
  normalizes every rect-derived measure to layout px via the section's own
  rect ÷ offsetHeight. **Gated:** `checkSectionCqAnchoring` in `tools/check-ownership.js`
  (via `build:check`), budget 0 with an empty allowlist.
- **Two ways to write the fix and get nothing** (both were written first; see
  `engineering/decisions/2026-07-29-section-cq-icb-leak.md` §5a):
  - **`:root` alone cannot be anchored.** `var()` is substituted on the element the
    declaration APPLIES to — for `:root` that is `html`, where the stamp doesn't exist,
    so the fallback is baked in and the token still resolves against the ICB. Declare on
    **`:root, section`** (the `--sp-*` idiom). It can LOOK fixed on the docs site anyway:
    the engine packs `:root` rules onto `article.lattice > :where(section)`, so the packed
    copy picks up the stamp while an unpacked document gets nothing. The gate's second arm
    fails this.
  - **A DESCENDANT's bare `cq*` must be left bare.** It already resolves against the
    section — but `1cqi` there is 1% of the section's CONTENT box (1152 at HD) while the
    stamp is `offsetWidth/100`, the BORDER box (1280). Anchoring one moves it 11%: doing
    that to `.chart-body` took it 3072 → 3456px against a 3110.4px export and made a
    `roadmap` slide's overflow ring vanish.
- **Still open, one tier down:** `.chart-body`, `.piechart-figure` and
  `section.list-criteria`'s cell are themselves `container-type: size`, so a `cq*` in
  THEIR own declarations has the identical self-reference problem, and there is no
  stamped anchor for a non-section container. 50 computed values on the gallery still
  move with the host viewport (down from 631); none of them changes an overflow verdict.
  Fixing that tier needs a per-container stamp, not another token rewrite.
- **Disclosed, not a bug: the chrome berths moved 3px in PREVIEW.** `--frame-inset-*` is
  read from both sides of the section boundary, so anchoring it also changes what the
  DESCENDANT side means wherever the stamp exists: the footer band's inset measures
  30px / 24px in preview against 27px / 21.6px in the export (2.34375% of the 1280
  border box vs of the 1152 content box). **The PDF does not move.** This puts the frame
  insets into the same stamp-anchored family as `--sp-*`/`--fs-*`, which have carried
  exactly this offset for as long as they have been anchored — the same OPEN question as
  the entry above, now with three more tokens in it.
- **The browser↔export verdict gap is untouched.** "0 flips" is a WITHIN-browser number.
  Across the boundary, same 117-slide gallery: the preview flags 7 slides the export
  flags 0 (pages 15, 21, 48, 66, 106, 109, 115; largest spill delta 381px), identical
  before and after this fix. Don't read it as closing that class.
- **CLOSED (2026-07-30) — both of the above.** The engine now EMITS `--_sec-1cqi` /
  `--_sec-1cqh` from the resolved `@size` on every render path
  (`lib/engine/css.js geometryVarsCss`), so the export resolves tokens at design size like
  the preview: the sidecar no longer tracks its window, and the export/preview verdict gap
  is gone. The remaining nested-container leak turned out not to be CSS at all — state-chart
  derived its scale from a transform-scaled rect. See
  `engineering/decisions/2026-07-30-slide-geometry-emitted-not-measured.md`, and
  `tools/check-geometry-parity.js` for the regression test. The entries below are kept as
  the record of what the symptom looked like.
- **Was open — the exported HTML sidecar at a non-slide window size.** Nothing
  stamps `--_sec-1cqi` in a standalone export, so every anchored token (the frame insets,
  and equally `--sp-*`/`--fs-*`, which have always been written this way) falls back and
  resolves against the WINDOW: the bloom sidecar's section padding reads 104px at a 1280px
  window and 31.7px at 390px. The PDF is unaffected (the emulator sets the viewport to the
  slide box) and the `--fluid` viewer re-derives on purpose. Pre-existing; it is the other
  face of the open `--_sec-1cqi` export/preview question above.
- **Triggered by:** writing a `cq` length directly on a `section…` rule — it reads as
  slide-relative and is not. Check with the gate, or by rendering the same deck in two
  differently-sized iframes and diffing computed styles.

## A live preview prints "1" as the page number on every slide

- **Symptom:** a deck with `paginate: true` shows the page number `1` on every slide in a
  preview — most visibly the Studio's Present slide-overview grid, where every tile reads
  "1". Navigating slides doesn't change it. The exported PDF/HTML numbers correctly, and the
  Playground's filmstrip numbers correctly, so it looks like a Studio-only rendering bug.
- **Cause: the engine numbers the DOCUMENT IT IS GIVEN, and the caller gave it one slide.**
  `lattice_directives_apply` (`lib/engine/slides.js`) walks the parsed token stream and does
  `pageNumber += 1` per section, stamping `data-lattice-pagination` with that ordinal and,
  after the walk, the final count as `data-lattice-pagination-total`. It is a position within
  one parse — there is no deck-level state and **no offset parameter** (`render(markdown,
  theme, opts)` takes only `baseUrl` / `stats` / `preview`). So a caller that slices one slide
  out and renders it alone gets a truthful "1 of 1". Nothing downstream is wrong: the
  `section[data-lattice-pagination]::after` pseudo (`lib/engine/css.js`) and the visible
  `<span class="lat-pagination">` both just read what the engine stamped.
- **Fix:** hand the engine the whole deck and DISPLAY one section — `DeckPreview`'s
  `slideIndex` / `renderInto`'s `opts.slideIndex`, which narrows a whole-deck render to the
  one shown slide (`keepOnlySection` in `docs/src/lib/single-slide-render.ts`). The kept
  section carries the ordinal, the total, and its positional `id`, all computed against the
  real deck. The srcdoc still holds a single section, so the frame's CSS parse + runtime
  execution is unchanged — but note the engine parse is now the dominant cost on the PATCH path
  (a warm edit's frame is ~1.8ms), so a **single-entry module-level memo of the last whole-deck
  render** collapses the two interactions that repeat an identical parse: changing the shown
  slide, and the overview grid's N tiles rendering the same deck. Measured on the real Studio at
  4× CPU on a 40-slide deck, navigation is TOTAL 7.1ms p50 (RENDER 0.1ms) against 12.8ms/6.8ms
  before deck context existed. A keystroke misses the memo by construction and pays the full
  parse; that one needs the engine-side incremental render path, not a memo.
- **The trap inside the fix — ONE AUTHORED SLIDE IS NOT ONE SECTION.** `slideIndex` indexes
  the CALLER's authored-slide list; narrowing indexes the ENGINE's sections. They diverge, and
  when they do an index-based lookup paints a slide the author did not select — which is worse
  than a wrong number, because a wrong number is visibly wrong and a wrong slide is plausibly
  wrong. Two confirmed causes, both on decks that ship here: a **1→N expansion** (`_focusSteps`
  clones one slide into a section per step — `examples/focus.md` is 11 authored → 14 sections;
  `split: headings` divides one chunk at every heading — `examples/split-headings.md` is 1 → 7),
  and — until 2026-08-05 — **splitter disagreement**: the engine's `splitOnHr` breaks on ANY
  markdown-it `hr` (`***`, `___`, `- - -`, `--- `, `----`, an indented `---`) while the Studio
  matched only a bare `\n---\n`, so six forms split for the engine and not for the caller.
  **That cause is retired** — the Studio derives boundaries from the engine's own rule
  (`lib/core/slide-boundaries.mjs`, #1271), so the counts agree. The 1→N expansion above
  REMAINS, so the guard is still load-bearing. So a host passes
  `slideCount` and `slideMarkdown` alongside `slideIndex`: narrowing happens only when the
  engine's section count agrees, and otherwise the shown slide is re-rendered alone and
  honestly numbered 1 of 1. **Right slide always; true number only when provably true.**
  Locked by `docs/src/lib/single-slide-render.alignment.test.ts`, which drives the real engine
  and the real splitter over the real example decks — a mocked engine cannot express a 1→N
  expansion, which is exactly the failure mode.
- **Triggered by:** any new preview surface that slices a slide out of a deck before
  rendering. If a host knows a slide's place in a deck, it must pass `slideIndex` **with**
  `slideCount` and `slideMarkdown`; omit all three only for a genuinely standalone slide (a
  landing island, a component specimen), where 1-of-1 is the truth. Note the preview number can still differ from the exported PDF's for a
  portrait/square/story deck: auto-split runs only in `lattice-emulator.js` (the export path,
  `resplitDoc`), never in the browser render, so an export may legitimately have more pages
  than the deck has slides.

## Exported fluid viewer: an overflowing slide shows NO marker tab, or the red author ring leaks to a reader

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
  guarded, so the mutation loop still settles). (b) Gate the reader styling on the
  RESOLVED MARKER LEVEL, not on a viewer flag. Both caught by maker-checker, not CI
  (no committed test exercises the fluid viewer yet — #1138).
- **Current shape (2026-07-30):** who the marker talks to is the `overflow-marker`
  EXPORT SETTING (`lib/core/resolve-overflow-marker.js` — `author` / `reader` / `off`;
  chosen by `--overflow-marker`, `LATTICE_OVERFLOW_MARKER`, or the Studio's Share →
  Marp bundle step, and carried in the bundle's own generated block —
  `lib/core/export-settings.js`. It is NOT a deck key; `lint:deck` says so if you write one),
  the watcher stamps the resolved level on every slide section, and both treatments
  live in `base.modifiers.css` keyed on
  `section.overflow[data-lattice-overflow-marker="reader"]`. The rules moved out of
  `base.fluid-view.css` and out of the `:root[data-lattice-fluid-capable]` gate,
  because the fluid viewer is no longer the only reader surface — an Export-to-Marp
  bundle renders through the same runtime. The fluid viewer resolves to `reader` in
  both its states, so its behavior is unchanged. See `lib/runtime/index.js`
  `startOverflowWatcher`, `engineering/decisions/2026-07-20-adaptive-viewport-fill.md`,
  `engineering/decisions/2026-07-30-overflow-marker-register.md`.

## A theme rule gated on `:root[…]` silently does nothing in a Marp render

- **Symptom:** a CSS rule whose prelude starts with `:root[data-…]` (or any
  non-`section` compound) works in the engine, the live preview, and the emulator's
  own export — and has NO effect in an Export-to-Marp bundle rendered by marp-cli.
  Nothing errors; the rule is simply never applied. Found when the `reader` overflow
  treatment landed and a delivered PDF kept the red author ring.
- **Cause:** marp-core scopes every theme rule off its **leftmost compound**. A
  literal leading `section` is understood as the slide itself; anything else is
  rewritten as a slide DESCENDANT. `:root[data-lattice-overflow-marker="reader"]
  section.overflow` came out of a real marp-cli render as
  `div#\:\$p > svg > foreignObject > :where(section):not([\20 root])[data-lattice-overflow-marker=reader] section.overflow`
  — a slide nested inside a slide, which cannot match. Same mechanism as the leading
  `:is(section.x, figure.x)` trap `lib/core/leading-is.js` exists for, from the other
  direction.
- **Fix:** put the state on the SECTION and lead the selector with a literal
  `section` (`section.overflow[data-…="reader"]`), stamping the attribute per-slide
  from the runtime instead of once on `<html>`. If you must gate on document state,
  check the rendered HTML — `marp deck.md --html -o out.html` then grep the emitted
  prelude — rather than assuming the selector survived.

## A CSS reset declaration silently does nothing — the value doesn't exist

- **Symptom:** a declaration written to OVERRIDE an inherited or lower-specificity
  one has no effect. The rule matches, specificity is right, the bundle builds, every
  golden renders pixel-identical, and the regression gate stays green. Found on
  `text-wrap: normal`, written to strip `text-wrap: balance` from a bookend eyebrow
  (#1309); both exclusions were dead and the eyebrows kept balancing. The first
  sweep for the class found two more, both `light-dark()` given something that is
  not a `<color>`: `box-shadow: light-dark(<shadow>, <shadow>)` on the kanban card
  (cards rendered with **no elevation at all**, in either mode) and
  `background: light-dark(transparent, linear-gradient(…))` on the chart glass
  pane. `light-dark()` resolves a `<color>` and nothing else — put it on the
  colors (a stop, a shadow's color) and keep the geometry outside it.
- **Cause:** the value is not in the property's grammar, so the declaration is
  **invalid at parse time and dropped**. `text-wrap` is a shorthand over
  `text-wrap-mode` (`wrap | nowrap`) and `text-wrap-style` (`auto | balance | stable
  | pretty`) — `normal` is in neither, and `CSS.supports('text-wrap','normal')` is
  `false`. Nothing in the toolchain objects: it is valid *syntax*, so `checkCssSyntax`
  passes, and a no-op override often changes no pixels, so no golden moves. The CSS
  reads as a working reset and the comment above it describes an empty declaration.
- **Fix:** prove an override by reading the **computed** value on a real render, not
  by observing that you wrote the property — and read it with
  `getComputedStyle(el).getPropertyValue('text-wrap')`, not the camel-cased
  `.textWrap`. Both work in the Chromium the render paths use, but the string form
  cannot silently return `undefined` on an engine whose IDL attribute for a newer
  property lags. For a **shorthand**, read the longhands instead — here
  `getPropertyValue('text-wrap-mode')` and `('text-wrap-style')` — which say *which
  half* actually applied rather than collapsing both into one token. And run
  `CSS.supports(prop, value)` for any value you have not used before. Here the
  correct reset is `text-wrap: wrap` (mode `wrap`, style `auto`).
  There is a gate for it: `npm run css:values` asks the rendering engine
  (`CSS.supports`) about every value in `lib/**` and `themes/**` and fails on any
  it would drop, with a `SANCTIONED` allowlist for deliberate cross-engine pairs.
  It is **on-demand, not in `build:check`** — that gate is contractually
  render-free and its CI job has no browser — so run it when you touch CSS.
  **What it does not cover:** a custom property's own value (`--x: anything` is
  always valid CSS, by definition), and a value whose `var()` resolves to something
  bad in a way the two var() passes below cannot see. It is a good net, not a proof.
  See `engineering/decisions/2026-08-02-sovereign-bookend-measures.md`.

## The same declaration, but it dies at COMPUTED-VALUE time — and does NOT fall back

- **Symptom:** a `box-shadow` (or any value) built out of a token renders as if the
  rule were not there — and unlike the parse-time case above, `CSS.supports` on the
  literal text says it is **fine**. Two shipped instances: pricing's recommended tier
  wrote `box-shadow: inset 0 0 0 1px var(--accent), var(--elevation-card)` and had no
  accent ring on any deck without `lift: on`; a `tone-* finish-none overflow` slide
  lost its tone rail from `box-shadow: var(--tone-rail, …), var(--fin-frame, …)`.
- **Cause:** the token held `none`, and **`none` is legal only as box-shadow's SOLE
  value** — so once substituted, the value is invalid. The trap is what happens next.
  A declaration containing `var()` is valid at PARSE time whatever the token turns
  out to hold, so it **wins the cascade**; the failure happens at computed-value
  time, where CSS says an invalid-at-computed-value declaration resolves to the
  property's **initial value**. It does *not* fall back to the lower-specificity rule
  it overrode. So the shadow does not merely lose one layer — it loses everything,
  including the parts that had nothing to do with the token.
- **Fix:** never turn a composable slot off with `none`. Use a **no-op value of the
  right type** — `0 0 transparent` for a shadow slot — which paints nothing and
  composes anywhere. `--tone-rail` had the idiom right from the start; the register
  tokens now match it (`base.tokens.css --elevation-card`, `base.finish.css
  --fin-frame`). Note that a `var(--x, fallback)` fallback does **not** save you: the
  fallback fires only when the token is *undefined*, not when it is defined as `none`.
  `npm run css:values` catches this class by substituting the values our own CSS
  actually declares for each token — see its DECLARED pass.

## A committed render golden doesn't match a fresh render — check staleness FIRST

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

## A manifest slot's `selector` describes AUTHORING input — a transform may consume it

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

## Charts export black/unstyled from the Studio image PDF or PPTX

- **Symptom:** A deck exported through the browser's one-click image PDF (or PPTX) renders every CSS-only slide perfectly, but SVG **chart** slides come out corrupted: radar/pie shapes solid black, gradient fills gone, the chart drawn at the wrong scale, axis/label text huge and overlapping in default black. The same deck renders the charts perfectly in the live preview AND through lattice-emulator.
- **Cause:** html-to-image (the export rasterizer's clone step) inlines computed styles onto **HTMLElements only** — nested `SVGElement`s keep just their classes/attributes. Chart styling lives in the stylesheet (`chart-family.css`) and gradient `<stop>`s carry raw `var()` expressions, so the serialized clone loses all of it: unspecified `fill` paints SVG-default black, unresolvable `var()` stops go black, the CSS-sized root (viewBox, no width/height attributes) rescales, and label font-sizes vanish. Mermaid/function-plot survive because they embed their own `<style>` **inside** the svg, which `cloneNode` keeps.
- **Mitigation:** `flattenChartSvgs` (studio/export/deck-export.js `sectionsOf`) bakes every stylesheet-styled chart `<svg>` in the capture frame with `flattenSvgStyles` — the "download chart as SVG" kernel (`standalone-svg.js`): computed paint/text inlined, gradient stops probe-resolved to literal rgb — and pins the root's layout box. Skips svgs that carry their own `<style>`. If you add a NEW way for deck content to depend on document-level CSS from inside an `<svg>` (or a new svg-emitting component), it must either self-style or be covered by this flatten; the `chart-export` e2e journey pins the mechanism. For any export-pipeline change, eyeball `test/fixtures/export-coverage-deck.md` through the real Share → PDF (see `engineering/visual-review.md` § The export surface).
- **Triggered by:** Any stylesheet-styled inline `<svg>` (the chart family) in a deck exported via the browser image pipeline. Found exporting the jargon gallery on an iPhone — masked until the export-crash fix (#709) let large decks finish; pre-existing all along.
- **Removable when:** html-to-image inlines computed styles for SVGElements too (upstream), or the capture pipeline is replaced by something that carries the document stylesheet.
- **Commits:** The chart-flatten branch (#715); mechanism regression-pinned by `docs/e2e/journeys/chart-export.spec.ts` (verified to fail on the pre-fix build).

## Studio PDF/PPTX export shows fallback type on some slides

- **Symptom:** A deck exported from the docs-site Studio (Share →
  PDF or PowerPoint) renders *most* type correctly but a face drops to a
  system fallback on a subset of slides — classically, a `finish: sketch`
  deck keeps its Caveat headings but the Shantell Sans **body** goes clean
  Outfit. The live preview looks right; only the exported file is wrong.
  This is the **web-export** twin of the offline-font fallback gotcha
  above ("A rendered PDF shows serif/fallback type") — same symptom,
  different render path and fix.
- **Cause:** The image exporters (`docs/src/components/studio/export/deck-
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

## Studio / playground LIVE PREVIEW shows hand-body decks in a system sans

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
- **Fix:** Register the vendored faces in the iframe directly. The preview host
  passes a `@font-face` block (built from `previewFontFaceCss()`, referencing the
  bundled woff2 by URL) through `data.previewFontCss` into `writeFrame`'s srcdoc;
  `single-slide-render.ts` (hero / restyle / field-card islands / specimens)
  lazy-imports the same builder.
  The faces are now genuinely present in the iframe regardless of the inert
  `@import` or what the parent loaded.

## marp-cli ignores `theme:` front matter unless the theme is registered (Export-to-Marp bundles)

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
