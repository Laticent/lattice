---
status: proposed
summary: >
  A LAYERED old-browser colour fallback, split by WHERE the fragile colour lives. Old browsers
  (Safari < 16.2 / old smart-TV Chromium) drop the `light-dark()` / `color-mix()` every theme token
  is authored with, so colour falls to black. An adversarial trio (2026-07-13) proved a runtime
  `:root`-only shim CANNOT replace the `@supports` fork (#908): the chart-bucket palette is declared
  on `.chart-frame` (off-`:root`) and uses `color-mix()` DIRECTLY in paint properties — neither of
  which a token shim can reach, and `.chart-frame` is a closer ancestor so `:root` re-injection can't
  fix it either. So chart colour MUST be flattened at build time. The layered answer: (1) a runtime
  SHIM handles the `:root` tier — core `--bg`/`--text-*`/`--accent` + the engine-wide `--cat-*`/
  `--diagram-*` diagram palette (all on `:root`) — with a verified-simpler scheme model (pin on
  `<html>`, `section.light/.dark` wins by tree depth, no restore-base arm); this also lets us DELETE
  the `--viz-*` shadow vocabulary + gate, since the shim makes core tokens old-safe so SVG paints may
  read them directly; (2) the STATIC compilation stays for the `.chart-frame` chart palette + the
  direct-in-paint painters (the part only build-time flattening can cover). Together they replace
  #908. Trade accepted: the shim's fallback path is JS-only + CI-invisible (covered by the on-device
  pass), and old-browser targets all run JS (confirmed). Bugs to fix before ship: `padStart` throws
  the bundle on Chrome 49–56 (add try/catch + a `padStart`-free hex), a composite-value flatten gap,
  the reader/parser `:root,`-group mismatch, the player's sha256 CSP, and wiring the remaining surfaces.
version: 2
supersedes: 2026-07-11-old-browser-chart-fallback.md
---

# Old-browser colour — the layered fallback (runtime shim for `:root`, static compilation for charts)

> **Revised 2026-07-13 after the adversarial trio.** v1 of this doc claimed a `:root` shim could
> REPLACE #908 outright. The trio (red-team + Munger inversion + independent checker) unanimously
> disproved that — see §"Adversarial trio". The design below is the corrected, LAYERED architecture.

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

## Adversarial trio (2026-07-13) — what it disproved, what held

Red-team + Munger inversion + independent checker, each verified to source. **Unanimous, decisive:
a `:root`-only shim cannot replace #908.** Corrections folded into this doc:

1. **FATAL coverage gap.** The chart-bucket palette (`--chart-cat-*`, `--state-*`, `--chart-rule`) is
   declared on `.chart-frame` — NOT `:root` (`chart-family.css:108,181`; 41 fragile defs in
   chart-family alone, off-`:root`). Components also use `color-mix()`/`light-dark()` DIRECTLY in
   paint properties (`.funnel-band { fill: color-mix(…) }`, state-disc `background`). A `:root` token
   shim reaches neither, and `:root` re-injection can't help — `.chart-frame` is a *closer* ancestor,
   so its dropped `light-dark()` wins tree-depth. **Deleting #908/static would re-black every chart.**
   ⇒ chart colour MUST be flattened at build time (the static compilation), on `.chart-frame`.
2. **`padStart` throws the bundle on Chrome 49–56 / Safari 9.1–9.3** (`lib/theme/color.js:54`, ES2017;
   esbuild lowers syntax, not methods; no try/catch → whole deck black). CI can't catch it (Node has it).
3. **Composite-value flatten gap** — `resolveFlatPalette` resolves `var(--name)`, not the token's own
   value, so a `:root` token embedding a modern fn in a gradient/shadow is dropped (nil exposure today).
4. **Reader/parser `:root,`-group mismatch** — `defaultReadRootCss` collects grouped `:root, .x {}`
   but `parseRootVars`/`isDarkScheme` only match `:root{`; a colour token on a grouped selector vanishes.
5. **Surfaces + CSP** — only the emulator is wired; the exported **player** uses a sha256-pinned CSP
   that will REFUSE the inline shim `<script>` unless its hash is added.

**What HELD (verified):** the fragile-token detector is complete; the resolver reuse is byte-faithful;
and the **no-restore-base scheme model is genuinely correct and simpler** — the pin sits on `<html>`
(never the consuming element), so `section.light/.dark` wins by tree depth and the static compiler's
P1 restore-base gymnastics are unnecessary. The shim cleanly fixes the `:root` tier (core text +
Mermaid/diagram). It is not wrong — it is scoped to `:root`, and that is now the design, not a gap.

## The layered architecture (corrected)

Split the fallback by WHERE the fragile colour is declared:

- **`:root` tier → the runtime shim.** Core (`--bg`/`--text-*`/`--accent`/`--border`/`--pass/warn/fail`)
  and the engine-wide `--cat-*`/`--diagram-*` diagram palette are all `light-dark()` on `:root`
  (verified in `themes/*.css`). The shim flattens them at load. This is also what lets us **delete the
  `--viz-*` shadow vocabulary + gate**: `--viz-*` existed only to keep SVG paints off raw *core*
  tokens (so the static compiler wouldn't flatten core deck-wide); with the shim making core old-safe
  at `:root`, an SVG paint may read `--text-heading` directly. The tax the whole pivot was about is gone.
- **`.chart-frame` tier → the static compilation.** The `--chart-*`/`--state-*` recipe on `.chart-frame`
  and the direct-in-paint `color-mix()` painters (funnel/pie/quadrant/radar/state-disc/math) are
  flattened at build to flat planes + flat paints — the ONLY thing that covers colour-functions living
  inside paint properties. This is the parked static work (`build-chart-palette-css.js` Phase 1–2),
  brought in WITHOUT its diagram plane (the shim owns diagram now) and WITHOUT `--viz-*`.

Together they replace #908. The shim's scheme model (pin on `<html>`) also serves the chart planes'
per-slide overrides, so the two tiers share one scheme mechanism.

## What ships, what deletes

- **Ships:** `lib/core/color-shim.js` + `dist/color-shim.min.js` (wired into every viewer surface); the
  static chart-palette compilation for the `.chart-frame` tier.
- **Deletes:** `tools/build-chart-compat-css.js` (#908) — ONLY after both tiers demonstrably cover their
  scope. The `--viz-*` namespace + the viz-hygiene gate are NOT brought over from the parked branch.
- **Untouched:** components author modern colour as normal; the PDF renders under modern Chromium (no-op).

## Bugs + gaps to fix before #908 can be deleted

1. `padStart` → add a `padStart`-free hex in `color.js` (or in the shim path) AND wrap `installColorShim()`
   in try/catch so a future method-gap degrades to "no worse than nothing", never a thrown black-out.
2. `resolveFlatPalette` → resolve the token's own value, not `var(--name)` (composite-value gap).
3. Align `parseRootVars`/`isDarkScheme` with the reader's `:root,`-group awareness.
4. Wire the player through its sha256 CSP (add the shim script's hash); wire runtime + docs/Studio.
5. Bring the static chart compilation (Phase 1–2) from the parked branch; keep #908 until it's proven.

## Testing plan (HARD RULE #23)

- **Shim core + wiring:** jsdom/Node — injected `:root` matches `resolveDeclarationValue`, both schemes,
  P1 mixed-scheme cascade, cross-origin skip, grouped-`:root`, the composite-value path.
- **Static chart tier:** the parked branch's compiler tests + gallery pixel-diffs (already built).
- **A `.chart-frame` coverage test** that would fail on a `:root`-only shim — the tripwire for gap #1.
- **Real old browser:** UNVERIFIABLE here (modern Chromium only) → UNVERIFIED, handed to the on-device pass.

## Honest risks

- **The shim's fallback path is JS-only + CI-invisible.** Mitigated by the device pass; a human gate, not
  a structural one (the static tier keeps the structural guarantee for charts, where it matters most).
- **Two mechanisms, one problem.** The layered split is more moving parts than one approach; the payoff is
  the `--viz-*` tax deleted and the shim's simpler scheme model, at the cost of a shared scheme contract
  both tiers must honor.
- **Reversibility.** The parked static branch remains a complete single-mechanism fallback if layering proves fragile.

## Sequence

1. This doc (revised) — layered architecture recorded (done).
2. Shim core + scheme-switching + `@import` reader + emulator wiring + bundle (done, on this branch).
3. Fix the trio's bugs: `padStart`+try/catch, composite-value, reader/parser group, (this step).
4. Bring the static chart compilation (Phase 1–2) from the parked branch; drop its diagram plane + `--viz-*`.
5. Wire the remaining surfaces (player via CSP hash, runtime, docs/Studio).
6. Delete #908 once both tiers are proven; export sign-off (dark + light); on-device pass.
