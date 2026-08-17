# Gotchas — Mermaid

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## A mermaid `click` directive is inert (and used to be an XSS)

- **Symptom:** `click A "https://…"` or `click A call fn()` does nothing in the
  live preview. Nothing errors; the node just isn't interactive.
- **Cause:** the runtime pins Mermaid to `securityLevel: 'strict'`, which disables
  `click` handling. That is deliberate and not negotiable: under the previous
  `'loose'`, `click A "javascript:…"` rendered as `<a xlink:href="javascript:…">`
  inside the SVG, which the runtime assigns straight to `innerHTML` — so clicking
  the node executed the script, inside the docs Studio's SAME-ORIGIN, un-sandboxed
  preview frame that renders shared and AI-generated decks. That is the HARD
  RULE #22 threat model (XSS there is OpenRouter-key theft). Found by CodeQL
  (`js/xss-through-dom`) on #1314 and confirmed exploitable on the real Playground.
- **Note:** `strict` is Mermaid's OWN default; the PDF path (mmdc) never
  overrode it, so the runtime was the only surface that opted out.
- **Not the cause:** `<br/>` in a node label still works under `strict`. An older
  comment claimed `loose` was required for it; that was wrong on Mermaid 11.

## A diagram with an `%%{init}%%` renders in Mermaid's stock colors (yellow clusters)

- **Symptom:** One diagram in an otherwise on-theme deck comes out with a pale
  yellow cluster box (`#ffffde`), unfamiliar node fills, `#333` label ink and the
  wrong font. No error, no warning — it renders, it just renders off-palette. The
  only thing different about that fence is an `%%{init: …}%%` line.
- **Cause:** the export path treated ANY init directive as "the author owns this
  diagram's theme" and skipped the injected `themeVariables` wholesale — even for
  a directive that named nothing but `flowchart.curve`. `engineering/mermaid.md`
  §5.3 was, at the same time, telling authors to write exactly such a directive.
- **Mitigation:** fixed in #1311 — `lib/integrations/mermaid/init-directive.js`
  merges instead: the engine directive is emitted ahead of the author's, and
  Mermaid merges init directives in source order (later wins), so an author's
  keys override ours and everything else keeps the palette. The kernel is the PDF
  path's; the live preview gets the same guarantee from Mermaid's own merge over
  `mermaid.initialize` and calls no kernel.
- **Still expected, ON THE PDF PATH:** `%%{init: {'theme': 'forest'}}%%` — any
  theme name Mermaid actually resolves, other than `base` — is an explicit
  opt-out, and the engine stands down. The live preview does NOT honor that pin:
  Mermaid folds the palette from `mermaid.initialize` back in as overrides, so a
  pinned diagram previews on-theme and exports stock. Known divergence. If that is NOT what you wanted, drop the `theme:`
  key; every other key in your directive keeps working.
- **Related:** `layout: 'elk'` looks like it works and doesn't. Mermaid falls
  back to dagre for an unregistered layout with a `log.warn` you never see, so
  the diagram renders on-palette in the wrong layout.

## Playground: Mermaid (and all DOM transforms) stop rendering after the first edit

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

## Mermaid's color parser rejects `light-dark()`

- **Symptom:** `[pageerror] Unsupported color format:
  "light-dark(#FAF7F2, #15110D)"`. Mermaid bootstrap halts; mermaid
  blocks stay in `data-mermaid-state="pending"` showing source code.
- **Cause:** When `lattice-runtime.js` reads palette tokens via
  `getComputedStyle().getPropertyValue('--bg')`, it gets the *raw
  token stream*, not the resolved color. After the light-dark() refactor,
  surface tokens are stored as `light-dark(<light>, <dark>)`. Mermaid's
  color parser only accepts hex / rgb / hsl / named colors and throws
  on the function form.
- **Mitigation:** `openSectionReader` in `lattice-runtime.js` (was
  `buildMermaidThemeVars` before #1332 step 4 made the reader the port)
  attaches a hidden probe element to the SECTION being rendered, sets its
  `color` to `var(--token)`, and reads back `getComputedStyle(probe).color`.
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

## Mermaid kanban applies a lighten step to cScale

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

## Mermaid timeline + journey are tile-stack, not card-on-band

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

## ~~Mermaid's `%%{init}%%` directive is intolerant of CSS comments~~ (RESOLVED)

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

## Mermaid frontmatter must be FIRST; `%%{init}%%` injection comes after

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

## Mermaid `mermaid.run()` is async; restoration logic must wait

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

## Mermaid's built-in error renderer breaks slide layout

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

## Mermaid `themeVariables` must come from a `<section>`, not `:root`

- **Symptom:** the runtime's diagram token reader gets empty strings for
  every theme token when it reads from `document.documentElement`. Mermaid
  falls back to its yellow/orange built-in defaults; preview shows wrong
  cluster colors and broken cScale.
- **Cause:** Marp scopes theme custom properties to `<section>`
  elements, not `:root` / `<html>`. The themeSet rules become
  `div#:$p > svg > foreignobject > section { --bg: …; }`, never
  `:root { --bg: …; }`. Reading from `documentElement` returns the
  unset value (empty string).
- **Mitigation:** `openSectionReader(scopeEl)` in `lattice-runtime.js`
  reads from **the section being rendered**, which the shared kernel
  hands it per slide (`renderDiagrams`, `lib/core/render-diagrams.js`).
  `document.documentElement` survives only as a last-resort fallback for
  a fence outside any section, where it reads empty and the retry budget
  takes over. A sentinel-color guard (`themeSettled`) gates the first
  render until the stylesheet has applied — the first tick can fire
  before paint.
- **Do NOT "simplify" this back to `document.querySelector('section')`.**
  That WAS the code here until #1332 step 3, and reading slide 1 for the
  whole document is the bug it fixed: a Mermaid SVG bakes its colors, so
  a light first slide baked light ink into every diagram in the deck,
  including a `_class: dark` one. Ink is baked, the chip under it is live
  CSS, and the two must describe the same slide.
- **Triggered by:** Any deck through Marp preview where the JS reads
  theme tokens.
- **Removable when:** Marpit hoists theme variables to `:root`.
- **Commits:** `f7f6558c`, `7079e65c`, #1332.

## `:where(:root)` token blocks are dropped from every rendered slide

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

## Mermaid had `layout: 'tidy-tree'` — silent diagram loss

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

## `mmdc` / Puppeteer flakes intermittently on cold starts

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
