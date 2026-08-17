# Gotchas — Browser engines (Chromium and WebKit quirks)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## RETIRED (2026-07-10) — `:not(:has(...))` / `:is(:has(...))` were believed unreliable inside Marp's webview Chromium

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

## Marp / Chromium `foreignObject` creates anonymous grid items

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

## Sub-pixel rounding diverges across Chromium platforms

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

## MutationObserver fires on its own writes (self-triggering loop)

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

## Chromium blocks `file://` URLs as `mask-image` sources

- **Symptom:** A CSS rule like `.foo { background: white; mask: url("./asset.svg") center / contain no-repeat; }` works in HTTP-served pages and in dev tools, but the masked element renders completely invisible in headless Chromium loading from `file://` (which is how every lattice-emulator PDF build works).
- **Cause:** Chromium treats each `file://` URL as its own origin and refuses to load mask sources cross-origin, even within `file://`. The same URL works fine as `<img src>` or as `background-image` — only `mask-image` is restricted. No console error; the mask just resolves to fully-transparent.
- **Mitigation:** Don't use `file://` URLs as `mask-image`. Inline the source as a `data:` URL (works), use an inline SVG `<mask>` element reference (works), or do the visual treatment via a different mechanism (`filter`, `mix-blend-mode`, etc.). The custom-logo feature went through three iterations on this: `::before` pseudo with `var(--deck-logo)` mask → real `<img>` with mask → final filter-only approach with no mask, because filter has none of the origin restrictions and works equally well in lattice-emulator, the VS Code Marp preview, exported HTML, and a marp-cli-rendered Export-to-Marp bundle.
- **Triggered by:** Any author writing `mask-image: url("./local.svg")` and building locally.
- **Removable when:** Chromium relaxes the file-origin policy for mask sources. Unlikely.
- **Commits:** This branch (the custom-logo redesign).

## `svh` can resolve LARGER than `dvh` on a real mobile browser

- **Symptom:** A full-bleed element sized with `100svh` **overflows the visible
  viewport on a real phone** (the bottom clips / a swipe reveals slide spill), even
  though `100dvh` fits exactly and it all looks right in headless Chromium and on
  desktop. Reaching for `svh` "to be safe against the URL bar" makes it worse, not
  better.
- **Cause:** The spec ordering is `svh ≤ dvh ≤ lvh` (small ≤ dynamic ≤ large), and
  headless Chromium honors it — so a spike looks clean and misleading. But a **real
  mobile browser can report `svh > dvh`**: on the device that surfaced this, an
  on-page probe read `svh 333 · dvh 313` (dvh = the actually-visible height). So `svh`
  is **not** a reliable "always-visible floor"; `100dvh` is the current visible height
  and `100svh` can exceed it. Another headless-Chromium blind spot, like the
  `zoom`/`cqi` entry below.
- **Mitigation:** For a "fill the currently-visible viewport" box, use **`100dvh`** (it
  already tracks the URL bar as it shows/hides). Don't reach for `svh` as a
  smaller-safer height — and don't trust any `svh`/`dvh`/`lvh` ordering without
  measuring on a **real device**. The Viewport-debug overlay (`?vvdebug`, or Workspace
  → Diagnostics) prints the live resolved values per device for exactly this.
- **Triggered by:** Sizing a full-height mobile surface off `svh`/`lvh` on the
  assumption `svh` is the visible floor. Cost four wrong rounds on the landscape
  cinema-morph overflow — where the real fix was a fit-**axis** change (fit-by-height,
  not fit-by-width), not the container height; `100dvh` was correct all along.
- **Commits:** Landscape cinema-morph (#1121); see
  [engineering/decisions/2026-07-20-landscape-phone-preview-lock.md](decisions/2026-07-20-landscape-phone-preview-lock.md)
  §Real-device fix.

## Preview slides collapse (cqi shrinks to near-zero) on iOS if scaled with CSS `zoom`

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

## A long press on a button selects its label on iOS (Copy / Look Up callout)

- **Symptom:** On a real iPhone/iPad, press-and-hold any app-chrome control — a Studio
  drawer row is the reported case — and instead of the row reading as *pressed*, iOS
  **selects the label text** ("Library") and raises the Copy / Look Up callout. The
  control behaves like prose. Invisible in every headless test: Playwright's WebKit has
  no long-press callout UI, and Chromium never shows it at all.
- **Cause:** nothing set `user-select` on controls. It is **not** a Tailwind Preflight
  gap — Preflight declares no `user-select` at all. shadcn's primitives each carry the
  `select-none` *utility* per component, which covers only the components that opted in;
  a **hand-rolled** `<button>` (the norm in this codebase) inherits `user-select: text`,
  and iOS answers a long press on selectable text by selecting it.
- **Fix:** the scoped `.lx-ui` baseline (`docs/src/styles/tailwind.css`, `@layer base`)
  sets `user-select: none` + `-webkit-touch-callout: none` on controls — `button` plus
  the ARIA control roles. Scoped to controls on purpose: the same property on `.lx-ui`
  or a wildcard makes the editor, chat transcript and code blocks uncopyable, which is
  worse than the bug. Guarded in `test/unit/tokens/shadcn-bridge.test.js` (including
  against a later rule re-enabling selection — unlayered CSS outranks `@layer base`) and
  measured in `docs/e2e/touch-chrome.spec.ts` on the `webkit-phone` project.
- **Note the boundary:** this only reaches `.lx-ui` islands. A surface outside them —
  tab bars, the site header menu, anchors styled as buttons — still
  selects on long press. For an anchor that is usually *wanted* (iOS's link action sheet
  offers Open / Copy Link); for a non-`.lx-ui` control it is the same bug, unfixed.

## Tapping an input zooms the page on iOS (sub-16px text controls)

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

## Tapping an in-slide link blanks the live preview on iOS

- **Symptom:** On the **/playground** (or Studio filmstrip) on an iPhone,
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

## A CodeMirror `@media (pointer: coarse)` block has no effect on a real touch device

- **Symptom:** Touch-only sizes declared in a CodeMirror `EditorView.theme`
  silently never apply. The lint popup's fix button measured **28px** on a
  genuine coarse pointer where the theme asks for 44px — while
  `matchMedia('(pointer: coarse)').matches` reported `true`, the theme object
  was valid, both surfaces built, and every unit test passed.
- **Cause:** A theme object is a flat map that `style-mod` compiles to a
  stylesheet **in key order**, and a coarse-pointer rule usually targets the
  SAME selector as the base rule it overrides — so the two have equal
  specificity and later-in-the-object wins. Put the `@media` block above the
  base rules (or above a `...spread` that contributes them) and it loses to the
  very declarations it exists to override.
- **Fix:** Keep `'@media (pointer: coarse)'` **last** in the theme object, below
  every spread that contributes base rules.
- **Second trap, same cause:** a shared module must NOT carry its own
  `'@media (pointer: coarse)'` key. Spreading it into a theme that already has
  one *replaces* that block wholesale — in this codebase that would drop the
  16px `.cm-content` lift that stops iOS Safari auto-zooming on focus. Export
  the coarse rules separately (`lintThemeCoarse`) and merge them explicitly.
- **Why no cheap guard catches it:** nothing about it is a type error or a
  failing assertion on the object; only a real coarse pointer shows the defect.
  Pinned by an ordering test in `docs/src/lib/lint-theme.test.ts` that asserts
  the `@media` key appears after the `...lintTheme` spread in both consumers.
- **Triggered by:** the lint-popup redesign,
  `engineering/decisions/2026-08-16-lint-popup-finding-card.md`.
