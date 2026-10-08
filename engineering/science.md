# The science in Lattice — a map of the algorithms and models we ship

Lattice writes most of its own science. Color spaces, a parser generator, an edge router,
container formats, statistical tests and models of human movement and speech are all in
this repository, usually with the measurement that justified them written next to the
code. A short list of heavy algorithms comes from libraries, and the last two sections
say which, and what we deliberately do **not** do.

This page is a map, not a manual. Each row names the idea, the file and the function
that holds it, and the one fact that makes it worth knowing. The file's own header is
the long form; read it before changing the code.

**Keeping it current.** Rows cite a file and a symbol, never a line number, because line
numbers rot on the next edit. A PR that adds, replaces or removes an algorithm updates
its row in the same commit (CLAUDE.md rule 6). The map was built on 2026-10-08 from a
read-only sweep of `lib/`, `tools/`, `docs/src/lib/` and `test/`. That sweep sampled the
largest files (`tools/check-ownership.js`, `lib/authoring/lint-core.js`,
`lib/export/player-core.mjs`, `lib/runtime/index.js`) by search, not end to end, so
treat this map as nearly complete rather than a census.

---

## 1. Color science and perception

No color library. The kernel is `lib/theme/color.js` and `lib/theme/cvd.js`.

| Idea | Where | What is worth knowing |
|---|---|---|
| sRGB transfer curve, WCAG 2 relative luminance and contrast ratio | `lib/theme/color.js` (`srgbChannelToLinear`, `contrastRatio`) | Rec. 709 weights. The forward curve uses the WCAG threshold 0.03928, the inverse the IEC 0.0031308; the gap is invisible at 8 bits. |
| OKLab and OKLCH (Ottosson 2020) | `color.js` (`hexToOklab`, `oklabToLinearRgb`, `oklabDistance`) | Both directions through the cone-response (LMS) matrix. Hue, chroma and lightness edits all happen here. |
| Gamut mapping | `color.js` (`oklchToHex`) | Bisects chroma 24 times at fixed lightness and hue, the CSS Color 4 idea. |
| Contrast repair | `color.js` (`ensureContrast`) | Walks OKLCH lightness only, so a repaired color keeps its hue. |
| Two-surface ink solver | `lib/theme/cat-ink.js` (`solveInk`, `feasibleRange`) | A chart mark must clear 4.65:1 on both slide surfaces. A second pass restores OKLab separation the solve destroyed, measured relative to what the palette already had. |
| Color-vision deficiency simulation (Machado, Oliveira and Fernandes 2009) | `lib/theme/cvd.js` | Applied in **linear** RGB; the header explains why most web simulators get this wrong. Total color blindness is modeled as equal-luminance gray. |
| Perceptual distance floors | `lib/theme/contrast.js`, `tools/cvd-audit.js`, `tools/chart-mark-separation.js`, `checkHljsSeparation` and `checkMutedTierFloors` in `tools/check-ownership.js` | Every distance is Euclidean OKLab. Charts also check that a mark's own gradient never spreads wider than its gap to the next category. |
| Palette generation by hue strategy | `lib/theme/derive.js` | Spectrum, analogous, triad, complementary and brand-mono. Brand-mono adds lightness spread because chroma alone collapses to about two distinct colors. |
| Color math in CSS | `tools/build-chart-finish-css.js`, `lib/plugins/mermaid/mermaid.styles.css`, `lib/base/base.tokens.css` | A branch-free black/white switch (`clamp()` on OKLCH `l`, a hand-built `contrast-color()`); the `none` channel in `color-mix`; quartic lightness curves; sequential ramps whose poles flip with `color-scheme`. |
| Texture as a second category channel | `lib/core/accessibility-textures.js`, `lib/core/texture-ramp.js` | Twelve 8×8 SVG pattern tiles for color-blind readers and grayscale print. |
| Contrast on rendered pixels | `tools/check-slide-contrast.js`, `tools/check-player-contrast.js`, `tools/chart-contrast-solve.js` | Glyphs are hidden and the backdrop read back. The compositing model documents its own known error (#1717). |

## 2. Languages, parsing and compilation

| Idea | Where | What is worth knowing |
|---|---|---|
| **Segno**, an LL(1) parser generator | `docs/src/lib/segno/` (`grammar.ts`, `charset.ts`, `codegen.ts`) | Refuses any grammar it cannot prove LL(1), so every parser it emits is linear time. Nullable/FIRST/FOLLOW by worklist fixed points; character sets as intervals over UTF-16; emitted code has no imports or `eval`, uses lookup tables for ASCII and binary search for wide sets. Its README covers the bounded extensions (`attempt`, `greedy`, `until`). |
| Segno's tests | `segno/grammar-fuzz.test.ts`, `segno/metamorphic.test.ts`, `tools/mutate-segno.mjs`, `tools/parser-bakeoff/` | Exhaustive enumeration of random grammars' languages, metamorphic relations, mutation testing, and a bake-off against six parser libraries. |
| Linear scanners replacing backtracking regexes (ReDoS) | `lib/core/closed-comments.js`, `lib/core/html-inline-guard.mjs`, `lib/core/front-matter-key.js`, `lib/core/bracket-list.js` | Each header records the measured blowup it removed. `html-inline-guard` precomputes closability in one right-to-left pass and patches markdown-it. |
| CSS lexing | `lib/core/css-comments.mjs` (`eachCssRun`), `lib/core/css-scan.js` | One state machine for comments, strings and `url(` per CSS Syntax; escape decoding with position mapping feeds the exfiltration scanners. |
| The compile pipeline | `lib/engine/slides.js`, `lib/engine/directives.js`, `lib/transformers/registry.js` | markdown-it core rules, then ordered HTML passes. Directive scoping: spot replaces global, global carries forward. |
| Topological order for plugins | `lib/plugins/resolve.js` | Kahn's algorithm, ties broken by name for determinism, cycles reported with their path. |
| TeX display-equation reflow | `lib/core/tex-linebreak.js` | A nesting-depth scan picks depth-0 break points and tells a binary `+` from a unary sign; KaTeX re-typesets, with fallback on error. |
| Parser memo | `lib/engine/index.js` | Single entry, keyed on the full input set, guarded by a byte comparison over every committed deck. |
| Untrusted transform rules | `lib/core/transform-dsl/` | A closed operation set, one forward pass, budgets, idempotence. Prototype, not wired in. |
| Edit distance | `lib/authoring/lint-core.js`, `docs/src/lib/intent-search.ts` | Bounded Levenshtein with early exit, for "did you mean" and typo repair. |

## 3. Security and cryptography

| Idea | Where | What is worth knowing |
|---|---|---|
| The HTML RAWTEXT trap | `lib/core/sanitize-style-text.mjs` | `</style` ends a style element even inside a CSS comment; the guard writes `<\/style`. Fuzzed with 300,000 cases. `css-tree` turns the escape back into a live terminator, which is why every CSS re-wrap guards again (HARD RULE #22). |
| Layered sandbox for package code | `lib/packages/code-door-core.mjs`, `code-shape.mjs`, `code-syntax.mjs`, `lib/core/os-sandbox.js` | Opaque-origin iframe, CSP allowing one script by hash, a worker with `eval` and `Function` stubbed out, network names removed, frozen inputs, an acorn parse for dynamic `import()`, and a measured seccomp check on Linux. |
| Consent pinned to content | `lib/packages/trust.js` | Trust is the SHA-256 of `transform.js`, stored where no package can write it. |
| SHA-256 from scratch | `docs/src/lib/lente/hash.ts` | Checked against NIST vectors; Lente hashes an injective encoding because an earlier one let two decks share a digest. |
| Peer-to-peer editing | `docs/src/lib/tavola/`, `docs/src/components/studio/live/` | ECDSA P-256 host identity, AES-GCM with a non-extractable key, Yjs (a conflict-free replicated data type) over WebRTC, and an anchor-based rebase that refuses rather than guesses. |
| OAuth PKCE | `docs/src/components/studio/ai/architect-model.js` | S256 challenge for bring-your-own-key OpenRouter. |
| Input-size bombs | `lib/packages/zip-read.js`, `lib/packages/json-guard.js` | Streamed inflation under a running byte cap; a one-pass bound on what `JSON.parse` will build. |

## 4. Graph drawing and computational geometry

| Idea | Where | What is worth knowing |
|---|---|---|
| Layered (Sugiyama) layout | `docs/src/lib/trama/kernel.ts`, `lib/core/dagre-layout.js` | dagre ranks and orders; Trama reverses back edges first so dagre's cycle breaker never decides, and re-ranks with other rankers when the routed drawing crosses itself. |
| Coffman–Graham layering with barycenter order | `kernel.ts` (`graphOrder`) | For the reading-order grid layouts. |
| **Trama's orthogonal edge router** | `kernel.ts` (`solveRoutes`) | Candidate routes on channel lanes, one weighted cost, branch-and-bound pruning, rip-up-and-reroute sweeps, and a work budget counted in steps so every machine draws the same chart. |
| Port spreading by dynamic programming | `kernel.ts` (`placeAround`) | Cheapest placement of line ends into gaps with a minimum step. |
| Fit against the type floor as a fixed point | `docs/src/lib/trama/pipeline.ts` | Shrinking raises the minimum type size, which changes the layout. A secant step from round 3, and a test for when no fixed point exists. |
| Arc length on an ellipse | `docs/src/lib/trama/radial.ts` (`arcParam`, `ellipseWing`) | Numerical integration, because there is no closed form. |
| Chart kernels | `lib/components/chart/_chart-family/cartesian.js` and the per-chart `*.transform.js` | Heckbert nice ticks plus 2.5; area-true bubbles; least squares and Pearson's r; largest-remainder rounding to 100; quantile classes; first-fit Gantt lanes; an Archimedean spiral with a golden-angle start for word clouds. |
| Label placement | `_chart-family/svg-label.js` (`placeLabels`, `deCollideLabels`) | An eight-position candidate model as in cartography, with leader lines. |
| Map projections | `tools/build-basemap.world.js` | Equal Earth and Robinson, and Douglas–Peucker simplification, all at build time. |

## 5. Typography and fit

| Idea | Where | What is worth knowing |
|---|---|---|
| Visual-angle legibility | `engineering/typography.md`, `lib/core/resolve-venue.js` | arcminutes ≈ 3438 × height ÷ distance; venue rungs target about 12′ body x-height. |
| Overflow predicted without rendering | `lib/authoring/lint-core.js` (`wrapLines`), `tools/measure-glyph-advances.js` | Greedy wrap over per-glyph advances measured from the shipped fonts. |
| Font engineering | `lib/core/pdf-compose/font-subset.mjs`, `docs/src/lib/calco/sfnt.ts` | HarfBuzz subsetting pins `wght` and drops ligatures, which broke copied text; sfnt checksums; EOT wrapping for PowerPoint. |
| The Fit Spine | `lib/core/auto-split.js`, `lib/core/collections.js` (`evenGroups`) | Collapse, shed, split, never scale. Splits are balanced partitions (4/3/3/3, not 4/4/4/1). |

## 6. File formats, media and signal processing

| Idea | Where | What is worth knowing |
|---|---|---|
| MP4 (ISO BMFF) and tx3g captions | `lib/export/tx3g.mjs` | Boxes written by hand, 64-bit sizes, a `moov` rewrite that moves no chunk offset. |
| PDF internals | `lib/core/pdf-compose/write-pdf.mjs`, `lib/core/pdf-timestamps.js`, `docs/src/components/studio/export/pdf-text-layer.js` | PNG IDAT passed straight into a Flate stream; byte-identical PDFs by pinning timestamps without moving offsets; an invisible text layer. |
| Deterministic video clock | `lib/export/video.mjs` | Every page timer replaced by a fake clock that follows the HTML nested-timer clamp. AAC encoder delay is measured with a click, not assumed. |
| Speech | `lib/export/kokoro-voice.mjs`, `docs/src/lib/cadenza/`, `lib/core/speech-pcm.mjs` | Kokoro neural TTS on ONNX; a syllable-based prosody model with Klatt pre-boundary lengthening; per-voice calibration by rolling median; onset detection. |
| Office files | `docs/src/lib/calco/` | Editable PPTX and ODP written directly; one-Bézier arcs with k = (4/3)·tan(Δθ/4); a leading model for how office suites place line spacing. |

## 7. Human–computer interaction

| Idea | Where | What is worth knowing |
|---|---|---|
| Fitts's law | `docs/src/lib/vetrina/pacing.ts` | The demo cursor's movement time, after MacKenzie 1992. |
| A model of the hand path | `docs/src/lib/vetrina/stage.ts` | Ballistic move then correction (Woodworth; Meyer 1988), a bowed path, and tremor at 1.7 and 9 Hz tied to wall-clock time to avoid aliasing. |
| Input-verb kernel | `lib/core/present-transport.mjs` | Swipe direction tests, a wheel cooldown that absorbs trackpad momentum, exponential zoom, pinch about its midpoint. |
| Render scheduling | `docs/src/lib/frame-scheduler.ts`, `docs/src/playground/virtual-window.js` | Frame-aligned coalescing with backpressure; a virtual list. |

## 8. Search and machine learning

| Idea | Where | What is worth knowing |
|---|---|---|
| Okapi BM25 | `docs/src/lib/intent-search.ts` | k1 = 1.2, b = 0.75, field weights set by ablation; Porter2 stemming; typo repair. |
| Search cascade | `docs/src/lib/component-search.ts` | Substring, then BM25, then Fuse.js fuzzy match. |
| Embedding retrieval | `docs/src/components/studio/ai/architect-retrieval.js` | bge-small, mean pooling, cosine ranking, lexical fallback. |
| LLM generation under gates | `lib/layout/ai.js`, `tools/component-gen-eval.mjs` | Output passes the same deterministic gates as hand-written code; evaluated on a frozen held-out adversarial set. |

## 9. Measurement, statistics and testing

| Idea | Where | What is worth knowing |
|---|---|---|
| Leak detection by trend test | `tools/perf-torture/engine.mjs` | Mann-Kendall plus Sen's slope, judged against an idle control because memory samples are autocorrelated; then a breadth-first search back to a GC root. |
| Benchmark noise bands | `test/benchmark/engine-bench.mjs`, `tools/perf-nightly-compare.mjs` | Bands widen with measured noise but are capped so a 2× regression cannot pass; a calibration probe on code that is not ours. |
| Asymptotic tests | `test/benchmark/relationship-scaling.test.js` | Assert a time **ratio** across input sizes, not a wall clock. |
| Scorecard science | `lib/authoring/scorecard.js`, `tools/score-variance.js`, `tools/score-venue-lint.js` | A saturating penalty curve; weights checked by variance decomposition and ablation; the linter graded with a confusion matrix against real exports. |
| Metamorphic and mutation testing | `test/unit/tools/jank-drift.metamorphic.test.js`, `tools/mutate-segno.mjs`, `tools/mutate-guide-gestures.mjs`, `tools/mutate-stage-window.mjs` | Relations that need no oracle; hand-built mutants. |
| Jank geometry | `tools/lib/jank-drift.js`, `tools/check-jank.js` | Drift as the minimum spread over three references tells a moving anchor from a growing one. |
| Software-evolution metrics | `tools/complexity-report.js`, `tools/change-coupling.js` | McCabe complexity on the acorn tree; change coupling from git history as a Jaccard index. |
| Determinism | `lib/core/render-ids.js` | Render-scoped id sequences; a fresh-name prefix proved absent from the source with BigInt. |
| Merge pre-check | `tools/queue-precheck.sh` | An in-memory three-way merge that ignores merge drivers, as GitHub does. |

---

## What comes from libraries

dagre (layered layout), KaTeX (math), Mermaid, HarfBuzz and woff2-encoder (fonts),
kokoro-js and ONNX Runtime (speech), Transformers.js (embeddings), `qrcode` (including
its Reed-Solomon error correction), DOMPurify, parse5, css-tree, acorn and the TypeScript
compiler API (parsing for gates), Yjs and trystero (collaboration), pdf-lib, JSZip,
pptxgenjs, mediabunny and lamejs (containers and codecs), rough.js (sketch strokes),
d3-geo (build-time paths), Fuse.js and wink-porter2-stemmer (search), tinybench,
dependency-cruiser, jscpd and knip (measurement).

## What we deliberately do not do

Each of these is a choice, not a gap; read the linked reason before adding one.

- **No shrink-to-fit by binary search.** The Fit Spine never scales text down
  (`lib/core/tex-linebreak.js` header restates it).
- **No Knuth–Plass line breaking or hyphenation dictionaries.** Line breaking is the
  browser's (`text-wrap: balance | pretty`).
- **No APCA, CIEDE2000 or wide-gamut output.** WCAG 2 ratios and Euclidean OKLab only.
- **No force-directed layout, A\*, visibility graph or constraint solver.** Trama
  enumerates candidates and prunes instead, which keeps it deterministic.
- **No perceptual image diff (SSIM).** Goldens compare bytes, then pixels with a fixed
  per-channel tolerance.
- **No bootstrap or confidence intervals** in the benchmarks; tinybench's relative margin
  of error is the only spread.
- **No readability formula.** Prose budgets count words per role.
- **No Myers diff.** The Studio's line diff is quadratic dynamic programming.
- **No incremental per-slide render cache.** A design note exists; only the single-entry
  parser memo is built.
