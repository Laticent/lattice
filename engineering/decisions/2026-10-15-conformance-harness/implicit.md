<!-- Evidence for ../2026-10-15-conformance-harness.md. Written by a read-only harvesting agent on 2026-10-15 at d2a6e6f; classifications are its reading, and rows marked UNVERIFIED were not confirmed by grep. Kept as the record the note cites, not maintained. -->

# Implicit-contract harvest — classified tables

Method and coverage:
- Git: local repo is SHALLOW (53 commits). History read from a blob-less bare clone of origin/main at scratchpad/hist.git (2,578 commits). `git log --no-merges -600 main` (d2a6e6f4 2026-10-15 back to 0ae520fb 2026-08-18). Keyword filter (fix( / fix: / regress|broke|restore|dark|contrast|overflow|clip|drop|missing|parity, case-insensitive) matched 119; 7 are not defect fixes (keyword hits on feat/perf/docs) and are marked EXCLUDED; 112 classified. ALL 119 read, no sampling. Body first lines read for every one.
- "Kind", "class" and "caught?" columns are the agent's reading of subject+body, not a mechanical rule. Caught? = would a per-kind clause that enumerates every instance (every component/variant/theme/mode/exporter/split page/render path) have failed BEFORE merge. Y = yes as an instance-enumeration clause; P = only if the clause also carries a specific assertion that §6 does not list (placement, geometry, parse-fuzz, content conservation) or a real browser; N = not an instance-enumeration problem.
- Defect classes: A split-page-loses-X · B second-path-diverges (export format, player, reader, dev server, Marp bundle, package) · C dark-or-palette contrast · D combination untested (modifier × component, register × slide, variant × new rule) · E fit at size/venue/long label · F parse/grammar edge · G gate blind or vacuous · H hand list or stale generated artifact · I app behavior (Studio state, iOS, interaction) · J security/resource · K taste.

## 1. Fix commits (119 rows; 112 classified)

| Commit | Kind | Implied contract violated | Class | Caught? |
|---|---|---|---|---|
| 01070652 | Studio-app | Architect chat edits only when asked, in author words | I-app-behavior | N |
| 450df02b | Parser/transform | Segno inline grammar still recognizes directives (isDirective regression) | F-parse-edge | P |
| 82c72476 | EXCLUDED | feature (keyword "clip" matched) | - | - |
| bab56131 | EXCLUDED | perf (keyword "drop" matched) | - | - |
| b06fb1a4 | Studio-app | every model spend is priced by the model and capped | I-app-behavior | P |
| 7912dd70 | Slide-modifier | a semantic tone's rail/glow draws on auto-split pages | A-split-page-loses-X | Y |
| 7a298864 | Exporter | .lattice carries every asset the deck names | B-second-path-diverges | Y |
| 5d8586c3 | Studio-app | chat cost readout covers every tool the turn can call | I-app-behavior | N |
| c59bc861 | Plugin | per-plugin lists in specs track the plugin registry (avatars missing) | H-hand-list-or-stale-generated | Y |
| ef3dda4c | Component | bucket gallery regenerated when a component is added | H-hand-list-or-stale-generated | Y |
| 30a550ea | Studio-app | workspace backup round-trips every field (captions) | B-second-path-diverges | P |
| ed9a2335 | Slide-modifier | tone-edge draws its tone on auto-split pages | A-split-page-loses-X | Y |
| fe4a448b | Studio-app | Compose controls work as rendered (4 audit defects) | I-app-behavior | N |
| e44d45b9 | Slide-modifier | tone-edge on split-panel/split-compare keeps one top bar | D-combination-untested | P |
| b5d73cef | Exporter | PDF writer paints Mermaid sequence participant text | B-second-path-diverges | P |
| 7b9ced4e | Deck-setting | split-panel/compare keep one top bar under a styled spectrum register | D-combination-untested | P |
| 0f74c5b8 | Render-surface | Playground lists every examples/*.md deck (hand-curated list) | H-hand-list-or-stale-generated | Y |
| bd5a426e | Parser/transform | JPEG aspect honors EXIF orientation | F-parse-edge | N |
| 069ac45a | Deck-setting | a slide's accent/tone-edge wins over a deck spectrum register | D-combination-untested | P |
| 53e318ce | Studio-app | stale page after deploy recovers | I-app-behavior | N |
| 7c2bee78 | Gate/CI | science-map follow-ups; runtime seam; stray empty file | G-gate-blind-or-vacuous | N |
| f44d2a6b | Exporter | stamped slides export (Calco native shapes) as drawn; stamp-mark is a watermark | B-second-path-diverges | Y |
| 9716f813 | Exporter | CLI -p theme travels with a re-openable export (warn) | B-second-path-diverges | N |
| 5baa803f | Generated-artifact | bless refreshes every WebP derived from a blessed gallery PDF | H-hand-list-or-stale-generated | P |
| 4a1faf96 | Exporter | Marp bundle HTML checks parse front-matter fences like the engine | F-parse-edge | N |
| dc3eefae | EXCLUDED | measurement/feature (keyword "parity" matched) | - | - |
| ea9770d2 | Package | installed @laticent/lattice runs (missing module, skipped transforms) | B-second-path-diverges | Y |
| ddf58e2a | Studio-app | iOS mic needs record audio session | I-app-behavior | N |
| 87ed678c | Gate/CI | bless reads full gate report (stdout truncated) | G-gate-blind-or-vacuous | N |
| b6e4a164 | Exporter | picture .pptx is schema-valid; control chars safe | B-second-path-diverges | Y |
| 7dd68e9d | Exporter | Export-to-Marp carries sample: pictures and logo | B-second-path-diverges | Y |
| eb5fc647 | Chart | hub-spoke node drawings clipped (mostly feature) | E-fit-at-size-or-label | P |
| fbdee2de | Exporter | Studio exports keep the deck's file name (Firefox/iOS) | B-second-path-diverges | P |
| 281e9e0e | Exporter | PDF writer 4K edge exact; split-slot parser parity between paths | B-second-path-diverges | P |
| 01320de8 | Gate/CI | ci gate fails when test tiers did not run | G-gate-blind-or-vacuous | N |
| df6e3f5b | Component | authority-chain rows align under the longest tier word | E-fit-at-size-or-label | P |
| 77fd31ac | Studio-app | chat transport failures name their cause | I-app-behavior | N |
| fe86ed5f | Component | capacity probe measures the documented label shape | H-hand-list-or-stale-generated | P |
| d63fa459 | Component | hub-spoke graduated into baseline gallery; bench row; sketch estimate | H-hand-list-or-stale-generated | Y |
| 0c81e9cc | Chart | marker/pill boxes grow with venue text | E-fit-at-size-or-label | Y |
| aac96625 | Studio-app | failed model request says why | I-app-behavior | N |
| 96b3ed10 | Exporter | PDF writer keeps tabular-digit widths and text | B-second-path-diverges | P |
| ed97ec92 | Render-surface | Trama no-worker settle | I-app-behavior | N |
| a4cedd0a | Exporter | PDF writer keeps a 1px rule's color (JPEG chroma) | B-second-path-diverges | P |
| 0ca7a1e7 | Finish | finish exports via Print/override/spotlight paths match; overflow tag clear of keyline | B-second-path-diverges | Y |
| 4e9db35a | Finish | saved finish survives Studio Images/PDF/PPTX exports | B-second-path-diverges | Y |
| 97983493 | Component | split-panels slot extraction same on DOM and export paths | B-second-path-diverges | Y |
| 590122d4 | Theme | carbone categorical cycle distinct; dark diagram fills tamed (feature-ish) | C-dark-or-palette-contrast | P |
| af9dbb74 | Component | split-compare keeps speaker notes; portrait footer; slot parity | A-split-page-loses-X | Y |
| 683376c7 | Component | portrait pullquote footer; stray blocks; dev-server Studio renders | B-second-path-diverges | P |
| 15f4e95a | Component | topic shelf separates from lit tab on onyx-dark | C-dark-or-palette-contrast | P |
| fa5e2445 | Component | topic lit tab reads as a marker (design) | K-taste | N |
| 21ff9b72 | Generated-artifact | CLI --help names a real Studio menu | H-hand-list-or-stale-generated | N |
| a4fd7b49 | Component | split-panel chrome budget; finish passthrough; footer not dropped | A-split-page-loses-X | Y |
| d08e476a | Render-surface | Read·Article projects coda; image slides don't jump | B-second-path-diverges | Y |
| f68e8fa1 | EXCLUDED | docs/followups bookkeeping | - | - |
| 95dfbd5e | Parser/transform | engine skips style: block-scalar bodies when reading front matter | F-parse-edge | P |
| f843ba09 | Studio-app | preview rect not stored mid-rotation | I-app-behavior | N |
| 49e4dc06 | Studio-app | every lazy panel warms for offline | I-app-behavior | P |
| 3b5a92a9 | Component | modifier-effects oracle records every component (flowchart null) | H-hand-list-or-stale-generated | Y |
| 5edf9661 | Chart | anima spec decodes UTF-8; line chart builds under motion: on | F-parse-edge | P |
| e504ac72 | Render-surface | pooled previews paint on astro dev (StrictMode) | B-second-path-diverges | N |
| cb32dbf2 | Render-surface | dev server resolves named imports from CJS lib files | B-second-path-diverges | P |
| 68b8b886 | Finish | backdrop soft edge same in export as Studio | B-second-path-diverges | P |
| 68c2d502 | EXCLUDED | feature (backdrop register) | - | - |
| 4f73c25a | Render-surface | one slide frame on every surface (player no-JS, Read·Slides) | B-second-path-diverges | Y |
| 7558660c | Deck-setting | scale-* never clips a slide at capacity (133 slides/47 galleries) | E-fit-at-size-or-label | Y |
| a8721163 | Package | backup reads are size-capped | J-security-resource | N |
| 73172f3b | Chart | hover emphasis is flat; marks tappable | K-taste | N |
| db9ba17a | Package | every import door runs the Library gates | J-security-resource | P |
| f38a3cd4 | Render-surface | reader prose keeps subtitle/media order | B-second-path-diverges | Y |
| 62f65546 | Package | packages cannot reach the network | J-security-resource | P |
| 2d41c555 | Component | manifest skeleton (not only gallery) fits; split pages | E-fit-at-size-or-label | Y |
| c15d09d0 | Render-surface | reader carries video lead; finish backdrop injected on every slide | B-second-path-diverges | Y |
| 35e19c14 | Exporter | player Read·Article charts paint in color | B-second-path-diverges | Y |
| f2949b1c | Component | premise term column fits the longest term | E-fit-at-size-or-label | P |
| b92a6b5f | Parser/transform | every section walker uses the shared kernel | F-parse-edge | P |
| 90257f8b | Parser/transform | quoted </section> read as text on every walker | F-parse-edge | P |
| 29aaeab0 | Chart | status-word case folded in every CHART_STATUS consumer | F-parse-edge | Y |
| 64ad3357 | Parser/transform | Compose fence closer is CommonMark-indented | F-parse-edge | N |
| 555ec97c | Exporter | overflow numbering by deck slides; function-plot UTF-8; color-mode arm | B-second-path-diverges | P |
| 59a4dba3 | Chart | kanban stamps canonical status word | F-parse-edge | Y |
| 9541d8d9 | Chart | heatmap live chart sized in player after motion | B-second-path-diverges | P |
| 9ab28574 | Exporter | Marp bundle runtime srcs match copied assets | H-hand-list-or-stale-generated | Y |
| 37fa5a30 | Component | frame that paints its own canvas keeps it under dark | C-dark-or-palette-contrast | Y |
| 6990aba3 | Exporter | Studio rasterizer does not paint charts black | B-second-path-diverges | Y |
| b6260ed1 | Studio-app | Playground settings sheet theme row; no clip | I-app-behavior | N |
| 50da2dba | Gate/CI | contrast specs share one color parser | G-gate-blind-or-vacuous | N |
| 024ba7e7 | Gate/CI | lint arms run on real WebKit; select-all fixed | G-gate-blind-or-vacuous | N |
| e93388f1 | Exporter | export waits for diagram progress; never bakes a blank | B-second-path-diverges | P |
| 1c398f27 | Render-surface | markers do not collide with stamp/logo corner | D-combination-untested | P |
| 30ffa6e0 | EXCLUDED | feature (guards: strict) | - | - |
| 983ac0e7 | Studio-app | themed selection band beats CodeMirror base theme | C-dark-or-palette-contrast | P |
| 95223749 | Studio-app | preview holds the old diagram while rendering | I-app-behavior | N |
| 674e4d11 | Component | team-profile follow-ups (five) | E-fit-at-size-or-label | P |
| ae795b11 | Studio-app | undo cannot cross decks | I-app-behavior | N |
| 49afaa86 | Component | kpi fills hero; rule between rail rows | K-taste | N |
| 7a9feae8 | Narration | closing quote keeps its pause | K-taste | N |
| b8f02432 | Parser/transform | tilde mermaid fences render on both paths | B-second-path-diverges | Y |
| 2a6b6ebe | Studio-app | diagram slide does not paint source first | I-app-behavior | N |
| ed7366a4 | Generated-artifact | committed example PDFs match the engine | H-hand-list-or-stale-generated | Y |
| df8bf3b0 | Gate/CI | every written gate runs in some CI job | G-gate-blind-or-vacuous | P |
| 2d522067 | Chart | progress label does not clip at square | E-fit-at-size-or-label | Y |
| 1ebab4dd | Slide-modifier | divider/closing numbered renders its stamp (pseudo owned by pagination) | D-combination-untested | Y |
| 48647575 | Generated-artifact | @visual baselines track the chrome | H-hand-list-or-stale-generated | N |
| b4d202c7 | Component | universal trailing blocks dock on every component | D-combination-untested | Y |
| 06006ff1 | Studio-app | phone preview bar does not truncate the lens pill | I-app-behavior | N |
| 0c7e1dba | Gate/CI | US-English scan skips generated sidecars; five gate fixes | G-gate-blind-or-vacuous | N |
| 5e129119 | Studio-app | failed chat turn scoped to its deck | I-app-behavior | N |
| 37f6455d | Chart | "not started" state uses neutral ink; deferral test not clock-bound | C-dark-or-palette-contrast | P |
| 924fa318 | Gate/CI | overflow oracle distinguishes ringing vs paginating | G-gate-blind-or-vacuous | N |
| 5e05180b | Studio-app | chat reply not shown twice | I-app-behavior | N |
| e7f58b87 | Gate/CI | overflow assertion is reachable (was vacuous by construction) | G-gate-blind-or-vacuous | N |
| f4c9b17f | Component | word-cloud spectrum ramp floor above AA on every palette | C-dark-or-palette-contrast | Y |
| f9374c4a | EXCLUDED | docs measurement | - | - |
| ced096eb | Chart | status pill dark gradient reaches AA on every palette | C-dark-or-palette-contrast | Y |
| fd3176e1 | Theme | every palette's status trio reaches the CLI export (cascade order) | B-second-path-diverges | Y |
| 8c10a20e | Theme | Studio-fabricated themes get the de-emphasis floor | C-dark-or-palette-contrast | P |
| fbb62879 | Theme | rendered deck measured on every palette, not just indaco | C-dark-or-palette-contrast | Y |

Totals (112): Y 39 (35%) · P 37 (33%) · N 36 (32%).
Engine-side kinds only (Component, Chart, Slide-modifier, Deck-setting, Theme, Finish, Plugin, Exporter, Render-surface = 68): Y 36 (53%) · P 25 (37%) · N 7 (10%).
App/infra kinds (Studio-app 19, Gate/CI 9, Parser 7, Generated-artifact 4, Package 4, Narration 1 = 44): Y 3 · P 12 · N 29.

## 2. Decision-note incidents (45, from 34 notes matching "why no gate/nothing caught", "passed every gate", "green CI", "shipped broken", plus 8 from a broader "silently dropped" grep)

| # | Note (engineering/decisions/) | Kind | Implied contract violated | Class | Enumerating clause would catch? |
|---|---|---|---|---|---|
| 1 | 2026-07-03-semantic-html-accessibility.md:1638 | Render surface (fluid viewer) | a semantic wrapper never changes slide geometry; `--fluid` was 100% broken with npm test/integration/CI green | B | P (geometry assertion per surface) |
| 2 | 2026-07-03-semantic-html-accessibility.md:1792 | Gate | an audit never drops a run as "unknown" | G | N |
| 3 | 2026-07-27-family-stamp-replaces-container-queries.md:456 | Component | manifest `reflow` declared ⇒ family rules exist (gate was one-directional) | D/declared⇔implemented | Y |
| 4 | 2026-07-27-family-stamp-replaces-container-queries.md:523 | Component × size family | premise regression passed every gate | E | P |
| 5 | 2026-07-27-footer-band-allocation.md:147 | Chrome × orientation | footer rail never overprints author footer (portrait, ≥8 sections, 82.8px) | collision/placement | P (needs placement oracle) |
| 6 | 2026-07-30-overflow-marker-register.md (summary) | Exporter (Marp bundle) | an export never ships authoring QA chrome | B | Y |
| 7 | 2026-07-30-overflow-marker-register.md:1009 | Chrome | corner claimants (markers, logo, stamp) never collide | collision/placement | P |
| 8 | 2026-08-02-marp-reference-register.md:183 | Exporter (Marp bundle) | every exporter's output is actually rendered; bundle broken for months (#1256) | B | Y |
| 9 | 2026-08-04-finish-stacking-displaces-frame-chrome.md:317 | Finish × chrome | a finish never moves header/logo; "placement has no oracle"; no gallery sets finish+chrome | D + placement | P |
| 10 | 2026-08-05-one-class-directive-reader.md:199 | Parser | one reader resolves `_class`/global `class:`; 7 regex copies diverged | F | P |
| 11 | 2026-08-09-studio-shell-structural-completeness.md:301 | Studio shell | static shell structurally matches hydrated app | I | N |
| 12 | 2026-08-10-input-verb-parity.md:110 | Render surface × input | every keymap action does what the map says (Home/End went back) | I | P (matrix must enumerate every action) |
| 13 | 2026-08-10-preview-pinch-zoom.md:292 | Studio preview | resize while zoomed re-clamps (rendered blank) — 9 defects post-green | I | N |
| 14 | 2026-08-10-shell-app-boot-state-sharing.md:252 | Studio shell | pre-paint mechanism actually ran | I | N |
| 15 | 2026-08-11-on-dark-ink-tiers.md:25 | Gate + Theme | contrast probe parses every color syntax (dropped 26% of runs); audit scores every rung | G + C | P |
| 16 | 2026-08-11-stage-owns-the-outer-inset.md:639 | Modifier × component | claim-bleed lint knows every unsafe component; no deck combined chart+claim-bleed | D | Y |
| 17 | 2026-08-11-stage-owns-the-outer-inset.md:163 | Chart × size | tall/strip arms kept on both paths | B/E | P |
| 18 | 2026-08-12-sketch-label-voice.md:421 | Finish × component | every label site follows the finish's label font (95 pinned); test exercised an unused function form | D + G | Y |
| 19 | 2026-08-12-slide-plane-model.md:233 | Engine CSS | a refactor with no intended visual delta leaves the corpus render unchanged | regression-diff | P (corpus A/B, not per-kind) |
| 20 | 2026-08-17-canvas-relative-sequential-ramp.md:132 | Theme × Marp path | palette `:root` form works on every render path | B | Y |
| 21 | 2026-08-17-mermaid-render-worker.md:93,276,462 | Diagram × render path | moving render into a worker keeps every capability, themeVariables, label fonts | B | P |
| 22 | 2026-08-17-studio-inline-search-dropdown.md:277 | Studio header | every control STATE (open, not idle) fits | I | P |
| 23 | 2026-08-18-card-boundary-contrast.md:59 | Theme token | every color token is in some contrast pair (`--border` was in none, and exempted) | C (non-text) | Y |
| 24 | 2026-08-18-undeclared-color-tokens.md:263 | Theme (code roles) | code-highlight roles stay distinct under CVD | C | P |
| 25 | 2026-08-24-palette-cascade-flip.md:288 | Theme × exporter | palette values reach the export (engine white masked both directions) | B | Y |
| 26 | 2026-08-23-status-trio-export-cascade.md | Theme × CLI export | curated status trio wins over engine defaults in the export bundle | B | Y |
| 27 | 2026-08-24-status-trio-monochromacy-respacing.md:49 | Theme | ratchet must not bless identical grays (concrete) | ratchet absorbed debt | P |
| 28 | 2026-09-01-autosplit-splits-on-structure.md:507 | Component × auto-split | split keeps placement, not only content (redline passages moved to closing page) | A | P (needs placement assertion) |
| 29 | 2026-09-01-manifest-driven-chart-dispatch.md:55 | Chart registry | chart name lookup is own-property only; a typo fails soft | F | Y |
| 30 | 2026-09-03-table-outer-edge-rules.md:129 | Component variant | obligation-matrix `asymmetric`/`heat` keep their closing border | D | Y |
| 31 | 2026-09-06-state-chart-dagre-layout.md:411 (F2) | Chart modifier | `curved` changes the output vs its absence | D | Y |
| 32 | 2026-09-06-state-chart-dagre-layout.md:411 (F1,F3,F5) | Chart + Gate | markers inside canvas pad; duplicate transitions distinct; tests not matching source text | E + G | P |
| 33 | 2026-09-07-chart-design-language/mark-declaration.md:214 | Chart marks | emitted marks == declared marks, encoding consistent | declared⇔implemented | Y |
| 34 | 2026-09-08-marker-capsule-berth.md:30 | Chrome | shared corner arithmetic correct | collision/placement | P |
| 35 | 2026-09-13-gallery-preview-memory.md:214 | Render surface × fonts | fonts load from blob stylesheets (rendered in fallback faces) | B (fonts) | P (font-face clause) |
| 36 | 2026-09-13-settings-find-and-list-view.md:846 | Studio panel | every settings section fits (e2e opened only Look) | I | P |
| 37 | 2026-09-20-gesture-audit.md:279 | Component manifest | slot selectors describe real authored DOM (team-profile) | declared⇔implemented | P |
| 38 | 2026-09-20-heatmap-table-authoring-label-sets.md:277 | Render surface (Playground) | per-cell reveal works on the real surface | I | N |
| 39 | 2026-09-22-canvas-ownership-declare-what-you-mean.md:172 | Deck setting × split cover | `spectrum: off` removes hairline; source order gated; 3,080 vacuous rows | D + G | P |
| 40 | 2026-06-20-adaptive-manifest-contract.md:3 | Component | declared adaptivity == actual (10 declared vs 25 adapted) | declared⇔implemented | Y |
| 41 | 2026-07-09-cadenza-narration-quality.md:239,306,395 | Narration per component | narration never silently drops content (trail, NaN stage) | content-conservation | P |
| 42 | 2026-08-17-composition-stays-content-addressed.md:160 | Parser (CSS import scanner) | a stray comment sequence never drops later imports | F | N |
| 43 | 2026-08-17-theme-css-is-a-preview-sink.md:386 | Security | `</style>` in CSS never becomes markup | J | N |
| 44 | 2026-09-20-form-is-not-configurable.md:125 | Component variant | `list bullet` keeps the bounded box the overflow probe walls | D | Y |
| 45 | 2026-09-05-stale-goldens-hid-a-clip.md:186 | Generated artifact | committed goldens match a fresh render (stale golden hid a clip) | H | Y |

Totals: Y 15 · P 23 · N 7 (of 45).

## 3. Gotchas (232 headings across 14 files in engineering/gotchas/, all covered; 1 retired)

Kind tags: Component, Chart, Diagram, Theme, Finish, Modifier, Deck-setting, Exporter, Render-surface, Parser, Studio-app, Gate/CI, Env (tooling/environment, no product contract).

| Gotcha (file:line) | Kind | Implicit contract (one line) |
|---|---|---|
| browser-engine:6 | — | RETIRED (HARD RULE #12) |
| browser-engine:36 | Render-surface | foreignObject children never become anonymous grid items |
| browser-engine:56 | Render-surface (WebKit) | wrapped SVG labels sit on the same baseline in every engine |
| browser-engine:103 | Gate/CI | pixel/geometry oracles tolerate cross-platform sub-pixel rounding |
| browser-engine:122 | Render-surface | an observer never re-triggers on its own writes |
| browser-engine:143 | Exporter | mask-image sources resolve under file:// renders |
| browser-engine:152 | Studio-app | viewport units chosen so svh>dvh cannot clip mobile chrome |
| browser-engine:179 | Render-surface (iOS) | preview scaling never collapses cqi |
| browser-engine:197 | Studio-app (iOS) | long-press on a control never selects its label |
| browser-engine:221 | Studio-app (iOS) | text controls ≥16px so tapping never zooms |
| browser-engine:251 | Render-surface (iOS) | tapping an in-slide link never blanks the preview |
| browser-engine:280 | Exporter | data: fetches work under the preview/export CSP |
| charts:6 | Chart (pie) | wedge borders index the wedge, not <defs> |
| charts:32 | Chart × motion | duplicate <defs> ids never break gradient fills under animation |
| charts:56 | Chart | chart size is stable when an ancestor gains container-type |
| charts:89 | Chart × chrome | caption survives `_footer` |
| charts:120 | Chart × exporter | Studio image PDF/PPTX charts paint in color |
| charts:129 | Chart × player | Read·Article charts paint in color |
| charts:137 | Render-surface | CSS prune never drops a rule whose element exists (pseudo) |
| charts:144 | Chart × package | code package render == in-repo render |
| ci:6 | Gate/CI | a check's verdict reflects all its jobs |
| ci:35 | Env | rendering needs CHROME_PATH |
| ci:94 | Env | stale dist after rebase is not a defect |
| ci:161 | Gate/CI | mocks deterministic under load |
| ci:194 | Gate/CI | docs tests order-independent |
| ci:300 | Gate/CI | a race test fails on the broken code |
| ci:341 | Gate/CI | integration tests never race wall-clock timers |
| ci:386 | Env | Dependabot directory-level npm ci failures |
| ci:472 | Gate/CI | nightly badge reflects spec failures |
| ci:504 | Gate/CI | ci gate red when a tier did not run |
| css:6 | Theme × component | an ink that passes token gates also passes rendered (own-hue band, opacity) |
| css:78 | Gate | contrast probe measures the real underlay (no phantom) |
| css:113 | Component CSS | no margin (HARD RULE #20) |
| css:142 | Finish × chrome | finish ::after edge never clobbered by pagination marker |
| css:171 | Modifier × render path | section::after content shows in browser as in PDF (`numbered`) |
| css:303 | Finish × chrome | finish never moves header/footer/logo or eats stage height |
| css:341 | Engine CSS | decorative layers paint on their declared z-plane |
| css:396 | Component | inline code nowrap never collapses blocks or overflows eyebrows |
| css:421 | Theme token | every var() used in SVG paint is defined (no black/none fallback) |
| css:450 | Chart (state disc) | recipe vars embedding --state-color are defined at the element |
| css:477 | Render-surface (chrome) | chrome reads only PORTAL_TOKENS |
| css:566 | Env | getPropertyValue returns raw tokens |
| css:584 | Theme | generated dark ink tokens contrast in both modes |
| css:609 | Component CSS | top-level list selectors don't match sublists |
| css:630 | Theme | :where(:root) defaults lose to palettes as intended |
| css:644 | Component CSS | font-size:0 never zeroes em boxes |
| css:667 | Component CSS | inline pseudo elements leave no sliver |
| css:700 | Studio-app | full-width children account for scrollbar |
| css:721 | Engine CSS | every reset value exists |
| css:761 | Engine CSS | declarations valid at computed-value time |
| css:786 | Studio-app | measuring elements never cause sideways scroll |
| css:852 | Finish × split page | finish shows on split pages and header spans them |
| css:898 | Theme | every palette renders without wedging (relative color over light-dark) |
| css:916 | Modifier × build | accent/tone-edge border-image:none survives minification |
| docs-site:6 | Env | dev server not served stale by service worker |
| docs-site:27 | Gate (#22) | every preview builder sanctioned |
| docs-site:43 | Gate (#22) | every <style> sink sanitized |
| docs-site:71 | Generated-artifact | showcase WebP regenerated with its gallery PDF |
| docs-site:90 | Render-surface (dev) | docs panels work under astro dev CJS |
| docs-site:141 | Render-surface (dev) | Fabricate previews work under StrictMode |
| docs-site:195 | Env | astro backgrounding under agents |
| docs-site:255 | Env | computed custom property serializes as hex |
| docs-site:279 | Env | astro binary missing |
| docs-site:302 | Env | config load export error |
| docs-site:405 | Env | pkill kills its own shell |
| docs-site:419 | Gate/CI | e2e waits for hydrated islands |
| docs-site:473 | Gate/CI | build:e2e and build produce equivalent specs results |
| docs-site:504 | Gate/CI | timing specs keep HTTP cache |
| export:6 | Exporter (PDF) | mask-image renders consistently across PDF viewers |
| export:18 | Exporter (PDF) | SVG images render in iOS Quartz |
| export:27 | Exporter (PDF) | blurred shadows don't become gray blocks in PDFKit |
| export:60 | Exporter (player) | JSON in <script> keeps raw & |
| export:76 | Exporter (player) | player works without front matter |
| export:88 | Exporter (player) | slide-level color-scheme pin re-emitted |
| export:129 | Exporter (player) | flattened tokens take screen, not print, band |
| export:154 | Exporter × chart | chart fills follow page scheme |
| export:189 | Exporter (player) | dark toggle moves every color |
| export:235 | Exporter (player) | no `X :is(…)` rule dropped |
| export:264 | Exporter × diagram | baked labels readable after toggle |
| export:283 | Exporter (strip-notes) | never deletes comments inside code fences |
| export:297 | Exporter (strip-notes) | removes notes beginning with directive keywords |
| export:313 | Exporter (strip-notes) | notes stripped from pptx and raster sidecar too |
| export:336 | Exporter (player) | player never claims notes after strip |
| export:525 | Exporter (PDF) | embedded source scrubbed under the right cut |
| export:557 | Exporter | tier/galleryAuthored pragmas never become speaker notes |
| export:575 | Exporter (Studio PDF) | pill never overlaps caption end |
| export:597 | Exporter (PDF 4K) | byte-deterministic under load |
| export:626 | Exporter (Studio) | export keeps deck name in Firefox |
| export:682 | Exporter (Studio) | counters (steps, agenda, tags) not all 0 |
| fonts:6 | Exporter × fonts | PDFs use design fonts, not fallback |
| fonts:42 | Exporter (Studio) × fonts | every slide's fonts embedded |
| fonts:79 | Render-surface × finish | live preview honors hand-body fonts |
| fonts:112 | Render-surface | color emoji font present on owned paths |
| fonts:147 | Component × font | caps centered in mono |
| fonts:156 | Render-surface | no layout jump after font load |
| lattice-internals:6 | Render-surface | preview == export for page number/progress/proof colors |
| lattice-internals:34 | Generated-artifact | manifest sample edit regenerates bucket gallery |
| lattice-internals:59 | Generated-artifact | dist/lattice.js schema == manifest schema |
| lattice-internals:82 | Generated-artifact | generated files built before bundle |
| lattice-internals:107 | Generated-artifact | goldens fresh before trusting diff |
| lattice-internals:154 | Component manifest | slot selector describes authoring input |
| lattice-internals:180 | Theme | legacy --fs-* names retired |
| lattice-internals:206 | Narration | narration timing covers every stage |
| lattice-internals:233 | Narration | dwell == narration |
| lattice-internals:257 | Render path | transforms in shared kernel (HARD RULE #1) |
| lattice-internals:281 | Chart | observer scope bounded |
| lattice-internals:298 | Diagram × theme | no Mermaid hardcoded default colors escape palette |
| lattice-internals:327 | Component | liftSlotLabel idempotent |
| lattice-internals:344 | Component variant | image museum doesn't inherit anchor border |
| lattice-internals:368 | Render-surface | non-canonical previews get section geometry and font |
| lattice-internals:425 | Component | layout components set their own line-height |
| lattice-internals:450 | Render-surface (emulator) | list nesting depth >2 supported |
| lattice-internals:473 | Deck-setting | style: front matter applies (one path only) |
| lattice-internals:501 | Diagram × size | Mermaid scales on 4K in VS Code |
| lattice-internals:528 | Render-surface × size | docs preview/export 4K not oversized |
| lattice-internals:556 | Render-surface (WebKit) | :root tokens relocated so mobile WebKit works |
| lattice-internals:595 | Render-surface × input | every surface takes every input device |
| lattice-internals:621 | Render-surface × input | pinch never turns the deck |
| lattice-internals:656 | Env | JS default param types |
| lattice-internals:673 | Render-surface (reader) × component | card eyebrow projected |
| lattice-internals:691 | Render-surface (reader) × component | video lead projected |
| lattice-internals:706 | Render-surface (reader) × component | media prose projected |
| lattice-internals:725 | Render-surface (reader) | video inside prose column |
| lattice-internals:742 | Render-surface (reader) | subtitle after heading |
| lattice-internals:760 | Render-surface (reader) | key insight / below-note projected |
| lattice-internals:787 | Render-surface (preview) | image slide doesn't jump on load |
| lattice-internals:901 | Render-surface × dark | video poster doesn't flash light |
| lattice-internals:923 | Render-surface | heading doesn't jump after slide change |
| lattice-internals:961 | Render-surface | tapping video poster plays |
| lattice-internals:977 | Exporter (player) | tapping a link keeps the deck |
| lattice-internals:991 | Component (masthead) | code/prose after heading not lifted into masthead |
| lattice-internals:1006 | Theme (generation) | G-gen merge source rule |
| lattice-internals:1029 | Parser | `$&` in author text is literal |
| lattice-internals:1048 | Env | emulator file citation |
| marp:6 | Exporter (Marp) | both marp-pre forms handled |
| marp:23 | Exporter (Marp) | emoji not rewritten to img (#29) |
| marp:51 | Exporter (Marp) | spot vs global class semantics |
| marp:76 | Exporter (Marp) | leading :is/:where not mangled |
| marp:126 | Theme × Marp | third-party theme still gets canvas |
| marp:158 | Deck-setting × Marp | style: specificity vs theme :root |
| marp:177 | Theme × Marp | :root[…] gated rules work |
| marp:198 | Exporter (Marp) | bundle registers theme |
| marp:225 | Parser | hard-wrapped paragraph not broken mid-sentence |
| memory-profiling:6 | Env | inspector-only leak |
| memory-profiling:30 | Env | DevTools retainer |
| memory-profiling:49 | Env | JIT warmup |
| memory-profiling:65 | Studio-app (WebKit) | iframe recycling doesn't leak |
| memory-profiling:86 | Render-surface | moving iframe doesn't blank it |
| mermaid:6 | Diagram | labels not clipped |
| mermaid:31 | Diagram | click directive inert (security) |
| mermaid:48 | Diagram × theme | %%{init}%% keeps palette colors |
| mermaid:74 | Render-surface (Playground) | DOM transforms rerun after edit |
| mermaid:99 | Diagram × theme | no light-dark() passed to Mermaid |
| mermaid:125 | Diagram (kanban) | cScale not lightened off-palette |
| mermaid:144 | Diagram (timeline/journey) | layout shape documented |
| mermaid:175 | Diagram (mindmap) | own color cycle |
| mermaid:201 | — | RESOLVED |
| mermaid:214 | Diagram | frontmatter first, init after |
| mermaid:229 | Diagram | restoration waits for async run |
| mermaid:251 | Diagram | error renderer never breaks slide layout |
| mermaid:273 | Diagram × theme | themeVariables read from section |
| mermaid:303 | Theme × render | :where(:root) blocks reach slides |
| mermaid:341 | Diagram | no unsupported layout → silent loss |
| mermaid:360 | Env | mmdc cold-start flake |
| mermaid:377 | Diagram × math | KaTeX extractor doesn't splice into SVG CSS |
| overflow:6 | Gate | overflow baseline not stale |
| overflow:44 | Component | top clip (eyebrow/heading) is detected |
| overflow:81 | Render-surface | fixed frame doesn't truncate silently |
| overflow:105 | Render-surface | overflow ring tracks edits |
| overflow:131 | Exporter (.html sidecar) | no false overflow ring |
| overflow:174 | Deck-setting × exporter | guards: strict trims every output format |
| overflow:210 | Render-surface | live preview type scale == PDF |
| overflow:254 | Render-surface | Playground fit == PDF fit |
| overflow:304 | Render-surface | Playground and Studio agree on overflow |
| overflow:392 | Exporter (fluid viewer) | marker shows; author ring never leaks |
| overflow:429 | Component | dense slide keeps card borders |
| overflow:462 | Component | first-line loss detected |
| overflow:484 | Exporter (Studio PDF) | measure scale == raster scale |
| studio-playground:6 | Render-surface (iframe) | iframe trap catalog |
| studio-playground:71 | Render-surface | engine CSS/runtime resolve (no 404) |
| studio-playground:107 | Render-surface | engine bundle not stale |
| studio-playground:160 | Studio-app | divider doesn't snap after load |
| studio-playground:198 | Studio-app | preview not empty after reload |
| studio-playground:226 | Studio-app | cached slide doesn't jump on live takeover |
| studio-playground:263 | Studio-app | Explore layout arrives with page |
| studio-playground:333 | Studio-app | divider same before/after hydration |
| studio-playground:371 | Studio-app | header controls correct on load |
| studio-playground:426 | Studio-app | slide count == rendered slides; edit never destroys slide |
| studio-playground:476 | Component × Studio | split-panel proof hues same when not paginating |
| studio-playground:513 | Render-surface | live preview page numbers correct |
| studio-playground:567 | Render-surface (WebKit) | counters, chart text, marks render |
| studio-playground:608 | Render-surface | cqi/cqh layouts stable |
| studio-playground:644 | Studio-app (iOS) | scroll after sheet |
| studio-playground:671 | Studio-app | crashes logged |
| studio-playground:715 | Studio-app | no false crash notice |
| studio-playground:736 | Studio-app | long-open tab errors |
| studio-playground:760 | Studio-app | crash reports name source |
| studio-playground:783 | Studio-app | deleted data stays deleted |
| studio-playground:809 | Studio-app | no lifetime Web Lock |
| studio-playground:831 | Studio-app (PWA) | OAuth sticks |
| studio-playground:846 | Studio-app | Present rail visible in forced-colors |
| studio-playground:874 | Studio-app | multi-line toast |
| studio-playground:892 | Studio-app | toast text current |
| studio-playground:915 | Studio-app | messages don't flash away |
| studio-playground:934 | Gate | DOM census reads the right elements |
| studio-playground:959 | Studio-app | control icons inside buttons |
| studio-playground:995 | Studio-app | coarse-pointer CSS applies on touch |
| studio-playground:1022 | Studio-app × theme | select-all contrast |
| studio-playground:1101 | Studio-app × theme | bracket highlight follows palette |
| studio-playground:1168 | Studio-app | two editors dress from one source |
| studio-playground:1348 | Studio-app | chat state lands on its deck |
| studio-playground:1400 | Render-surface × size | 4K preview/export not cropped |
| studio-playground:1413 | Studio-app (iOS) | sheet's first control takes first tap |
| studio-playground:1440 | Studio-app | controls inside panel at large text |
| studio-playground:1466 | Studio-app | tab survives deploy |
| studio-playground:1505 | Studio-app | loading shell resolves |
| studio-playground:1536 | Chart × interaction | hover card stable |
| studio-playground:1570 | Studio-app | CSS comment syntax |
| studio-playground:1589 | Studio-app | notifications clickable over sheets |
| studio-playground:1607 | Gate | tests find opened panel |
| studio-playground:1626 | Studio-app | closed panel leaves DOM |
| vscode:6 | Render-surface (VS Code) | Marp preview lacks plugins |
| vscode:27 | Render-surface (VS Code) | every transform has a runtime mirror |
| vscode:83 | Exporter (Marp) | equations keep layout in Restricted Mode |
| vscode:96 | Env | worktree node_modules |
| vscode:119 | Render-surface (VS Code) | script execution depends on security level |
| vscode:208 | Exporter (Marp) | html:true required |
| vscode:231 | Exporter (Marp) | leading :is(section…) dead |
| vscode:274 | Deck-setting × VS Code | logo: shows |
| vscode:306 | Env | marp-cli timeouts |
| vscode:325 | Env | VS Code PDF hue shift |
| vscode:357 | Diagram × size | Mermaid 4K in VS Code |


Gotcha kind totals (232): Render-surface 46 · Studio-app 38 · Exporter 37 · Env (no product contract) 19 · Diagram 16 · Component 15 · Gate/CI+Gate 17 · Theme 10 · Chart 10 · Generated-artifact 5 · Deck-setting 4 · Finish 3 · Engine CSS 3 · Parser 2 · Narration 2 · Modifier 2 · Render path 1 · retired/resolved 2.

## 4. followups.d (260 files, README excluded; all covered)

Type: D defect · V verification owed on a real surface/device · F feature · T tooling/process/perf · X owner decision.
Totals: D 134 · F 47 · V 31 · T 29 · X 19.
Defects by kind: Studio-app 22 · Exporter 16 · Gate/CI 13 (+Gate 3) · Component 12 · Chart 11 · Parser 9 · Generated-artifact 9 · Deck-setting 8 · Render-surface 7 · Narration 5 · Diagram 5 · Package 4 · Finish 4 · Plugin 3 · Theme 1 · Slide-modifier 1 · Docs 1.

| File (followups.d/) | Type | Kind | Missing contract |
|---|---|---|---|
| 2196-p3-section-dark-form-tile-watermark-has-the | D | Component × dark | every dark-form mark contrasts with its ground (tile-watermark class-vs-ground) |
| 2219-p1-restore-the-split-panel-coverless-band-chrome | D | Component (split-panel) | coverless band chrome present on split-panel |
| 2219-p2-close-2161 | T | — | close issue |
| 2219-p3-decide-the-fate-of-claude-overflow-probe | X | Gate | — |
| 2222-p2-this-swimlane-still-has-no-decision-doc | T | Diagram (swimlane) | decision doc owed |
| 2226-p1-take-the-retention-decision-then-implement-it | X | — | retention decision |
| 2226-p2-drive-the-one-claim-2226-could-not | V | — | claim not driven |
| 2230-p2-residual-where-reaches-the-player-s-dark | D | Exporter (player dark) | player dark block never freezes :where() declarations light |
| 2238-p1-drive-the-detail-reveal-in-present-on | V | Chart × Present touch | detail reveal on touch |
| 2238-p2-migrate-roadmap-onto-lib-core-html-tables | T | Chart (roadmap) | shared html-tables kernel |
| 2238-p3-wire-the-deck-wide-scale-register-through | D | Deck-setting × chart | scale: register reaches chart transforms |
| 2238-p4-confirm-or-drop-the-false-text-too | D | Gate | no false "text too small" under live Anima |
| 2239-p2-delete-the-three-empty-model-label-definitions | T | — | label cleanup |
| 2242-p3-decide-whether-cancelled-is-reachable-at-all | X | — | cancelled reachability |
| 2243-p4-give-validatetrack-and-voicelanguagemismatch-callers-or-delete | T | Narration | dead functions |
| 2245-p3-sweep-the-five-files-still-hand-rolling | D | Parser | every file uses the depth-aware <h2> reader |
| 2248-p1-fix-buildreadingarticledocument-the-same-way-it-is | D | Render-surface (reader) | buildReadingArticleDocument correct (broken on main) |
| 2264-p5-drive-a-real-reading-mode-against-a | V | Render-surface (reader) | real reading mode on deployed build |
| 2272-p1-assert-the-a11y-tree-in-the-integration | D | Gate | a11y tree asserted in integration |
| 2289-p2-the-language-chip-s-popover-strands-when | D | Studio-app | language chip popover follows scroll |
| 2289-p3-a-fence-comes-back-as-once-its | D | Parser (Studio) | ~~~ fence preserved on edit |
| 2303-p1-fix-the-same-baseline-defect-in-mermaid | D | Diagram (Mermaid labels) | label baseline correct |
| 2303-p2-verify-the-shipped-fix-on-real-ios | V | Render-surface (iOS) | real iOS fix |
| 2307-p1-read-the-code-scanning-alerts-for-lib | T | Gate | code-scanning alerts |
| 2307-p2-render-the-cdn-script-route-from-a | V | Exporter (CDN) | unproxied egress |
| 2307-p3-decide-whether-the-bounded-attribute-scan-wants | X | Gate | regression test needed? |
| 2314-p2-three-finish-deck-goldens-stale | D | Generated-artifact | committed finish deck PDFs match fresh render |
| 2317-p2-preexisting-golden-drift | D | Generated-artifact | goldens match main's render (50 drift) |
| 2321-p3-portrait-split-cover-footer-clip | D | Component × split × portrait | no false clipped report for ellipsized footer |
| 2321-p3-split-first-body-page-taller-stage | D | Component × split | every body page of a split run gets the same stage |
| 2324-p2-astro-dev-cannot-load-compose | D | Render-surface (dev) | Compose loads on astro dev |
| 2324-p2-iphone-check-chip-picker-scroll | V | Studio-app (iOS) | chip picker scroll |
| 2324-p3-fenceranges-sees-no-containers | D | Parser (Compose) | fenceRanges sees list/blockquote containers |
| 2325-p2-journey-labels-double-escape-ampersands | D | Diagram (journey) | labels not double-escaped |
| 2325-p3-heatmap-gallery-clips-content-on-p3-p4 | D | Component (heatmap gallery) | gallery does not clip; baseline not falsely clean |
| 2326-p1-webkit-sizes-sequence-and-xychart-svg-box | D | Diagram × WebKit | sequence/xychart labels same baseline in WebKit |
| 2327-p2-rebuild-stale-committed-pdfs | D | Generated-artifact | committed PDFs fresh |
| 2327-p3-lattice-lint-is-not-a-command | D | Generated-artifact (messages) | warnings point at real commands |
| 2328-p1-lint-body-boundary-from-markdown-it-tokens | T | Parser (lint) | one markdown-it model for axis boundary |
| 2328-p2-gantt-axis-name-and-spoken-window | F | Chart (gantt) | — |
| 2328-p3-narration-inline-comment-and-over-cap-lint | D | Parser (lint) | axis grammar gaps closed |
| 2331-p3-webkit-ci-arm-decision | X | Gate (WebKit arm) | — |
| 2331-p4-authority-chain-branching-overflows-the-card | D | Component variant (authority-chain branching) | variant fits its card |
| 2331-p4-masked-glyph-pdf-seam-over-a-finish | D | Exporter (PDF) × finish | masked glyph shows no seam over a finish |
| 2331-p4-studio-compose-code-only-child | D | Studio-app CSS | compose selector defect |
| 2334-p2-studio-lint-lacks-claim-excludes | D | Render-surface (Studio lint) | Studio lint receives claimExcludes (lint parity CLI vs Studio) |
| 2335-p2-eyebrow-and-heading-registers-inert-on-some-layouts | D | Deck-setting × component | eyebrow/heading/table registers act on every layout |
| 2335-p3-lint-warn-on-a-modifier-with-nothing-to-act-on | D | Deck-setting (lint) | lint warns on a modifier with nothing to act on |
| 2336-p3-packages-trio-followups | D | Package | packages trio findings |
| 2336-p3-web-images-followups | D | Render-surface (web images) | web image findings |
| 2341-p2-tour-walkunits-browser-test | D | Render-surface (tour) | tour over split slide tested |
| 2343-p3-reconcile-premise-declared-capacity-with | D | Component (premise) | declared capacity == measured |
| 2348-p1-author-reference-docs | T | Docs | author features documented |
| 2348-p2-lfm-spec-front-matter-stale | D | Deck-setting (spec) | spec lists current values |
| 2348-p2-lint-unchecked-front-matter-values | D | Deck-setting (lint) | size/theme/motion values linted |
| 2348-p2-lint-unknown-status-word | D | Chart (lint) | unknown status word warns |
| 2348-p2-obligation-matrix-label-set-narration | D | Narration × component | obligation-matrix narration uses label set |
| 2348-p2-style-front-matter-one-render-path | D | Deck-setting × render path | style: applies on every render path |
| 2348-p3-directive-keys-in-front-matter | D | Deck-setting | directive keys in front matter behave |
| 2353-p3-mark-the-html-player-decision-note-shipped | T | Docs | mark note shipped |
| 2355-p2-state-chart-edge-style-and-flow-controls | F | Chart (state-chart) | — |
| 2355-p3-status-green-shared-by-three-words | D | Chart vocab | status words distinct colors |
| 2356-p2-cadenza-em-dash-pause | D | Narration | em dash pause |
| 2356-p3-cadenza-month-abbreviations | D | Narration | month abbreviations |
| 2356-p3-cadenza-years-as-pairs | D | Narration | years as pairs |
| 2356-p3-journey-visible-label-double-escapes | D | Diagram (journey) | & and " not entity-escaped |
| 2357-p1-pdf-renderer-text-box-centering | D | Exporter (PDF) | pill labels centered |
| 2357-p2-diamond-mark-glyphs-sit-high | D | Exporter (PDF) | diamond glyphs centered |
| 2358-p3-player-export-cancel-stops-picture-fetch | D | Exporter (player) | cancel stops fetches |
| 2358-p3-player-export-skips-deck-css-pictures | D | Exporter (player) | embeds pictures named in deck CSS |
| 2360-p3-publish-workspace-libraries | F | Package | — |
| 2361-p2-talk-venue-and-trim | X | — | talk venue |
| 2361-p2-venue-lint-accuracy-on-real-decks | D | Deck-setting (venue lint) | capacity-scale warnings accurate |
| 2361-p3-glossary-bare-huddle-strict-basis | D | Component (glossary) | stored capacity == measured |
| 2361-p3-lint-quadratic-quoted-comments | D | Parser (lint) | linear time on quoted comments |
| 2361-p3-split-panel-export-blind-spots | D | Exporter (overflow probe) × split-panel | probe reports split-panel clips |
| 2364-p3-dagre-label-own-diagonal | D | Chart (dagre) | edge labels placed off diagonal |
| 2367-p3-premise-modifier-effects-drift | D | Component (premise) | modifier-effects oracle matches render |
| 2371-p1-guide-kernel-into-the-exported-player | F | Exporter (player) | — |
| 2371-p2-vetrina-demo-and-docs-section | F | — | — |
| 2371-p2-word-anchored-cues | F | Narration | — |
| 2371-p3-authoring-time-cue-suggestions | F | Studio-app | — |
| 2372-p4-video-from-the-desktop-app | F | Exporter (video) | — |
| 2374-p3-indaco-dark-cat-6-and-cat-8-both-teal | D | Theme (indaco dark) | categorical fills distinct |
| 2375-p1-one-settle-before-reveal-font-contract | X | Render-surface (fonts) | one settle-before-reveal font contract |
| 2375-p2-stale-studio-tab-404s-themes-after-deploy | D | Studio-app | stale tab doesn't 404 themes |
| 2375-p3-slide-edge-known-gaps | D | Render-surface (slide edge) | keyline gaps |
| 2376-p2-list-code-pane-budgets-over-ceiling | D | Component (list, code) | declared pane budgets ≤ measured |
| 2376-p2-size-chart-viewbox-to-the-pane | F | Chart × pane | — |
| 2376-p3-band-family-for-stacked-panes | F | Component (shape family) | — |
| 2376-p3-chart-pane-canvas-under-long-headline | D | Chart × pane | canvas fits box when headline wraps |
| 2376-p3-map-key-value-double-escaped | D | Chart (map) | key values not double-escaped |
| 2376-p3-overprint-probe-blind-marks | D | Gate (overprint probe) | probe sees every mark |
| 2376-p3-truncated-names-in-shipped-decks | D | Generated-artifact (shipped decks) | chart names not truncated |
| 2378-p2-new-gallery-clips-2377-2380 | D | Component (galleries) | galleries don't clip; baseline not blessing a clip |
| 2383-p2-nightly-e2e-red-on-main | D | Gate/CI | nightly e2e green on main |
| 2385-p2-composite-chain-reads-as-a-column | D | Chart (state-chart) | composite chain readable |
| 2385-p2-flowchart-editor-autocomplete | F | Studio-app | — |
| 2385-p2-flowchart-group-direction | F | Chart (flowchart) | — |
| 2385-p2-flowchart-group-padding | D | Chart (flowchart) | group padding |
| 2385-p2-flowchart-group-title-placement | F | Chart (flowchart) | — |
| 2385-p2-flowchart-shape-aliases | F | Chart (flowchart) | — |
| 2385-p2-flowchart-spacing-controls | F | Chart (flowchart) | — |
| 2385-p2-flowchart-worker-throttle | T | Chart (flowchart) | perf throttle |
| 2385-p3-compose-inline-code-popup | F | Studio-app | — |
| 2385-p3-flowchart-connection-points | F | Chart (flowchart) | — |
| 2385-p3-flowchart-icons | F | Chart (flowchart) | — |
| 2385-p3-flowchart-line-rides-group-top | D | Chart (flowchart) | line doesn't ride group title |
| 2385-p3-live-status-paints-two-ways | D | Chart vocab | `live` paints the same across families |
| 2388-p2-studio-drops-deck-embedded-finish-css | D | Finish × render path | Studio paints a deck-embedded finish |
| 2388-p3-legacy-saved-finish-wedge | D | Finish × exporter (--chrome-pdf) | legacy saved finish doesn't wedge |
| 2388-p3-veil-tile-seams | D | Finish × exporter (--chrome-pdf) | no tile seams |
| 2393-p2-guide-opens-a-detail-card | X | Studio-app | — |
| 2393-p2-ios-underline-and-phone-cursor | D | Studio-app (iOS) | underline bounded |
| 2398-p1-verify-add-slide-on-a-real-ipad | V | Studio-app (iPad) | real device |
| 2399-p3-bench-math-workload-drift | D | Generated-artifact (bench) | bench counts match gallery |
| 2400-p3-resave-legacy-fabricate-spotlights | D | Finish (saved) | legacy finish migrated |
| 2404-p2-git-dir-leak-in-hook-tests | D | Gate/CI | hook tests don't leak into repo |
| 2404-p2-pdf-parity-sweep-ci-job | X | Gate/CI | PDF parity sweep as CI job |
| 2404-p2-webpage-export-note-blank-line | D | Exporter (webpage) | note strip leaves no blank line |
| 2404-p3-pdf-writer-known-limits | D | Exporter (PDF writer) | known limits / viewers |
| 2411-p2-cli-os-sandbox-other-platforms | V | Package (CLI sandbox) | macOS/Windows |
| 2415-p2-hook-test-clobbers-worktree-index | D | Gate/CI | hook test doesn't clobber index |
| 2415-p2-scene-gaps | F | Narration (scenes) | — |
| 2415-p2-stage-window-palette-blink | D | Studio-app × palette | stage window doesn't blink |
| 2417-p5-lpm-tokens-own-declarations | D | Plugin | tokens list host-supplied, not self-declared |
| 2417-p5-plugin-roadmap-phases-e-to-g | F | Plugin | — |
| 2422-p3-flowchart-worker-burst-arm-flaky | D | Gate/CI | flowchart burst arm not fixed-timer |
| 2422-p4-bracket-list-linear-arm-single-sample | D | Gate/CI | bracket-list arm noise guard |
| 2422-p4-loose-readers-still-read-block-scalar-bodies | D | Parser (front matter) | every reader skips block-scalar bodies |
| 2424-p3-trama-nudge-shared-runs | F | Chart (trama) | — |
| 2424-p3-trama-sync-live-redraw-settles | D | Render-surface (trama) | no-worker redraw settles |
| 2436-p2-real-device-playback | V | Exporter (narrated video) | real devices/PowerPoint/Keynote |
| 2441-p2-exported-player-guide-lead | D | Exporter (player) | Guide lead parity with Present |
| 2441-p2-mermaid-guide | D | Diagram × Guide | Mermaid gets Guide walk |
| 2443-p3-present-voice-button-says-aria-for-every-cloud-voice | D | Studio-app | voice button names voice |
| 2447-p1-verify-studio-webpage-export-into-lattice-video | V | Exporter (webpage→video) | — |
| 2447-p2-ship-the-cli-skill-in-the-claude-code-plugin | F | Package | — |
| 2453-p2-compose-spark-popup | F | Studio-app | — |
| 2453-p3-cache-rough-ink-paths | T | Render-surface | perf cache |
| 2453-p3-rebuild-stale-sketch-pdfs | D | Generated-artifact | sketch PDFs fresh |
| 2453-p3-repaint-only-changed-slides | T | Render-surface | perf repaint |
| 2456-p3-mermaid-theme-reader-one-recalc-per-token | T | Diagram | perf recalc |
| 2456-p3-runtime-full-pass-after-every-patch | T | Render-surface | perf runtime pass |
| 2456-p3-split-seed-clamp-paints-raw-share | D | Component (split seed) | clamp on first frame |
| 2466-p2-dependabot-groups-still-red | D | Gate/CI | Dependabot groups green |
| 2466-p2-vendored-mermaid-dompurify-3-3-1 | D | Package (vendored) | vendored DOMPurify current |
| 2473-p3-retire-the-experimental-pane-syntax | X | Deck-setting | panes alias retirement |
| 2479-p3-normalize-comment-resolve-narration | T | Docs | comment pointer |
| 2494-p1-ci-gate-passes-a-timed-out-tier | D | Gate/CI | ci gate fails timed-out tier |
| 2500-p3-modulepreload-misses-static-imports | D | Studio-app | modulepreload covers closure |
| 2512-p3-second-radial-chart-redesigns-the-solvers | X | Chart (trama) | — |
| 2512-p4-one-arrowhead-for-trama | T | Chart (trama) | dedupe arrowhead |
| 2521-p2-integration-job-timeout-margin | T | Gate/CI | integration timeout margin |
| 2523-p3-panel-shells-slide-in-poll-misses-under-load | D | Gate/CI | slide-in test robust under load |
| 2524-p1-ci-path-filter-skipped-tiers-on-rerun | D | Gate/CI | changes job runs |
| 2533-p3-heading-pill-label-sits-low-in-the-pdf | D | Exporter (PDF) | heading pill label centered |
| 2538-p2-goldens-drift-on-main | D | Generated-artifact | goldens match main (33 drift) |
| 2538-p3-pdf-finish-frame-keyline-4k | D | Exporter (PDF writer) × finish × 4K | frame keyline sharp |
| 2540-p1-lessons-iphone-listen | V | Studio-app (iPhone) | lessons voice |
| 2540-p3-radix-modal-hides-vetrina-exit | D | Studio-app (a11y) | Radix modal doesn't hide Vetrina exit |
| 2547-p1-verify-live-on-two-real-networks | V | Studio-app (live) | two real networks |
| 2547-p2-decide-a-turn-default | X | Studio-app (live) | TURN default |
| 2547-p2-live-privacy-note | T | Docs (privacy) | — |
| 2547-p2-live-sessions-outlive-host | F | Studio-app (live) | — |
| 2547-p2-per-member-signing-keys | F | Studio-app (live) | — |
| 2547-p2-phone-sheet-shift-misdirects-taps | D | Studio-app (phone) | sheet doesn't shift under finger |
| 2547-p3-comments-note-contradicts-itself | D | Docs | comments note self-contradiction |
| 2547-p3-live-clock-and-chat-limits | F | Studio-app (live) | — |
| 2547-p3-live-connection-telemetry | F | Studio-app (live) | — |
| 2547-p3-live-edit-attribution | F | Studio-app (live) | — |
| 2547-p3-live-editor-trust-and-rate-limits | F | Studio-app (live) | — |
| 2547-p3-live-guide-and-shared-tag | F | Studio-app (live) | — |
| 2547-p3-live-presence-keyed-by-name | F | Studio-app (live) | — |
| 2547-p3-live-present-with-audience | F | Studio-app (live) | — |
| 2547-p3-live-slide-lock | F | Studio-app (live) | — |
| 2547-p3-own-signaling-relay | F | Studio-app (live) | — |
| 2547-p3-rotate-link-on-remove | F | Studio-app (live) | — |
| 2547-p3-share-present-link-makes-no-link | D | Studio-app (Share) | Present link row makes a link |
| 2547-p4-screen-share | F | Studio-app (live) | — |
| 2549-p1-real-viewer-checks-reopenable | V | Exporter (re-openable) | real viewers |
| 2549-p3-library-drop-overlay-sticks-on-cancel | D | Studio-app (Library) | drop overlay clears on cancel |
| 2553-p1-studio-phone-chrome | F | Studio-app (phone) | — |
| 2553-p2-lesson-intent-prewarm | F | Studio-app | — |
| 2554-p1-uncommit-generated-js | T | Generated-artifact | uncommit generated JS |
| 2556-p2-verify-editable-pptx-in-powerpoint | V | Exporter (editable pptx) | PowerPoint itself |
| 2556-p3-calco-license-and-types-for-outside-users | X | Package (Calco) | — |
| 2556-p3-calco-native-shapes | F | Exporter (pptx native shapes) | — |
| 2570-p2-goldens-step-4-switch-on-auto-merge | T | Gate/CI (goldens) | thresholds + auto-merge |
| 2571-p1-verify-regency-and-calls-on-devices | V | Studio-app (live calls) | real devices |
| 2571-p2-build-s5-video | F | Studio-app (live video) | — |
| 2571-p3-call-output-device | F | Studio-app (calls) | — |
| 2577-p3-svg-text-char-index-misaligned | D | Exporter (PDF writer) | SVG text char index aligned under whitespace collapse |
| 2595-p1-changesets-release-pipeline | T | Release | — |
| 2595-p2-bootstrap-publish-1-0-0 | T | Release | — |
| 2595-p2-retire-august-v1-tag | T | Release | — |
| 2595-p3-golden-diff-same-version-deps | D | Gate/CI (golden-diff) | stale goldens not reported as changed |
| 2595-p3-weekly-automatic-release | T | Release | — |
| 2599-p1-independent-check-of-the-marp-open-markup-port | V | Exporter (Marp bundle) | independent checker |
| 2599-p2-markdown-it-unclosed-comment-quadratic | D | Parser (markdown-it) | unclosed <!-- linear |
| 2599-p3-marp-cli-range-floor | V | Exporter (Marp bundle) | marp-cli floor |
| 2606-p3-mark-treatments-review | X | Modifier (mark-* treatments) | keep/change/drop |
| 2609-p2-trama-route-wall-clock | D | Chart (trama) | wall-clock bound |
| 2609-p3-library-api-revisit-0-2 | X | Package | API revisit |
| 2611-p1-replace-the-remaining-naive-css-comment-regexes | D | Parser | every CSS-comment reader uses the shared scanner |
| 2612-p2-ratify-and-publish-draft-specs | X | Spec | ratify drafts |
| 2612-p3-pill-unknown-word-unreported | D | Chart (lint) | unknown/repeated pill word reported |
| 2615-p1-verify-stale-deploy-swap-on-iphone | V | Studio-app (iPhone) | stale-deploy swap |
| 2620-p3-engine-named-esm-exports | D | Package | named ESM exports |
| 2620-p4-completion-on-windows-powershell-5-1 | V | Package (Windows) | PowerShell 5.1 |
| 2628-p2-dark-slides-erase-gradient-slot-treatments | D | Slide-modifier × dark | dark slides keep tint-* gradient slots |
| 2633-p1-verify-ios-wake-lock-clipboard-and-speaker | V | Studio-app (iOS) | wake lock etc. |
| 2633-p2-slow-first-connect-and-phone-host-handoff | T | Studio-app (live) | measure |
| 2633-p3-withdraw-a-chat-typing-post-when-typing-is-turned-off | F | Studio-app (live) | — |
| 2639-p3-live-row-hover-contrast | D | Studio-app × light palette | hovered row contrast |
| 2640-p1-sanitizer-object-url-opt-in | D | Package (sanitizer) | blob: allowance opt-in |
| 2640-p2-webkit-pptx-drops-images | D | Exporter (pptx) × WebKit | pptx keeps pictures and reports failure honestly |
| 2640-p3-large-photo-decode-unverified | V | Studio-app | large photo decode |
| 2640-p3-live-collaboration-photos | D | Studio-app (live) | guest sees Library photos |
| 2640-p3-media-export-duplication | D | Exporter (media) | photo embedded once |
| 2640-p3-pptx-capture-intermittent-image-load | D | Exporter (pptx) | image load reliable |
| 2640-p3-raw-html-asset-refs | D | Parser (asset:) | resolved in raw HTML src/srcset/video |
| 2641-p1-collage-lightbox-real-ios-run | V | Component (collage) × iOS | lightbox gestures |
| 2648-p2-drive-exported-player-wheel-in-webkit-gecko | V | Exporter (player) × WebKit/Gecko | lightbox wheel/digits |
| 2648-p3-lightbox-wheel-and-digit-polish | F | Exporter (player) | — |
| 2649-p1-compose-inline-notation-editors | F | Studio-app (Compose) | — |
| 2649-p2-compose-audit-untested-surfaces | V | Studio-app (Compose) | untested surfaces |
| 2649-p3-library-images-complete-flake | D | Gate/CI | flaky spec |
| 2651-p1-drive-the-plugin-placeholder-on-cards-columns | V | Plugin × component | placeholder on cards/columns/fluid |
| 2654-p1-real-device-pass-for-chat-photos-video-and-pool | V | Studio-app (chat) | real phone |
| 2662-p2-compose-pill-surfaces-not-driven | V | Studio-app (Compose) | Safari @scope, IME, locked slides |
| 2662-p3-compose-pill-separator-backspace-undo-step | D | Studio-app (Compose) | no empty undo step |
| 2665-p1-carrier-cap-and-1440-chromium-gap | D | Studio-app | carrier cap writer check; Chromium photo specs run |
| 2668-p3-collage-spec-enter-inserts-a-list-continuation | D | Studio-app (Compose) | Enter accepts completion |
| 2672-p3-discard-a-chat-clip-the-author-adopted | D | Studio-app (chat) | adopted clip not deleted |
| 2673-p1-compose-spark-surfaces-not-driven | V | Studio-app (Compose) | 820px/Safari |
| 2673-p2-compose-spark-fixes-second-checker-pass | V | Studio-app (Compose) | second checker pass |
| 2673-p3-compose-spark-edit-fidelity-gaps | D | Studio-app (Compose) | spark edit preserves spacing |
| 2674-p3-tone-rail-studio-and-nightly-check | V | Slide-modifier × split | tone rail across 70 galleries the PR cap skipped |
| 2678-p3-packed-form-webpack-and-ci-gate | X | Gate/CI | packed form gate |
| 2687-p3-library-image-metadata-use-new-name-flake | D | Gate/CI | flaky spec |
| 2687-p4-inline-kinds-on-rebuilt-layouts | D | Plugin × component | zip plugin @kind spans render on all 38 rebuilt layouts |
| 2687-p5-inline-fields-and-2686-reader | X | Plugin | fields semantics |
| 2687-p6-versioned-consent-text | T | Plugin | consent versioning |
| 2687-p7-fence-output-style | D | Plugin (fence) | fence output style can't cover slide |
| 2687-p8-compose-inline-kind-panel | F | Studio-app (Compose) | — |
| 2689-p2-palette-audit-nondeterministic | D | Generated-artifact (palette-audit PDF) | one commit renders one way |
| 2690-p1-chart-model-phase-2-reader | F | Chart (authoring model) | — |
| 2691-p2-chat-tools-that-act-on-lattice | X | Studio-app (chat) | — |
| 2691-p3-architect-names-a-layout-in-code | D | Studio-app (chat) | Architect never names layout in code |
| 2692-p2-inline-span-bench-scenario | T | Gate (bench) | inline-span scenario |
| 2692-p3-phone-shape-for-inline-specs | V | Studio-app (phone) | inline specs phone case |
| 2699-p3-bn-magnitude-spelling | D | Narration | 5Bn reads as billion |
| 2704-p1-compose-reports-a-part | D | Studio-app (Compose) | reports part not unit |
| 2704-p2-present-follows-the-hub | D | Studio-app (Present) | follows focus hub |
| 2704-p3-live-ids-and-boot-slide | D | Studio-app (live) | stable unit ids |
| 2704-p4-playground-scanner | T | Render-surface | Playground uses deck outliner |
| 2704-p5-preview-element-addresses | F | Studio-app | — |
| 2704-p6-deck-outline-carry-ids | T | Studio-app | shared carryIds |
| 2708-p1-docs-build-not-byte-deterministic | D | Gate/CI (docs build) | byte-deterministic |
