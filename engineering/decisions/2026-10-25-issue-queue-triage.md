---
status: proposed
summary: >
  685 cards (333 open issues, 352 follow-up files) checked against main at ca84df8 for a release this week.
  Three are P0 (the published CLI crashes on pane slides, an inline-run attribute-to-markup bypass,
  WebKit PowerPoint export dropping pictures), no live exploit was confirmed, and about 130 cards
  are fixed, obsolete or duplicate and should close. The rest are grouped into eight workstreams
  an agent can pick up, with an owner-decision list. Nothing was closed or relabeled by this note.
---

# Issue and follow-up triage, 2026-10-25

**Answer first.** 685 cards were checked against `main` at `ca84df8`: 333 open issues and 352 `followups.d/` files. **94 should close** (55 issues, 39 follow-up files), **87 wait on an owner call**, and 504 stay open. Three are P0 for a release this week, 49 are P1.

**P0, fix before release** (re-checked by hand on 2026-10-25; see the verification section):
- `F2779-p3` — the published CLI crashes on any deck with a pane slide (`Invalid manifest: dist/styles/manifest.json`). I reproduced it: `node dist/lattice.js examples/pane-photo-fit.md` throws, while `node lattice.js` on the same deck renders. `bin` is `dist/lattice.js` and `files` ships `dist/`. The packaged-install test misses it because its deck has no pane slide.
- `F2853-p1` — **downgraded to P1.** `wrapHtml` does write its span into a quoted attribute (unit-level repro holds), but in a `--player` (sanitized) export my payload came out with no `onerror`, and in a plain export the author's raw HTML is already trusted. No end-to-end path is shown yet; the card's guess is a code-package slide.
- `F2640-p2` — the Studio's PowerPoint export on Safari drops every picture and still says "PowerPoint ready." The evidence is real Playwright WebKit (2026-10-12), not literal Safari.

**No confirmed live exploit** in the security set. The nearest are #1993 (sanitized HTML is parsed twice into a same-origin frame, a theoretical mXSS shape), #1890 (a measured cubic-time regex freezes the Studio on a shared deck), vendored Mermaid's older DOMPurify, and an undisclosed IP exposure on Live links.

**How this was made.** Eight agents each took a slice, read every body, and checked it against `main` (commit, file and line evidence per card). Each close below cites that evidence in the per-card table. A dated snapshot, not a mirror: `backlog.d/` is the living view.

**Checked by hand (light):** I confirmed #1911’s `.anima-live` safelist entry in `lib/export/player-prune.js`, that every dupe target is itself open, and the `--no-sandbox` flag at `lattice.js:5291`. I did not re-verify the other closes; the evidence column is the agents' and a closer should read it. One chain error was found: #2004 is a duplicate of #2098, which another agent marks fixed. #2004, #2098 and #2310 are held out of the close list until someone confirms #2098 has its cards-grid and list-steps check and #2310's last contrast row.

## 1. Close these (94)

**Issues (55).** Closed on 2026-10-25 except the three held back (see section 4).

| issue | verdict | evidence |
|---|---|---|
| #596 Performance gating by metric class + E2E re-tier ( | fixed | ci.yml:831 per-PR route-budget byte gate; studio-e2e-nightly.yml files issues; perf-nightly.yml |
| #668 Add a real-surface Playwright smoke against the bu | obsolete | ci.yml:903 studio-smoke runs @smoke Playwright against the built site since d42abb3f6 (#802); 1 |
| #1507 Studio E2E: the first restored run reports 16 fail | obsolete | Snapshot of the 2026-08-09 run; 300f0b783 (#2455) drove 23 of 24 desktop specs green; live stat |
| #1586 test(e2e): nothing bounds the Studio's cold first- | dupe(F2868-p1-studio-startup-back-to-baseline) | test/benchmark/preview-budget.json has no cold first-paint ceiling; F2868 'next (1)' is the sam |
| #1848 infra(gate): checkUsEnglish counts examples/**/*.h | fixed | 0c7e1dbac (#1883) exempts examples/**/*.html at tools/check-ownership.js:4078; the US-English r |
| #1860 fix(test): `equiv:check` has been red on main sinc | fixed | a378cf936 re-blessed test/benchmark/slice-equivalence.json; tools/slice-equivalence.mjs --check |
| #1936 test(e2e): `build:e2e` skips the post-build passes | dupe(I2134) | docs/package.json:43 build:e2e still skips inject-modulepreload and hoist-stylesheets; #2134 ca |
| #1949 examples: other hand-drawn-diagram decks may carry | obsolete | tools/golden-bless.mjs:194 checks --scope all and re-blesses every drifted golden nightly since |
| #2181 e2e(studio-fixture): no mobile route into the Insp | fixed | b2990c668 (#2837) added openDeckSettingsAt (docs/e2e/studio-fixture.ts:714) for phone, tablet a |
| #2231 word-cloud: examples/seq-ramp-canvas-aware.md lose | dupe | node tools/measure-word-cloud-drop.mjs: seq-ramp-canvas-aware.md slides 1 and 2 drew 12 of 13,  |
| #2266 chart(caption): .chart-caption is a flex COLUMN, s | fixed | 538d357 (#2364): chart-family.styles.css:1130 .chart-caption is now BLOCK, not a flex column |
| #2288 state-chart narration reads its metadata tokens al | fixed | 4ce0d29 (#2424): chart-narration.js:1968 'THE LIST IS SPOKEN, NEVER FLATTENED'; status words go |
| #2349 handoff(chart): one style-delivery spine — engine- | fixed | fb9e3c5 (#2366) 'one style-delivery spine'; engineering/decisions/2026-09-24-one-style-delivery |
| #2401 Handoff: graph charts after #2385 — shared library | fixed | 4ce0d29 (#2424) state chart v2 on Trama; 2026-09-27-trama-graph-chart-library.md status: shippe |
| #287 refactor(engine): LPM Phase 1 — manifest `render`  | fixed | 71c6824 (#1984) manifest-driven dispatch; 28 chart manifests carry render; chart-family.dispatc |
| #1406 A relative `logo:` resolves against the OUTPUT dir | fixed | ff03320 (#2748): lattice.js:2260 deckBaseUrl passed as baseUrl; deck-logo parity test asserts t |
| #1558 export player: a pinch turns the slide, and the de | dupe | Item 1 shipped 00a391d (#1580); its own done-when says items 2-3 are tracked in #1578 |
| #1602 export(player): the no-JS floor's ladder is width- | fixed | c924ae4 (#2494); 2026-09-29-player-no-js-controls.md:9,49-52 'closes #1602', fit takes min of w |
| #1683 `size: 4:3` is in the Studio's size map but absent | fixed | a82c134 (#2420): slide-size.ts:12-28 drops '4:3'; slide-size.test.ts:46 checks SIZE_RATIO again |
| #2004 fix(list): an inline-code chip in a list card swal | **hold** dupe | Issue's own done-when: add cards-grid/list-steps check to #2098, then close as its duplicate; b |
| #2310 handoff(canvas): make the cover half of the canvas | **hold** fixed | 03f544002 (#2331) split pages keep finish + one-code-span stays prose; ci.yml:958 player-webkit |
| #2475 handoff(plugins): phase D browser half, the KaTeX  | fixed | P1 978750f (#2496)/300579e (#2508); P2 6fa88e4 (#2497); P3 lives in followups.d/2417-p5-plugin- |
| #2511 handoff(segno): flowchart spike, phase 2 on Segno, | fixed | Spike 9c7fda9 (#2462 bakeoff), phase 2 fd0ce8d (#2513), follow-ups 1acdd6b (#2567) |
| #2731 Handoff: player assembler — host parity, then the  | fixed | 6119db7 (#2739), e6cb9ed (#2817); audit note §11.9: 25 of 25 decks byte-identical; §11.3 reveal |
| #2741 Handoff: bridges P1, the Marp exporter as a bridge | obsolete | bridges note §9 line 614: D1 decided 2026-10-16 "no presets"; D2-D4, D6 also decided |
| #500 feat(legal): obligation-matrix cover-paginate — a  | fixed | 0c7badb (#2219) obligation-matrix.manifest.json:194 split strategy cover-cards, axis row |
| #1407 `section pre.hljs` / `section code.hljs` are dead  | fixed | 35379464 (#2710) deleted lib/integrations/highlight-js/highlight-js.css; no code.hljs rule left |
| #1549 math: three variants centre the MASTHEAD with the  | fixed | stage-catalog.generated.js:47 math is canvas; math.styles.css:887,1034 center .cell-stage only |
| #280 docs: fix phantom `--hljs-name`/`--hljs-meta` toke | obsolete | highlight-js.docs.md is gone; base.tokens.css:1512 says --hljs-* were renamed to --syntax-* on  |
| #1945 docs(components): 54 of 59 components never got th | fixed | 22cbf0cb4 (#1196) backfilled agent-contract fields; all 79 lib/components/**/*.docs.md carry "# |
| #1966 spike(exemplars): the style judges are calibrated  | fixed | e6723bb99 (#1969) added engineering/decisions/2026-08-31-exemplar-quality-and-style-judges.md,  |
| #290 test(infra): add a three-renderer transform-parity | obsolete | marp.config.js no longer exists; HARD RULE #1 retired Marp as a render path, so there are no lo |
| #1437 Configure Release Pipeline | dupe(of F2595-p1-changesets-release-pipeline) | engineering/decisions/2026-10-07-first-npm-release.md §5 supersedes it; the body targets SlideW |
| #1874 feat(orchestration): add the ADDITIVE TRIO — seam  | fixed | 0c7e1dbac (#1883) added .claude/agents/seam-census.md, blast-radius.md and contradictions.md; C |
| #1912 infra(workflow): `enable_pr_auto_merge` silently a | fixed | engineering/workflow.md:1235-1259 documents the auto_merge verify step and the method question, |
| #1924 infra(build): rebuilding a gallery PDF invalidates | obsolete | c05de6f6e (#2614): PRs no longer commit PDFs; golden-bless.yml:74,138 re-rasterizes and commits |
| #2099 A 3.1 MB `mermaid-v11.min.js` is committed at the  | fixed | 873b4c55a (#2501) deleted the root mermaid-v11.min.js; git ls-files shows none; the vendor copy |
| #1410 `<strong>` renders dark-on-dark on the inverse tit | fixed | 461742289 (#1706): title.styles.css section.title declares color-scheme: dark with --surface-in |
| #1460 `tools/contrast-audit.js:53` cannot see `--hljs-bu | obsolete | The --hljs-* family was renamed to --syntax-* with built_in to builtin (spec/THEME-1.0.md:175,  |
| #1536 The chart categorical cycle has no curated ink — c | dupe(of I1574) | b6525cc7a (#1573) shipped the curated --chart-catN-ink and tools/derive-chart-cat-ink.js; the t |
| #1562 A generated theme has no texture channel — `--cat- | dupe(of I1865) | lib/theme/derive.js has no texture output; I1865 asks for the same deriveTheme emission with fu |
| #581 kpi: default layout overflows 4 rows under a two-l | obsolete | kpi.docs.md:50 now documents 3 as the allowance and says a 4th needs a one-line title; the done |
| #1429 engine(overflow): move both marker registers to th | fixed | 1c398f27b (#2143) moved both markers into .marker-rail at the foot; decision 2026-09-08-marker- |
| #1605 quadrant: one crowded slide sets the label size fo | fixed | df36705b9 (#2170) DOT_LABEL_LADDER quadrant.transform.js:181-199 per-slide sizing; 6990aba39 (# |
| #2098 A `list`-layout bullet loses the space around any  | **hold** fixed | a6dc26c21 (#2831) wraps li text in span.lat-run; rendered '- the **class** is' gives <li><span  |
| #1867 docs: `design/skills/lens.md` still carries the se | fixed | 0c7e1dbac (#1883) 'retired lens wording'; design/skills/lens.md:56-71 now says drift-not-forger |
| #1911 export(player): player-prune drops every runtime-i | fixed | 9541d8d9f (#2319) adds '.anima-live' to PLAYER_PRUNE_SAFELIST (lib/export/player-prune.js:88);  |
| #297 feat(website): build a visual component catalog (t | obsolete | docs/src/pages/components/index.astro builds the catalog from manifests; Studio add-slide galle |
| #414 refactor(website): consolidate the per-surface the | obsolete | DrawingBoardTopbar.tsx and theme-studio.js no longer exist; Drawing Board + Workbench removed ( |
| #1517 [Bug] Closing the add-slide gallery leaves ~70 doc | fixed | 1d4826cd3 pooled frames; f38d7c9be keeps Add slide mounted; 2026-09-13-gallery-preview-memory.m |
| #1539 SLICE_CACHE_MAX (24) sits below PREVIEW_BUDGET (32 | obsolete | 1d4826cd3 removed PREVIEW_BUDGET and the live-preview budget registry (pool replaced it); no PR |
| #1876 studio: the Coach, Chat, Library and Views panels  | fixed | 9f094e026: panels open at 700/820/1024/1099 via the More controls menu; overflow-trigger-names. |
| #2275 class-directive-scan: `slideClassDirectives` is qu | fixed | 16345bb52 moved the walk to meta-record.mjs:204-249 (exhausted skip); measured 80 KB of unclose |
| #2296 Handoff — Compose fenced code: three off-path find | fixed | 2289-p1 via 5edf9661c; 2289-p2 and p3 via a9afc01fb (compose-fenced-code.spec.ts:331, fence-rou |
| #2426 Handoff — Studio offline: mid-rotation preview rec | fixed | f843ba093 drops a mid-rotation rect and warms Mermaid for diagram users |

**Follow-up files (39).** Delete these files from `followups.d/`; the work is done or moot.

- `2248-p1-fix-buildreadingarticledocument-the-same-way-it-is` — fixed: ea9770d2c (#2595) made jsdom a runtime dependency (package.json dependencies), so lattice.js:60
- `2303-p1-fix-the-same-baseline-defect-in-mermaid` — fixed: 0d3c58292 (#2326) added dominant-baseline: inherit at lib/plugins/mermaid/mermaid.styles.css:15
- `2325-p3-heatmap-gallery-clips-content-on-p3-p4` — dupe(I2254): Same heatmap.gallery.md p3/p4 clip as #2254
- `2327-p2-rebuild-stale-committed-pdfs` — obsolete: tools/golden-bless.mjs:194 re-blesses every drifted committed PDF nightly (c05de6f6e, #2614)
- `2331-p3-webkit-ci-arm-decision` — dupe(I2306): Same WebKit CI-arm decision as #2306 item P3, with the same measured table
- `2383-p2-nightly-e2e-red-on-main` — fixed: 300f0b783 (#2455) fixed split:206, inline-grammar:75, status-pill:212, theme-import:59/:205; re
- `2399-p3-bench-math-workload-drift` — fixed: test/benchmark/baseline.json datasets.math and 'edit · math' now record 17 slides (last bless 9
- `2415-p2-stage-window-palette-blink` — fixed: 300f0b783 (#2455): stage-window.js marks the rewrite's null and PresentOverlay keys presenter f
- `2749-p3-ci-route-budget-delta-diagnostic` — dupe(F2718-p5-docs-build-still-differs-by-bytes-on-ci): Same CI-only route-budget byte delta as F2718; gate now names the grown files (gotchas/ci.md §m
- `2325-p2-journey-labels-double-escape-ampersands` — dupe: journey.transform.js:373,492 escHtml(t.label) on a stripTags label that keeps entities
- `2364-p3-dagre-label-own-diagonal` — obsolete: 4ce0d29 (#2424) moved state chart to Trama; placeLabel and ctx.ownRuns no longer exist in lib o
- `2385-p3-flowchart-icons` — fixed: ebcbc3c (#2558) icons in chart nodes; flowchart-grammar.js:257-260 icon= and icon-only
- `2385-p3-live-status-paints-two-ways` — dupe: chart-family.styles.css:1279 live grouped with pass; same split the 2355 follow-up records
- `2772-p1-regenerate-the-chart-gallery-after-2767` — fixed: fb8f07b (#2770); chart.gallery.md:5 '28 components'; bucket-galleries.test.js passes 36/0 on ma
- `2245-p3-sweep-the-five-files-still-hand-rolling` — dupe(of I2265): Same sites as #2265 (carousel, split-envelope, split-panels, premise, chart-family dispatch)
- `2348-p2-lint-unchecked-front-matter-values` — fixed: b6e1dd3 (#2717) findUnknownSettingValues; lint-deck on size: huge/theme: nope/motion: maybe pri
- `2361-p3-lint-quadratic-quoted-comments` — fixed: Measured on ca84df8: lint-deck on 0/1000/4000 lines of "> <!--" = 319/384/392 ms (linear)
- `2371-p1-guide-kernel-into-the-exported-player` — fixed: a203d69 (#2436) Guide in narrated exports; guide-player-bundle.generated.mjs built from present
- `2744-p3-panes-through-template` — obsolete: Own 2026-10-19 update: 67/79 manifests already declare pane floors; 2779-p1 (shape sizing) is g
- `2348-p2-lfm-spec-front-matter-stale` — fixed: 953301c48 (#2619): spec/LFM-1.0.md:86 lists finish: as backdrops, :417 records the ratification
- `2360-p3-publish-workspace-libraries` — dupe(of F2595-p2-bootstrap-publish-1-0-0): Owner ruling 2026-10-07: publish all nine (first-npm-release.md §5); docs/src/lib/*/package.jso
- `2415-p2-hook-test-clobbers-worktree-index` — fixed: a203d698b: check-lint-coverage.test.js:19-32 and staged-pdf-glob.test.js:20-28 delete every GIT
- `2422-p4-bracket-list-linear-arm-single-sample` — fixed: a203d698b: test/unit/core/bracket-list.test.js now counts charCodeAt reads ("COUNTED, NOT TIMED
- `2453-p3-rebuild-stale-sketch-pdfs` — fixed: e82f2440a re-rendered every committed PDF; all nine named PDFs were re-blessed 2026-10-05 to 10
- `2521-p2-integration-job-timeout-margin` — fixed: .github/workflows/ci.yml:121-134: sharded into four legs, re-sampled 2026-10-12 (slowest job 9:
- `2570-p2-goldens-step-4-switch-on-auto-merge` — dupe(of I2737): Issue #2737 is the handoff for this same goldens step 4; the follow-up's state block (bless PR 
- `2314-p2-three-finish-deck-goldens-stale` — fixed: Nightly bless re-rendered all three: dark-canvas-ownership and spectrum-canvas-ownership in 99b
- `2317-p2-preexisting-golden-drift` — obsolete: c05de6f6e (#2614) nightly bless re-blesses every drifted golden; later blesses 99b9c540c (#2598
- `2422-p3-flowchart-worker-burst-arm-flaky` — fixed: 4ce0d2985 (#2424): test/unit/components/flowchart.test.js:218-228 settle now waits on answered=
- `2538-p2-goldens-drift-on-main` — obsolete: c05de6f6e (#2614): goldens are nightly-bot-blessed; decision 2026-10-06-goldens-bot-blessed.md;
- `2243-p4-give-validatetrack-and-voicelanguagemismatch-callers-or-delete` — obsolete: validateTrack is now public LTT API (ltt/index.ts:18) called by ltt/validate.ts:135 (953301c48)
- `2289-p2-the-language-chip-s-popover-strands-when` — fixed: a9afc01fb (#2324): compose-fenced-code.spec.ts:331 "chip picker rides its block when the editor
- `2289-p3-a-fence-comes-back-as-once-its` — fixed: a9afc01fb keeps a fence marker; fence-round-trip.test.ts:97-103 asserts tilde round trip
- `2324-p2-astro-dev-cannot-load-compose` — fixed: cb32dbf21: fence-catalog.ts:2-4 default-imports the CJS kernel and destructures SCRIPT_TAGS
- `2356-p3-cadenza-month-abbreviations` — fixed: 4c9f81374: lexicon.ts:111-116 expands Feb-Dec and Sept; CONTEXT_MONTHS (:172) handles Jan/Mar/J
- `2453-p2-compose-spark-popup` — fixed: c2b09040c (#2673) shipped the Compose spark editor; docs/src/components/studio/SparkPanel.tsx
- `2668-p3-collage-spec-enter-inserts-a-list-continuation` — fixed: e6cb9ed5b (#2817) added acceptCompletion/watchMenuOpen in docs/e2e/library-images-complete.spec
- `2687-p3-library-image-metadata-use-new-name-flake` — fixed: 6119db712 (#2739): library-image-metadata.spec.ts:618-630 opens the tab in a toPass retry loop
- `2687-p8-compose-inline-kind-panel` — fixed: 810f3a73c (#2861) "plugin kinds get a panel"; inline-objects.ts:274,301 read @kind{...}

Also stale but not in the count (agents flagged them outside their lists): `2404-p2-webpage-export-note-blank-line`, `2404-p2-git-dir-leak-in-hook-tests` (per #2438 both shipped; one agent still reads the blank-line spec as red, so confirm first).

## 2. Workstreams for agents

Ordered by what the owner asked for. Each row is one card; "agent-ready: yes" means the body names files and acceptance. A card sits in the first workstream that claims it.

### W1 — Release blockers and security (23)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| `2853-p1-inline-run-wraphtml-splits-a-quoted-attribute` | P0 | S | yes | inline-run's string path can write its span into a quoted attribute value — Turns attribute text into live markup after sanitize; a code-package slide may reach it. |
| `2779-p3-logged-dist-lattice-js-fails-inside-the-repo` | P0 | S | yes | `node dist/lattice.js <deck>` fails inside the repo: the manifest loader scans `dist/styles/` — The published bin crashes on pane slides. An installed 1.0.0 would fail the same way. Fix it be |
| `2640-p2-webkit-pptx-drops-images` | P0 | M | yes | The PowerPoint export on WebKit drops every picture and still says "PowerPoint ready." — Safari users get a PowerPoint with no pictures and a success message; at minimum warn. |
| #2878 | P1 | S | no | Nightly platform suites failed — macOS/Windows export suites went red after 10-20; check before release whether it is a real OS  |
| #617 | P1 | S | yes | Harden .lattice-*.zip import against zip-slip / path traversal on filesystem-backed (desktop/CL — Code guard is present but unpinned; add the crafted-zip test and threat-model note before relea |
| #1354 | P1 | S | yes | The Export-to-Marp bundle ships MIT + OFL third-party files with none of their license texts — The shipped Marp bundle redistributes MIT and OFL files without their licenses. |
| #1833 | P1 | S | no | narration(export): a speaker note still reaches a recipient through the player's notes panel — A default --player export hands recipients the speaker notes unless the author remembers --stri |
| #1890 | P1 | S | yes | review-core: catastrophic regex backtracking in CLASS_COMMENT_G freezes the Studio on an unterm — Live ReDoS: an unterminated class comment freezes the Studio, including on a shared deck. |
| `2687-p7-fence-output-style` | P1 | S | yes | A zip plugin's FENCE output keeps `style`, which can cover the whole slide — An approved zip plugin fence can paint a fixed box over the whole slide. |
| #1794 | P1 | S | no | docs(public): two owner-only surfaces contradict the engine — v1.0.0 Release body and repo desc — Only the owner can edit these. The 1.0.0 recut replaces the August release body anyway. |
| `2307-p1-read-the-code-scanning-alerts-for-lib` | P1 | S | yes | Read the code-scanning alerts for lib/authoring/lint-core.js — A security claim with no proof. Reading the alerts API takes minutes. |
| `2595-p2-retire-august-v1-tag` | P1 | S | yes | Slice D: retire the August v1.0.0 tag as a v0.9.0 preview — A mechanical step that needs the owner's go-ahead at the time. |
| `2780-p2-decide-style-module-shipping-and-index` | P1 | S | yes | Decide how the style modules ship and which index a loader uses — This decides what 1.0.0's tarball carries, and it ties into the F2779 crash. |
| #1993 | P1 | S | yes | studio(preview): patchSlideBody re-parses and re-serializes DOMPurify's output twice, which is  — Sanitized markup is parsed twice into a same-origin frame (the mXSS shape). Fix: move holder's  |
| #1634 | P1 | S | yes | crash sentinel: onVisibility persists without a catchUpOnWipe guard — A tab waking after "Delete Everything" can write the deck title back to storage. |
| `2547-p2-live-privacy-note` | P1 | S | no | Say who sees a Live user's IP address — Undisclosed IP exposure ships to users this week; copy fix is small. |
| #1501 | P1 | M | yes | export(player): the only real guard on forged chrome is ungated, and two collection lookups are — Deck markup can still forge the player's slide and frame lookups, and the only guard never runs |
| `2599-p1-independent-check-of-the-marp-open-markup-port` | P1 | M | yes | Give #2599's port onto the Marp bundle engine an independent checker pass — Export-to-Marp on a security boundary never got its independent check. |
| `2595-p2-bootstrap-publish-1-0-0` | P1 | M | no | Slice E: the first publish, which is 1.0.0 — This is the release itself. Token handling is the owner's job, and the bin must not crash first |
| `2466-p2-dependabot-groups-still-red` | P1 | M | yes | The other two red Dependabot groups: docs security (#2569) and routine (#2582) — 122 alerts (1 critical) are still open. Triage which ones reach shipped runtime code before rel |
| `2466-p2-vendored-mermaid-dompurify-3-3-1` | P1 | M | yes | The vendored Mermaid bundles DOMPurify 3.3.1, which the 3.4.16 bump does not reach — Mermaid's label sanitizer is behind the patched DOMPurify. It still ships in the .html export h |
| `2595-p1-changesets-release-pipeline` | P1 | L | no | Slice C: Changesets in, the 915 fragments archived, release notes split — The first publish waits on this one owner choice. Option A (publish folder) is recommended and  |
| #1958 | P1 | L | no | security(engine): triage the 34 open CodeQL findings — 28 polynomial-regex, 4 escaping, 2 sanit — Do the 6 escaping and sanitization alerts first, since they sit upstream of #22 sinks. The 28 R |

### W2 — CI flake and red gates (24)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| #1747 | P1 | S | yes | test(docs): PlaygroundApp's rAF loop can re-arm the shell-drop timer after unmount, failing doc — This is a live flake source in docs-build, and the fix is small. |
| #2886 | P1 | S | no | CodeQL default setup analyzes C# in a repo with no C#; "Analyze (csharp)" fails intermittently — The repo does have C# (a test tool), which is why CodeQL runs the flaky csharp job. Drop C# in  |
| `2404-p2-webpage-export-note-blank-line` | P1 | S | yes | The Studio webpage export leaves a blank line where it strips a speaker note — Two byte-identity specs were red on main and run in studio-e2e-nightly; rerun to confirm, then  |
| #1530 | P1 | M | no | [preview-e2e] playground gallery preview fails to render — A self-closing alarm still open means the Playground gallery preview likely still fails nightly |
| #1845 | P2 | S | no | [integration-nightly] render-regression tier failing on main — A standing hand-close dashboard; the repo cannot show whether it still fires. |
| #1851 | P2 | S | yes | e2e: playground-first-paint's cut-document width read takes an unguarded boundingBox() and can  — Half fixed; the settled read can still hit null on a 2-core runner in the @smoke tier. |
| `2524-p1-ci-path-filter-skipped-tiers-on-rerun` | P2 | S | no | CI's `changes` job sometimes gets no runner and ends canceled — The gate hole is closed; the cause still costs red runs and queue ejections. |
| `2523-p3-panel-shells-slide-in-poll-misses-under-load` | P2 | S | yes | The cold-sheet slide-in test misses the shell's slide under parallel load — A known e2e flake under load with a clear fix. |
| `2750-p1-route-budget-ci-local-mismatch` | P2 | S | yes | The route budget charges a PR bytes it does not add — The probable fix landed. Confirm on the next markdown-only PR, then update the gotcha. |
| `2789-p2-golden-diff-uncapped-decks` | P2 | S | yes | `golden-diff` renders every changed deck with no cap, so a PR that edits many decks times out — Still live. A many-deck PR times out silently and loses its demo PDF link. |
| #1748 | P2 | M | no | e2e: playground-first-paint.spec.ts flakes across at least four different tests under parallel  — A @smoke spec that flakes under load erodes trust in studio-smoke. |
| #2035 | P2 | M | no | [studio-e2e] Studio E2E suite failing on main — A standing dashboard that is likely still firing; close by hand once F2861 and the flakes clear |
| `2494-p1-ci-gate-passes-a-timed-out-tier` | P2 | M | no | The `ci` gate still passes a tier that timed out on a PR run — A green PR check can still hide a timed-out tier. |
| `2861-p4-compose-stress-gallery-caret-red` | P2 | M | yes | Two compose-stress e2e tests fail on main: inserting from the gallery leaves the caret on slide — Two compose specs are deterministically red on main in the nightly. |
| #2737 | P2 | M | no | Handoff: goldens step 4 — set the bless thresholds and switch on auto-merge — It is blocked on the owner merging #2624 and labeling a week of nights. |
| `2554-p1-uncommit-generated-js` | P2 | M | yes | Uncommit the lib/**/*.generated.* files (owner go-ahead 2026-10-14) — The owner approved it. It cuts merge conflicts and unblocks Dependabot bumps. |
| `2456-p3-split-seed-clamp-paints-raw-share` | P2 | M | yes | The split seed's clamp sometimes misses the first frame — Intermittent first-paint spec flake (~1 in 25) on main. |

_plus 7 P3 cards in the per-card table._

### W3 — Performance (43)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| `2739-p2-firefox-no-js-flip-redesign` | P1 | M | yes | Redesign the player's no-JS dark-mode switch so Firefox opens a large player in under a second — Large exported players take 30s+ to open in Firefox; export sign-off needed. |
| `2868-p1-studio-startup-back-to-baseline` | P1 | L | no | Get the Studio's startup back to the 2026-09-22 baseline, then make the site Lighthouse-green. — The owner's top perf item; startup is back, Lighthouse is not. |
| #2085 | P2 | S | no | [perf-nightly] docs perf regression detected — A standing dashboard, not work; the real startup regression lives in F2868. |
| #2791 | P2 | S | no | [perf-nightly-engine] engine / preview / export perf regression — A standing dashboard; the boot regression is tracked in F2868. |
| #1333 | P2 | S | yes | Preview route decision: the running-global probe over-matches, and its scan is quadratic on aut — Annotation comments still force the slow whole-deck preview route. |
| `2456-p3-mermaid-theme-reader-one-recalc-per-token` | P2 | S | yes | The Mermaid theme reader forces a style recalc per token — ~1.2s worst scroll frame; batch the probe reads. Path in body is stale. |
| `2640-p1-sanitizer-object-url-opt-in` | P2 | S | yes | Make the sanitizer's blob: allowance opt-in, so the home page and Playground do not carry it — The blob: allowance still ships on home and Playground. It is a route-bytes cost, and the same- |
| #1930 | P2 | M | yes | studio(perf): the boot path re-splits every deck and runs three O(n) localStorage scans — the f — Boot-path waste on the owner's top perf target; fold into the F2868 startup work. |
| `2609-p2-trama-route-wall-clock` | P2 | M | yes | Trama's route solver has a work budget but no wall-clock bound — A large graph can block the render thread for over a minute. |
| `2456-p3-runtime-full-pass-after-every-patch` | P2 | M | yes | The runtime re-runs its whole-deck pass after every section patch — Largest per-keystroke cost in the Playground. |
| `2599-p2-markdown-it-unclosed-comment-quadratic` | P2 | M | yes | markdown-it parses a repeated unclosed `<!--` in quadratic time — Hostile deck stalls every markdown-it path; a size guard is the cheap fix. |
| `2780-p3-slim-the-package-tarball` | P2 | M | yes | Slim the npm tarball: minify the two bundles, drop duplicate fonts and Mermaid variants — A big install-size win before the first publish, but not a blocker. |
| `2790-p1-start-read-aloud-sooner` | P2 | M | yes | Start read-aloud sooner: measure the wait before the first sentence and shorten it — Owner-reported delay; measure then cut. |
| `2794-p6-start-the-engine-before-the-page-goes-idle` | P2 | M | yes | Start the Playground's engine download before the page goes idle, and slim the 1.18 MB runtime  — Biggest measured first-slide lever. |
| `2794-p7-stop-scanning-the-whole-stylesheet-per-character-on-every-render` | P2 | M | yes | Cache or fast-path the web-reference scan of the stylesheet (and the sheet composition) that ev — Big cheap win, but a CSP-feeding scanner needs the trio. |
| `2793-p2-reuse-the-live-render-for-the-fit-check` | P2 | L | yes | Cut the fit check's fixed cost: reuse the live render instead of rendering the draft again — Remaining fixed cost of the fit check. |

_plus 27 P3 cards in the per-card table._

### W4 — Jank and visible polish (87)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| `2821-p1-chat-header-title-clips-beside-long-model-name` | P1 | S | yes | On a phone the chat header's "Chat" title is clipped to "C" beside a long model name — The owner hit 'Chat' clipped to 'C' on an iPhone. Visible on mobile, and cheap. |
| `2862-p4-pricing-laptop-footnote-clip` | P1 | S | yes | pricing's sample footnote is clipped by its list item at laptop size — The default pricing sample clips at default size. It is the one shown in the catalog and the sc |
| #2203 | P1 | S | yes | Studio settings panel scrolls sideways in the General section — the Language trigger won't shri — A one-line, measured fix for a visible sideways scroll. |
| `2361-p3-split-panel-export-blind-spots` | P1 | M | yes | Two split-panel clips the export's overflow probe does not report — split-panel metric on a deck with a header clips 17-38px with no warning. Silent clip in the ex |
| `2852-p2-slide-spectrum-space-not-reserved` | P1 | M | yes | The slide spectrum's space is not reserved, so content shifts when it is present or absent. — Editable office export moves content depending on the spectrum. Wrong output, so it needs expor |
| `2547-p2-phone-sheet-shift-misdirects-taps` | P1 | M | yes | A phone sheet moves under the finger when a field loses focus, so a tap on a button below it la — Taps land on the wrong control on phone sheets; fix in the shared primitive. |
| #2133 | P2 | S | yes | The overflow-corpus baseline is stale: 8 decks clip on main that it records as clean — The stale-baseline half is moot; only the owner's footer pick remains. |
| `2831-p4-trailing-pill-in-column-flex` | P2 | S | yes | A trailing pill stretches full width in column-flex items — Trailing pill renders as a full-width bar. |
| #1611 | P2 | S | yes | authority-chain: the 8n tier cycle only defines 4 residues, so tier 5+ loses its hue — Tiers 5 to 8 fall back to --accent. |
| `2331-p4-authority-chain-branching-overflows-the-card` | P2 | S | yes | `authority-chain branching` rows run past the card's right edge — Branch rows run past the card edge in the committed gallery. |
| `2824-p2-visual-review-band-thin-cards` | P2 | S | yes | A visual-review pass on the band and thin cards: a hazy `ink-dark` statement scrim edge and sma — Hazy scrim edge and small band body text on a new layout. |
| `2628-p2-dark-slides-erase-gradient-slot-treatments` | P2 | S | yes | Dark slides erase every gradient-slot tint (`tint-*`) — Every dark tint-* paints nothing. The fix is small, but it moves many galleries. |
| #1241 | P2 | S | yes | ui(dropdown-menu): the only Radix portal wrapper that doesn't carry `lx-ui` — its rows sit outs — One Radix portal still sits outside the scoped reset. |
| #2192 | P2 | S | yes | studio(library): the search field's Clear ✕ is off the edge of the panel header — unclickable a — The Clear button is still reported off the header edge. |
| `2547-p3-share-present-link-makes-no-link` | P2 | S | yes | The Share sheet's "Present link" row makes no link — Label promises a link the row never makes; relabel is a one-liner. |
| `2651-p1-drive-the-plugin-placeholder-on-cards-columns` | P2 | S | yes | Drive the plugin placeholder in the real Studio on `cards`, `columns` and the fluid view — Real-Studio check, reachable from the sandbox. |
| `2673-p1-compose-spark-surfaces-not-driven` | P2 | S | yes | The spark editor and the pinned slide bar were not driven at 820px or in desktop Safari — Width/engine gap reachable from the sandbox now. |
| `2794-p4-port-the-rail-walk-sync-fix-and-spec-onto-the-shipped-map` | P2 | S | yes | Check the shipped Playground map for the rail/walk disagreement a second map found — Rail and walk bar may disagree at the last slide on phones. |
| #2254 | P2 | M | yes | chart/heatmap: heatmap.gallery.md clips p3 and p4 on main — A shipped specimen still cuts content. |
| `2378-p2-new-gallery-clips-2377-2380` | P2 | M | yes | Two galleries clip on main after #2377 and #2380, and the overflow baseline now records them — The list stress slide still cuts 3 of 8 lines. |
| #1213 | P2 | M | yes | HARD RULE #4: human-readable chart text is sized in raw cqi with no floor — ~9px labels at port — Chart labels still size in raw cqi with no portrait branch, so portrait decks print sub-floor t |
| #1919 | P2 | M | no | quadrant: two charts on adjacent slides render at different sizes, because a lede taxes the sta — Adjacent quadrant charts still render at different sizes; the fix forks two ways and couples to |
| `2385-p2-flowchart-group-padding` | P2 | M | yes | Give a flowchart group's title and contents real breathing room — Group titles still hug their shapes; spacing is literals, not a token. |
| `2321-p3-split-first-body-page-taller-stage` | P2 | M | yes | The first body page of a split run gets a taller stage than the rest — First split page seats a lone row ~30px lower than the rest of the run. |
| `2831-p1-pill-line-growth` | P2 | M | no | A pill taller than the line box grows its host — Pills push the line box and move everything below. |
| #1875 | P2 | M | yes | Declared layout capacity is coda-blind — seven layouts clip an in-budget slide once a key insig — An in-budget slide plus a key insight clips on 7 layouts. The renderer flags it, so it is visib |
| #1944 | P2 | M | no | studio(header): the tablet header still overflows below ~787px — curing it means an icon-only p — Tablet Studio header overflows below ~787px; the fix needs a posture design first. |
| #2054 | P2 | M | yes | A split run's last body page shifts its content down, because the pointer's berth is not reserv — The last page of a split run jumps down; a viewer paging through sees it. |
| #2240 | P2 | M | yes | jank: the census has 77 movement leads and zero verdicts — sweep the first 20 with `--anchor` — This is the one card likely to find real visible drift. The blocker is overstated, so it can st |
| `2739-p14-tall-quoted-diagram-overflows` | P2 | M | yes | A top-to-bottom Mermaid diagram inside a quote or a list item overflows the slide, in both host — A quoted TB diagram overflows, though the export flags it. Changes PDF bytes, so it needs expor |
| `2862-p1-video-qr-own-layout` | P2 | M | yes | video qr sits under the QR floor from huddle and clips its caption; it needs its own layout — Clips only at huddle and up, not at the default laptop venue. |
| #1464 | P2 | M | no | [Bug] The search confidence meter is unreadable and needs a redesign — The search confidence meter is still reported unreadable. |
| #1906 | P2 | M | yes | Carbone is now default-LIGHT and no web surface has ever been opened on that face — Carbone light, now the default face, was never opened on the web surfaces. |
| #1929 | P2 | M | yes | studio: the theme/palette picker is unreachable at ~820px, so the QUALITY BAR's three-width evi — The theme picker is still unreachable at tablet width. |
| #2190 | P2 | M | yes | A cold first paste paints raw Mermaid fence source for 13–27 painted frames before the diagram  — A cold paste still flashes raw Mermaid source. |
| `2649-p2-compose-audit-untested-surfaces` | P2 | M | yes | The Compose audit did not reach table editing, undo, paste, drag, slide delete or diagrams — Jank the owner mentioned may live there; audit is agent-runnable. |
| `2704-p1-compose-reports-a-part` | P2 | M | yes | Compose reports a unit, not a part, so a Compose caret under a heading shows the slide's first  — Compose highlights the wrong rendered slide on heading-split decks. |
| `2789-p3-shell-models-the-slide-map` | P2 | M | yes | The Studio's pre-paint shell does not model the slide map — Returning map users see a layout shift on load. |
| `2376-p2-size-chart-viewbox-to-the-pane` | P2 | L | no | finish sizing charts to their pane: Mermaid, the HTML charts, and a measured budget — Mermaid pane labels and HTML chart budgets are still unmeasured; the probe fix is an export cha |
| `2385-p2-composite-chain-reads-as-a-column` | P2 | L | yes | A long machine with a composite state lays out as one unreadable column — A long grouped machine exports at 2.9pt, far under the type floor. |
| `2219-p1-restore-the-split-panel-coverless-band-chrome` | P2 | L | yes | Restore the split-panel coverless band chrome, and remove the pointer-suppression guard #2219 s — Stopgap guard still stands in for the band chrome; trio-level change. |
| `2375-p1-one-settle-before-reveal-font-contract` | P2 | L | yes | Hold a slide's text until its fonts land in the engine, once, instead of in every host — Five hosts each gate fonts; owner sees text shift. Trio-tier engine change. |
| `2553-p1-studio-phone-chrome` | P2 | L | yes | The Studio on a phone: search in one tap, an action row per pane, a 44px floor, lessons that wo — Phone Studio polish; too large for release week. |

_plus 44 P3 cards in the per-card table._

### W5 — Silent wrong output (67)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| `2356-p3-journey-visible-label-double-escapes` | P1 | S | yes | A journey step or stage whose name holds `&` or `"` shows the entity, not the character — R&D prints as R&amp;D on the slide and in the description, a visible wrong export. |
| #1901 | P1 | S | yes | Two trailing paragraphs abort the coda harvest entirely — the Key Insight prints as unstyled bo — Three trailing registers drop the whole coda, so the Key Insight prints unstyled. |
| #2012 | P1 | S | yes | `maskCodeRegions` has three holes, and `--strip-notes` deletes code through them — --strip-notes can delete code from the shared source through three unmasked shapes. |
| #2050 | P1 | S | yes | engine: a NESTED front-matter key named after a global directive is read as that directive — A nested front-matter key silently acts as a global directive on every slide. |
| #2052 | P1 | S | yes | engine: an unterminated RAWTEXT element swallows the next slide separator, silently merging two — An unterminated RAWTEXT element silently merges every later slide into one. |
| `2798-p1-pdf-writer-drops-svg-text-halo` | P1 | S | yes | The CLI's vector PDF writer drops the halo on SVG chart text — Default PDF drops label halos on several charts; silent export loss. |
| #1097 | P1 | S | yes | Verify: does parseFinishReply handle the complete({json:true}) object contract? — Finish generation with a real model always reports "no usable finish recipe"; the feature silen |
| #1295 | P1 | S | yes | [Bug] Present Screen Rework — On Firefox the audience Stage window never handshakes and stays on slide 0. |
| `2727-p2-qr-standards-conformance` | P1 | M | no | The shipped QR codes miss four points of the QR, Wi-Fi URI and vCard standards — Exported QR codes garble accented names and SSIDs. |
| #1257 | P1 | M | yes | studio(front-matter): the lexicon: / acronyms: writers still rebuild the whole block — Editing lexicon or acronyms still rewrites the author's front matter, dropping comments and _ke |
| `2226-p1-take-the-retention-decision-then-implement-it` | P1 | M | no | Take the retention decision, then implement it — Every deploy breaks open tabs; the fix waits on the owner's retention pick. |
| `2375-p2-stale-studio-tab-404s-themes-after-deploy` | P1 | M | yes | A Studio tab left open across a deploy 404s every theme it has not fetched yet — A tab open across a deploy exports with the wrong theme; pairs with F2226-p1. |
| #2290 | P2 | S | yes | state-chart decides "is this an ending?" twice, by two different rules — The picture now uses one rule, but narration still calls a stranded state an end state the slid |
| `2355-p3-status-green-shared-by-three-words` | P2 | S | no | The family pill vocabulary still paints on-track, done and live one green — One status word paints two colors across sibling charts. |
| `2798-p2-lift-label-set-regex-spans-paragraphs` | P2 | S | yes | liftLabelSet's paragraph regex can span paragraphs and match <pre> — A label set after a code-led paragraph or fence is silently not lifted. |
| #1513 | P2 | S | yes | Narration silently skips most of a slide on the on-device rung: the produce deadline burns down — On-device narration still times out queued sentences and skips them silently. |
| #1838 | P2 | S | yes | narration: an inline `&lt;!-- caption: --&gt;` may bind to the wrong page across an autosplit — Inline captions may bind to the wrong page after an autosplit; unproven but unremapped. |
| #2225 | P2 | S | yes | `.tile-watermark` keys its ink on the `.dark` CLASS, not the resolved ground — the bug #2196 fi — Watermark ink follows the .dark class, not the resolved ground, so -dark themes get wrong ink. |
| `2794-p1-content-mask-reads-selector-spelling` | P2 | S | yes | The engine's content mask reads the selector's spelling, so unminified CSS is masked differentl — Unminified -c CSS masks different rules than minified. |
| `2824-p1-base64-svg-bg-line-renders-as-text` | P2 | S | yes | A `![bg](data:image/svg+xml;base64,…)` line renders as literal text on the slide, not as a phot — A pasted SVG data URI shows as card text with no diagnostic. |
| #1069 | P2 | S | yes | lint: proseWordCount counts fenced-code content as prose (wall-of-text false positive on decks  — The wall-of-text coach still counts code as prose. The fix and the test are both small. |
| `2672-p3-discard-a-chat-clip-the-author-adopted` | P2 | S | yes | Taking a device clip off a message deletes it even after the author chose to keep it in the Lib — Silent loss of a clip the author chose to keep. Small fix. |
| #1247 | P2 | S | yes | pwa: the engine/KaTeX `<script>` channel and the SW's cross-tab eviction are a second source of — A stale tab can silently render math as source; same deploy window as F2226-p1. |
| #2087 | P2 | S | yes | fix(studio): getFrontMatter doesn't strip a trailing YAML comment, so three Inspector toggles s — Three Inspector toggles still misread annotated values. |
| `2326-p1-webkit-sizes-sequence-and-xychart-svg-box` | P2 | M | yes | WebKit sizes the sequence and xychart `<svg>` box differently, so their labels drift low — Safari paints sequence and xychart labels up to 32px low. |
| #2286 | P2 | M | yes | word-cloud: two shipped slides lose a word the packer cannot seat — The packer still silently drops one word on two shipped slides. |
| `2441-p2-mermaid-guide` | P2 | M | yes | A Mermaid diagram gets no Guide walk, and one inline edge label silences its narration — One inline edge label silences a whole diagram's narration. |
| `2348-p2-style-front-matter-one-render-path` | P2 | M | yes | `style:` front matter applies on the CLI render path only — style: works on the CLI only; HARD RULE #1 split, and a #22 sink when fixed. |
| #1861 | P2 | M | no | fix(theming): `--cat-N-fill` overrides are silently inert on every textured theme — the documen — Overrides are still silently inert on textured themes. Needs a design pick; it is blocked by I1 |
| #1716 | P2 | M | yes | fix(studio): tell the author when an export squares a `corners: rounded` deck — A Studio PDF export squares rounded corners without telling the author. |
| `2358-p3-player-export-skips-deck-css-pictures` | P2 | M | no | The player export does not embed a picture named in the deck's own CSS — A logo set in deck CSS is blank in the player export with no notice. |
| `2388-p2-studio-drops-deck-embedded-finish-css` | P2 | M | no | The Studio does not paint a finish the deck defines in its own `<style>` block — Studio silently drops deck-defined finish CSS the CLI renders; same root as 2852-p3. |
| `2665-p1-carrier-cap-and-1440-chromium-gap` | P2 | M | yes | Two gaps the photo-export work found and left: no writer-side check on the 200 MB carrier cap,  — Export can write a file the importer refuses; 1440 specs skip Chromium. |
| `2704-p2-present-follows-the-hub` | P2 | M | yes | Present seeds from an authored-slide index and does not follow the focus hub — Present opens on the wrong slide of heading-split decks. |
| `2852-p3-studio-export-ignores-deck-style` | P2 | M | no | The Studio's office export ignores a deck's own `style:` block. — Same root as 2388; resolve together under HARD RULE #22. |
| `2875-p7-compose-escaped-ref-link-shapes` | P2 | M | yes | Compose: round trip changes link reference definitions on other slides — Compose round trip silently breaks links on other slides. |

_plus 31 P3 cards in the per-card table._

### W6 — Accessibility and contrast (30)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| #2077 | P1 | S | yes | fix(comparison): inline code in a compare-prose corner tag is 1.16:1 — it keeps its own ink on  — Inline code on the accent tag banner fails AA badly. |
| `2756-p1-read-the-22-examples-sample-findings` | P1 | M | yes | the examples sample's first bless recorded 22 sub-AA runs nobody has read — 22 sub-AA contrast rows were blessed without anyone reading them. |
| `2828-p1-chrome-other-themes-and-pptx` | P1 | M | yes | Check the smaller venue chrome in the other 13 themes, the PPTX export and a real projector — Shipped smaller chrome may fall under 4.5:1 in 13 unchecked palettes. |
| #1886 | P2 | S | yes | kanban: the lane tag is sub-AA on the PLAIN card too, not just the status-washed one — The plain-card lane ink is still canvas-solved and unmodeled, so it can sit below 4.5:1. |
| `2816-p2-mermaid-legend-rules-leak` | P2 | S | yes | Mermaid's legend rules paint every `.legend` group on a slide — Mermaid ink leaks into every legend group; a counter-!important hides it today. |
| #1685 | P2 | S | yes | a11y palettes: `--chart-state-*` and `--diagram-critical` stay flat, so they now disagree with  — Still live and small: pair the flat tokens the way the trio is paired. |
| #1862 | P2 | S | yes | fix(a11y): the Mermaid pie legend swatch is never textured — texture makes the chart HARDER to  — A shipped a11y defect: the pie key cannot be matched. The fix is about 12 CSS rules. |
| #1431 | P2 | S | yes | Component-generator prompt still offers --cat-N-mark as the categorical text color — The generator is told to color text with the mark tier, which can fail contrast. |
| #1921 | P2 | S | no | verify(studio): the Studio suppresses Safari's own pinch events — unverified, and if it works a — A low-vision iOS reader may lose page zoom in the Studio. |
| #1975 | P2 | S | yes | studio: a disabled Save explains itself to a pointer only — keyboard and screen readers get not — Keyboard and screen-reader users get no reason, and the button has no name at 390px. |
| #1995 | P2 | S | yes | Studio: an invalid theme name disables Save with no message — An invalid theme name disables Save with no message; fix with I1975. |
| `2639-p3-live-row-hover-contrast` | P2 | S | yes | Live panel: a hovered person row fails text contrast in the light palette — Hovered Live row fails AA in cuoio light. |
| #1871 | P2 | M | yes | test(a11y): no gate reads the exported PDF's tag tree — the structure is emitted and never chec — The new in-house PDF writer builds a tag tree that nothing checks. |
| #1878 | P2 | M | yes | theme-surface-aa audits only the mode a palette PINS, so half of every palette has never been g — Half of every palette's surfaces are still never AA-gated. |
| #2274 | P2 | M | no | Gantt's statuses reach none of the three redundant-encoding channels — no text, no glyph, no te — Gantt status still rides color alone, which fails achromatopsia and print. |
| #1954 | P2 | M | no | anima(a11y): built scenes have no poster, so a reduced-motion viewer gets "Play the motion" ove — Reduced-motion viewers still see an empty stage on built scenes. |
| #1745 | P2 | M | yes | contrast(sweep): 285 sub-AA text runs in the exported players — 148 genuinely low-contrast, 137 — Items 1 and 3 are met. The a11y pie legend is still invisible text after the toggle. |
| #1927 | P2 | M | yes | studio(a11y): a parked preview iframe stays in the accessibility tree and tab order — Tab can l — Tab can still land on a hidden preview frame. |
| #1933 | P2 | M | yes | studio(a11y): the toolbar dial is three independent `aria-pressed` toggles, and its segments mi — The dial still announces as three unrelated toggles. |
| `2540-p3-radix-modal-hides-vetrina-exit` | P2 | M | yes | A Radix modal still walks into Vetrina's stage and hides Exit from assistive tech — Radix modal hides lesson Exit from AT; shared stage, needs checker. |
| #1864 | P2 | L | no | theming: the categorical fill ramp is not separable — ΔE 0.013 to NORMAL vision, against a 0.15 — This is the root of the texture cluster. Large, and the bytes it changes need export sign-off. |

_plus 9 P3 cards in the per-card table._

### W7 — Verification debt (needs a device or owner) (50)

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| #2405 | P2 | S | no | [webkit-baselines-nightly] SVG labels drift in WebKit on main — A standing dashboard; the repo cannot show whether it still fires. |
| `2540-p1-lessons-iphone-listen` | P2 | S | no | Listen to the lesson voice on a real iPhone, and run the @webkit-phone lessons tests — Lesson voice on iOS is UNVERIFIED. |
| `2615-p1-verify-stale-deploy-swap-on-iphone` | P2 | S | no | Verify the stale-deploy swap on a real iPhone after a deploy — The stale-deploy swap is UNVERIFIED on iPhone Safari. |
| `2742-p1-verify-since-path-after-second-nightly` | P2 | S | no | the changed-only (`--since`) path and the last-green cache marker have never run in CI; they ru — The --since path has never been seen running in CI. |
| `2436-p2-real-device-playback` | P2 | S | no | Play a narrated export's Guide on Safari/iOS, and a `lattice video` MP4 in PowerPoint and Keyno — Guide on Safari/iOS and MP4 in PowerPoint/Keynote are UNVERIFIED. |
| `2549-p1-real-viewer-checks-reopenable` | P2 | S | no | Open a re-openable export in the real viewers: PowerPoint, Acrobat/Preview, iOS Files — Three real-viewer screenshots still owed. |
| `2556-p2-verify-editable-pptx-in-powerpoint` | P2 | S | no | Verify the editable .pptx in PowerPoint itself — Editable .pptx never opened in PowerPoint. |
| `2641-p1-collage-lightbox-real-ios-run` | P2 | S | no | Run the collage lightbox's swipe and pinch on a real iPhone — Touch gestures verified only through CDP emulation. |
| `2447-p1-verify-studio-webpage-export-into-lattice-video` | P2 | S | yes | Verify the Studio narrated Webpage export feeds `lattice video` — This is real-surface verification debt. A person at a desktop clears it in minutes. |
| #2604 | P2 | S | no | Handoff — Studio live calls: quality readout, device checks, volume, high fidelity, TURN (after — What remains is the owner's devices and the TURN default. |
| `2398-p1-verify-add-slide-on-a-real-ipad` | P2 | S | no | Finish the real-device check of Add slide after #2398: memory, VoiceOver, rotation (Safari 26+) — Device-only check the owner must run. |
| `2547-p1-verify-live-on-two-real-networks` | P2 | S | no | Verify a live session on two real devices and two networks — Owner must run cross-network live test. |
| `2571-p1-verify-regency-and-calls-on-devices` | P2 | S | no | Verify the regency and calls on two real devices — Device-only host handoff check. |
| `2633-p1-verify-ios-wake-lock-clipboard-and-speaker` | P2 | S | no | Drive the iOS wake lock, the connection-log copy and the speaker picker on a real iPhone — Device-only check. |
| #1956 | P2 | XL | yes | verify: the standing real-surface backlog — 91 UNVERIFIED claims across seven surfaces, what ea — The sandbox can clear two surfaces now; the rest need devices. |

_plus 35 P3 cards in the per-card table._


### W8 — Everything else (267)

Features, docs, process and refactors. P0-P2 only here; the rest are P3 in the table.

| item | pri | effort | agent-ready | what / why |
|---|---|---|---|---|
| `2327-p3-lattice-lint-is-not-a-command` | P1 | S | yes | The retired-Form render warning points at a `lattice lint` command that does not exist — Release ships a warning that sends users to a command that errors. |
| `2620-p3-engine-named-esm-exports` | P1 | S | yes | `import { render } from '@laticent/lattice'` fails: the engine has no named ESM exports — Public ESM import fails; cheapest to fix before the release publishes. |
| #1623 | P2 | S | yes | A theme color change stales committed artifacts three hops deep, and no per-PR gate sees it — Non-diagram pages of a mermaid deck still get the looser 1% band. |
| #2134 | P2 | S | yes | The E2E suite runs against a site `npm run build` would not ship — `build:e2e` skips two head-r — E2E tests a site that npm run build would not ship. |
| `2404-p2-pdf-parity-sweep-ci-job` | P2 | S | no | Decide whether the PDF writer parity run and its thin-line sweep become a CI job — The new PDF writer has no gate that renders real decks. |
| `2348-p2-lint-unknown-status-word` | P2 | S | yes | An unknown status word draws silently in progress and timeline-list — A typo like 'at risk' still draws as a deliberate info pill with no warning. |
| #1368 | P2 | S | yes | Four consumers read `data-class` as the slide's class identity, which it structurally cannot be — Two gates still skip default slides by reading data-class. |
| `2473-p3-retire-the-experimental-pane-syntax` | P2 | S | yes | After the next release, retire the `panes:` / `pane:` alias, or keep it with a reason — Waits on this week's release; then retire or keep with a reason. |
| `2748-p3-mermaid-theme-css-keeps-file-urls` | P2 | S | yes | A Mermaid diagram's author `themeCSS` can leave `file:` URLs in the exported SVG — Exported HTML carries author file: URLs that load on the reader machine. |
| `2376-p2-list-code-pane-budgets-over-ceiling` | P2 | S | yes | list and code declare pane budgets above what the calibration measures — Pane lint stays quiet on list panes that clip. |
| `2612-p2-ratify-and-publish-draft-specs` | P2 | S | yes | The owner signs off LFM 1.1, the theme contract and the .lattice file, then they go on the site — Only the owner can ratify a public spec. The projection work is mechanical after that. |
| #1767 | P2 | S | yes | golden-diff drops its montage artifact on large diffs, and blames a missing ImageMagick that is — Still live. The message misleads triage on a large diff. |
| `2447-p2-ship-the-cli-skill-in-the-claude-code-plugin` | P2 | S | yes | Ship the CLI skill in the kit's Claude Code plugin — Still missing. A small build-output addition. |
| #1503 | P2 | S | yes | narration: finish the encoder integration — Gemini encodes on the main thread, clips gain untri — The LAME license notice ships unlinked; cheap to fix before a public release. |
| `2367-p3-premise-modifier-effects-drift` | P2 | S | yes | premise's modifier-effects entry drifted from the render — The editor hides premise modifiers that change the render. Fold this into a re-check of the who |
| #1928 | P2 | S | no | infra(ci): decide the CodeQL rollout — a required check that never reports on the merge group w — Making CodeQL a required check could deadlock the merge queue, and branch protection is shared  |
| #1931 | P2 | S | no | infra(secrets): five Actions secrets were assumed to survive the org rehost — two of them fail  — Two workflows still pass green when their secret is gone. Only the owner can confirm the secret |
| #2024 | P2 | S | yes | Export CSP: media-src and connect-src have no behavioral coverage on the export path — The CSP directives exist, but no test proves media-src and connect-src block anything. This is  |
| `2404-p2-git-dir-leak-in-hook-tests` | P2 | S | yes | Tests that run git leak into the real repo when a hook runs from a worktree — The original leak is fixed, but #2780 added a new test with the same bug. It can still write us |
| `2238-p1-drive-the-detail-reveal-in-present-on` | P2 | S | yes | Drive the detail reveal in PRESENT on a touch context — Tap-to-reveal in Present was never driven on a touch project. |
| `2547-p2-decide-a-turn-default` | P2 | S | no | Decide whether to put a free third-party TURN in the slot — Without TURN, client-isolated networks cannot connect at all. |
| #1601 | P2 | M | yes | export: nothing detects a player-only defect — the PDF is right, the webpage is wrong, and no g — A player-only export defect still has no detector. |
| #1902 | P2 | M | yes | Nothing gates who addresses .cell-coda — six CSS families drifted silently when the cell moved — Moving the coda cell can still break CSS families silently. |
| `2314-p4-code-packages` | P2 | M | yes | Investigate what refusing a code package at OS layer OFF would break. — Code packages run with the OS sandbox off in common setups; measure before the owner decides ag |
| #2171 | P2 | M | yes | chart: a dropped label is still silent for an author — the census only covers decks we ship — The CLI half shipped in 6990aba (#2229); lint:deck and the Playground still stay silent on a dr |
| `2611-p1-replace-the-remaining-naive-css-comment-regexes` | P2 | M | yes | Replace the remaining naive CSS-comment regexes — Naive /*…*/ strip misreads strings/url(); one new site added since. |
| `2272-p1-assert-the-a11y-tree-in-the-integration` | P2 | M | yes | Assert the a11y tree in the integration tier — There is still no AX-tree assertion for label-set overrides. |
| #1904 | P2 | M | yes | `--chart-state-*` is in no CVD token group — a real protanopia collapse reached a green PR unde — A real protanopia collapse already slipped past this gap once. |
| `2335-p2-eyebrow-and-heading-registers-inert-on-some-layouts` | P2 | M | no | The eyebrow, heading and table registers do nothing on some layouts — The tool disagrees with its oracle on every layout I tried, even list. Fix or trust the instrum |
| `2800-p1-preview-sandbox-pool-fork` | P2 | M | no | Move the math preview into the sandbox: pick the mechanism. — KaTeX output is sanitized before display, so this is defense in depth. The CLI already proves o |
| `2800-p2-capture-browser-os-sandbox` | P2 | M | yes | Give the export's capture browser Chromium's OS sandbox. — The CLI renders untrusted decks without Chromium's OS sandbox, but the network is cut. An escap |
| #1569 | P2 | M | yes | lint: flag a `---`-delimited YAML block below offset 0 — the stray front matter that costs a sl — Authors still get no warning for a pasted second front-matter block that eats a slide. |
| `2547-p3-live-editor-trust-and-rate-limits` | P2 | M | yes | Limit what an admitted editor can do to the document — Admitted editor can flood or spoof document items. |
| `2673-p2-compose-spark-fixes-second-checker-pass` | P2 | M | yes | The late fixes to the spark writer and door had no second checker pass — Writer rewrites deck source; fixes never re-checked. |
| #1869 | P2 | L | no | decision: retire the live-DOM mirror render path, or pay for it properly — A capability-removal and CI-contract decision, both reserved for the owner. |
| `2743-p1-npm-plugin-canary-harness` | P2 | L | no | Finish the npm-plugin canary harness: the export check and the data-return case. — Security gate for the npm door; phase G must not open until green. |
| `2348-p1-author-reference-docs` | P2 | L | yes | Document the author features the site never mentions — The notes and export flags are partly documented. The modifiers, directives and auto-split page |
| #1621 | P2 | L | no | fix(studio): the crash report is invisible on the browser's own post-crash reload — three desig — The crash report stays invisible on a browser's own recovery reload. |
| `2547-p2-per-member-signing-keys` | P2 | L | yes | Give every member a signing key, so a member's peer id is proven, not vouched for — Impersonation window in Live trust model; needs adversarial trio. |
| `2690-p1-chart-model-phase-2-reader` | P2 | XL | yes | Phase 2 of the chart authoring model, what is left: delete the bridge (phase 4) and the residua — Phase 4 deletion is large shared-kernel work; not a release-week item. |

## 3. Needs the owner (87)

- #1833 (P1) — Should recipient player exports drop the notes panel by default (opt-in to keep), or stay opt-o
- #1794 (P1) — Fold this into the 1.0.0 release: update the repo description and let slice D retire the old bo
- `2595-p2-retire-august-v1-tag` (P1) — Go ahead to retag August's v1.0.0 as the v0.9.0 preview when slice E is ready?
- `2780-p2-decide-style-module-shipping-and-index` (P1) — Ship dist/styles in the package or generate it on install, and which index does the runtime loa
- #2886 (P1) — Remove C# from CodeQL default setup's languages (the tool is a test harness, not shipped), or k
- `2547-p2-live-privacy-note` (P1) — Approve wording for the Live start card and lobby saying who sees a user's IP?
- `2595-p2-bootstrap-publish-1-0-0` (P1) — Is the 1.0.0 publish this week? If so, settle slice C now and fix F2779 first.
- `2226-p1-take-the-retention-decision-then-implement-it` (P1) — Asset retention after a deploy: A (keep the old hash dir), B (current.json + 404 re-resolve; re
- `2595-p1-changesets-release-pipeline` (P1) — Pick slice C's shape: A packages/lattice publish folder (recommended), B two release paths, or 
- #1845 (P2) — Read the latest [integration-nightly] comment: close by hand if recent nights measured green, o
- #2085 (P2) — Close this thread by hand and track startup in F2868, or keep it as the docs-perf dashboard?
- #2133 (P2) — Which caption-footer option ships (the note recommends dropping the summary suffix when it will
- #2405 (P2) — If recent nights read green, close by hand; otherwise which deck drifted?
- #2791 (P2) — Read the latest firing: close by hand if no tier is past its band, else hand the tier to F2868?
- `2404-p2-pdf-parity-sweep-ci-job` (P2) — Run the PDF writer parity sweep as a nightly job, a path-filtered PR job on lib/core/pdf-compos
- `2355-p3-status-green-shared-by-three-words` (P2) — Does live take info family-wide (recommended), and does done get its own tone?
- `2612-p2-ratify-and-publish-draft-specs` (P2) — Sign off LFM 1.1, THEME 1.0 and LATTICE-FILE 1.0 before or after this week's release?
- #1928 (P2) — Keep CodeQL advisory for this release, or test on one low-stakes PR whether it reports on merge
- #1931 (P2) — Can you confirm CLOUDFLARE_API_TOKEN and OPEN_ROUTER_KEY are set on Laticent/lattice, and appro
- #2604 (P2) — Which TURN default (relay or none) for Live calls, given same-hotel-wifi devices cannot connect
- `2547-p2-decide-a-turn-default` (P2) — No TURN, or a named free TURN provider (it relays media while in use)?
- `2494-p1-ci-gate-passes-a-timed-out-tier` (P2) — Should a PR-run tier killed by its own timeout fail the ci gate, read via the jobs API, accepti
- #1919 (P2) — Stabilize the chart stage (levels down ~10%, unblocks #1605) or absorb the variance into the un
- `2831-p1-pill-line-growth` (P2) — Pill as inline (padding/border, no line growth) or keep inline-block for the text-box trim?
- #2737 (P2) — Merge bless PR #2624 and label a week of nights so the thresholds can be set?
- `2800-p1-preview-sandbox-pool-fork` (P2) — For the math preview, (a) a frame pool with a two-pass render, or (b) the WASM KaTeX wall in th
- `2388-p2-studio-drops-deck-embedded-finish-css` (P2) — Should the Studio render a deck's own <style>/style: CSS (through sanitizeStyleText, #22) or sa
- #1869 (P2) — Retire the live-DOM mirror path, keep it with behavioral tests, or derive it from one kernel; a
- #800 (P3) — Promote studio-smoke to a required check now, or wait until the open smoke flakes (#1851, #1748
- #1922 (P3) — Delete the merged claude/* branches now, and which unmerged ones may go?
- #1946 (P3) — Add a defaultfont Playwright project to the nightly (with measured runtime), or record the gap?
- #2025 (P3) — Keep the Studio export e2e nightly-only (record why), or move it onto the per-PR gate?
- #2060 (P3) — If recent nights read none above baseline, close it by hand?
- #2145 (P3) — Is one card per page, with most of each card empty, the intended de-boost result?
- #2306 (P3) — Add a WebKit slide-render arm (measured: 11.6 s structural check, ~226 s screenshots), and wher
- `2862-p5-venue-harness-ci-and-none-probe` (P3) — Require a venueProbe on every venueCapacity none component?
- #180 (P3) — Close the epic now that #1213 carries the remaining portrait work?
- #2224 (P3) — Which reference wins for the page numeral: frame inset, band center, or leave the 4px?
- `2831-p2-one-center-line` (P3) — Center inline objects on the x-height or the cap height?
- `2361-p3-glossary-bare-huddle-strict-basis` (P3) — Should glossary: auto page at the strict count (7) or read the deck size?
- #294 (P3) — Wire pixel-check as a pre-commit hook? I recommend no: the goldens and golden-diff cover it. Th
- #970 (P3) — OK to delete these three superseded remote branches?
- #2277 (P3) — Should plain speaker notes feed the narration coaches (current code) or be dropped (the card)?
- `2219-p2-close-2161` (P3) — Close draft PR #2161 with a pointer to #2219?
- `2239-p2-delete-the-three-empty-model-label-definitions` (P3) — Delete the live model:opus label?
- `2778-p2-decide-the-card-posting-hook` (P3) — Add a hook that validates cards in PR comments? I recommend waiting for F2778-p1's misread revi
- `2780-p6-pre-push-guard-for-session-branches` (P3) — Price and add a pre-push HARD RULE #31 guard, or keep it a discipline rule?
- #1994 (P3) — Refuse, namespace or allow the shadowing when a Studio theme takes a built-in palette's name?
- `2862-p3-portrait-hall-display-anchors` (P3) — On a portrait canvas, should the venue lift be ignored, or is the venue contract documented as 
- #2182 (P3) — Which design for the slide panel's "No changes yet / Reset slide" row: drop it, fold it into th
- #2578 (P3) — The .html sidecar and Marp follow-ups shipped. Are the two device checks still wanted, or can t
- `2356-p3-cadenza-years-as-pairs` (P3) — Read years in pairs ("twenty twenty-six") instead of the current cardinal reading?
- `2794-p3-decide-style-loader-default` (P3) — Flip the Playground default to the ?styles=floor loader once the listed conditions hold?
- `2794-p5-restyle-hook-needs-engine-ceiling-room` (P3) — Raise getting-started engineJsGz by 1 KB so restyle() can return?
- `2822-p3-deck-check-at-chat-send` (P3) — Delete the background diagram check and run it at chat send?
- `2853-p3-decide-the-imported-tag-after-a-restore` (P3) — Keep Imported as "arrived this session", or carry origin in the package?
- `2861-p3-compose-change-highlight` (P3) — Which flash curve: settle, quick, or linger? And keep the off-screen chip?
- #1856 (P3) — Which bench:check contract: drop the calibration index, normalize per tier, or same-run A/B onl
- `2678-p3-packed-form-webpack-and-ci-gate` (P3) — Should a reduced palette-slide parity run (two palettes, one gallery) join CI?
- #2438 (P3) — Gate tools/pdf-writer-parity.mjs --galleries nightly, as a path-filtered PR job, or not at all?
- `2357-p1-pdf-renderer-text-box-centering` (P3) — Bump the export Chrome to >=133 (all PDF bytes change) to fix a <=0.68px pill offset?
- `2388-p3-legacy-saved-finish-wedge` (P3) — Retire --chrome-pdf (closes this and the veil seams), or keep fixing poppler artifacts?
- `2388-p3-veil-tile-seams` (P3) — Retire --chrome-pdf, or keep fixing its poppler tile seams?
- `2556-p3-calco-license-and-types-for-outside-users` (P3) — Which license should Calco ship under for outside users, and should it bundle a reference pinne
- `2717-p4-adopt-cards-on-four-candidates` (P3) — For authority-chain, checklist, cycle and premise: adopt cards (with which default) or relabel 
- `2789-p1-bookend-header-footer-via-manifest` (P3) — Should bookends drop header and footer via manifest chrome, with with-header/with-footer as the
- `2361-p2-talk-venue-and-trim` (P3) — Is PR #2361 still alive? If not, drop this follow-up; if so, trim at huddle on that branch.
- `2606-p3-mark-treatments-review` (P3) — Keep, change or drop each of the 11 mark-* treatments (the review deck is ready to rebuild)?
- `2687-p4-inline-kinds-on-rebuilt-layouts` (P3) — Let the door draw @kind spans before shipped rebuild passes, or keep the shadow and document it
- #1284 (P3) — What should "smart" autocomplete do? Close as covered by #2322, or write the acceptance check?
- #1943 (P3) — Should an agent try to recover the 27 critique findings, or close this and run a fresh landing 
- `2547-p3-live-connection-telemetry` (P3) — Accept opt-in anonymous join-outcome counts, and where should they land?
- `2691-p2-chat-tools-that-act-on-lattice` (P3) — Approve the tool tiers and the Talk/Review/Auto mode control before any acting tool is built?
- `2884-p1-fuoco-change-channel-for-the-flash` (P3) — Span list or one span, and separate origins or not?
- #1754 (P3) — Adopt one guarded assembleDocument() chokepoint plus a gate that requires it, or keep the four 
- `2547-p3-own-signaling-relay` (P3) — Run a Nostr relay we control in a CI job, and offer it for self-hosting?
- #288 (P3) — Is the section 12 deck-config table still wanted, or close in favor of the shipped registers?
- #554 (P3) — Close as superseded by panes, or still want a 3+ component grid?
- #1935 (P3) — Bake prepared audio into shared exports, fetch it alongside, or keep captions as the answer?
- `2376-p3-chart-pane-canvas-under-long-headline` (P3) — Ship chart kernels in every export runtime so panes re-lay out under long headlines?
- `2852-p2-native-tables-in-the-office-export` (P3) — After a measured row-height sample, native tables or cell frames in the editable export?
- `2862-p2-per-canvas-venue-budgets` (P3) — What Studio-bundle byte budget may the per-canvas count tables take, and are non-wide laptop sa
- #1791 (P3) — Approve an OpenRouter spend cap for a 4x3 faculty-by-model eval, or park it?
- #515 (P3) — Is Google Drive bring-your-own-storage still wanted? If yes, which decision doc governs it and 
- #2644 (P3) — Build our own signaling, or wait for or patch a Trystero hook, for stereo High fidelity?
- `2547-p2-live-sessions-outlive-host` (P3) — Peer-held persistence (last member keeps the room) or the server-backed step?
- `2822-p1-fuoco-owns-preview-state` (P3) — Pick design A then C from the 2026-10-23 Fuoco note?

## 4. What was applied (2026-10-25)

The owner approved closing the confident set. A label change leaves no diff, and neither does a close, so this list is the audit trail. Reopen any one if its evidence row proves wrong. Per-card evidence is in `2026-10-25-issue-queue-triage/cards.json`.

- **Closed 52 issues** (open count 333 → 281 at the time; 11 were reopened afterward, see section 5, so 292 are open):
  - #596 — completed
  - #668 — not_planned
  - #1507 — not_planned
  - #1586 — not_planned (target is a follow-up file)
  - #1848 — completed
  - #1860 — completed
  - #1936 — duplicate
  - #1949 — not_planned
  - #2181 — completed
  - #2231 — duplicate
  - #2266 — completed
  - #2288 — completed
  - #2349 — completed
  - #2401 — completed
  - #287 — completed
  - #1406 — completed
  - #1558 — duplicate
  - #1602 — completed
  - #1683 — completed
  - #2475 — completed
  - #2511 — completed
  - #2731 — completed
  - #2741 — not_planned
  - #500 — completed
  - #1407 — completed
  - #1549 — completed
  - #280 — not_planned
  - #1945 — completed
  - #1966 — completed
  - #290 — not_planned
  - #1437 — not_planned (target is a follow-up file)
  - #1874 — completed
  - #1912 — completed
  - #1924 — not_planned
  - #2099 — completed
  - #1410 — completed
  - #1460 — not_planned
  - #1536 — duplicate
  - #1562 — duplicate
  - #581 — not_planned
  - #1429 — completed
  - #1605 — completed
  - #1867 — completed
  - #1911 — completed
  - #297 — not_planned
  - #414 — not_planned
  - #1517 — completed
  - #1539 — not_planned
  - #1876 — completed
  - #2275 — completed
  - #2296 — completed
  - #2426 — completed
- **Held back:** #2004, #2098, #2310.
- **Deleted 39 follow-up files** from `followups.d/`: those marked CLOSE in section 1.
- #1437 also got a warning comment, because its steps put a raw npm token in `.npmrc`.
- No labels, milestones or board columns were changed.

## 5. Verification of the closes (added 2026-10-25, after the first 52 were closed)

Two independent checker agents tried to refute every close verdict, plus the three held back.
Of the 55: 27 confirmed, 24 partial, 2 refuted, 2 unclear (the checkers' own tallies differ by a few because two marked caveats as CONFIRMED).

**Reopened (11)**, because a stated done-when item has no evidence: #1539 (the pool allows 28 slots, the slice cache holds 24, and a walk back through 40 slides missed 16), #1586 (its survivor asks for a decision only, not a tail-time check), #1558 (its survivor does not carry ctrl+wheel zoom), #1945 (`variantDecisionRule` 46 of 79, `dataShapeGuidance` 21 of 79), #2731 (host parity holds, but no evidence the packer features shipped), #1605 (drops are reported, not prevented), #1911 (fix holds when run; the required real-Chromium screenshots are missing, HARD RULE #23), #1429 (no scale canary or split-panel legibility evidence), #1410 (the contrast test loads only `indaco`; the card names `atelier`), #1966 (the 10/10 rubric was never applied to a named sample), #1912 (items 3 and 4 absent).

**Still closed with a caveat** (the fix is real, a test or note is missing): #668 (studio-smoke is advisory, not blocking), #1848 and #2288 (no regression test), #1406 (a test also accepts the broken relative src), #1683 (the test walks the engine's size list, not every Studio key), #1549 (no title-position test for `math matrix`), #2475 (phase P3 lives in a follow-up file), #2099 (the cited commit is wrong, `f205b6619` deleted the file, and there is no `.gitignore` guard or recorded reason), #1437 (the closing pointer should also name `2595-p2-bootstrap-publish-1-0-0` and `2595-p3-weekly-automatic-release`), #1562 (carry "add `--cat-N-texture` to REQUIRED_TOKENS" and the golden re-bless into #1865), #1517 and #1876 (oracle lives in another file; #1876's spec tests only 820px). Three evidence citations are wrong but their verdicts hold: #2181 (about 5 specs, not 8), #2266 (stylesheet is `lib/plugins/chart-family/chart-family.styles.css`), #2511 (spike is `4db398956`, not `9c7fda9`).

**Held, still open:** #2004 refuted (a trailing code chip is still outside its wrapper), #2098 plausibly fixed but has no PDF evidence, #2310 unclear.

**Not verified by anyone:** no checker rendered a PDF or drove a real surface, so every visual criterion above is UNVERIFIED (HARD RULE #23).
