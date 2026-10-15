<!-- Evidence for ../2026-10-15-conformance-harness.md. Written by a read-only harvesting agent on 2026-10-15 at d2a6e6f; classifications are its reading, and rows marked UNVERIFIED were not confirmed by grep. Kept as the record the note cites, not maintained. -->

# Harvest: axes and joins for per-kind conformance harnesses

Source checkout: /home/user/lattice at HEAD (shallow clone: `git log` has 53 commits, so past-defect
evidence mostly comes from issue numbers cited in test headers, not from `git log`).
Legend for coverage: **full** = enumerates every value from the source of truth; **sampled** =
a derived subset; **hand** = a hand-written list or fixture; **none** = nothing found.
`NOT TRACED` = I did not reach the code that would decide it; this is not the same as "none".

## 1. Axes: values and source of truth

| # | Axis | Values | Source of truth (file:line) | Notes |
|---|---|---|---|---|
| A1 | Theme (palette file) | 33 files = 14 light/dark pairs + 5 a11y light-only | `lib/theme/files.js:28` `themeEntries()` over `themes/` | `-dark` files are 14-line `@import` + `color-scheme: dark` (`themes/indaco-dark/indaco-dark.css`). So the real palette axis is 19, and dark is a second axis |
| A2 | Color mode | 4: light, dark, system, inherited | `lib/core/resolve-color-mode.js:44` `COLOR_MODE_REGISTER` | Also per-slide `dark`/`light`/`print`/`color-light`/`color-system` modifiers. Dark has two implementations: a `-dark` theme file and `section.dark` over a light theme |
| A3 | Finish | 9 (+ none = 10) | `lib/finishes/presets.generated.js:7` `FINISH_PRESETS` | `backdrop:` restrains it: 5 strengths + 11 masks (`lib/core/resolve-backdrop.js:37-44`) |
| A4 | Size / aspect | 8 distinct canvases (16 names with aliases) | `lib/engine/sizes.js:44` `SIZES` | `mobile-landscape` adds `wideFactor` scaling (`sizes.js` ~90) |
| A5 | Size family | 4: wide, square, tall, strip | `lib/adaptive/families.js:64` `FAMILIES` | Components declare `adapt.families`: 63 reflow, 12 native (manifest census) |
| A6 | Render path | 3: `lib/engine` (canonical), `lib/runtime` mirror (3,302 lines), Export-to-Marp `lib/core/marp-bundle.js` | `engineering/workflow.md:823` two-renderer rule | Mirror gap register: `lib/core/marp-fidelity.js:46` LEDGER, 31 constructs: 13 mirrored, 11 unmirrored, 5 baked, 1 moot |
| A7 | Output format | 6: pdf, pptx, odp, png, zip(imageset), html | `lattice.js:852` `OUT_FORMATS`; `lib/cli/options.js:32` `OUTPUT_EXTS` | Sub-modes: pdf {plain, --present, --print, --raster, --chrome-pdf, --paper×3×orient}; pptx/odp {image, --editable}; zip {png,jpeg,webp × image-mode}; plus video, marp |
| A8 | HTML render target | 4: default, --player, --read, --fluid (+ --present for PDF) | `lib/cli/options.js:75-79` | `--player-mode` light/dark/system (`options.js:29`) |
| A9 | Split | on (intrinsic at square/portrait/story/mobile) / `--no-split`; cover/body/closing/carousel page roles | `test/oracle/split-oracle.json` (recomputed from manifests by `tools/bless-split-oracle.js`); `lib/core/split-envelope.js` | 22 manifests declare `split` |
| A10 | Surface (where rendered) | CLI export, docs Playground/Studio preview (DOMPurify `sanitizeSlideHtml`), VS Code Marp preview, exported player | `docs/src/lib/sanitize-slide-html.js`; `engineering/gotchas/vscode.md:27` | |
| A11 | Browser engine | 3: Chromium, WebKit, Gecko | `docs/playwright.config.*` projects; `.github/workflows/webkit-baselines-nightly.yml` | Every PR render gate is headless Chromium |
| A12 | Print / grayscale / texture | `print` modifier, `--print`, 12 `--cat-N-texture` | `lib/core/accessibility-textures.js`; `test/unit/core/accessibility-textures.test.js:196` | |
| A13 | Lang / direction | `lang:` key (html lang + read-aloud). **No `dir`/RTL axis exists** | `docs/src/components/studio/front-matter-keys.ts:18` | Component CSS: 321 physical `left/right` declarations vs 33 logical (grep, `lib/components/**/*.css`) |
| A14 | Lens (reader view) | per-deck `lenses:` defs, `_lens` tags | `docs/src/lib/lente/project.ts` | Prose claim: "changes which slides are shown, never their look" (`design/skills/lens.md`) |
| A15 | Motion | `motion`, `motion-style`, `motion-speed`, `player-motion`; slide classes `motion-on`, `chart-anima` | `lib/core/resolve-motion.mjs:31,90` | No engine-side value list (design doc §3: `STATIC_VALUES`, docs-site only) |
| A16 | Density / capacity | `density` (29 manifests), `capacity` (23), `adapt.capacity` (8), `venueCapacity` (75), `pane` budget (75) | `lib/runtime/axis-dom-catalog.generated.js` | |
| A17 | Venue | 4: laptop, huddle 1.15, conference 1.3, hall 1.5 | `lib/core/resolve-venue.js:38-52` | |
| A18 | Reveal / build states | **No such axis**; the nearest are motion and the Guide's gesture (`gesture` on 75/75 manifests) | grep of `lib/core`, `lib/engine` for reveal/fragment: nothing | |
| A19 | Speaker notes | present/absent × `--strip-notes`, `--notes`, `--notes-icon` | `lib/cli/options.js:67-74` | |
| A20 | Deck registers | mode 3 tokens; stamp 13; tone-style 3; rule 5; eyebrow 5; headline 4; lift 2; cards 4; corners 2; chart-finish 3; tag 3×3×5×3; spectrum 5 + edge 5 (+card, card-edge, trim); inline-code 2; spark 2×3×2; fit 3 + guards 2; venue 4; preset | `lib/core/resolve-*.js` (lines in report); 68 front-matter keys in `front-matter-keys.ts` | |
| A21 | Slide modifiers | 35 groups, 198 tokens | `lib/components/index.js:499` `MODIFIER_GROUPS` | |
| A22 | Variant | 224 variants on 53 components | manifests | |
| A23 | Plugins | 7; `--disable-plugin`, `--default-plugins` | `lib/plugins/registry.generated.js`; `lib/plugins/extension-points.generated.json` (1 point: chart `kernel`) | |
| A24 | Install path | built-in vs installed package | `test/integration/export/installed-package(s).test.js` | |
| A25 | Hosted in a pane | component as side/stack pane of a split slide | manifest `pane` (75/75) | Calibrated by `tools/calibrate-capacity.js --pane`, on demand |

## 2. Coverage matrix: kind x axis

Kind = component (75) unless stated. Tier: PR = `test:integration:pr` (parity, export, invariants);
NIGHTLY = `test:integration:nightly` or `integration-nightly.yml`; DEMAND = on-demand script.

| Kind x axis | Coverage | Evidence | Tier |
|---|---|---|---|
| component x theme (rendered contrast) | hand (gallery.md, 57/75) x full themes | `palette-sweep.suite.js:97-105`, `tools/palette-sweep.js:116` | PR |
| component x theme (axe, slide-contrast) | hand deck x 2 themes (indaco, indaco-dark) | `slide-contrast.test.js:86-88`, `axe-a11y.test.js:125` | PR |
| component x color mode | sampled: 75 x light/dark, page count only | `component-galleries.test.js` (dark parity) | NIGHTLY |
| component x a11y themes x dark | **none** (token audit reads one mode per file) | `tools/contrast-audit.js:69` isDark only from file | - |
| component x finish | **none** for text-over-finish; finish-ink full over themes x 6 covers x 6 modifiers but finish-agnostic token probe | `finish-ink-matrix.test.js:27-40`; `finish-canvas-matrix.test.js` (4 bookends x 6 modifiers, indaco only) | PR |
| component x size family (fires) | full over family-reflowing components x 5 sizes, indaco light only | `tools/check-family-tiers.js:120-126`, `test/oracle/family-conformance.json` | NIGHTLY |
| component x size family (overflow) | full gallery slides x 5 sizes, `--no-split` | `test/oracle/family-overflow.json` | NIGHTLY |
| component x size `mobile-landscape`, `standard`, `4K` | **none** rendered (unit `sizes.test.js` only) | grep `size: mobile-landscape` in test: 1 unit hit | - |
| component x split (static: what splits) | full (recomputed from manifests) | `split-oracle.json`, `checkSplitOracle` | PR (build:check) |
| register x split page (token rides) | full over register token lists | `test/unit/core/split-surface-registers.test.js:22-30` | PR |
| register x split page (CSS matches) | hand | `split-finish-surface`, `split-finish-pane`; fixes #2656, #2674 | PR |
| component x render path (runtime) | hand: 4 parity tests (cards-align, mode-geometry, overflow-marker, frontmatter-refire) | `test/integration/parity/runtime-*.test.js` | PR |
| component x Export-to-Marp | per construct, not per component (31-row ledger), 2 fixtures | `lib/core/marp-fidelity.js:46`; `marp-kit-render.test.js:78` | PR |
| component x output format | hand (preview-deck.md, chart-diagram-deck.md) | `export-formats.test.js:24-27` | PR |
| component x PPTX/ODP --editable | hand (preview-deck) | `export-formats.test.js:126-150` | PR |
| notes x output format | **full** (derived from OUT_FORMATS) | `strip-notes-every-format.test.js:76-104` | PR |
| component x player/read/fluid/present | hand fixtures | `html-player.test.js`, `read-export.test.js`, `fluid-panes.test.js`, `present-mode.test.js` | PR |
| component x player contrast after dark toggle | hand (~12 decks), ratchet of 242 sub-AA runs | `test/oracle/player-contrast.json` | NIGHTLY |
| component x Present Guide handles | **full**, 2 orientations, derived set | `test/unit/components/guide-handles.test.js:1-30` | PR (unit) |
| component x Studio sanitizer | hand: 2 SVG attributes pinned | `test/unit/core/sanitize-slide-html.test.js:55-66` | PR (unit) |
| component x WebKit | sampled: chart + mermaid galleries, report-only | `webkit-baselines-nightly.yml` | NIGHTLY |
| component x Gecko | none for components (e2e projects only) | NOT TRACED beyond config | - |
| component x print/texture | hand (charts only); theme x texture ids only referenced | `accessibility-textures.test.js:218-228` | PR (unit) |
| component x lang/RTL | **none**; no axis | - | - |
| component x lens | NOT TRACED (lens projects source slides; likely pre-render) | `docs/src/lib/lente/project.ts` | - |
| component x motion | hand e2e (`shipped-motion.spec.ts`), chart-marks surface in modifier-effects | `tools/check-modifier-effects.js:17-19` | DEMAND/e2e |
| component x capacity at soft | none rendered in CI; static lint tables full | `venue-capacity.test.js` (unit, 75/75); `tools/calibrate-capacity.js` | DEMAND |
| component x venue | static full (manifest numbers vs lint vs docs); rendered DEMAND only | `test/unit/components/venue-capacity.test.js:1-25` | PR static |
| component x slide modifier | full-ish (72/75; collage, columns, rows missing) x 198 tokens x 7 surfaces | `tools/check-modifier-effects.js:55`, `lib/core/modifier-effects.generated.json` | **DEMAND only** |
| component x deck register (rendered) | **none** in CI; registers tested at resolve level only | `resolve-*.test.js`, `lfm-conformance.test.js` | PR unit |
| chart x chart-finish | source only | `test/unit/components/chart-finish-css.test.js` | PR unit |
| chart x theme (no black paint) | hand 3/33 x 2 schemes | `tools/check-viz-render.js:71-72` | PR |
| chart-family kernel x members | hand 3 fixture cases / 24 members | `lib/plugins/chart-family/chart-family.fixtures.md` | PR |
| component x deck lint | full (every gallery, `--strict`) | `tools/lint-deck.js:59-76`, `lint:deck:all` | PR + pre-push |
| component x hosted in pane | DEMAND calibration only | manifest `pane`; `calibrate-capacity.js --pane` | DEMAND |
| theme x finish | finish-ink full themes (token probe) | `finish-ink-matrix.test.js` | PR |
| theme x mode (token AA) | 14 pairs full, 5 a11y light only | `tools/contrast-audit.js:69` | PR |
| plugin x theme | NOT TRACED | `conformance.test.js:143-211` | - |
| browser x surface for Studio | e2e projects webkit-phone/tablet, gecko | `docs/playwright.config.*:197-228` | nightly e2e |

## 3. Riskiest uncovered joins (with evidence)

1. **Register or modifier x split page, CSS layer.** Token-ride test is full, CSS match is hand. Two fixes in two days: `ed9a233` (#2656, tone-edge on auto-split story pages), `7912dd7` (#2674, tone rail/glow). Earlier: #2305 finish missing on 6 of 6 split covers (`lib/core/surface-registers.js:1-30`).
2. **Finish x component text contrast.** No rendered check; doc §3 measured this.
3. **Finish x bookend x canvas modifier.** #1656's first fix was wrong on four combinations (`finish-canvas-matrix.test.js:1-27`); the matrix is indaco only and 4 components.
4. **a11y themes x dark.** `contrast-audit.js:69` decides dark per file; a11y has `light-dark()` dark branches (39 in a11y-base) and no `-dark` file, so they are never audited. Player: a11y Mermaid pie 1.00:1 after dark toggle (doc §3; prose).
5. **Deck register x component, rendered.** cards: inert on stats/kpi/actors. `modifier-effects.generated.json` already records stats has no `card-row` surface, but it is on-demand and not joined to card-row evidence.
6. **Component x Studio sanitizer.** `vector-effect` and `dominant-baseline` shipped stripped in every Studio artifact and exported player; "reverting ADD_ATTR to [] left the whole unit suite green" (`sanitize-slide-html.test.js:55-61`). Any new SVG attribute repeats this.
7. **Component x WebKit.** #2303 charts and #2326 mermaid labels paint a third of a font-size high in Safari; three example decks still fail a second WebKit defect; per-PR gates are Chromium-only.
8. **Component x Export-to-Marp.** A flowchart deck exported 13 slides as 14 pages (#1325, `marp-kit-render.test.js:1-12`); 11 constructs unmirrored.
9. **Component x size mobile-landscape (wideFactor).** No rendered test at 1560x720; families oracle covers hd, square, portrait, story, mobile only.
10. **Component x size family x theme/dark.** Family conformance pinned to `theme: indaco` light (`check-family-tiers.js:229`).
11. **Component x editable PPTX/ODP.** Text boxes from one preview deck; no per-component text-extraction check.
12. **Variant x contrast.** `list-steps converge` 3.01:1 (doc §3, prose); variants are absent from gallery.md.
13. **Chart x chart-finish x theme.** etching/tone source-tested only; no-black-paint 3/33 themes.
14. **Kanban sub-bullets x palette.** gallery-jargon found 18 palettes failing (worst 3.13:1, `palette-sweep.suite.js:83-90`). Content shape (a slot form) is itself an axis gallery.md under-samples.
15. **Component x RTL.** No axis at all, 321 physical left/right declarations. Whether RTL is in scope is an owner decision; today a `lang: ar` deck renders LTR silently (NOT TRACED by render).

## 4. Combinatorics and a proposal

Real counts: 75 components, 947 generated gallery slides (doc §3), 224 variants, 19 palettes x 2 schemes
(33 files), 10 finish states, 8 canvases / 4 families, 4 color modes, 3 render paths, ~12 export targets,
198 modifier tokens, ~16 registers with 2-16 values.

- Full product, CSS axes only: 947 x 33 x 10 x 4 families = 1.25M slide configs; with registers
  (mode 4 x spectrum 5 x rule 5 x eyebrow 5 x headline 4 x lift 2 x cards 4 x corners 2 x chart-finish 3)
  x 480,000 more. Unbuildable.
- Measured unit cost (palette sweep): render once ~15 s, re-theme in place 32 palettes ~120 s for 117 slides
  = **about 32 ms per slide-config** (`palette-sweep.suite.js:24-28`). A token-probe page is cheaper still:
  finish-ink covers ~3,500 cases in 16.9 s (`shard-weights.json`).

Split the axes by cost:
- **Restyle axes** (toggle in place on one render): theme, scheme, finish, backdrop, class-token registers,
  modifiers, venue, print.
- **Re-render axes**: size/family, split, render path, export target, plugins, fit, lens, browser.

Proposal:
1. **Per PR, changed instances x one axis at a time, all values.** About 12.6 slides per component x
   (33 themes + 10 finishes + 4 modes + ~60 register values + 198 modifiers ~= 305) x 32 ms ~= 2 min per
   changed component, plus 8 canvas re-renders (~30 s). A changed theme or finish runs the transposed case:
   947 slides x 1 value x 2 schemes ~= 1 min.
2. **Per PR, pairwise on the restyle axes for one fixed sample of slides**: the covering array is
   bounded below by 33 x 10 = 330 configs. 330 x 120 sample slides x 32 ms ~= 21 min. Too heavy per PR;
   nightly.
3. **Nightly, full one-axis-at-a-time over every instance:** 947 x ~305 x 32 ms ~= 2.6 h, about 40 min
   over 4 shards. Plus pairwise over re-render axes on canvas x split x render path x target (8 x 2 x 3 x 6 =
   288 deck renders of the all-galleries deck).
4. **Trust guard**: in-place re-theming was once wrong in both directions (appended stylesheet,
   `palette-sweep.suite.js:30-40`). Every restyle axis needs a native reconciler like `tools/palette-native.js`.
   Registers stamped by a transform (cards: `stampCardsAlign` fills from manifest) are not pure class toggles
   and belong in the re-render group: NOT TRACED per register.

## 5. Relationships that should become clauses

| Relationship | Clause | Existing oracle to reuse |
|---|---|---|
| Register R targets a surface S; component C has S | `component.register.<R>.honors` or declared `n/a` with reason | `modifier-effects.generated.json` (surfaces per component) + `lib/components/surfaces.js` |
| Register R decorates the page | `register.<R>.split.rides` and `register.<R>.split.css-matches` (two clauses: token and selector) | `surface-registers.js`, `split-surface-registers.test.js` |
| Finish F paints behind C | `finish.<F>.text-contrast` over every component, both schemes | `finish-ink-matrix` probe |
| Theme T supplies tokens | `theme.<T>.dark-side.audited` (both branches of every `light-dark()`) | `contrast-audit.js` |
| C declares `adapt.families` | `component.family.<fam>.fires` x scheme | `family-conformance.json` |
| C emits SVG attribute A | `surface.studio.sanitizer.keeps(A)` derived from engine output | `sanitize-slide-html.js` `ADD_ATTR` |
| Construct X on Marp path | every construct used by C has a fidelity ledger row | `marp-fidelity.js` LEDGER |
| Extension point P | every member exercised (24 chart kernels) | `extension-points.generated.json` |
| Output format O | the coverage deck round-trips through O | `strip-notes-every-format` pattern (derive from OUT_FORMATS) |
| C declares `venueCapacity`, `pane` | rendered at soft capacity at each venue and in a pane | `calibrate-capacity.js` |
| Lint rule L names a component grammar | the gallery of every C lints clean | `lint:deck:all --strict` (already full) |
| C renders a nameable part | declares `handles` | `guide-handles.test.js` (already full; the model) |
