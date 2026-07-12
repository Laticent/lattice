---
status: in-progress
summary: >
  Chart colour goes BLACK on old browsers (Safari < 16.2 / old smart-TV Chromium) across every
  surface, for one structural reason: all old-browser chart colour lived behind an
  `@supports not (light-dark)` fork that headless Chromium NEVER executes — so four regressions
  (#908 → #925 → #930 → #936) rode through it invisibly. The fix DISSOLVES the fork instead of
  patching it: STATIC PALETTE COMPILATION. Every chart colour is compiled at build time to plain
  literals + plain `var()` (a 2016-era feature, six years below the color-mix (16.2) / light-dark
  (17.5) floor), scheme-switched by plain selector cascade, and the `@supports` fork is DELETED.
  Modern and old browsers then run byte-identical chart CSS, so a future regression surfaces on
  modern — where it is testable. One path fixes the figure-black (D1), swatch-black (D2), and
  mermaid-uncovered (D6) defects at once and deletes the fragile `:is()` splitter (D4). The recipe
  becomes a build-time INPUT (sentinel-delimited in chart-family.css), resolved per theme to two
  flat planes (default scheme + subject-anchored opposite-scheme override + strict OS arm) by
  tools/build-chart-palette-css.js, stripped from the shipped bundle, and injected into every
  dist/themes/*.min.css AND the emulator. Real old-iOS behaviour stays UNVERIFIED (HARD RULE #23):
  the sandbox has only modern Chromium, but the design makes Chromium parity materially stronger
  evidence than the fork ever allowed — old iOS now runs the SAME bytes Chromium does.
version: 1
supersedes: 2026-07-11-old-browser-chart-fallback.md
extends: 2026-07-07-html-lattice-player.md
---

# Chart colour — static palette compilation

## The problem (root cause)

Every chart colour in Lattice is authored through `light-dark()` and `color-mix()`. An engine
lacking those functions drops the WHOLE declaration invalid-at-computed-value: an SVG `fill` falls
to its black initial value, an HTML `background` vanishes. Charts render solid black or colourless.

The former mitigation (`2026-07-11-old-browser-chart-fallback.md`) baked flat-literal twins inside
`@supports not (color: light-dark(#000,#fff))`. That block is **inert on modern engines and never
executed by headless Chromium** — the only browser CI can drive. So the fork was a blind spot:
changes looked green on modern and silently broke old. Four regressions rode through it
(#908 born → #925 opened the Read·Article figure gap → #930 widened mermaid → #936 codified the
figure gap with a false "Read·Article is modern-only" premise). The exported player compounds it —
`lib/export/player-core.mjs` resolves `light-dark()` at export but **never `color-mix()`**, so
`color-mix()` ships verbatim and dies on the old engine.

This is a **structural** fault, not a one-off: any old-browser chart colour hidden behind an
untestable fork will keep regressing.

## The decision

**Delete the `@supports` fork. Compile every chart colour to plain literals + plain `var()` at build
time, scheme-switched by plain selector cascade.** `var()` shipped in Safari 9.1 (2016), well below
the `color-mix` (16.2) / `light-dark` (17.5) floor, so **modern and old browsers execute
byte-identical chart CSS**. A future regression then surfaces on modern, where it is testable.

Confirmed sub-decisions: (i) the offline mixer adopts browser-style OKLCh chroma-reduction
gamut-mapping so old-browser literals match the modern render; (ii) continuous ramps (choropleth,
progress) quantize at K ≈ 16 buckets so they compile to literals; (iii) colour-parity only this
round — word-cloud and roadmap/timeline **layout** breaks on old WebKit are tracked separately.

Rejected: a player-only `resolveColorMix` (leaves Studio/Playground swatches black; preserves the
fork), extend-compat / scope-agnostic-paint (preserve the fork), `@property` typed props (Safari
16.4, above the floor), `@layer` ordering (declared-but-inert in this engine — see
`engineering/cascade.md`; specificity-by-subject is used instead).

## The mechanism

### The recipe is a build-time INPUT
The chart colour recipe (`--chart-cat*`, `--state-*`, `--chart-rule`, `--chart-cat-base`, and — in
phase 2 — the enumerated paint tokens) lives between `>>> chart-palette-recipe >>>` sentinels in
`lib/components/chart/_chart-family/chart-family.css`. It is never shipped raw:
`tools/build-css.js` strips the sentinel region from `dist/lattice.css`, and
`tools/build-chart-palette-css.js` compiles it per theme.

### Two flat planes per theme
For each theme the compiler resolves every recipe token to two flat literals (via the shared offline
evaluator `lib/core/resolve-token-expr.js` — the same math already trusted in `dist/`, pinned to
Chromium by `test/integration/parity/color-parity.test.js`) and emits:

1. **Default plane** — the theme's own declared scheme, on the kernel's own selectors INCLUDING the
   bare `.chart-frame`, so the Read·Article `<figure>` re-host resolves identically to a slide
   (figure == section for free — this closes **D1**).
2. **Override plane** — the OPPOSITE scheme, as a compound-/descendant-SUBJECT on a canonical anchor
   union (`.chart-frame.dark`, `[data-lp-scheme=dark] .chart-frame`, and the strict OS arm
   `@media (prefers-color-scheme:dark){:root[data-lp-scheme=system] .chart-frame}`). Custom
   properties inherit by **tree depth, not specificity** — a default literal set directly on
   `.chart-frame` would beat an override inherited from an ancestor `:root`; so the override MUST
   land on the consuming element itself, at strictly higher specificity than the default. The OS arm
   byte-matches the exported player's strict form (`player-core.mjs`) — it keys on `=system`, never
   the loose `:not([=light])`, so a pinned export is untouched by the viewer's OS.

Because the recipe is now the ONLY chart-colour source (no `light-dark()` survives for the browser
to follow natively), the override anchors must capture **every** dark-selection path or modern dark
regresses too: the theme's declared scheme (build-time), the per-slide `section.dark`/`.light`
class, the player's `data-lp-scheme`, and the no-JS OS arm are all emitted.

### Two plane GROUPS — chart-frame and diagram
The compiler emits the planes above as the **chart group**, on the `.chart-frame` union. But the
`.chart-frame` skeleton is not the whole story: a **Mermaid** diagram renders on a bare
`section.diagram` (never a chart-frame), and **journey / roadmap / legal / decision** draw from the
OLDER *engine-wide* `--cat-N-fill/mark`, `--cat-on-fill/mark`, and `--diagram-*` palette — tokens the
themes define as `light-dark()` at `:root`. The retired `@supports` fork used to flatten those too
(its GLOBAL-REDEFINE arm, scoped to `section.chart-frame, section.journey, section.map, section.math`),
so deleting the fork regressed every one of those components to black on old engines. The fix is a
second **diagram group**:

- **Selector:** `section, figure` — the same ancestor the Mermaid + diagram paints target, so the flat
  literals land where those `var()` consumers can read them. A `:root` `light-dark()` def dropped by an
  old engine leaves `--cat-1-fill` guaranteed-invalid at `:root`; a flat literal declared directly on
  the `section` (a different element, so no same-element cascade fight) wins for that subtree. The
  override plane uses the TYPE-subject anchors `section.dark` / `[data-lp-scheme=dark] section` / the
  OS-system arms — every one strictly above the `section` base.
- **Token set (reference-driven):** every `var(--X)` referenced by the diagram-family CSS whose theme
  definition resolves through a modern function — auto-discovered, so it can't rot as the CSS changes.
  This captures the categorical family, the `--diagram-*` structurals, AND the core tokens those SVG
  paints read directly (`--text-heading`, `--bg`, `--bg-alt`, …). Emitting the core tokens flat on
  every `section` is a **no-op on modern** (the literal equals the theme's own resolved value) and the
  old-engine fix; the per-slide/player/OS overrides keep the scheme flip exact.
- **Component-derived + direct-paint tokens** ride `[diagram]`-tagged `>>> chart-palette-recipe >>>`
  regions, stripped from the bundle and compiled into this group (e.g. the Mermaid mindmap branch-edge
  `--mindmap-edge-N` — the one place a `color-mix()` sat in the PAINT itself, now a flat token).

Component *direct-paint* `color-mix()`/`light-dark()` (radar/journey/gantt/roadmap/kanban fills,
backgrounds, shadows) are the remaining phase-2 tail — a token can't carry a per-instance mix, so
those are refactored paint-side (the `fill-opacity` equivalent for a mix-with-transparent, or a
`data-*` bucket like the map ramp). Non-chart components (redline, video, checklist, verdict-grid) the
fork never covered stay out of scope (pre-existing; HARD RULE #18 logged, not pulled into this diff).

### One source of truth (HARD RULE #1)
The compiler is a pure module. `build-css.js` injects its planes into every `dist/themes/*.min.css`;
`lattice-emulator.js` appends the same planes to its palette CSS (the emulator loads palettes from
`themes/*.css` source, which never carried the recipe's dist-only fallback). So the CLI PDF, the
exported HTML player, the docs-site engine, and dist all carry identical planes.

## Phased plan

- **Phase 1 (this commit) — build layer.** Recipe → sentinels; the compiler; strip + inject; emulator
  wiring; cache-key fix; the old `@supports`-fork generator + test retired; `chart-palette-css.test.js`
  as the new gate. Modern-neutral: token consumers now read flat literals identical to what
  `light-dark()`/`color-mix()` resolved to.
- **Phase 2 — transforms + component paints.** Value-rewrite the ~81 inline `color-mix()` painters
  (canonical fill gradient, legend swatches → a CSS rule + `data-cat` not a presentation-attr,
  choropleth ramp quantized at K≈16, spine tokens, radar muted, mermaid edges) and the ~40 indirect
  local colour-token defs to read enumerated flat plane tokens. Live renderers stamp `data-lp-scheme`.
- **Phase 3 — marker collapse + gates + tests.** Collapse `:is(section.X, figure.X)` → `.chart-frame.X`
  (mermaid excepted, test-locked); wire the durable gates into `build:check`; extend the tests.
- **Phase 4 — verification + sign-off.** Simulation harness (labeled UNVERIFIED); export-byte
  sign-off (dark + light); full adversarial trio on the shipping diff.

## Honest limits

- **Old iOS / old WebKit is UNVERIFIED (HARD RULE #23).** The sandbox has only modern Chromium, which
  supports both functions and never runs `@supports not(…)`. The design's advantage is real but not
  proof: old iOS now runs byte-identical CSS to Chromium, so Chromium parity is materially stronger
  evidence than the fork allowed. Verification plan: get the device's exact WebKit version; re-shoot
  the photos post-fix (checking **journey** specifically — its presentation-attr resolution is the
  probe); if a real old Safari is reachable (BrowserStack / physical < 16.2), run the fixture gallery
  there. Everything from the sandbox is a labeled simulation.
- **"Byte-identical" is a MODERN-vs-OLD claim, not before-vs-after-modern.** Both engines eat the same
  baked literal. The compiled literal can differ from the pre-change *native* render by up to the
  offline-resolver↔Chromium tolerance (±3/255 per channel, per the parity test); the parity sweep
  pins sample expressions + the bridge tokens, not all recipe tokens × all themes. Gallery
  pixel-diffs are the backstop.
- **Phase-scoped coverage.** After phase 1 the recipe *tokens* are old-safe, but the inline
  direct-paint `color-mix()`/`light-dark()` painters still ship raw and are not yet covered on old
  engines. Old-browser paint coverage is completed in phase 2 — until then the "modern == old" claim
  holds for token consumers only.

## The durable invariants (gated at `build:check`, phase 3)

1. No runtime colour-function or presentation-attr `var()`/function in shipped chart paint (OUTPUT-scanned).
2. No `section.`/`figure.`-qualified chart-paint selector (marker-lock; mermaid's bare `:is` allowlisted).
3. Referenced ⊆ defined tokens, AND defined ⊇ the stripped recipe, in both planes / all themes.
4. No scheme-selecting construct outside the canonical anchor union.
5. Browser-parity ΔE at real tree depth (Chromium-pinned, reference-only).
6. Staged theme bytes == freshly-built `dist/` bytes.
