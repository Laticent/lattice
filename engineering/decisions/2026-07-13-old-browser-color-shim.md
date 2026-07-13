---
status: proposed
summary: >
  Replace the per-paint old-browser colour discipline with a single runtime SHIM. Old browsers
  (Safari < 16.2 / old smart-TV Chromium) drop the `light-dark()` / `color-mix()` that every theme
  token is authored with, so colour falls to black. Instead of hand-flattening the fragile spots
  and policing them with a gate (the parked static-compilation + `--viz-*` approach), the engine
  detects the missing feature ONCE at load, resolves the whole `:root` palette to flat literals for
  the active scheme with the SAME resolver the build already trusts (`resolve-token-expr.js` +
  `parse-root-vars.js`, both on main), and injects them. Modern browsers keep native `light-dark()`
  untouched; components author modern colour everywhere and read theme tokens freely — no shadow
  vocabulary, no gate. Chosen over static compilation because old-browser targets all run JS
  (confirmed), so the shim's one weakness (a JS-only fallback path CI can't drive) is covered by the
  on-device verification pass. A ~5-line viability spike confirms the core flattens every token
  correctly in both schemes. Supersedes the `@supports`-fork (#908) and parks the static-compilation
  branch (claude/session-resolution-p9gge0) as the reference/fallback.
version: 1
supersedes: 2026-07-11-old-browser-chart-fallback.md
---

# Old-browser colour — the runtime shim

## The problem (unchanged, restated)

Every theme colour is authored `--t: light-dark(L, D)` (and many via `color-mix()`). An engine
lacking those functions (Safari < 16.2, old smart-TV Chromium) drops the whole declaration
invalid-at-computed-value → text and drawings fall to black. This is the same root cause the
chart-colour work chased.

## Why not the two approaches we already have

- **`@supports not (light-dark)` fork (#908, on main today).** A *static* shim: ship flat twins in
  a block modern engines ignore. Fatal flaw — headless Chromium (the only browser CI drives) NEVER
  executes the block, so regressions ride through invisibly. This is what everything since set out
  to replace.
- **Static palette compilation (parked branch `claude/session-resolution-p9gge0`).** Compile colour
  to flat literals for EVERYONE at build time, delete `light-dark()` from the output → modern == old
  (testable). It works and is fully verified, but it is scoped to *chart* colour and it introduced a
  parallel `--viz-*` token vocabulary + a `build:check` gate to keep SVG paints off raw core — a
  standing per-paint maintenance tax (the gate needed hardening one day after landing). Extending it
  engine-wide means regenerating scheme-switching for every token and shipping the whole palette flat
  — heavy, and the `--viz-*`/gate tax generalizes with it.

## The decision — a runtime shim

**Detect the missing feature once at load; resolve the whole `:root` palette to flat literals for
the active scheme; inject them. Modern browsers are untouched (native `light-dark()`); old browsers
get a programmatically-generated flat palette.** Components author modern colour everywhere and read
theme tokens directly — in HTML or SVG. `--viz-*` and its gate are not needed and do not ship.

Chosen because **every old-browser target we support runs JavaScript** (old smart-TV Chromium and
old iOS Safari both do — confirmed with the user). The shim's one real weakness — its fallback path
is JS-only and is NOT exercised by our modern-only CI — is covered by the standing **on-device
verification pass** (the user tests real old hardware each release; that IS the integration test for
this path). The static approach's unique advantage (a bug shows on modern because modern eats the
same bytes) is real but is bought at the cost of the per-paint tax; with device testing in place, the
trade favours the shim.

## The mechanism — and it is mostly EXISTING code

The core is not new. Two modules already on main, already unit-tested, do the hard part:

- `lib/core/parse-root-vars.js` — `parseRootVars(cssText)` collects every `:root` custom property
  (across all `:root` blocks, incl. the `--scheme-dark-*` literals) into a `{name: value}` map;
  `isDarkScheme(cssText)` reads the declared scheme.
- `lib/core/resolve-token-expr.js` — `resolveDeclarationValue(value, vars, isDark)` resolves a
  declaration (following `var()` chains, `light-dark()`, `color-mix()`) to a flat literal. This is
  the SAME resolver the build compiler and `dist` already trust (Chromium-pinned by the parity test).

**Viability spike (run 2026-07-13, indaco):** parse `:root` (119 vars) → `resolveDeclarationValue`
each for light and dark. Every token bottoms out at a clean flat literal, matching the known-good
values:

```
--bg           light=#FFFFFF dark=#001D33     --text-heading light=#0A1628 dark=#FFFFFF
--text-body    light=#1E3A5F dark=#CBD9E8     --accent       light=#006FA8 dark=#82C8E5   (via var(--brand-accent))
--border       light=#E4EAF2 dark=#0F3A5F     --pass/warn/fail all FLAT ✓
```

So the shim, at load, is:

1. **Detect.** `if (CSS.supports('color', 'light-dark(#000,#fff)') && CSS.supports('color','color-mix(in oklab, red, blue)')) return;` — modern browsers exit immediately, zero cost.
2. **Read the palette.** Pull the active theme's `:root` text from the loaded stylesheet(s) → `parseRootVars`.
3. **Resolve.** For the active scheme, `resolveDeclarationValue('var(--'+name+')', vars, isDark)` for every token.
4. **Inject.** Write one `<style>:root{ … flat … }</style>` so every consumer — HTML text, chart SVG, Mermaid, math — reads a flat literal. No per-component work.

## The one real complexity — scheme switching

`light-dark()` gives runtime light/dark for free off `color-scheme`. Flat literals don't flip, so the
shim must inject the RIGHT scheme and handle the cases the static approach already mapped:

- **Fixed-scheme deck** (theme or `color-mode:`) — inject that scheme once. Trivial.
- **Per-slide `.dark`/`.light`** — inject scope-scoped flat blocks (the shim knows each section's
  class), mirroring the static approach's subject anchors.
- **OS-follow (`prefers-color-scheme`)** — resolve to the OS scheme at load; optionally re-run on the
  media-query change event. (Old engines that lack `light-dark` still fire `prefers-color-scheme`.)

This is the part to design carefully and test; the anchor logic is portable from the parked
compiler's `serializeGroup`/`schemeAnchors`.

## What ships, what deletes

- **Ships:** `lib/core/color-shim.js` (~detect + parse + resolve + inject + scheme handling), wired
  into every surface a viewer hits — the exported HTML player (`lib/export/player-core.mjs`), the
  docs-site engine, the emulator/runtime (`lib/runtime`), and Studio/Playground. Unit tests for the
  wiring (jsdom: given an old-browser stub + a theme, the injected `:root` matches the resolver).
- **Deletes:** `tools/build-chart-compat-css.js` (the #908 `@supports` fork) and its build wiring.
  The parked static-compilation machinery (`build-chart-palette-css.js`, the recipe sentinel regions,
  the `--viz-*` namespace, the paint-flatness/viz-hygiene gates) simply never merges — the shim makes
  it unnecessary.
- **Untouched:** every component authors modern colour as normal. The PDF export renders under modern
  Chromium, so it needs nothing (native `light-dark()`).

## Testing plan (HARD RULE #23)

- **Resolver + parser:** already unit-tested on main; extend if the shim exercises a new path.
- **Shim wiring:** jsdom unit test — stub `CSS.supports` to false, feed a theme, assert the injected
  flat `:root` equals `resolveDeclarationValue` for every token, in both schemes and the per-slide /
  OS-follow cases.
- **Real old browser:** UNVERIFIABLE from this sandbox (modern Chromium only) — marked UNVERIFIED and
  handed to the user's on-device pass. This is the explicit, accepted residual risk of choosing the
  shim; it is the reason JS-everywhere was the gating precondition.

## Honest risks

- **The fallback path is JS-only and not CI-testable here.** Mitigated by device testing; it is the
  deliberate trade. A human-in-the-loop release step, not an automated guarantee — the one thing the
  static approach did better.
- **Scheme-switching edge cases** (mixed per-slide schemes, OS-follow re-render) are the substantive
  engineering; get them wrong and an old browser shows the wrong scheme, not black.
- **Timing / FOUC.** The shim must run before first paint on old browsers (a blocking inline script in
  the export/player head) or the deck flashes black then corrects.
- **Reversibility.** Low blast radius on modern (the shim is a no-op there), and the parked static
  branch remains a complete, working fallback if the shim proves unworkable on real hardware.

## Sequence

1. This doc + the viability spike (done).
2. `color-shim.js` — detect + parse + resolve + inject for the fixed-scheme case; jsdom tests.
3. Scheme-switching (per-slide + OS-follow), ported from the parked anchor logic.
4. Wire into every surface; delete the `@supports` fork.
5. Export sign-off (dark + light demo decks) — a hard stop.
6. User on-device pass on real old hardware — the integration test this design leans on.
