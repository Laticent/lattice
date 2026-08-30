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

## Marpit theme prefixer mangles `:is(...)` and `:where(...)` as a leading selector

- **Symptom:** A CSS rule like `:is(section.A, section.B) > p { … }`
  or `:where(.chart-frame) > .chart-status { … }` silently fails when
  applied via Marpit's themeSet, even though the same rule works in
  plain CSS. No build error; the rule just never fires.
- **Cause:** Marpit's prefixer rewrites every theme rule to scope it
  to the slide root, prepending `div#:$p > svg > foreignobject >
  section`. Its pattern only recognizes a single leading `section` or
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
