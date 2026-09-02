# Gotchas

Things in this codebase that look wrong but aren't, plus workarounds
whose rationale lives in commit messages and would otherwise be lost.

This is a **living index**. When you hit something surprising — a hack
in the code, a quirk in a dependency, a behavior that took a bisect to
understand — add an entry. Future-you and future-collaborators (human
or LLM) will thank you.

## How to use this file

This page is the **symptom index** — one line per gotcha, grouped by topic, each
linking into a file under `engineering/gotchas/`. Do not read the topic files
top-to-bottom; they hold ~150 entries between them and they are a reference, not a
narrative. (No exact count here on purpose — a hand-maintained total in prose goes
stale the first time someone adds an entry, and nothing regenerates this paragraph.
The generated index below is the live list.)

**Two ways in, and picking the wrong one is how you conclude "gotchas has nothing":**

- **You can describe the SYMPTOM** ("the ring lags an edit", "type falls back in the
  PDF") — skim or `grep` this index, then open the ONE file it points at.
- **You have a NAME instead** — an API, a CSS property, a selector, a token, an error
  string (`z-index`, `srcdoc`, `container-type`, `getBoundingClientRect`) — then
  **`grep -rn <term> engineering/gotchas/`**. Those words are in the entry BODIES,
  which this index does not carry: it lists headings only. Grepping the index for
  `z-index` returns nothing while seven entries discuss it. Grep costs the same on
  the directory as on one file — you pay for the hits, not the haystack.

When fixing or working around something subtle, add an entry **before** committing
the fix so the commit message can link to it. Add it to the topic file (as a `##`
heading), then run `npm run gotchas:index` — the list below is generated, and
`npm run gotchas:index:check` fails the build if it drifts.

Each entry has the same shape:

- **Symptom** — what you'd see if you didn't know about this
- **Cause** — root cause, in one paragraph
- **Mitigation** — what the code does about it (with file:line links)
- **Triggered by** — what flow exercises this path
- **Removable when** — what upstream change would let us delete the
  workaround (often "never", which is fine to say)
- **Commits** — the SHAs that introduced or fixed this

Keep entries terse — one screen each. If something needs a deep dive,
spin out a `engineering/decisions/YYYY-MM-DD-topic.md` and link to it from here.

## Symptom index

<!-- gotchas-index:begin -->

### [Browser engines (Chromium and WebKit quirks)](gotchas/browser-engine.md)

- [RETIRED (2026-07-10) — `:not(:has(...))` / `:is(:has(...))` were believed unreliable inside Marp's webview Chromium](gotchas/browser-engine.md#retired-2026-07-10--nothas--ishas-were-believed-unreliable-inside-marps-webview-chromium)
- [Marp / Chromium `foreignObject` creates anonymous grid items](gotchas/browser-engine.md#marp--chromium-foreignobject-creates-anonymous-grid-items)
- [Sub-pixel rounding diverges across Chromium platforms](gotchas/browser-engine.md#sub-pixel-rounding-diverges-across-chromium-platforms)
- [MutationObserver fires on its own writes (self-triggering loop)](gotchas/browser-engine.md#mutationobserver-fires-on-its-own-writes-self-triggering-loop)
- [Chromium blocks `file://` URLs as `mask-image` sources](gotchas/browser-engine.md#chromium-blocks-file-urls-as-mask-image-sources)
- [`svh` can resolve LARGER than `dvh` on a real mobile browser](gotchas/browser-engine.md#svh-can-resolve-larger-than-dvh-on-a-real-mobile-browser)
- [Preview slides collapse (cqi shrinks to near-zero) on iOS if scaled with CSS `zoom`](gotchas/browser-engine.md#preview-slides-collapse-cqi-shrinks-to-near-zero-on-ios-if-scaled-with-css-zoom)
- [A long press on a button selects its label on iOS (Copy / Look Up callout)](gotchas/browser-engine.md#a-long-press-on-a-button-selects-its-label-on-ios-copy--look-up-callout)
- [Tapping an input zooms the page on iOS (sub-16px text controls)](gotchas/browser-engine.md#tapping-an-input-zooms-the-page-on-ios-sub-16px-text-controls)
- [Tapping an in-slide link blanks the live preview on iOS](gotchas/browser-engine.md#tapping-an-in-slide-link-blanks-the-live-preview-on-ios)

### [Charts](gotchas/charts.md)

- [Pie wedge borders off-by-one (`nth-child` vs `<defs>`)](gotchas/charts.md#pie-wedge-borders-off-by-one-nth-child-vs-defs)
- [`chart-anima`: a gradient-filled chart animates as bare OUTLINES (duplicate `<defs>` ids)](gotchas/charts.md#chart-anima-a-gradient-filled-chart-animates-as-bare-outlines-duplicate-defs-ids)
- [Chart renders as a thumbnail after an ancestor gains `container-type` (cqh re-basing)](gotchas/charts.md#chart-renders-as-a-thumbnail-after-an-ancestor-gains-container-type-cqh-re-basing)
- [Chart caption swallowed when `_footer` is set](gotchas/charts.md#chart-caption-swallowed-when-_footer-is-set)
- [Charts export black/unstyled from the Studio image PDF or PPTX](gotchas/charts.md#charts-export-blackunstyled-from-the-studio-image-pdf-or-pptx)

### [CI and the cloud sandbox](gotchas/ci.md)

- [The `CodeQL` check reports a verdict BEFORE its `Analyze` jobs finish](gotchas/ci.md#the-codeql-check-reports-a-verdict-before-its-analyze-jobs-finish)
- [Rendering in the cloud sandbox needs `CHROME_PATH`](gotchas/ci.md#rendering-in-the-cloud-sandbox-needs-chrome_path)
- [A generated `dist/` artifact goes "stale" after a rebase, and that is not a defect](gotchas/ci.md#a-generated-dist-artifact-goes-stale-after-a-rebase-and-that-is-not-a-defect)
- [A docs test passes in declaration order and fails under `--sequence.shuffle.tests`](gotchas/ci.md#a-docs-test-passes-in-declaration-order-and-fails-under---sequenceshuffletests)
- [A Playwright test for a settling-round race passes on the broken code](gotchas/ci.md#a-playwright-test-for-a-settling-round-race-passes-on-the-broken-code)
- [An integration test that asks the export to BEAT a timer ejects PRs from the merge queue](gotchas/ci.md#an-integration-test-that-asks-the-export-to-beat-a-timer-ejects-prs-from-the-merge-queue)
- [Every Dependabot PR in a directory is red, and `npm ci` blames a package none of them touched](gotchas/ci.md#every-dependabot-pr-in-a-directory-is-red-and-npm-ci-blames-a-package-none-of-them-touched)
- [The Studio E2E nightly is GREEN while specs fail — the signal is issue #1705, not the badge](gotchas/ci.md#the-studio-e2e-nightly-is-green-while-specs-fail--the-signal-is-issue-1705-not-the-badge)

### [CSS](gotchas/css.md)

- [An ink passes every contrast gate and still renders sub-AA (own-hue band · element opacity)](gotchas/css.md#an-ink-passes-every-contrast-gate-and-still-renders-sub-aa-own-hue-band--element-opacity)
- [A contrast gate reports sub-AA for a run the rendered pixels show clearing (phantom underlay)](gotchas/css.md#a-contrast-gate-reports-sub-aa-for-a-run-the-rendered-pixels-show-clearing-phantom-underlay)
- [`margin` corrupts measured layout (virtual lists, the Fit Spine) — HARD RULE #20](gotchas/css.md#margin-corrupts-measured-layout-virtual-lists-the-fit-spine--hard-rule-20)
- [A finish `::after` EDGE layer is clobbered by the pagination marker](gotchas/css.md#a-finish-after-edge-layer-is-clobbered-by-the-pagination-marker)
- [A `section::after` `content` renders in the PDF and is BLANK in the browser (`numbered`)](gotchas/css.md#a-sectionafter-content-renders-in-the-pdf-and-is-blank-in-the-browser-numbered)
- [On a `finish:` deck the running header/footer/logo moved, and ate stage height](gotchas/css.md#on-a-finish-deck-the-running-headerfooterlogo-moved-and-ate-stage-height)
- [Something decorative on a slide is painting on the wrong side of something else](gotchas/css.md#something-decorative-on-a-slide-is-painting-on-the-wrong-side-of-something-else)
- [`white-space:nowrap` on `section code` collapsed code blocks + overflowed eyebrows](gotchas/css.md#white-spacenowrap-on-section-code-collapsed-code-blocks--overflowed-eyebrows)
- [`var(--fg)` is undefined — SVG `fill`/`stroke` silently falls back to black/none](gotchas/css.md#var--fg-is-undefined--svg-fillstroke-silently-falls-back-to-blacknone)
- [State disc never paints — a recipe var that embeds `--state-color` was defined at `:root`/section](gotchas/css.md#state-disc-never-paints--a-recipe-var-that-embeds---state-color-was-defined-at-rootsection)
- [Chrome (`<body>`) tokens are the `PORTAL_TOKENS` subset — a slide-only token is `undefined` there (the `--pass`/`--warn`/`--fail` bug, fixed)](gotchas/css.md#chrome-body-tokens-are-the-portal_tokens-subset--a-slide-only-token-is-undefined-there-the---pass--warn--fail-bug-fixed)
- [CSS custom properties return raw token stream via `getPropertyValue`](gotchas/css.md#css-custom-properties-return-raw-token-stream-via-getpropertyvalue)
- [G-generation `--c-ink-dark: var(--text-heading)` breaks contrast in both canvas modes](gotchas/css.md#g-generation---c-ink-dark-var--text-heading-breaks-contrast-in-both-canvas-modes)
- [CSS `ul > li` matches nested sublists — chain `> ul > li` for top-level-only styling](gotchas/css.md#css-ul--li-matches-nested-sublists--chain--ul--li-for-top-level-only-styling)
- [`:where(:root)` zero-specificity defaults](gotchas/css.md#whereroot-zero-specificity-defaults)
- [`font-size: 0` collapses `em` width/height on the same element](gotchas/css.md#font-size-0-collapses-em-widthheight-on-the-same-element)
- [A `::before`/`::after` on a padded inline element paints a stray sliver at the end of the previous line](gotchas/css.md#a-beforeafter-on-a-padded-inline-element-paints-a-stray-sliver-at-the-end-of-the-previous-line)
- [`100dvw`/`100vw` includes the scrollbar — a full-width child of a scroll container clips when centered](gotchas/css.md#100dvw100vw-includes-the-scrollbar--a-full-width-child-of-a-scroll-container-clips-when-centered)
- [A CSS reset declaration silently does nothing — the value doesn't exist](gotchas/css.md#a-css-reset-declaration-silently-does-nothing--the-value-doesnt-exist)
- [The same declaration, but it dies at COMPUTED-VALUE time — and does NOT fall back](gotchas/css.md#the-same-declaration-but-it-dies-at-computed-value-time--and-does-not-fall-back)

### [Docs site build and dev server (Astro + GitHub Pages)](gotchas/docs-site.md)

- [`astro dev` serves stale assets after previewing a production build (service worker)](gotchas/docs-site.md#astro-dev-serves-stale-assets-after-previewing-a-production-build-service-worker)
- [`build:check` fails: "builds a live preview frame … not a sanctioned preview builder" (HARD RULE #22)](gotchas/docs-site.md#buildcheck-fails-builds-a-live-preview-frame--not-a-sanctioned-preview-builder-hard-rule-22)
- [`build:check` fails: "embeds a `<style>` element but does not call `sanitizeStyleText`" (HARD RULE #22)](gotchas/docs-site.md#buildcheck-fails-embeds-a-style-element-but-does-not-call-sanitizestyletext-hard-rule-22)
- [Docs build fails `stale: <name>.<mood>: gallery PDF changed since the WebP was generated`](gotchas/docs-site.md#docs-build-fails-stale-namemood-gallery-pdf-changed-since-the-webp-was-generated)
- [A docs panel is dead in `astro dev` only (source CJS served over `/@fs`)](gotchas/docs-site.md#a-docs-panel-is-dead-in-astro-dev-only-source-cjs-served-over-fs)
- [Every Fabricate preview is EMPTY in `astro dev` only (StrictMode disposes the renderer, and the sentinel hides it)](gotchas/docs-site.md#every-fabricate-preview-is-empty-in-astro-dev-only-strictmode-disposes-the-renderer-and-the-sentinel-hides-it)
- [astro 7 backgrounds `preview` and `dev` FOR AN AGENT, and Playwright then dies with `Process from config.webServer exited early`](gotchas/docs-site.md#astro-7-backgrounds-preview-and-dev-for-an-agent-and-playwright-then-dies-with-process-from-configwebserver-exited-early)
- [A CSS custom property reads back as `#1478dc` where the source says `rgb(20, 120, 220)`](gotchas/docs-site.md#a-css-custom-property-reads-back-as-1478dc-where-the-source-says-rgb20-120-220)
- [Docs `npm run dev` → `sh: 1: astro: not found`](gotchas/docs-site.md#docs-npm-run-dev--sh-1-astro-not-found)
- [Docs build dies at config load: "does not provide an export named `unified`"](gotchas/docs-site.md#docs-build-dies-at-config-load-does-not-provide-an-export-named-unified)
- [`pkill -f astro` kills the shell that's launching astro](gotchas/docs-site.md#pkill--f-astro-kills-the-shell-thats-launching-astro)
- [An `<astro-island>` without `ssr` is mounted, not yet wired — clicks still vanish](gotchas/docs-site.md#an-astro-island-without-ssr-is-mounted-not-yet-wired--clicks-still-vanish)

### [Export (PDF, PPTX, the HTML player)](gotchas/export.md)

- [Chromium PDF output of CSS `mask-image` renders inconsistently across viewers](gotchas/export.md#chromium-pdf-output-of-css-mask-image-renders-inconsistently-across-viewers)
- [SVG images in the exported PDF partially render or vanish in iOS Quartz viewers](gotchas/export.md#svg-images-in-the-exported-pdf-partially-render-or-vanish-in-ios-quartz-viewers)
- [A blurred `box-shadow` renders as an opaque gray block in Apple PDFKit and Quartz PDF viewers](gotchas/export.md#a-blurred-box-shadow-renders-as-an-opaque-gray-block-in-apple-pdfkit-and-quartz-pdf-viewers)
- [A JSON data block inside a `<script>` comes back with `&amp;` in every string](gotchas/export.md#a-json-data-block-inside-a-script-comes-back-with-amp-in-every-string)
- [The exported player has no front matter to read](gotchas/export.md#the-exported-player-has-no-front-matter-to-read)
- [A slide-level color-scheme pin has to be re-emitted for the exported player](gotchas/export.md#a-slide-level-color-scheme-pin-has-to-be-re-emitted-for-the-exported-player)
- [A token flattened for the player took the print band's value](gotchas/export.md#a-token-flattened-for-the-player-took-the-print-bands-value)
- [Chart fills took one scheme while the page took the other](gotchas/export.md#chart-fills-took-one-scheme-while-the-page-took-the-other)
- [A player's dark toggle moved every color except the ones written in a real property](gotchas/export.md#a-players-dark-toggle-moved-every-color-except-the-ones-written-in-a-real-property)
- [An exported player quietly dropped every `X :is(…)` rule the deck renders](gotchas/export.md#an-exported-player-quietly-dropped-every-x-is-rule-the-deck-renders)
- [A baked diagram label went dark-on-dark after the player's toggle](gotchas/export.md#a-baked-diagram-label-went-dark-on-dark-after-the-players-toggle)
- [`--strip-notes` deleted a comment out of a code fence](gotchas/export.md#--strip-notes-deleted-a-comment-out-of-a-code-fence)
- [`--strip-notes` could not remove a note that opens with a directive keyword](gotchas/export.md#--strip-notes-could-not-remove-a-note-that-opens-with-a-directive-keyword)
- [`--strip-notes` shipped the note anyway — in the `.pptx`, and in the raster PDF's sidecar](gotchas/export.md#--strip-notes-shipped-the-note-anyway--in-the-pptx-and-in-the-raster-pdfs-sidecar)
- [The exported player told the recipient a deck HAD notes, after `--strip-notes` removed them](gotchas/export.md#the-exported-player-told-the-recipient-a-deck-had-notes-after---strip-notes-removed-them)
- [A `tier:` / `galleryAuthored:` pragma shipped as the speaker note in every format](gotchas/export.md#a-tier--galleryauthored-pragma-shipped-as-the-speaker-note-in-every-format)

### [Fonts and emoji](gotchas/fonts.md)

- [A rendered PDF shows serif/fallback type, not the design fonts](gotchas/fonts.md#a-rendered-pdf-shows-seriffallback-type-not-the-design-fonts)
- [Studio PDF/PPTX export shows fallback type on some slides](gotchas/fonts.md#studio-pdfpptx-export-shows-fallback-type-on-some-slides)
- [Studio / playground LIVE PREVIEW shows hand-body decks in a system sans](gotchas/fonts.md#studio--playground-live-preview-shows-hand-body-decks-in-a-system-sans)
- [Color emoji needs an installed font on the owned render paths](gotchas/fonts.md#color-emoji-needs-an-installed-font-on-the-owned-render-paths)
- [Flex-centered caps read high in JetBrains Mono (and `text-box-trim` can't fix it here)](gotchas/fonts.md#flex-centered-caps-read-high-in-jetbrains-mono-and-text-box-trim-cant-fix-it-here)

### [Lattice internals](gotchas/lattice-internals.md)

- [A page number / progress rail / proof-panel color looks wrong in the preview, right in the export](gotchas/lattice-internals.md#a-page-number--progress-rail--proof-panel-color-looks-wrong-in-the-preview-right-in-the-export)
- [Editing a manifest `sample` staled the bucket survey gallery](gotchas/lattice-internals.md#editing-a-manifest-sample-staled-the-bucket-survey-gallery)
- [A committed render golden doesn't match a fresh render — check staleness FIRST](gotchas/lattice-internals.md#a-committed-render-golden-doesnt-match-a-fresh-render--check-staleness-first)
- [A manifest slot's `selector` describes AUTHORING input — a transform may consume it](gotchas/lattice-internals.md#a-manifest-slots-selector-describes-authoring-input--a-transform-may-consume-it)
- [Legacy `--fs-*` token names retired](gotchas/lattice-internals.md#legacy---fs--token-names-retired)
- [Two render paths — land transforms in the shared kernel, not one path](gotchas/lattice-internals.md#two-render-paths--land-transforms-in-the-shared-kernel-not-one-path)
- [Chart-family observer's broad `MutationObserver` scope](gotchas/lattice-internals.md#chart-family-observers-broad-mutationobserver-scope)
- [Stray colors escape the palette via Mermaid's hardcoded defaults](gotchas/lattice-internals.md#stray-colors-escape-the-palette-via-mermaids-hardcoded-defaults)
- [`liftSlotLabel` idempotency contract](gotchas/lattice-internals.md#liftslotlabel-idempotency-contract)
- [`image museum` slides inherit the anchor `border-left` via cascade](gotchas/lattice-internals.md#image-museum-slides-inherit-the-anchor-border-left-via-cascade)
- [Section geometry AND body font (padding, border, body text) look wrong in any non-canonical preview](gotchas/lattice-internals.md#section-geometry-and-body-font-padding-border-body-text-look-wrong-in-any-non-canonical-preview)
- [Layout components inherit line-height silently from the section body default](gotchas/lattice-internals.md#layout-components-inherit-line-height-silently-from-the-section-body-default)
- [Emulator line-by-line builder only supports 2-deep list nesting by default](gotchas/lattice-internals.md#emulator-line-by-line-builder-only-supports-2-deep-list-nesting-by-default)
- [lattice-emulator doesn't auto-load `style:` from front matter](gotchas/lattice-internals.md#lattice-emulator-doesnt-auto-load-style-from-front-matter)
- [Mermaid diagrams render at HD size inside 4K slides in VS Code preview](gotchas/lattice-internals.md#mermaid-diagrams-render-at-hd-size-inside-4k-slides-in-vs-code-preview)
- [Docs-site preview/export rendered 4K decks oversized + cropped](gotchas/lattice-internals.md#docs-site-previewexport-rendered-4k-decks-oversized--cropped)
- [lattice-engine: deck looks fine on desktop but collapses on mobile WebKit (no `:root` token relocation)](gotchas/lattice-internals.md#lattice-engine-deck-looks-fine-on-desktop-but-collapses-on-mobile-webkit-no-root-token-relocation)
- [A slide surface ignores one input device (a wheel mouse does nothing; arrows are dead)](gotchas/lattice-internals.md#a-slide-surface-ignores-one-input-device-a-wheel-mouse-does-nothing-arrows-are-dead)
- [A pinch on a slide turns the deck (and `preventDefault` in your React handler does nothing)](gotchas/lattice-internals.md#a-pinch-on-a-slide-turns-the-deck-and-preventdefault-in-your-react-handler-does-nothing)
- [A destructuring default in a plain-JS export erases the rest of its parameter type](gotchas/lattice-internals.md#a-destructuring-default-in-a-plain-js-export-erases-the-rest-of-its-parameter-type)
- [G-gen merge must use non-G file's G-gen block, not the G-file's block](gotchas/lattice-internals.md#g-gen-merge-must-use-non-g-files-g-gen-block-not-the-g-files-block)

### [Marp / Marpit](gotchas/marp.md)

- [Marp Preview emits `<marp-pre>`, marp-cli emits `<pre is="marp-pre">`](gotchas/marp.md#marp-preview-emits-marp-pre-marp-cli-emits-pre-ismarp-pre)
- [Marp Core wraps emoji in `<img class="emoji">` (twemoji)](gotchas/marp.md#marp-core-wraps-emoji-in-img-classemoji-twemoji)
- [Marpit "spot replaces global" for the `class:` directive](gotchas/marp.md#marpit-spot-replaces-global-for-the-class-directive)
- [Marpit theme prefixer mangles `:is(...)` and `:where(...)` as a leading selector](gotchas/marp.md#marpit-theme-prefixer-mangles-is-and-where-as-a-leading-selector)
- [A slide renders with NO canvas — white paper, invisible text — on a third-party theme](gotchas/marp.md#a-slide-renders-with-no-canvas--white-paper-invisible-text--on-a-third-party-theme)
- [Front-matter `style:` directive specificity vs. theme :root](gotchas/marp.md#front-matter-style-directive-specificity-vs-theme-root)
- [A theme rule gated on `:root[…]` silently does nothing in a Marp render](gotchas/marp.md#a-theme-rule-gated-on-root-silently-does-nothing-in-a-marp-render)
- [marp-cli ignores `theme:` front matter unless the theme is registered (Export-to-Marp bundles)](gotchas/marp.md#marp-cli-ignores-theme-front-matter-unless-the-theme-is-registered-export-to-marp-bundles)

### [Memory profiling (perf-torture / CDP)](gotchas/memory-profiling.md)

- [A CDP/DevTools memory profile shows a "leak" that vanishes off-inspector](gotchas/memory-profiling.md#a-cdpdevtools-memory-profile-shows-a-leak-that-vanishes-off-inspector)
- [A heap retainer walk names `<DevTools console>` / `ScriptStateProtectingContext` as the holder](gotchas/memory-profiling.md#a-heap-retainer-walk-names-devtools-console--scriptstateprotectingcontext-as-the-holder)
- [perf-torture says `RISING` but memory isn't leaking (JIT warmup)](gotchas/memory-profiling.md#perf-torture-says-rising-but-memory-isnt-leaking-jit-warmup)

### [Mermaid](gotchas/mermaid.md)

- [A mermaid `click` directive is inert (and used to be an XSS)](gotchas/mermaid.md#a-mermaid-click-directive-is-inert-and-used-to-be-an-xss)
- [A diagram with an `%%{init}%%` renders in Mermaid's stock colors (yellow clusters)](gotchas/mermaid.md#a-diagram-with-an-init-renders-in-mermaids-stock-colors-yellow-clusters)
- [Playground: Mermaid (and all DOM transforms) stop rendering after the first edit](gotchas/mermaid.md#playground-mermaid-and-all-dom-transforms-stop-rendering-after-the-first-edit)
- [Mermaid's color parser rejects `light-dark()`](gotchas/mermaid.md#mermaids-color-parser-rejects-light-dark)
- [Mermaid kanban applies a lighten step to cScale](gotchas/mermaid.md#mermaid-kanban-applies-a-lighten-step-to-cscale)
- [Mermaid timeline + journey are tile-stack, not card-on-band](gotchas/mermaid.md#mermaid-timeline--journey-are-tile-stack-not-card-on-band)
- [~~Mermaid's `%%{init}%%` directive is intolerant of CSS comments~~ (RESOLVED)](gotchas/mermaid.md#mermaids-init-directive-is-intolerant-of-css-comments-resolved)
- [Mermaid frontmatter must be FIRST; `%%{init}%%` injection comes after](gotchas/mermaid.md#mermaid-frontmatter-must-be-first-init-injection-comes-after)
- [Mermaid `mermaid.run()` is async; restoration logic must wait](gotchas/mermaid.md#mermaid-mermaidrun-is-async-restoration-logic-must-wait)
- [Mermaid's built-in error renderer breaks slide layout](gotchas/mermaid.md#mermaids-built-in-error-renderer-breaks-slide-layout)
- [Mermaid `themeVariables` must come from a `<section>`, not `:root`](gotchas/mermaid.md#mermaid-themevariables-must-come-from-a-section-not-root)
- [`:where(:root)` token blocks are dropped from every rendered slide](gotchas/mermaid.md#whereroot-token-blocks-are-dropped-from-every-rendered-slide)
- [Mermaid had `layout: 'tidy-tree'` — silent diagram loss](gotchas/mermaid.md#mermaid-had-layout-tidy-tree--silent-diagram-loss)
- [`mmdc` / Puppeteer flakes intermittently on cold starts](gotchas/mermaid.md#mmdc--puppeteer-flakes-intermittently-on-cold-starts)
- [KaTeX math extractor splices error spans into inlined Mermaid SVG CSS](gotchas/mermaid.md#katex-math-extractor-splices-error-spans-into-inlined-mermaid-svg-css)

### [Overflow detection and the Fit Spine](gotchas/overflow.md)

- [A slide loses its EYEBROW and HEADING off the top, and no ring / pill / console line fires](gotchas/overflow.md#a-slide-loses-its-eyebrow-and-heading-off-the-top-and-no-ring--pill--console-line-fires)
- [A fixed-size slide frame silently truncates content past 1280×720](gotchas/overflow.md#a-fixed-size-slide-frame-silently-truncates-content-past-1280720)
- [The overflow ring lags an edit, or a slide scrolled past keeps a ring it should have lost](gotchas/overflow.md#the-overflow-ring-lags-an-edit-or-a-slide-scrolled-past-keeps-a-ring-it-should-have-lost)
- [A false "Overflows" ring appears on the exported `.html` sidecar for a slide that actually fits](gotchas/overflow.md#a-false-overflows-ring-appears-on-the-exported-html-sidecar-for-a-slide-that-actually-fits)
- [One slide renders at ~2x type and overflows, but ONLY in a live preview — the PDF is perfect](gotchas/overflow.md#one-slide-renders-at-2x-type-and-overflows-but-only-in-a-live-preview--the-pdf-is-perfect)
- [A slide clips 30-70px in the Playground that the exported PDF renders whole](gotchas/overflow.md#a-slide-clips-30-70px-in-the-playground-that-the-exported-pdf-renders-whole)
- [The Playground and the Studio disagree about which slides overflow (and a slide's own padding changes when the preview pane is resized)](gotchas/overflow.md#the-playground-and-the-studio-disagree-about-which-slides-overflow-and-a-slides-own-padding-changes-when-the-preview-pane-is-resized)
- [Exported fluid viewer: an overflowing slide shows NO marker tab, or the red author ring leaks to a reader](gotchas/overflow.md#exported-fluid-viewer-an-overflowing-slide-shows-no-marker-tab-or-the-red-author-ring-leaks-to-a-reader)

### [The Studio and the Playground (docs-site app surfaces)](gotchas/studio-playground.md)

- [The preview `<iframe>` — trap catalog (read this first: surfaces × workarounds)](gotchas/studio-playground.md#the-preview-iframe--trap-catalog-read-this-first-surfaces--workarounds)
- [Playground/specimen previews 404 on the engine CSS + runtime](gotchas/studio-playground.md#playgroundspecimen-previews-404-on-the-engine-css--runtime)
- [Playground preview serves a STALE engine bundle (a 200, not a 404)](gotchas/studio-playground.md#playground-preview-serves-a-stale-engine-bundle-a-200-not-a-404)
- [The editor|preview divider snaps to the middle a moment after the page loads](gotchas/studio-playground.md#the-editorpreview-divider-snaps-to-the-middle-a-moment-after-the-page-loads)
- [The Playground's preview pane is empty for seconds after a reload](gotchas/studio-playground.md#the-playgrounds-preview-pane-is-empty-for-seconds-after-a-reload)
- [The Playground's cached slide jumps when the live preview takes over](gotchas/studio-playground.md#the-playgrounds-cached-slide-jumps-when-the-live-preview-takes-over)
- [The Playground's Explore layout arrives a second after the page does](gotchas/studio-playground.md#the-playgrounds-explore-layout-arrives-a-second-after-the-page-does)
- [The Playground's divider is in one place before hydration and another after](gotchas/studio-playground.md#the-playgrounds-divider-is-in-one-place-before-hydration-and-another-after)
- [A header control shows nothing (or the wrong thing) for a second after every page load](gotchas/studio-playground.md#a-header-control-shows-nothing-or-the-wrong-thing-for-a-second-after-every-page-load)
- [The Studio counts fewer slides than the deck renders — or an edit destroys a slide](gotchas/studio-playground.md#the-studio-counts-fewer-slides-than-the-deck-renders--or-an-edit-destroys-a-slide)
- [A `split-panel proof` run is one hue in the Studio, but only when the deck doesn't paginate](gotchas/studio-playground.md#a-split-panel-proof-run-is-one-hue-in-the-studio-but-only-when-the-deck-doesnt-paginate)
- [A live preview prints "1" as the page number on every slide](gotchas/studio-playground.md#a-live-preview-prints-1-as-the-page-number-on-every-slide)
- [Playground renders broken in mobile Safari/WebKit (counters "00", chart text overlaps, marks drop)](gotchas/studio-playground.md#playground-renders-broken-in-mobile-safariwebkit-counters-00-chart-text-overlaps-marks-drop)
- [Playground math (and any cqi/cqh layout) renders tiny + "jumps/rescales"](gotchas/studio-playground.md#playground-math-and-any-cqicqh-layout-renders-tiny--jumpsrescales)
- [Playground preview won't scroll on iOS after opening a settings sheet](gotchas/studio-playground.md#playground-preview-wont-scroll-on-ios-after-opening-a-settings-sheet)
- [The Studio "crashed" and reloaded itself, and nothing was logged anywhere](gotchas/studio-playground.md#the-studio-crashed-and-reloaded-itself-and-nothing-was-logged-anywhere)
- [A "crash" notice appeared on returning to a tab, and nothing had crashed](gotchas/studio-playground.md#a-crash-notice-appeared-on-returning-to-a-tab-and-nothing-had-crashed)
- [The Studio says a feature "hit an unexpected error" on a tab that has been open a while](gotchas/studio-playground.md#the-studio-says-a-feature-hit-an-unexpected-error-on-a-tab-that-has-been-open-a-while)
- [A crash report shows `Script error.` several times and names nothing](gotchas/studio-playground.md#a-crash-report-shows-script-error-several-times-and-names-nothing)
- [Data a user deleted comes back when a parked tab wakes up](gotchas/studio-playground.md#data-a-user-deleted-comes-back-when-a-parked-tab-wakes-up)
- [A Web Lock held for the life of a page silently kills its bfcache](gotchas/studio-playground.md#a-web-lock-held-for-the-life-of-a-page-silently-kills-its-bfcache)
- [Installed iOS PWA: "Connect OpenRouter" doesn't stick](gotchas/studio-playground.md#installed-ios-pwa-connect-openrouter-doesnt-stick)
- [The Present rail is completely invisible under `forced-colors: active`](gotchas/studio-playground.md#the-present-rail-is-completely-invisible-under-forced-colors-active)
- [A multi-line toast renders as a giant lozenge with its last line cut off](gotchas/studio-playground.md#a-multi-line-toast-renders-as-a-giant-lozenge-with-its-last-line-cut-off)
- [A control's own icon renders sliced/outside its button, and every overflow guard is green](gotchas/studio-playground.md#a-controls-own-icon-renders-slicedoutside-its-button-and-every-overflow-guard-is-green)
- [A CodeMirror `@media (pointer: coarse)` block has no effect on a real touch device](gotchas/studio-playground.md#a-codemirror-media-pointer-coarse-block-has-no-effect-on-a-real-touch-device)
- [A chat panel's state lands on whichever deck is on screen when the turn ends](gotchas/studio-playground.md#a-chat-panels-state-lands-on-whichever-deck-is-on-screen-when-the-turn-ends)
- [A 4K deck renders oversized and cropped in docs-site preview and export](gotchas/studio-playground.md#a-4k-deck-renders-oversized-and-cropped-in-docs-site-preview-and-export)

### [VS Code / marp-vscode](gotchas/vscode.md)

- [The VS Code Marp preview runs marp-core directly, without Lattice's markdown-it plugins](gotchas/vscode.md#the-vs-code-marp-preview-runs-marp-core-directly-without-lattices-markdown-it-plugins)
- [Known preview gaps — transforms shipped without a `lattice-runtime.js` mirror](gotchas/vscode.md#known-preview-gaps--transforms-shipped-without-a-lattice-runtimejs-mirror)
- [`git worktree` doesn't share `node_modules`](gotchas/vscode.md#git-worktree-doesnt-share-node_modules)
- [Does the marp-vscode webview execute `<script>`? — UNVERIFIED, and this is the entry that says so](gotchas/vscode.md#does-the-marp-vscode-webview-execute-script--unverified-and-this-is-the-entry-that-says-so)
- [`enableHtml` / `html: true` is required or the runtime `<script>` tags print as TEXT](gotchas/vscode.md#enablehtml--html-true-is-required-or-the-runtime-script-tags-print-as-text)
- [A rule that LEADS with `:is(section…)` is dead in every Marp render](gotchas/vscode.md#a-rule-that-leads-with-issection-is-dead-in-every-marp-render)
- [Custom `logo:` front-matter directive shows nothing in marp-vscode preview](gotchas/vscode.md#custom-logo-front-matter-directive-shows-nothing-in-marp-vscode-preview)
- [marp-cli timeouts under load (60-90s on small fixtures)](gotchas/vscode.md#marp-cli-timeouts-under-load-60-90s-on-small-fixtures)
- [VS Code's built-in PDF preview hue-shifts our gradients (pink/magenta)](gotchas/vscode.md#vs-codes-built-in-pdf-preview-hue-shifts-our-gradients-pinkmagenta)
- [Mermaid on a 4K deck renders at HD size in the VS Code preview](gotchas/vscode.md#mermaid-on-a-4k-deck-renders-at-hd-size-in-the-vs-code-preview)

_Generated by `npm run gotchas:index` from the entry headings in `engineering/gotchas/` — add an entry to a topic file, then regenerate. No totals here on purpose: an aggregate over every entry is the one line two concurrent PRs cannot both get right (#1547)._

<!-- gotchas-index:end -->
