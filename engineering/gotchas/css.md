# Gotchas — CSS

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## An ink passes every contrast gate and still renders sub-AA (own-hue band · element opacity)

- **Symptom:** `node tools/contrast-audit.js` reports 0 failures,
  `tools/check-slide-contrast.js` reports the run comfortably above AA, `npm test`
  is green — and the rendered slide is hard to read. Most visible on `redline`'s
  struck clause and on `word-cloud spectrum`'s mid-weight words.
- **Cause:** two blind spots, either sufficient on its own.
  1. **The background moves with the ink.** `contrast-audit` scores each ink
     against `--bg` / `--bg-alt`, the opaque canvases a palette declares. Several
     components paint the ink on a tint OF ITSELF instead — `--pass-bg` /
     `--fail-bg` are `color-mix(in srgb, var(--pass) 12%, transparent)`,
     `--stance-bg` is 12% of `--stance`. Re-tuning the hue moves the band with it,
     so a value can be pushed a long way and gain almost nothing, and no
     canvas-based number describes what is on screen. Same class: an ink the BASE
     derives from a palette anchor (`--seq-700` is 45% of the way from `--seq-500`
     to black, in OKLab) — `contrast-audit` skips the `lattice` @import, so it has
     never scored one at all.
  2. **`check-slide-contrast.js` cannot see `opacity`.** It reads computed `color`
     and the ancestor paints. A CSS opacity composites the whole subtree buffer —
     ink and background together — so the ink moves much further than its band.
     Its number for a run inside an opacity group is optimistic by construction:
     measured on indaco's `redline .stacked`, it reported ~5:1 where the rendered
     pixels were **3.21:1**, two nested washes deep (`del` at .85 inside a card at
     .78).
- **Fix / check:** score the surface, not the token —
  `node tools/composed-contrast.js [theme…]` composes the real stack (own-hue
  bands, nested cards, group opacity, base-derived stops) in both cascade orders,
  and is gated by `test/unit/palette/composed-surface-contrast.test.js`. For
  anything carrying an opacity, sample the rendered PIXELS; do not trust a
  computed-style reading. And prefer not to spend alpha at all —
  `base.tokens.css`'s own rule is "spend size or weight, not alpha."
- **Triggered by:** curating a status hue against the canvas; adding an `opacity`
  for de-emphasis on text; setting a `--seq-500` anchor without checking the STOPS
  the ramp derives from it.
- **Commits:** the surface gate + the redline/palette fixes it found (#1640).

## `margin` corrupts measured layout (virtual lists, the Fit Spine) — HARD RULE #20

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

## A finish `::after` EDGE layer is clobbered by the pagination marker

- **Symptom:** A finish preset's `edge` layer (the vignette in `halo`, the corner
  fold in `ledger`) renders in a standalone HTML mock but is **invisible in the real
  engine/emulator render** (PDF and on-page) whenever the deck shows page numbers.
  The wash/texture (section background) and the mark (`::before`) all paint normally;
  only the `::after` edge vanishes.
- **Cause:** `section.finish::after` (specificity 0,1,1) is the SAME pseudo-element as
  the engine's pagination marker, `article.lattice > section::after` (0,1,2), which sets
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

## On a `finish:` deck the running header/footer/logo moved, and ate stage height

- **Symptom:** Anything on a slide carrying a `finish:` (deck-wide or per-slide
  `_class: finish finish-<name>`) that is supposed to be pinned to the slide FRAME turns
  up in the wrong place and shortens the stage. The running header sat 88px low and 64px
  right of its berth — far enough to collide with the `h1` — and `logo-x` / `logo-y`
  described a placement the render did not produce, with the y drifting slide to slide on
  a deck that declared one value. In the worst case the logo left the frame entirely and
  reported as slide overflow, which sent the diagnosis chasing a typography token.
- **Cause:** `base.finish.css` lifted content above the finish backdrop with
  `section.finish > *:not(.backdrop) { position: relative; z-index: 2 }`. Only the
  z-index was the intent — `position: relative` is just how a STATIC child earns one. On a
  child that positions ITSELF it is destructive twice: `top`/`left` stop meaning "inset
  from the frame" and start meaning "offset from wherever I landed in flow", AND the
  element starts consuming flow height it was designed never to take. At (0,2,1) it beat
  `img.deck-logo`'s own `position: absolute` (0,1,1) outright, and tied-and-won on source
  order against `.illegible-tab` and `.lat-split-rail`.
- **Tell:** a coordinate that should be constant is different on different slides. An
  absolute placement cannot depend on how much copy sits above it, so if it does, the
  element is in flow.
- **Fixed 2026-08-04**, then **removed outright 2026-08-12.** The first fix withheld
  `position` from frame chrome via a gated `:where()` exclusion list. The slide plane model
  deleted the rule the list existed to hold back: every child of every section now names its
  own plane, so nothing has to be pushed off the backdrop and no rule reaches across a
  section's children to set `position` at all. The list and its gate went with it.
- **The "simplification" that used to be forbidden here is now what ships.**
  `.backdrop { z-index: var(--z-canvas) }` — sinking the backdrop instead of lifting
  everything else — was built, rendered and rejected in 2026-08, because a Lattice `section`
  did not reliably form a stacking context (`isolation` computed `auto` on `math` and
  `title`), so the backdrop escaped behind the section's own opaque background. That note
  named the precondition for re-proposing it, and `section { isolation: isolate }`
  (base.elements.css) now meets it unconditionally. **Do not remove that line** — it is what
  holds the whole model up.
- **If you are adding out-of-flow chrome to a section:** add the rule, give it a `--z-*`
  plane token, and run `npm run build:check`. No exclusion list to update.
- **Commits:** `engineering/decisions/2026-08-04-finish-stacking-displaces-frame-chrome.md`,
  `engineering/decisions/2026-08-12-slide-plane-model.md`.

## Something decorative on a slide is painting on the wrong side of something else

- **Symptom:** A ghost numeral, a watermark, a scrim or a pale glyph turns up *behind* the
  surface it is supposed to sit on, or *in front of* the words it is supposed to sit behind.
  The tell is that it looks right on some decks and wrong on others — most often it breaks
  the moment a deck sets `finish:`, which is unrelated to the element in question.
- **Cause:** a `z-index` picked locally instead of a plane named globally. A slide is a
  stack of six named planes — `--z-canvas` (−2) and `--z-atmosphere` (−1) sink below the
  words, content rests at the natural flow, and `--z-chrome` (30), `--z-alarm` (90) and
  `--z-mark` (100) rise above (`lib/base/base.tokens.css` § depth axis). A raw integer is a
  plane assignment nobody else can read. The watermark Tile declared plane 1 (atmosphere) in
  its manifest and `z-index: -1` in its CSS, which put it *below* the finish backdrop; under
  `finish: savile` the pinstripes ruled straight across the numeral.
  `citation-card.styles.css` carries a comment recording the identical bug, found and
  patched independently.
- **Tell:** a hand-picked `z-index` on anything that can be a direct child of `section`.
  If you are reaching for `-1` to push something behind the words, you want
  `--z-atmosphere`; the plane is already negative, and it is negative for a reason.
- **The rule:** if the element **can be a direct child of `section`**, it sits on a plane
  and names it with a token. If it always renders **inside** an occupant (a component's
  internals, a `.lat-focus` row inside the stage), it uses the local band `0–9`. That band
  sits BETWEEN `--z-atmosphere` (-1) and `--z-chrome` (30), so arithmetic orders it — nothing
  isolates it, and nothing should: isolating a container is a print-path hazard (below).
- **Gated** by `checkZPlanes` (`tools/check-ownership.js`, via `build:check`) for the part
  decidable from CSS text, and by
  `test/integration/invariants/slide-planes.test.js` for the part that needs a render:
  every real direct child of every section must land on a plane value or the content flow.
  **The render test cannot catch a plane written as its literal** — `--z-atmosphere` IS `-1`,
  and the test reads computed values — so the STATIC gates are what stop a bare `-1`
  (`checkZPlanes`, and §4.3 in `tools/build-forms.js` for a Form noun).
- **A "print-path wash" was diagnosed here for months. It does not exist — it is a bug in
  `pdftoppm`.** The symptom: a 1px `.below-note` gradient hairline renders in an exported
  PDF at ~22% strength, a crisp accent rule reduced to a barely-visible tint, while the
  screen is perfect. It was attributed in turn to isolating `.cell-stage`, to a blanket
  child `z-index`, and to a `z-index` on `img.deck-logo`, and each attribution produced a
  design rule. All of them were measured through poppler's splash backend, which leaks an
  earlier element's constant alpha into a later tiling-pattern fill. The alpha is `/ca .22`
  from `--code-inline-border` (`base.elements.css`), so **any slide carrying an inline-code
  chip can trigger it**, and `0.22 x accent + 0.78 x white` is the "washed" color to within
  a unit. The same PDF through `pdftocairo` or ghostscript is crisp, and the two files are
  byte-identical through the hairline.

  **So: if a mark looks washed in a PDF, rasterize it a second way before you change any
  CSS.** `pdftoppm out.pdf` and `pdftocairo out.pdf` disagreeing IS the diagnosis. Every
  visual tool in this repo (`tools/pixel-check.js`, `tools/rasterize-for-review.sh`,
  `tools/preview.js`) shells out to `pdftoppm` alone, so a second opinion from the tooling
  is not a second opinion.

  What it cost before anyone checked: an export flip that swapped the gradient for a solid
  bar and silently restyled 32 slides that were fine, blessed into goldens; the deck logo
  pulled off the plane scale; a gate built to keep it off; and guard rails in three CSS
  files telling authors not to isolate containers. All reverted.
  `2026-08-12-slide-plane-model.md` § The wash that was a rasterizer.
- **Commits:** `engineering/decisions/2026-08-12-slide-plane-model.md`.

## `white-space:nowrap` on `section code` collapsed code blocks + overflowed eyebrows

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

## `var(--fg)` is undefined — SVG `fill`/`stroke` silently falls back to black/none

- **Symptom:** An SVG element styled with `fill: var(--fg)` renders solid
  **black**; a `stroke` derived from a `--fg`-based token (e.g.
  `color-mix(in srgb, var(--fg) 15%, transparent)`) renders as if
  `stroke: none` — the shape, ring, or gridline disappears.
- **Cause:** `--fg` is **not defined anywhere in the repo** — not in
  `lattice.css`, not in any theme. It looks like a base ink token (and
  the journey CSS uses it heavily: `--journey-timeline`, `--journey-plumb`,
  `--journey-axis`, `--journey-task-fg`, `.journey-actor-name` color),
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
  references `var(--fg)`. Grep before copying color code out of the
  journey block.
- **Removable when:** Either a theme defines `--fg`, or the journey CSS
  is migrated off it. Until then, treat `--fg` as a dead token.
- **Commits:** Radar feature commit; see
  [engineering/decisions/2026-05-15-radar-chart.md](decisions/2026-05-15-radar-chart.md).

## State disc never paints — a recipe var that embeds `--state-color` was defined at `:root`/section

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

## Chrome (`<body>`) tokens are the `PORTAL_TOKENS` subset — a slide-only token is `undefined` there (the `--pass`/`--warn`/`--fail` bug, fixed)

- **Symptom:** An element **portaled to `<body>`** (a diagnostics overlay, a badge, a
  status pill) that colors itself with `var(--<token>, #fallback)` looks **muddy /
  un-themed**, and (the tell) does **not** adapt between light and dark — the same dull
  hue in both. `getComputedStyle(document.documentElement).getPropertyValue('--<token>')`
  returns `""`.
- **Cause:** The docs-site **chrome** tokens on `html[data-palette][data-mode]` are a
  GENERATED SUBSET, not the full theme — `tools/build-docs-portal.js` `PORTAL_TOKENS`,
  emitted into `docs/src/styles/lattice-tokens.generated.css`. Only tokens on that list
  resolve outside a slide. A token a theme defines but that **isn't in `PORTAL_TOKENS`**
  lives only inside the slide iframe's theme, so a `<body>` element referencing it gets
  the invalid-substitution fallback (same family as the `var(--fg)` / `--state-color`
  traps above — but here the fallback *paints*, just wrong, so it's easy to miss). This
  bit the status trio: `--pass`/`--warn`/`--fail` were slide-only, so the diagnostics
  verdict chips fell to a static dark hex that went muddy on the dark popover.
- **Fix / contract:** The trio is now in `PORTAL_TOKENS`, so it resolves on `<body>` per
  palette + mode. **If you need a themed color on `<body>` chrome and it comes up `""`,
  add the token to `PORTAL_TOKENS` and regen** — `npm run docs:landing-tokens && npm run
  docs:portal` — rather than hardcoding a hex. Caveat: `resolveToken` **throws** if any
  base palette is missing the token, so completing the trio also surfaced + fixed
  `carta`, which referenced `var(--fail)`/`var(--warn)` in its `-bg` vars without ever
  defining them.
- **Foreground token vs. white-text fill — two different tokens.** `--pass`/`--warn`/`--fail`
  are tuned for FOREGROUND use (text / icon / underline) and go BRIGHT in dark mode (e.g.
  indaco `--pass` #6fcc4d). So a `bg-[var(--pass)] text-white` FILL resolves to ~2:1 in dark.
  The companion **`--pass-fill`/`--warn-fill`/`--fail-fill`** tokens exist for exactly this:
  the generator (`build-docs-portal.js`) darkens each status hue via OKLCH lightness until
  white text clears AA (4.5:1), same value in both modes — so a status FILL is theme-aware AND
  colorblind-safe (an a11y palette gets blue/amber/gray, not red/green). **White-text status
  fills use `var(--*-fill)`; foreground uses (`text-[var(--fail)]`, severity underlines) use
  the plain token.** Same split applies to `bg-[var(--accent)]` fills — use `text-[var(--on-accent)]`,
  never `text-white` (`--accent` resolves *light* in dark mode for some palettes).
- **Thin palettes need the `@import` stripped before the block scan.** `parseThemeVars`
  keyed `:root` blocks by a regex whose selector captured everything up to `{` — so a
  `:root {…}` right after `@import 'a11y-base';` took the selector `@import '…'; :root`,
  failed the `:root` test, and was dropped. The a11y palettes override only their status
  trio in that post-import block, so they silently emitted **onyx's green/red** instead of
  their authored colorblind-safe values — the exact colors those palettes exist to avoid.
  Fixed by stripping `@import` before the scan.
- **Can't always add a token to `PORTAL_TOKENS` — the throw is a coverage gate.** `resolveToken`
  throws if ANY base palette lacks the token, so a token only *some* palettes define (audited:
  `--text-secondary`, `--spectrum-end`/`-vertical`/`-solid`, `--cat-N-mark`) can't join without
  first completing it across all ~18 themes. When that's out of scope, give the chrome USE a
  fallback to a token that IS on chrome instead — `var(--text-secondary, var(--text-muted))` —
  rather than shipping a `""`. (`--cat-N-mark` in anima scenes and `--spectrum-*` swatches
  already resolve in their themed context or fall back to `--accent`, so they were left as-is.)
- **Foreground status text on chrome (RESOLVED in #1160).** The FILL tokens fix white-text
  backgrounds, not FOREGROUND status text; two palettes used to ship sub-AA foreground
  `--pass`/`--warn`/`--fail` (#1152, closed by #1160). (1) `carbone`: its `--bg` is a flat dark
  `#1A1A1C` (no `light-dark()`) but its status tokens ARE `light-dark(...)`, and the portal
  FLATTENS `light-dark` per mode — so the `[data-mode="light"]` chrome block used to pair the
  LIGHT-side `--fail #A02323` against the dark bg at 2.28:1. Fixed: `resolvePalettes` now
  resolves each block's tokens to the arg matching THAT block's canvas scheme (`isDarkSurface`
  of its `--bg`), not the mode toggle — so carbone (dark in both toggles) takes the dark args
  in both, and its light-mode chrome status is 6.2–8.2:1. (The old `singleMode` flag, computed
  but never consumed, was the intended lever; it's removed in favor of this one rule, which
  also subsumes the a11y mode-invariant case.) (2) `a11y-achromatopsia`'s grayscale `--warn`
  was `#7a7a7a` (4.29:1) — darkened to `#6E6E6E`, which clears AA on its surface AND stays
  CVD-distinct. Achromatopsia is gated by a luminance contrast-ratio floor (1.25,
  `ACHROMAT_FLOOR` in `cvd-palette.test.js`) — NOT the 0.15 OKLab ΔE floor the three dichromacy
  palettes use, from which it's explicitly excluded (its trio is luminance-only greys whose
  distinction rides the glyphs, not a color ΔE the simulation measures); the ramp holds ~1.6:1
  pairwise and `cvd-audit` collapses are unchanged. A theme-wide contrast gate
  (`test/unit/palette/theme-surface-aa.test.js`) now catches any regression.
- **Triggered by:** Referencing any slide-theme token from chrome that lives outside a
  slide (a `<body>`-portaled overlay / popover / toast).
- **Commits:** status trio → `PORTAL_TOKENS` + `@import`-scan fix (a11y) + `carta` completion
  + white-text-fill pins (#1142); the derived `--*-fill` trio + `--on-accent` fills +
  `headline-catalog` fallback + `url()`-aware `@import` strip + cuoio `--warn` AA (#1149);
  the theme-wide foreground AA sweep + carbone scheme-derived resolution (#1160); the overlay
  dark-mode workaround it superseded (#1129).

## Blurred `box-shadow` → opaque gray box around the element in some PDF viewers

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

## CSS custom properties return raw token stream via `getPropertyValue`

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

## G-generation `--c-ink-dark: var(--text-heading)` breaks contrast in both canvas modes

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

## CSS `ul > li` matches nested sublists — chain `> ul > li` for top-level-only styling

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

## `:where(:root)` zero-specificity defaults

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

## `font-size: 0` collapses `em` width/height on the same element

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

## KaTeX math extractor splices error spans into inlined Mermaid SVG CSS

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

## `100dvw`/`100vw` includes the scrollbar — a full-width child of a scroll container clips when centered

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
