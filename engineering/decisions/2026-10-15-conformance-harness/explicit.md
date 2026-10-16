<!-- Evidence for ../2026-10-15-conformance-harness.md. Written by a read-only harvesting agent on 2026-10-15 at d2a6e6f; classifications are its reading, and rows marked UNVERIFIED were not confirmed by grep. Kept as the record the note cites, not maintained. -->

# Harvest: explicit per-kind expectations (repo @ HEAD, 2026-10-15)

Columns: kind | expectation | explicit source | enforced by | enrollment.
"CO" = `tools/check-ownership.js` (runs in `build:check`). "LC" = `lib/authoring/lint-core.js` (runs in `lint:deck`; `lint:deck:all --strict` in CI over examples/, exemplars/, baseline decks, component/bucket/integration galleries — `tools/lint-deck.js:65`). "RC" = `lib/authoring/review-core.js` (advisory suggestions; **off under `--all`**, `tools/lint-deck.js:169`, so it never runs on shipped decks in CI).
Enrollment: **auto** = gate discovers every instance from the tree; **opt-in** = instance must declare something to be checked; **hand-list** = a hand-maintained list names the instances; **none** = no check found. "UNVERIFIED" = could not confirm by grep in this sweep.

## Component (75 manifests)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| component | `function`+`form` coordinate is a SANCTIONED pair in design-system §4 matrix | design/skills/component.md:244; design/design-system.md:759 | NONE — each axis enum-checked alone (`lib/components/index.js:769`, FORMS :210); no pair check found | none |
| component | Manifest has name/function/form/substance/tags/description/skeleton | lib/components/manifest.schema.json `required` | `checkManifestSchemas` (CO) | auto |
| component | 3–5 tags, controlled vocab, complementary (not repeating own axes) | design/design-system.md:658-665; design/skills/component.md:245 | schema minItems 3/maxItems 5; `validate()` lib/components/index.js:816 | auto |
| component | every tag used by ≥2 components; no dead vocab term | design/design-system.md:669-671 | `checkTagClustering` CO:533 (+`SINGLETON_TAGS`) | auto |
| component | 3–4 `whenToUse`, 3–4 `antiPatterns` (naming escalation target) | design/skills/component.md:24-25 | shape only (`validate()` index.js:1420-1451); NO count floor (71/75 and 72/75 have ≥3 today) | none |
| component | `related` entries carry `when` clauses and resolve | design/skills/component.md:26 | `checkRelatedTargets` CO:1443 (resolve); `when` UNVERIFIED as gated (0/299 missing today) | auto |
| component | `variantDocs` entry for every declared variant | design/skills/component.md:27,264 | `validate()` lib/components/index.js:1479-1491 | auto |
| component | universal variants NOT listed in `variants` | design/design-system.md:443; design/skills/component.md:263 | `validate()` lib/components/index.js:847 | auto |
| component | tight `capacity` contract with real `escalateTo` | design/skills/component.md:18-19 | `validate()` shape only (index.js:1209); presence NOT required — 23 of 75 manifests declare `capacity` | opt-in |
| component | `capacity` ⇒ `stressDoc` proving the ceiling | design/skills/component.md:266; design/editorial.md (specimen voice) | `validate()` lib/components/index.js:1679 | opt-in (conditional on capacity) |
| component | `density` word budget present (calibrated by tool, not hand-raised) | design/editorial.md:184-188 | `checkDensityCoverage` CO:9506 (+`SANCTIONED_DENSITY_EXEMPT`); "density from calibrate tool only / not raised in same PR" — NONE | auto (presence) / none (provenance) |
| component | `variantAxes` whose members are CSS alternatives MUST declare `exclusive` | design/design-system.md:425-431 | NONE (3 of 53 variant-bearing components declare `variantAxes`) | none |
| component | CSS palette-blind (`var(--token)`) | design/skills/component.md:20; CLAUDE.md:310 | `checkHexLiterals` CO:3923 | auto |
| component | CSS margin-free | design/skills/component.md:21; CLAUDE.md:451 | `checkMarginDiscipline` CO:2736 | auto |
| component | CSS unlayered | design/skills/component.md:248; CLAUDE.md:565 | `checkCascadeLayers` CO:3789 | auto |
| component | CSS anchored on `> .cell-stage` | design/skills/component.md:21,248 | partial: `checkStageInsetOwnership` CO:3336, `checkSectionCqAnchoring` CO:2561; no "every rule anchors on .cell-stage" check — UNVERIFIED | auto (partial) |
| component | one CSS file covers native + post-processed render paths | design/skills/component.md:22,249 | NONE found | none |
| component | `@container` matches `adapt.mode` | design/skills/component.md:249 | `checkAdaptDeclarations` CO:5095 | auto |
| component | transform pure, idempotent, registered, wired in all three paths | design/skills/component.md:251; CLAUDE.md:304 | registered: `checkTransformerNames` CO:1372; idempotence: ONE split-panel fixture `test/unit/transformers/registry.test.js:64` + per-component tests; three-path wiring: NONE generic | hand-list |
| component | reuse shared kernels (`lib/core/html-lists.js`, `section-walk.js`), never copy; never import a component from lib/core | design/skills/component.md:28; lib/components/README.md:37-39 | NONE found for copy-detection or the import direction | none |
| component | `_`-prefixed folder is shared infra, not a component | lib/components/README.md:30-33 | loader/CSS walker skip (by construction) | auto |
| component | demo deck `examples/<name>.md` 6–10 slides | design/skills/component.md:253; CLAUDE.md:322 | NONE (discipline; CI renders PDFs it finds) | none |
| component | gallery rendered light + dark and looked at | design/skills/component.md:256 | page-count parity light=dark (integration); "looked at" discipline | auto (count) / none (look) |
| component | sample/skeleton never uses inline `- **Title.** body` on card layouts | design/skills/component.md:268; CLAUDE.md:391 | `validate()` via `findInlineTitleBodyLine` lib/components/index.js:1699 | auto |
| component | graduates into hand-curated galleries in a SEPARATE commit | CLAUDE.md:320; design/skills/component.md:270 | NONE (discipline) | none |
| component | gallery copy: no placeholder (TBD/TODO/lorem) | design/editorial.md:179-183 | `test/unit/components/gallery-contract.test.js:197` | auto |
| component | specimen voice: default sample H2 states the job as declarative sentence; variant copy names what changes; axis-default slide documents the axis | design/editorial.md:167-176 | `gallery-contract.test.js` `VOICE_DEBT`/`VOICE_EXEMPT` ledger (:56) — exempt list hand-kept; sentence-shape not mechanically judged (UNVERIFIED) | hand-list |
| component | Anatomy block matches the render | engineering/decisions/2026-06-06-layout-audit/README.md:71,349 ("add an anatomy↔render check") | NONE — `tools/anatomy-catalog.js` only resolves the id | none |
| component | no SVG text below the type scale (hardcoded px labels) | layout-audit README.md:72 (T4) | partially `checkTypographyTokens` CO:1755 for CSS; SVG presentation attrs UNVERIFIED | auto (CSS) |
| component | no `justify-content:center` overflow clip on lists | layout-audit README.md:70 (T2) | NONE as a rule; overflow probe catches instances rendered | none |
| component | glyph/connector iconography consistent per semantic role | layout-audit README.md:75 (T7) | `checkTypedGlyphs` CO:4312 bans typed glyphs; consistency of role→shape NONE | auto (glyph) / none (consistency) |
| component | no hidden cross-component CSS coupling (one file styles another component) | layout-audit README.md:78 (T10) | `checkLayoutOwnership` CO:1386 (UNVERIFIED scope) | UNVERIFIED |
| component | framing text (eyebrow/heading/subtitle) carries NO component `max-width` | lib/base/base.registers.docs.md:699-702 | NONE found (CO max-width arms are inset-calc, not framing) | none |
| component | framing paint sites read the `headline:` seam | lib/base/base.registers.docs.md:692-694 | rot-guard `test/unit/parsing/resolve-headline.test.js:92` (pinned covered set) | hand-list |
| component | declares `cards` ⇒ CSS reads `--cards-align` | lib/base/base.registers.docs.md:924-928 | unit test (in §3/§6 already) | opt-in |
| component | modifier offered only where its surface exists (surface derivation corrected by render proof) | design/design-system.md:544-578 | `npm run check:modifier-effects` → `lib/core/modifier-effects.generated.json` | auto (when run; not per-PR — UNVERIFIED cadence) |
| component | `render: svg|hybrid|html` + `renderNote` on every viz component; declared = derived | design/design-system.md:313-339 | `checkRenderNature` CO:5276 (static); `tools/check-render-nature.js` (rendered) | auto |
| component | svg-rendered viz emits motion roles so Anima animates it | design/design-system.md:318-326 | per-component tests only (bar/bullet/waterfall/…) | hand-list |
| component | plugin-requiring component declares `plugins.requires`; its gallery uses no undeclared plugin syntax | lib/plugins/README.md:278-289 | build fails (plugin host; README:287) | auto |
| component | `conformance: strict` Form tree match | design/forms.md | `lib/forms/frame-conformance.js` (in §3/§6) | opt-in |
| component | split treatment declared (`TREATMENTS`) | design/skills/chart-component.md:212 | `checkSplitOracle` CO:10759 / split:treatments:check | auto |
| component | universal-table guard | — (CO) | `checkUniversalTableGuard` CO:10986 | auto |
| component | guide handles declared | — | `checkGuideHandles` CO:5564 | auto |

## Chart component (24)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| chart | ≤ 6 categories; cycle never past slot 6; long tail → "Other" | design/skills/chart-component.md:30, 400 | NONE — 22 of 24 chart manifests declare no `capacity`, so `capacity-overflow` (LC:4715) cannot fire | none |
| chart | labels/values sit on the canvas, not on the colored mark | design/skills/chart-component.md:32,403 | NONE generic; `check:render` CANVAS_TEXT is opt-in per chart (chart-component.md:256) | opt-in |
| chart | the `## ` heading names the takeaway | design/skills/chart-component.md:34 | RC `chart-no-takeaway` (advisory, never on shipped decks) | none (CI) |
| chart | no color in the kernel; CSS consumes only `--chart-cat-N-*` / `--chart-state-*` | design/skills/chart-component.md:36,386 | `checkHexLiterals` for CSS; "kernel emits no color" UNVERIFIED; token-family restriction NONE found | auto (hex) |
| chart | contrast both canvases: text-on-fill ≥4.5, mark-vs-canvas ≥3, adjacent distinct | design/skills/chart-component.md:38 | `test/unit/palette/chart-contrast.test.js` (derived tokens); rendered: `check:render` 3 of 33 themes (in §3) | auto (tokens) |
| chart | kernel pure, returns `null` when empty, viewBox SVG with `--i`/`--mix` | design/skills/chart-component.md:379-380 | `checkChartKernels` CO:5354 ties `figureClass`; "null when empty" — NONE (doc §6 "edge cases ✗") | none |
| chart | cycles via `nth-of-type`, never `nth-child` | design/skills/chart-component.md:387,402 | NONE found | none |
| chart | CSS anchored on `:is(section.<name>, figure.chart-frame)` | design/skills/chart-component.md:388 | NONE found as a rule | none |
| chart | declares `projection.figure` | design/skills/chart-component.md:207 | `checkProjectionCoverage` CO:5796 | auto |
| chart | listed in Studio chart-count chip regex | design/skills/chart-component.md:242 | NONE ("SILENT") | hand-list |
| chart | listed in `CHART_SVG_SEL` (Present reveal + popovers) | design/skills/chart-component.md:244 | NONE ("SILENT") | hand-list |
| chart | listed in Compose `TABLE_UNSUITED` | design/skills/chart-component.md:246 | NONE ("SILENT") | hand-list |
| chart | categorical marks carry `data-cat`/`data-series` for CVD + print texture | design/skills/chart-component.md:248-251 | NONE ("SILENT") — doc §6 notes texture "charts only ◐" | none |
| chart | in `test/fixtures/chart-fit.md` so `check:chart-fit` renders it | design/skills/chart-component.md:252 | NONE ("SILENT"; stage-clip check skips it) | hand-list |
| chart | `NARRATORS` entry (spoken facts) | design/skills/chart-component.md:256 | NONE (optional) | opt-in |
| chart | series data is markdown list + inline-code pills (no front-matter/data-file input) | design/skills/chart-component.md:406 | NONE found | none |
| chart | member never tunes structure (edge, radius, gap) for itself; family token only | engineering/chart-styling.md:19-22 | `test/unit/components/chart-mark-edge-census.test.js` (edge only; derived from manifests) | auto (edge) / none (radius, gap) |
| chart | a finish moves color only; never adds/removes or touches structure | engineering/chart-styling.md:107 | UNVERIFIED | UNVERIFIED |
| chart | pinned in component-manifest test count + `EXPECTED_CANVAS` + layer3 `CHARTS` | design/skills/chart-component.md:213-224 | red tests (they are the hand lists) | hand-list |

## Diagram (Mermaid) / plugin-drawn figure

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| diagram | wide floored figure is keyboard-focusable (`tabindex=0`) | engineering/mermaid.md:180-184 | axe on hand-written `gallery.md` only | hand-list |
| diagram | `@media print` drops the floor so paper never clips | engineering/mermaid.md:185 | UNVERIFIED | UNVERIFIED |
| diagram | layout/capture code selects `[data-lattice-figure]`/`[data-lattice-hydrate]`, never `.mermaid` | lib/plugins/README.md:247-252,260 | `checkPluginMigration` drawnFigureClasses arm CO:8120 | auto |
| diagram | every capture waits until no placeholder is `pending`/`hydrating` | lib/plugins/README.md:254-258 | settle barrier; per-surface (CLI, Studio export) — hand-wired | hand-list |
| diagram | diagram scope selectors | — | `checkDiagramScopeSelectors` CO:6840 | auto |

## Theme (33)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| theme | `@theme` = filename = manifest name; variant `@import` = `extends`; no `@size` | design/skills/theme.md:313-315 | `checkThemeIdentity` CO:922 | auto |
| theme | 11 core tokens declared directly | design/skills/theme.md:316 | build fails (theme.md:345) | auto |
| theme | every surface/ink/accent token is a `light-dark()` pair; `--cat-on-*` flip | design/skills/theme.md:317-319 | `test/unit/palette/paired-token-parity.test.js` | auto |
| theme | categorical three-layer contract, both modes | design/skills/theme.md:320-322 | `checkCatContrast` CO:10124 | auto |
| theme | 12 `--cat-N-ink` committed, generated by recipe | design/skills/theme.md:323-327 | `derive-cat-ink --check` in build (tools/build.js:231); `checkCatInkDeclared` CO:9823 | auto |
| theme | mode-invariant categorical tier ⇒ pin `--cat-on-mark` | design/skills/theme.md:327-329; design/theming.md:300 | `test/unit/palette/diagram-ink-contrast.test.js:159` | auto |
| theme | `<name>-dark.css` is the 3-line wrapper | design/skills/theme.md:330 | `checkThemeModes` CO:1340 / `checkThemeRoles` CO:806 (UNVERIFIED exact shape) | auto |
| theme | full 98-token contract defined directly | design/skills/theme.md:332 | `checkThemeTokenParity` CO:4396 | auto |
| theme | `--seq-500` dark arm re-anchored (OKLab L 0.68) | design/skills/theme.md:334 | `test/unit/palette/composed-surface-contrast.test.js` (per-PR); `composed-contrast` nightly | auto |
| theme | palette listed in `token-parity.test.js` THEMES | design/skills/theme.md:337 | **stale instruction** — THEMES is derived (`baseThemeNames()`, token-parity.test.js:34) | auto |
| theme | every text token AA (4.5:1) both modes | design/skills/theme.md:39; design/theming.md:533 | `test/unit/palette/contrast.test.js` + `contrast-audit` (a11y dark gap in §3) | auto |
| theme | muted tiers: floors + ceiling (≥0.030 OKLab from body) | design/theming.md:640-648 | `checkMutedTierFloors` CO:11805 | auto |
| theme | `--muted-mark` never used for TEXT | design/skills/theme.md:350 | NONE ("checkMutedTierFloors cannot catch it") | none |
| theme | saturation reserved for `--diagram-stroke` + `--diagram-critical`; stroke reads on white | design/skills/theme.md:34-38 | stroke: `test/unit/palette/diagram-nontext-contrast.test.js`; "every routine surface pale" — NONE | auto (stroke) / none |
| theme | `--on-accent` curated for AAA vs this accent, both modes | design/skills/theme.md:39-40 | AA likely via contrast.test; AAA bar NONE found | none (AAA) |
| theme | accent clears contrast vs `--bg` AND `--accent-soft` | design/theming.md:651-652 | UNVERIFIED | UNVERIFIED |
| theme | adjacent categorical slots distinct (first 6) | design/theming.md:244-248 | `test/unit/palette/cat-adjacency-floor.test.js` — ratchet; 75 readings below floor | auto (ratchet) |
| theme | hljs syntax contrast + separation | — | `checkHljsContrast` CO:9984, `checkHljsSeparation` CO:12043, `checkSyntaxInkContrast` CO:13315 | auto |
| theme | texture tokens: all 12 or none; ids resolve | design/theming.md:338-342 | ids: accessibility-textures.test.js:218 (12-or-none ✗, in §3) | auto (ids) |
| theme | a CVD-safe brand variant is based on `a11y-base.css`, not a recolor | design/skills/theme.md:358 | NONE | none |
| theme | gallery + mermaid gallery rendered light & dark and looked at | design/skills/theme.md:331 | NONE (discipline) | none |
| theme | role names are engine property; a theme cannot invent/rename a role | engineering/decisions/2026-08-09-color-theme-ownership.md:38; CLAUDE.md:393 | `checkRetiredTokenNames` CO:1688, `checkPhantomTokenReads` CO:12322, `checkDanglingTokenReads` CO:13070 (UNVERIFIED that an INVENTED theme-only token is rejected) | auto (partial) |
| theme | a theme states whether it has a light face (carbone) | color-theme-ownership.md:86-88 | manifest `modes` required (THEME-1.0 §5) | auto |
| theme | reader refuses remote `@import`/`url()`/`expression` | spec/THEME-1.0.md:131-140 | spec/conformance/theme + `test/unit/spec/theme-conformance.test.js` | auto |
| theme | rule that paints an element directly is "reported" | spec/THEME-1.0.md:53-55 | UNVERIFIED | UNVERIFIED |
| theme | installed theme imports only base theme; refused theme fails render, never falls back | engineering/pipeline.md:143-152 | `lib/packages/gate.js` (runtime); test coverage UNVERIFIED | auto (runtime) |
| theme | no safe-default tokens / fallback contracts | — | `checkNoSafeDefaultTokens` CO:4895, `checkFallbackContracts` CO:11657 | auto |
| theme | Studio-derived theme emits `--cat-N-ink` tier | engineering/decisions/2026-08-09-color-theme-ownership.md:73-76 (#1411) | UNVERIFIED (doc says open) | UNVERIFIED |

## Finish (9)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| finish | accent alpha low (~5–16%) | design/skills/finish.md:18 | by construction: `coerceRecipe` clamps intensity 3–20 (lib/finishes/finish-generate.js:123) | auto |
| finish | RICH + OPAQUE faces, identical layer counts | design/skills/finish.md:20-24,245 | generated from one table (`EXPORT_FACES`); no explicit count-parity test found | auto (construction) |
| finish | opaque full-bleed fade ends on `var(--fin-canvas)`, never transparent; only bottom layer may | design/skills/finish.md:21-23; base.registers.docs.md:282 | `test/unit/css/finish-bottom-layer.test.js:107-157` | auto |
| finish | palette-blind; no hex / `url()` / `mask-image` / margin | design/skills/finish.md:26,246 | generator vocabulary (finish-generate.js:20) + `checkHexLiterals`/`checkMarginDiscipline` | auto |
| finish | has a point of view (signature layer), not a plain accent wash | design/skills/finish.md:29 | NONE (judgment) | none |
| finish | glyph mark defaults to empty; no baked monogram on deck-wide finish | design/skills/finish.md:247,33 | default `mark.type` from vocabulary (UNVERIFIED default) | UNVERIFIED |
| finish | one finish per slide (never two `finish-*`) | design/skills/finish.md:31,262 | NONE found (`finish` is a recognized prefix, LC:506) | none |
| finish | export sign-off: both engines, dark+light, human approval | design/skills/finish.md:249 | NONE (human gate) | none |
| finish | package folder + generated rule match | design/skills/finish.md:241 | `checkFinishPackages` CO:1004; `test/unit/core/finish-generate.test.js:30` | auto |
| finish | (mode: axis) changes type and box geometry, never color | lib/base/base.docs.md:1105 | NONE found | none |

## Treatment (tint-* / mark-*)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| treatment | `tint-corner`/`tint-edge` require an `at-*` placement ("a build-time validator catches it") | engineering/treatments.md:64,227 | **NONE found** — `follows` (lib/components/index.js:535) feeds autocomplete only; LC accepts the prefix (LC:506) | none |
| treatment | multi-accent tint owns its slot; cannot share with another tint | engineering/treatments.md:119 | NONE found | none |
| treatment | `at-*` on a mark is silently ignored (v1) | engineering/treatments.md:66 | NONE (no warning) | none |

## Texture set

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| texture | full emission byte-locked to golden | engineering/textures.md:223-227 | `test/unit/core/accessibility-textures.test.js:16` | auto |
| texture | a11y literal sets: no `var()`, no `<style>` | engineering/textures.md:235-236 | accessibility-textures.test.js:30 | auto |
| texture | sets APPENDED to `TEXTURE_SETS`, never inserted | engineering/textures.md:239 | golden order (:16) | auto |
| texture | every palette emits ⊇ ids it references | engineering/textures.md:241-245 | accessibility-textures.test.js:218 | auto |
| texture | adjacent tiles maximally different; shapes carry no own fill/stroke | engineering/textures.md:214-217 | NONE | none |

## Token / typography / z-plane

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| token | `--fs-*` 12-token system only | CLAUDE.md:388 | `checkTypographyTokens` CO:1755 | auto |
| token | per-slide class may change spacing/chrome/color, never a type role's size | engineering/typography.md:489 | `checkReadingRole` region CO:2882 (exempts rungs; "NOT covered: a component's own variant", CO:2915) | auto (partial) |
| token | `--fs-hero` class-driven only, never bound to an h-element | engineering/typography.md:65,189 | UNVERIFIED | UNVERIFIED |
| token | `--cat-N-ink` read WITH fallback `var(--cat-N-ink, var(--cat-N-mark))` at every consumer | design/theming.md:308-311 | `checkCatInkFallback` CO:9876 | auto |
| token | role names, no retired / `-light`/`-dark` names | CLAUDE.md:393 | `checkRetiredTokenNames` CO:1688 | auto |
| token | no phantom/dangling token reads | — | `checkPhantomTokenReads` CO:12322, `checkDanglingTokenReads` CO:13070 | auto |
| z-plane | noun paints on the plane its manifest declares; local 0–9 band, never a plane token | design/forms.md:472-515 | `checkZPlanes` CO:3501; build-forms.js:154 §4.3 equality | auto |
| token | a new color goes behind an existing role; else a vocabulary change with crosswalk entry | color-theme-ownership.md:99-103 | `checkHexLiterals` (partial) | auto (partial) |

## Form: Frame / Cell / Tile

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| form | every Cell keeps a defined gap; no two Cells share an edge | design/forms.md:569-572 | NONE generic found (UNVERIFIED) | UNVERIFIED |
| form | Cell clips (`overflow:hidden`); content cut at its Cell, never bleeds | design/forms.md:573-575 | NONE generic; `check:jank` collision is opt-in per `--anchor` | opt-in |
| form | stage owns the outer inset; body owns only gap / clip margin / own-surface padding | design/forms.md:608-613 | `checkStageInsetOwnership` CO:3336 + inset assertion in `tools/check-chart-fit.js` (chart-fit fixture list) | auto (static) / hand-list (render) |
| form | Cell is a direct child of section, never of `.cell-stage` | design/forms.md:418 | UNVERIFIED | UNVERIFIED |
| form | geometry/gap token refs resolve; Cell `css` flag = filesystem; `suppresses` never removes stage | design/forms.md:1038-1043 | `tools/build-forms.js:154` | auto |
| form | Tile `fits` → real Cell ids | design/forms.md:191; lib/forms/index.js:241 | lib/forms/index.js:257 | auto |
| form | accepts/fits enforced as author lint (warn) then blocking gate | design/forms.md:784-791 | NONE — no LC rule reads `accepts`/`fits` | none |
| form | caption is component-owned inside its stage Cell; footer Cell holds only footer+progress+pagination | design/forms.md:362 | NONE found | none |

## Deck setting / register / venue / profile

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| deck setting | explicit key always wins over preset | lib/base/base.registers.docs.md:74 | UNVERIFIED | UNVERIFIED |
| deck setting | `overflow-marker` is NOT a deck key (lint says so) | design/skill.md:114-116 | LC `stray-overflow-marker` :7667 | auto |
| deck setting | standing overflow-marker default refuses `off` | design/skill.md:138-141 | UNVERIFIED | UNVERIFIED |
| deck setting | deck `plugins:` cannot re-enable a disabled plugin | lib/plugins/README.md:274-275 | UNVERIFIED | UNVERIFIED |
| deck setting | `say:` key lowercase only; `caption:`/`captions:` retired | design/skills/speaker-notes.md:349; LC:823 | LC `say-key-case`, `caption-key-retired` :803 | auto |
| deck profile | profile sets whole-slide budgets; nothing inferred | design/skills/deck.md:235-245 | `lib/authoring/deck-profiles.js` (RC, advisory) | none (CI) |
| venue | spot `venue-*`/`scale-*` named by lint | engineering/typography.md:493 | LC `spot-scale` :7209 | auto |

## Slide modifier / inline marks

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| modifier | `numbered` divider needs a heading (else series silently skips) | lib/base/base.docs.md:1026-1029 | NONE ("lint:deck does not catch it") | none |
| modifier | `numbered` slide cannot carry `_footer:` | lib/base/base.docs.md:1020-1024 | NONE found | none |
| modifier | `insight-*` vocabulary is a closed edited set | lib/base/base.docs.md:615-616 | LC `unknown-class` :4321 (UNVERIFIED for insight-*) | UNVERIFIED |
| state mark | a layout supplies the WORDS, never the meaning; `[!]` = no everywhere | lib/base/base.docs.md:1254-1257 | UNVERIFIED (a private-copy unit test exists, base.docs.md:1314) | UNVERIFIED |
| inline pill | braces→pill; fenced/indented code never touched; `pill-literal`, `pill-shape-crowded` warn | lib/base/base.docs.md:1588,1613,1661 | LC `pill-literal` :3380 | auto |
| pane | panes: one setting per slide; frame components never in a pane | lib/base/base.docs.md:144,172 | LC `pane-*` rules (:2697) | auto |

## Deck (authored deck) / example / exemplar / gallery

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| deck | front matter present: `marp`, `theme`, `paginate`, `header`; `size: 4k` | design/skills/deck.md:229 | NONE found | none |
| deck | title slide `# h1` first; one-sentence closing; both `silent` | design/skills/deck.md:230; design/editorial.md (closing) | RC `title-incomplete` (advisory); `silent` — NONE | none |
| deck | every `## ` is a complete declarative sentence | design/skills/deck.md:231; design/editorial.md:15 | RC `label-title` :230 (advisory; off under `--all`) | none (CI) |
| deck | never three `content` slides in a row (rhythm) | design/skills/deck.md:21 | NONE | none |
| deck | ≤~40 words body, ≤6 bullets, ≤4 cards; split never shrink | design/skills/deck.md:24-25; design/design-principles.md:76-83 | RC `wall-of-text`, `density-*` (advisory); LC `capacity-overflow` :4715 (where capacity declared) | partial |
| deck | quote ≤~25 words; timeline ≤6 steps; diagrams ≥50% of slide area | design/design-principles.md:79-83 | capacity where declared; area — NONE | none |
| deck | zero lint errors | design/skills/deck.md:234 | `lint:deck:all --strict` (shipped decks) | auto |
| deck | no `**bold**` in kpi/stats ordered item; no bodyless number items | design/skills/deck.md:263 | LC `statement-ol-bold`, `number-slot-bodyless-item` :5046 | auto |
| deck | one paragraph = one source line (no hard wrap) | design/skill.md:155-175 | NONE ("nothing warns") | none |
| deck | inline `<script>` works synchronously | design/skill.md:215-225; AGENTS.md:153 | LC `author-script-defers` :7807 | auto |
| deck | list items parallel; card titles noun phrases of similar weight | design/editorial.md:113-131 | NONE | none |
| deck | no possessive stacking / monotone openings | design/editorial.md:35-58 | RC `possessive-stacking`, `monotone-openings` (advisory) | none (CI) |
| deck | metric has a referent; image has alt | RC rubric | RC `metric-no-referent`, `image-no-alt` (advisory) | none (CI) |
| example deck | per-feature `examples/<slug>.md`, 6–10 slides, front matter as galleries, no PDF in PR | CLAUDE.md:322; engineering/workflow.md:163-176,187-189 | no-PDF: `tools/check-no-pdf-in-pr.mjs` + `checkCommittedPdfs` CO:11412; slide count/front matter NONE; lint via `lint:deck:all` | auto (lint/PDF) / none (shape) |
| example deck | inline-title rule applies | test/unit/components/deck-authoring.test.js:31,94 | that test | auto |
| exemplar | deck count exact; committed PDF page count = source; lint-clean | exemplars/README.md:9-10; tools/lint-deck.js:60-61 | integration tier + `lint:deck:all` | auto (count is hand-pinned) |
| gallery (generated) | committed `.md` byte-matches generator unless `galleryAuthored` | design/design-system.md:902-906 | `build:galleries:check` | auto / opt-out |
| gallery (author-owned) | only light/dark page-count parity runs | design/design-system.md:906-908 | integration | opt-in |
| gallery (bucket survey) | rebuilt when a `sample` changes | design/design-system.md:895-900 | `build:bucket-galleries:check` (not rebuilt by `npm run build`) | auto (check) |
| gallery (showcase) | `examples/data-viz-gallery.md` generated from chart+math manifests; new chart lands in same change | engineering/workflow.md:111-118 | `test/unit/tools/showcase-galleries.test.js` | auto |
| gallery (hand-curated six) | feature content isolated; graduation in separate commit | CLAUDE.md:320 | NONE (discipline) | none |
| baseline gallery | it is the sole input to rendered contrast/palette/axe sweeps | — (§3 covers) | — | hand-list |

## Plugin (7) / hydrator / extension point

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| plugin | manifest, docs.md, fixtures.md present | lib/plugins/README.md:20-22 | `test/unit/plugins/conformance.test.js:151` | auto |
| plugin | never names a component | spec/LPM.md:40; lib/plugins/README.md:5 | UNVERIFIED | UNVERIFIED |
| plugin | name = folder = manifest name, kebab | spec/LPM.md:65 | `checkPackageIdentity` CO:978 (UNVERIFIED scope) | auto |
| plugin | inline rule returns false without consuming unless trigger | spec/LPM.md:207-208 | conformance.test.js:233-267 | auto |
| plugin | renderer keeps no closure state | spec/LPM.md:221 | NONE found | none |
| plugin | renderer escapes author text it writes | spec/LPM.md:222 | NONE per plugin (fail-soft degrade path tested, :292) | none |
| plugin | hydrator self-contained (no require/import/module helper) | lib/plugins/README.md:214-217; spec/LPM.md:230 | build refusal + `test/unit/plugins/hydrate-host.test.js` | auto |
| plugin | hydrator emits sanitizer-allowed SVG/HTML; no `<canvas>` | spec/LPM.md:236 | UNVERIFIED | UNVERIFIED |
| plugin | hydrator shows reason + `settle('error')` on failure (SHOULD) | spec/LPM.md:235 | UNVERIFIED | UNVERIFIED |
| plugin | figure writes `data-lattice-figure`; library global is a function | lib/plugins/README.md:243-247,217; spec/LPM.md:194,324 | `checkPluginMigration` CO:8120 (classes); fn check UNVERIFIED | auto (partial) |
| plugin | `styles.css` passes every component-CSS gate | spec/LPM.md:263-265 | CO gates scan lib/** (UNVERIFIED that plugins dir is in each arm) | UNVERIFIED |
| plugin | `styles.css` type sizes use `--fs-*` | spec/LPM.md:265-266 | NONE ("no gate enforces that yet") | none |
| plugin | second pass SHOULD prefix its `describe()` keys | spec/LPM.md:257 | NONE | none |
| plugin | collisions fail by name; fail-soft; boundary parser agrees | lib/plugins/README.md:265-271 | host + conformance.test.js | auto |

## Lens

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| lens | fails closed; every reader goes through `lensEligibility` | design/skills/lens.md:28-32,319 | NONE (import discipline; 3 consumers today) | none |
| lens | approval is a content hash re-checked at read | design/skills/lens.md:33-37,320 | `docs/src/lib/lente/hash.test.ts` (UNVERIFIED depth) | auto (lib) |
| lens | read path never imports the suggester | design/skills/lens.md:40-42 | `checkLenteBoundary` CO:9235 only bars escaping the folder; in-folder import NOT checked | none |
| lens | `id` stable; membership = shortest diff from base | design/skills/lens.md:314-315 | NONE / UNVERIFIED | none |
| lens | suggester id matches across `suggest.ts` + `lens-archetypes.ts` | design/skills/lens.md:323 | NONE found | hand-list |
| lens | `kind: rung` only where containment holds | design/skills/lens.md:324 | `validateLadder` (Studio lint) | auto |
| lens | round-trip `parseLensRegistry(emitRegistry(x)) ≡ x` | design/skills/lens.md:326 | `docs/src/lib/lente/registry.test.ts` | auto |
| lens | lowercase tags | design/skills/lens.md:336 | UNVERIFIED | UNVERIFIED |

## Speaker note / `say:` line / review comment

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| speaker note | adds subtext, never restates the slide | design/skills/speaker-notes.md:332 | NONE | none |
| speaker note | no private/reviewer remark (it surfaces in teleprompter) | design/skills/speaker-notes.md:333 | NONE | none |
| say line | one per slide (last wins) | design/skills/speaker-notes.md:347 | NONE found | none |
| say line | acronyms expanded via `acronyms:` | design/skills/speaker-notes.md:334 | discovery lint (advisory, off under `--all`) | none (CI) |
| review comment | lives in `.lattice` manifest, never markdown; off by default in export | design/skills/speaker-notes.md:24,336 | UNVERIFIED | UNVERIFIED |

## Exporter / CLI render / render path

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| render path | all render modes faithful to `lattice.css` | design/skill.md:7 | `geometry:check` (nightly, examples list) | hand-list |
| render path | deck logo: engine, lattice.js, runtime agree | lib/base/base.docs.md:1546-1556 | `test/integration/parity/deck-logo.test.js` | hand-list |
| exporter | every export path reads `overflow-marker` (PDF, PNG set, PPTX, Marp) | design/skill.md:122-124 | `export-formats.test.js`, `content-clipped-pill.test.js` (per format, hand-written) | hand-list |
| exporter | console names clipped pages at every level, incl. `off` | design/skill.md:145-149 | UNVERIFIED | UNVERIFIED |
| exporter | a 10/10 run is quiet: no OVERFLOW/placeholder/palette warning | design/skills/cli.md:28-30 | NONE (exit 0 while warning) | none |
| exporter | unknown theme fails with name + `add` command; never falls back | engineering/pipeline.md:143-145 | UNVERIFIED test | UNVERIFIED |
| exporter | vector PDF has selectable text unless `--raster` | design/skills/cli.md:20 | (in §6 "text extractable ✗") | none |
| exporter | captured formats freeze DOM; `.html` keeps script live | design/skill.md:229-233 | UNVERIFIED | UNVERIFIED |
| exporter | exported player has keyboard, wheel, swipe; trackpad pinch (`ctrlKey` wheel) never navigates | 2026-08-10-preview-pinch-zoom.md:476-496 | e2e (UNVERIFIED which spec) | hand-list |
| exporter | export-byte change needs dual-mode human sign-off | CLAUDE.md:212-217 | NONE (human gate) | none |
| exporter | MP4 written as `.partial` then renamed; new `.mp4` | engineering/pipeline.md:535 | UNVERIFIED | UNVERIFIED |
| exporter | style sink sanitizes every `<style>` | CLAUDE.md:481 | `checkDocumentStyleSinks` CO:7689 | auto (discovery) |

## Studio / editor / preview surface

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| slide surface | accepts keyboard + wheel + touch at every breakpoint; no device gating | 2026-08-10-input-verb-parity.md:12-14 | `@parity` e2e specs (6 files: present, preview-nav, stage-window, compose-stress, playground-stress, collage-lightbox) | hand-list |
| slide surface | reads verbs from `lib/core/present-transport.mjs` kernel | 2026-08-10-input-verb-parity.md:80 | NONE (no import-census gate) | none |
| slide surface | ≥2 pointers is a pinch, never a swipe; zoom in kernel | 2026-08-10-preview-pinch-zoom.md:12-15 | `@parity` e2e (hand-list) | hand-list |
| slide surface | Studio surface supports zoom clamped [1,4] | 2026-08-10-preview-pinch-zoom.md:140 | UNVERIFIED | UNVERIFIED |
| preview surface | holds first reveal until faces settle (`preview-font-gate`) | engineering/jank.md:49-50 ("any new preview surface owes that gate") | `docs/e2e/preview-font-swap.spec.ts` drives ONE surface (`/playground/?view=edit`, :185) | hand-list |
| preview builder | markup through `sanitizeSlideHtml` | CLAUDE.md:481-497 | `checkPreviewHtmlSinks` CO:7633 | auto (idiom discovery) |
| runtime markup sink | in-frame injection is censused | CLAUDE.md:491-494 | `checkRuntimeMarkupSinks` CO:8175; `checkSnapshotHtmlSinks` CO:8347 | auto |
| CSS re-wrap | re-wrap calls `sanitizeStyleText` itself | CLAUDE.md:489-491 | `checkCssTreeRewrapSinks` CO:7794 | auto |
| docs-site page | ships at 1440/820/390 with screenshot evidence; one visual language | CLAUDE.md:206-210 | NONE (discipline) | none |
| docs-site UI | extends shadcn primitives + shared chrome; no per-surface widget fork | CLAUDE.md:358-362 | NONE | none |
| Studio autocomplete | offers every manifest key / front-matter key | (in §3) | — | — |
| docs site | no `OPEN_ROUTER_KEY` reference | CLAUDE.md:527 | `checkOpenRouterBudget` CO:8441 | auto |

## Markdown ingest

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| ingest | normalize `\r\n?` + BOM at ingest; listed in `SANCTIONED_EOL_BOUNDARIES` with justification + a watched-fail case | 2026-08-04-line-endings-lf-boundaries.md:129-138 | `checkLineEndingBoundaries` CO:7360 — finds known shapes; "an ingest that parses front matter some other way" not seen | hand-list (+partial discovery) |
| front-matter reader | reads through the shared reader | — | `checkFrontMatterReaders` CO:7006 | auto |

## Spin-off library (Cadenza, Trama, Calco, Tavola, Fuoco, Suono, LTT, Anima, Lente, Segno, Vetrina)

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| library | zero-dependency; every import resolves inside its folder | CO comments at :9235, :9271 | one `check<Name>Boundary` per library (CO:8649-9271) + `checkStrictPackageImports` CO:8805 | hand-list (a new library is not enrolled until someone writes its function) |
| library | `dist` rebuilt and fresh | — | `<lib>:check` scripts (package.json) | hand-list |
| library | no ajv outside tools/ | CO:9204 | `checkAjvBoundary` | auto |

## Repo artifacts with stated contracts

| kind | expectation | source | enforced by | enrollment |
|---|---|---|---|---|
| agent roster card / workflow stage | `model: opus`, last word | CLAUDE.md:579-595 | `checkAgentModelPinning` CO:10538 | auto |
| changelog fragment | `changelog.d/<slug>.<category>.md`, bullets only, `**Breaking:**` lead | CLAUDE.md:346-353 | `checkChangelogFragments` CO:12460 | auto |
| followup | pending item without an issue lives in `followups.d/` | CLAUDE.md (DEFAULT OPERATING MODE table) | `checkFollowups` CO:12471 (shape); presence NONE | auto (shape) |
| decision note | one correctly formatted index row | design/design-system.md:1008 | `decisions:index:check` | auto |
| skill doc | stated counts match source | — | `checkSkillFreshness` CO:10628 (marker list hand-kept) | hand-list |
| skill doc | checklist rosters/instructions current | design/skills/theme.md:337 (stale THEMES instruction) | NONE | none |
| tool / script | registered in capabilities before building | CLAUDE.md:358-360 | `capabilities:check` | auto |
| spec part | spec file parts valid | — | `checkSpecParts` CO:12506 | auto |
| spec | LFM / THEME / LATTICE-FILE have conformance case folders; LPM via plugin test; LTT via `test/unit/export/ltt-conformance.test.js` | spec/README.md | per-spec tests | auto |
| perf change | before/after bench + ratcheted baseline + scenario covering the path | CLAUDE.md:440-450 | NONE blocking (`bench:check` on demand) | none |
| e2e spec | no hard sleeps | — | `checkE2ESleeps` CO:6694 | auto |
| committed PDF | none in a PR | workflow.md:187-189 | `tools/check-no-pdf-in-pr.mjs`, `checkCommittedPdfs` CO:11412 | auto |
| font face | self-hosted, all surfaces in parity, no Google CDN | tools/check-fonts.js:1-22 | `fonts:check`; `checkFontMetricsPin` CO:12868 | auto |
| font face | "Fonts must be available on Google Fonts" | design/design-principles.md:55 | **contradicts** fonts:check (zero-network) — stale | — |
| vetrina gesture | gesture in sanctioned vocabulary | CO:9380-9398 | `checkSanctionedGestures` CO:9399 | auto |
| anima scene | colors from the slide-token vocabulary | CO:13170-13180 | `checkAnimaColorVocabulary` CO:13180 | auto |
| voice sample asset | — | — | `checkVoiceSampleAssets` CO:8544 | auto |
| dist verbatim copy | equals its committed source | CO:12683 | `checkVerbatimDistCopies` | auto |
| package (portable) | identity + gate; code package runs only after SHA-256 approval | engineering/pipeline.md:139-142 | `checkPackageIdentity` CO:978; `lib/packages/gate.js` (runtime) | auto |
| .lattice file | deck.md byte-for-byte; reader refuses unsafe entries; has size limits | spec/LATTICE-FILE-1.0.md:45-100 | `docs/src/components/studio/lattice-file.conformance.test.ts` | auto |
| visual review claim | reviewer views whole slides; "downloaded + toast fired" is not fidelity | engineering/visual-review.md:30,112-119 | NONE (discipline) | none |
| verification claim | names surface + artifact | CLAUDE.md:509 | NONE (discipline) | none |
