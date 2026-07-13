---
status: superseded
superseded-by: 2026-07-13-old-browser-color-shim.md
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

- **Selector: the SCOPED diagram/chart root union — `.chart-frame, section.diagram, .lp-figure`** — NOT a
  bare `section, figure`. A `:root` `light-dark()` def dropped by an old engine leaves `--cat-1-fill`
  guaranteed-invalid at `:root`; a flat literal declared on a diagram/chart ROOT (a different element,
  so no same-element cascade fight) wins for that subtree. The three arms cover every place diagram/chart
  content renders: `.chart-frame` (journey / roadmap / every chart-frame chart + their Read·Article
  re-host `figure.chart-frame`), `section.diagram` (a Mermaid slide — Mermaid is the `diagram` bucket,
  not a chart-frame; the SVG inherits from the section), and `.lp-figure` (the Read·Article re-host
  figures, incl. the bare `figure.lp-figure` a Mermaid diagram re-hosts into). The override arms compose
  onto each root (`section.diagram.dark`, `[data-lp-scheme=dark] .chart-frame`, the OS-system arms, the
  restore-base arm) — every one strictly above its base.

  > **Why scoped, not `section, figure` (a real defect, caught and fixed).** This group's token set
  > necessarily includes CORE engine tokens (`--bg`, `--text-*`, `--accent`, `--border`, `--pass/warn/fail`)
  > because Mermaid reads them DIRECTLY in an SVG paint (`fill: var(--text-heading)`). An early version
  > emitted those flat literals on a bare `section, figure` — i.e. on EVERY slide — which froze the whole
  > engine's colour system to build-time literals deck-wide, taking core colour off the theme's live
  > `:root light-dark()` and routing every slide's text/bg through this compiler's scheme logic. That is
  > **wrong and dangerous**: a bug in the scheme logic (and the red-team P1 proved such bugs exist) would
  > then mis-colour every slide, not just a chart. It was rationalized at the time as a "no-op on modern"
  > because the literal equals the theme's resolved value — but that only accounts for one static render;
  > it ignored native `color-scheme` following and the fallibility of the scheme selectors. Scoping the
  > emission to the diagram/chart roots (matching the retired fork's intent) confines the flattening to
  > where diagram content actually renders; the rest of the deck keeps its live `:root` core tokens.
- **Token set (reference-driven):** every `var(--X)` referenced by the diagram-family CSS (mermaid +
  journey + roadmap — scope-matched to the fork; legal / decision are deliberately out) whose theme
  definition resolves through a modern function — auto-discovered, so it can't rot as the CSS changes.
  This captures the categorical family, the `--diagram-*` structurals, AND the core tokens those SVG
  paints read directly. The per-slide/player/OS/restore-base overrides keep the scheme flip exact.
- **Component-derived + direct-paint tokens** ride `[diagram]`-tagged `>>> chart-palette-recipe >>>`
  regions, stripped from the bundle and compiled into this group (e.g. the Mermaid mindmap branch-edge
  `--mindmap-edge-N` — the one place a `color-mix()` sat in the PAINT itself, now a flat token).

Component *direct-paint* `color-mix()`/`light-dark()` (radar/journey/gantt/roadmap/kanban fills,
backgrounds, shadows) can't be carried by a shared token when the mix is per-instance — but every one
of them mixes a hue that **cycles a fixed palette** (the cat slots / the state set), so none is truly
dynamic: each compiles to a per-slot flat token the setter re-points, exactly like the map ramp. The
paint-side moves used: `fill: var(); fill-opacity: N` for a mix-with-transparent (radar area); per-cat
`--*-track`/`-ring`/`-phaseborder`/`-cardshadow` tokens set inline or by the nth-child rotation
(journey / roadmap / kanban); per-state `--state-*-glow-*` tokens (gantt focus lift); and — for the
inline-SVG paths the CSS sweep misses — the pie/quadrant radial stops read the compiled
`--chart-cat-N-g0/g1/g2`, and the journey face disc moved off a flaky `fill="var()"` presentation
attribute onto a CSS rule. **As of Phase 2k the three-pattern sweep — CSS declarations, inline
`style=`, and `fill=`/`stroke=`/`stop-color=` presentation attributes — is ZERO across the whole chart
bucket + math + mermaid.** Non-chart components (redline, video, checklist, verdict-grid, legal
obligation-matrix) the fork never covered stay out of scope (pre-existing; HARD RULE #18 logged, not
pulled into this diff).

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
- **Phase 2 (DONE, 2a–2k) — transforms + component paints.** Value-rewrote every inline `color-mix()`
  painter (canonical fill gradient, legend swatches → a CSS rule + `data-cat` not a presentation-attr,
  choropleth ramp quantized at K=16, spine tokens, radar area via `fill-opacity`, mermaid mindmap
  edges, progress `--pct` via `background-size`, roadmap phase-border, journey actor track/ring +
  faces, gantt focus glow, kanban card shadow, pie/quadrant radial stops) and the indirect local
  colour-token defs to read enumerated flat plane tokens. Added the **diagram plane group** (2g) so
  the engine-wide `--cat-*`/`--diagram-*` palette the fork's GLOBAL-REDEFINE arm covered is recovered
  on `section, figure`. Live renderers stamp `data-lp-scheme`. **End state: zero modern-fn / flaky
  presentation-attr paint anywhere in the chart family.**
- **Phase 3 (in progress) — marker collapse + gates + tests.** The **paint-flatness gate is LANDED**
  (`checkChartPaintFlatness` in `tools/check-ownership.js`, via `build:check`): with the recipe regions
  removed it fails the build on ANY `color-mix()`/`light-dark()` in a chart CSS paint AND any inline
  `style=`/`fill=`/`stroke=`/`stop-color=` modern-fn or flaky presentation-attr `var()` in a chart
  transform — the anti-rot lock for the Phase-2 end state (it immediately caught two multi-line neutral
  shadows a line-based sweep missed). Landing it also fixed the offline resolver to flatten a
  `color-mix()` embedded after bare lengths inside a `light-dark()` arm (a per-scheme box-shadow), so a
  whole scheme-structural shadow compiles as one token. Remaining: collapse
  `:is(section.X, figure.X)` → `.chart-frame.X` (mermaid excepted, test-locked); extend the plane tests.
- **Phase 4 (in progress) — verification + sign-off.** Per-feature demo deck shipped
  (`examples/chart-color-static-palette.md` + PDF). The **full adversarial trio ran on the shipping
  diff** (red team + Munger inversion + independent checker) and surfaced four real items, all fixed:
  - **P1 (red team, confirmed rendered regression).** A per-slide `_class` returning a slide to the
    theme's DECLARED scheme, on a deck pinned to the OPPOSITE scheme (`indaco` + `color-mode: dark` +
    `_class: … light`), rendered wrong-scheme — the deck-wide `[data-lp-scheme=dark] section` override
    (0,1,1) beat the base plane (0,0,1) and nothing restored the base for the exempted slide. Fixed
    with a **restore-base arm**: the base tokens re-emitted on `[data-lp-scheme=opp] <subject>.<base-class>`
    at (0,2,1), plus the OS-`system` mirror. Verified both directions; locked by a test.
  - **Invisible-rot seam (Munger inversion).** The compiler's flatten-guard and the gate keyed on a
    2-function DENYLIST (`color-mix`/`light-dark`), so a future `oklch()`/`lab()`/relative-colour would
    ship to old engines unthrown, ungated. Flipped both to an **old-safe ALLOWLIST** (`unflattened()` +
    `MODERN_COLOR_FN`) — anything not provably old-safe now fails the build.
  - **Wrong mix-space math (Munger inversion).** The offline resolver computed any non-`srgb` space as
    `oklab`, so a future `color-mix(in oklch, …)` would ship a literal that diverges from the browser
    (parity break on modern too). It now computes ONLY `oklab`/`srgb` and passes anything else through
    verbatim → the compiler throws.
  - **Gate blind spot (independent checker F1).** The map "unmatched" chip emitted `stroke="var()"`
    through a `${…}` template variable, invisible to the source-literal gate — the one real
    presentation-attr `var()` left. Routed through `data-unmatched` + a CSS rule (like the other
    swatches); the three-pattern sweep is now genuinely zero. Discipline noted: never build a
    presentation-attr paint from a dynamic value.

  Remaining Phase-4 gates need the human: **export-byte sign-off** (the demo deck renders dark + light
  for inspection) and **merge authorization**.

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
- **Phase-scoped coverage.** After phase 1 the recipe *tokens* were old-safe but the inline
  direct-paint painters still shipped raw; **phase 2 (2a–2k) completes old-browser paint coverage** —
  the "modern == old" claim now holds for the whole chart family, not just token consumers — and the
  Phase-3 paint-flatness gate (landed) now enforces it at `build:check`, so the end state can't rot.
- **Diagram-group blast radius — was deck-wide, now scoped (checker finding 4, FIXED).** The diagram
  plane re-declares ~20 core tokens (`--bg`, `--text-*`, `--accent`, `--pass/warn/fail`, …) flat,
  because Mermaid reads them directly in an SVG paint. The first cut emitted them on a bare
  `section, figure` — i.e. on *every* slide, deck-wide — which froze the whole engine's core colour to
  build-time literals and took it off the theme's live `:root light-dark()`. That is a real defect, not
  a cosmetic one: any bug in the compiler's scheme logic would then mis-colour the entire deck's text
  and background, not just chart content. **Fixed** by scoping the emission to the diagram/chart root
  union — `.chart-frame, section.diagram, .lp-figure` — so the flat core literals land only where
  diagram/chart content actually renders (journey/roadmap/chart frames + their `figure.chart-frame`
  re-hosts; bare Mermaid slides `section.diagram`; Read·Article re-host figures `.lp-figure`). Every
  other slide keeps its core colour on the theme's live `:root`. Gated: the compiler test asserts the
  scoped union and `doesNotMatch` any bare `section, figure` plane.
- **Nested `<figure>` under a per-slide `section.dark`/`.light` (checker finding 2, LOW).** The diagram
  base plane declares core tokens directly on `.lp-figure` (0,0,1), shadowing inheritance from a
  flipped parent section; the override arms match `.lp-figure.dark` / `[data-lp-scheme] .lp-figure` but
  not a plain `.lp-figure` inside a `section.dark`, so such a figure would read default-scheme core
  tokens. Exposure is ~zero today (diagram SVGs render div/svg content that inherits from the section;
  chart re-host figures carry `data-lp-scheme`). A `.dark .lp-figure, .light .lp-figure` descendant arm
  closes it if a nested-figure diagram ever ships.

## The durable invariants (gated at `build:check`, phase 3)

1. No runtime colour-function or presentation-attr `var()`/function in shipped chart paint (OUTPUT-scanned).
2. No `section.`/`figure.`-qualified chart-paint selector (marker-lock; mermaid's bare `:is` allowlisted).
3. Referenced ⊆ defined tokens, AND defined ⊇ the stripped recipe, in both planes / all themes.
4. No scheme-selecting construct outside the canonical anchor union.
5. Browser-parity ΔE at real tree depth (Chromium-pinned, reference-only).
6. Staged theme bytes == freshly-built `dist/` bytes.
