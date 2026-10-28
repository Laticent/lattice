---
status: shipped
summary: >
  Lighthouse mobile, reproduced on the built site over HTTP/2: Studio 48-55, Playground 42-51, home 56-66, against a target
  of 90. Two causes dominate. Total blocking time is script work (React, the island, the preview runtime). The simulated
  first and largest paints count every download that starts before the real paint. On a LOCAL server the home page's
  461 KB runtime prefetch started before the hero painted, and dropping it moved home from 56-61 to 66-76. On the real
  Cloudflare CDN, A/B against a preview with the same engine build, the change is NEUTRAL: home 73-80 with the prefetch and
  75-78 without, LCP identical, the hero's first slide within noise on Chromium and a little faster on WebKit. It ships as
  harmless, not as a win. Studio and Playground are held by module-preloaded JavaScript and need the boot-order redesign.
---

# Lighthouse: what holds each page below 90, and the home page's runtime prefetch

**Date:** 2026-10-26 · **Status:** home change shipped; Studio and Playground findings only
**Trigger:** followup 2868-p1: "Lighthouse reads 59 to 67 against a target of 90. Find what dominates and fix the largest,
safest cause."

## 1. How it was measured

- The production build (`sync:portal`, `sync:playground`, `astro build`, `inject-modulepreload.mjs`, the same steps as
  `scripts/perf-collect.mjs`) served by `scripts/serve-h2.mjs`, which speaks HTTP/2 with gzip like production. The repo's
  `npm run perf` uses `astro preview` (HTTP/1.1, no compression), which overstates request cost
  (2026-10-23-startup-bake-off.md E0), so it was not used for the numbers here.
- The Lighthouse CLI from `docs/node_modules` with the mobile profile from `docs/lighthouserc.mobile.cjs`: 390 x 844 at 2x,
  150 ms RTT, 1.6 Mbit/s, 4x CPU, simulated throttling. Only the performance category.
- Base and head served side by side on two ports, the runs alternating base, head, base, head, so machine load lands on
  both. Home five runs each, Studio and Playground three. One sandbox (4 vCPU Xeon @ 2.10 GHz).
- This is not the deployed site, which the followup's done-when names. Hosting (Brotli, caching) changes the network half.

## 2. What dominates, per page (base build)

Lighthouse simulates FCP and LCP from a dependency graph: every request and CPU task that started before the paint in the
real (unthrottled) trace is replayed on the slow profile. So a large download that merely STARTS early costs simulated
paint time, whatever its priority.

| Page | Score | FCP | LCP | TBT | What the paint waits on in the graph |
|---|---|---|---|---|---|
| home | 60-66 (first pass; 56-63 interleaved, §5) | 1.66-1.81 s | 4.73-4.88 s | 662-907 ms | 38 requests, 805 KB, of which the runtime prefetch is 461 KB |
| Studio | 48-55 | 3.77-4.14 s | 4.22-4.82 s | 754-1419 ms | 138 requests, 757 KB: the island and its module-preloaded chunks |
| Playground | 42-51 | 2.87-4.67 s | 5.57-5.72 s | 1050-1542 ms | 88 requests, 918 KB: the editor, island and engine chunks |

Total blocking time, by script (base, first run of each): Studio, React's `client` chunk 1594 ms of script, unattributable
1316 ms, `single-slide-render` 513 ms, the preview runtime 368 ms; Playground, the island 690 ms, `client` 752 ms, the
runtime 359 ms; home, unattributable 637 ms, the runtime 321 ms, `client` 308 ms. Main-thread work is script evaluation first
on every page (home 1.5 s, Playground 2.3 s, Studio 4.0 s).

On home the LCP element is the hero `h1`. It paints at 137 ms in the real trace, at the same moment as FCP, and its
simulated LCP is 87% render delay: the graph makes it wait for everything that started in those 137 ms.

## 3. The change: no runtime prefetch on the home page

`RuntimeWarm.astro` warms the preview runtime (`lattice-runtime.js`, 461 KB on the wire) for pages that render a slide on
load. It was on home (for the hero) and on every component page (for the specimen), as a static `<link rel="prefetch">` in
the head, so the browser started the download during HTML parse, beside the fonts and the render-blocking stylesheet.
Deleting the tag from the built home page moved LCP from 4.73-4.88 s to 2.63-2.79 s (first pass).

Three forms of the home page were then compared on the hero's first slide (`npm run perf:startup`, phone profile, HTTP/2,
interleaved, two batches of four loads, batch medians):

| Home page form | Hero first slide |
|---|---|
| static prefetch in the head (main) | 4.30 s, 4.31 s |
| prefetch appended on `load` (built first, not shipped) | 4.31 s, 4.44 s |
| **no prefetch (shipped)** | **4.08 s, 4.09 s** |

The hero asks for the runtime only after the engine (`lattice-playground.js`) has downloaded and rendered, and a prefetch
started any earlier shares the link with that download, so it delays the engine more than it saves on the runtime. The
deferred form was the first fix in this branch; the maker-checker pass flagged that its "the hero does not move" claim came
from the deletion variant, the measurement above refuted it, and it was replaced. The home page now has no `RuntimeWarm`, and
`RuntimeWarm.test.ts` pins that. The component pages keep it unchanged: their specimen was not measured in this pass.

## 4. Why Studio and Playground were not changed here

Their paint waits on the island's own module graph: `inject-modulepreload.mjs` puts 122 hints on the Studio and 49 on the
Playground. E7 of 2026-10-23-startup-bake-off.md measured every hint variant (none, low priority, end of body, CSS
inlined): the best reached 69-74 and each cost real first-slide time on a phone, which is the target that PR met. TBT rises
in every faster-FCP variant because Lighthouse counts blocking time from FCP onward. What is left is the script work itself
(React, hydration, the runtime), which is the boot-order redesign the owner ordered third on 2026-10-23, and it needs a
design note first. Nothing in this pass changes that conclusion.

## 5. Results

Interleaved, same machine, same session (§1). The ranges are min-max across runs. The first pass measured the deferred form
(not shipped); the final pass measured the shipped form against the same base build.

| Page | Build | Runs | Score | FCP | LCP | TBT |
|---|---|---|---|---|---|---|
| home | base | 5 | 56, 58, 60, 60, 61 | 1.67-1.81 s | 4.74-5.63 s | 774-1384 ms |
| home | **head (shipped: no prefetch)** | 5 | **66, 71, 74, 74, 76** | 1.36-1.89 s | **2.19-2.71 s** | 922-3472 ms |
| home | head (first pass: on `load`) | 5 | 66, 71, 73, 75, 76 | 1.66-1.92 s | 2.49-2.67 s | 941-2481 ms |
| Studio | base | 3 | 52, 56, 60 | 2.88-3.51 s | 3.49-4.83 s | 1136-1338 ms |
| Studio | head | 3 | 50, 53, 65 | 2.33-4.08 s | 2.92-4.83 s | 1083-1688 ms |
| Playground | base | 3 | 42, 44, 46 | 3.93-4.69 s | 5.58-5.73 s | 1133-1520 ms |
| Playground | head | 3 | 43, 43, 47 | 1.82-4.81 s | 5.57-5.74 s | 1224-3057 ms |

Hero first slide, the shipped form against base in the same final pass: 3.99 s and 4.12 s against 4.15 s and 4.27 s (batch
medians, four loads each).

Home's LCP ranges do not overlap: the change is the whole gap. Studio and Playground do not use `RuntimeWarm` and are
unchanged within their spread, as expected. TBT is the noisiest metric on this sandbox and is now home's largest remaining
weight. None of the three pages reaches 90. Screenshots of all three pages at 1440, 820 and 390 px are pixel-identical
between base and head.
**UNVERIFIED:** the deployed site, any real phone, and the component pages' specimen timing.

## 6. The deployed preview (Cloudflare Pages), head only

The PR's Cloudflare Pages preview of this branch (Brotli, a real CDN), the same Lighthouse profile, three runs each. There is no
deployed base to compare against: the `lattice-docs-5ji.pages.dev` production alias serves an older build (its Playground
still loads `lattice-playground.js`), so these are absolute numbers for the shipped form, not a before/after.

| Page | Score | FCP | LCP | TBT |
|---|---|---|---|---|
| home | 71, 75, 76 | 1.22-1.53 s | 1.90-2.21 s | 1060-1840 ms |
| Studio | 66, 68, 71 | 1.56-2.87 s | 2.16-3.32 s | 918-1613 ms |
| Playground | 37, 41, 44 | 2.71-4.75 s | **10.13-10.27 s** | 1013-1485 ms |

**The Playground's next lever, found here and not fixed:** its LCP element is the Explore walk caption
(`nav#pg-walk > p.pg-walk-caption`). It paints at 1.0-1.6 s in the real trace, after hydration, so the simulated LCP replays
every download and task before it and is 94% render delay (9.5 s). A caption present in the pre-paint HTML, or one that
is not the largest text in the first viewport, would move that number the way the hero `h1` moved home's. Recorded in
followup 2868-p1.

## 7. The real CDN contradicts the local win (added after the PR opened)

Base: PR #2907's Cloudflare preview (`claude/fix-g-webkit-pptx`), which carries the same engine and runtime build as this PR
(asset hash `82c143b5765c`) and still has the home prefetch; its own change is the Studio's PowerPoint export. Head: this
PR's preview. Both on Cloudflare Pages (Brotli), measured from this sandbox, interleaved.

| Measure | Base (prefetch) | Head (none) |
|---|---|---|
| Lighthouse home, 5 runs: score | 73, 77, 77, 78, 80 | 75, 77, 78, 78, 78 |
| LCP | 1.88-2.21 s | 1.88-2.18 s |
| Hero first slide, Chromium phone profile, 3 batches of 4, medians | 3.96, 3.78, 3.94 s | 4.08, 3.84, 3.97 s |
| Hero first slide, WebKit unthrottled, 2 batches of 4, medians | 2.97, 2.29 s | 2.23, 2.18 s |

**The §5 gain does not reproduce on the real host.** Served locally, every request returns at once, so the prefetch STARTED
before the hero's real paint and Lighthouse's simulation charged its 461 KB to the LCP. Over the CDN it starts later than
that paint and drops out of the LCP graph, so base and head score the same. Chromium's first slide reads about 70 ms
slower by mean of medians with fully overlapping ranges, and WebKit's reads faster: neither is a measured difference.

So the change is neutral for real visitors. It stays because it is harmless on every surface measured, removes a 461 KB
download a visitor who leaves before the hero renders never needed, and wins on the local profile; it is not a Lighthouse
improvement and must not be cited as one. This also means the deployed home page already scores 73-80, so the remaining gap
to 90 there is TBT, not LCP. The lesson for the next pass: measure Lighthouse candidates on a CDN preview before calling a
local win, because the simulation depends on when requests start in the real trace.

## 8. The Playground walk caption goes into the HTML (followup 2868-p1)

`playground.astro` now reads the default component's first caption from the same `galleryPlan` that stages `plans/<name>.json`
and passes it to the island as `bakeCaption`. The Walk bar renders it (`data-baked`) while no walk exists, so the server HTML
holds the text that used to arrive after hydration and the plan fetch. A visitor who is not the newcomer the bake was built
for (a remembered component, `?c=`, `?s=`, a hand-off, a slow connection, Edit first) must not see another slide's words, so
the head script marks `data-pg-newcomer` only in the branch that starts the bake, and `playground.css` hides `[data-baked]`
without it (`visibility: hidden`, so the box holds its height and a hidden element is not an LCP candidate). Checked in
Chromium with a remembered `kpi` and a 3 s plan delay: the baked caption is hidden, then replaced by the KPI caption.

**What the sandbox can and cannot show.** On the local HTTP/2 server, five runs each, base and head alternating: the LCP element
is still the caption and LCP equals FCP (5.4-5.7 s base, 5.4 s head; one head run scored 51 with FCP 2.5 s). Locally the caption was
only 0.9 s behind FCP already, so the 10 s gap in §6 does not exist here: §7's warning applies, and the CDN decides.

**On the CDN (Cloudflare Pages, Brotli), five runs each, interleaved.** Base is PR #2907's preview (`claude/fix-g-webkit-pptx`, which
has the same engine and no baked caption); head is this PR's preview. `/playground/`, the §1 mobile profile, from this sandbox.

| Build | Score | FCP | LCP | TBT |
|---|---|---|---|---|
| base | 41, 42, 40, 42, 42 | 2.6-4.5 s | 7.5, 8.3, 10.0, 7.5, 10.3 s | 940-2200 ms |
| head | 44, 47, 55, 57, 55 | 3.0-4.6 s | 5.7, 5.1, 3.8, 3.6, 4.2 s | 990-1430 ms |

Median LCP 8.3 s to 4.2 s, median score 42 to 55. The followup's bar was Playground LCP under 4 s: **NOT met** (2 of 5 runs
under 4 s, median 4.2 s). The caption now paints with the page, so what is left is FCP itself (3.0-4.6 s, bimodal on both builds),
and the Playground's TBT (1.0-1.4 s, §9). The LCP element is still the caption, which is correct: it is real content in the HTML.

## 9. Boot-order redesign for TBT: design and the question for the owner (followup 2868-p1, next item 3)

**Why TBT.** On the CDN preview the Playground's metric scores are FCP 0.14-0.39, LCP 0.16-0.56, TBT 0.15-0.22; CLS and speed index
are already 1.0 and 0.7-0.8. TBT carries 30% of the score. Studio is the same shape (TBT 1,435-1,731 ms, score 0.13).

**Where the blocking time is.** Lighthouse's long-task list, head build, local HTTP/2, 3 runs, averaged (blocking = duration over 50 ms):

| Script | Studio | Playground |
|---|---|---|
| React `client` chunk (render and commit) | 1,061 ms | 609 ms |
| the island (`StudioIsland` / `PlaygroundIsland`) | 51 ms | 1,509 ms |
| unattributable (parse, style, layout, GC) | 939 ms | 819 ms |
| `lattice-runtime.js` (the frame) | 406 ms | 470 ms |
| `single-slide-render` | 96 ms | not in the top 8 |

The `PlaygroundIsland` row hides one task. A CDP profile of `/playground/` on the phone profile (4x CPU, 250 us samples), split
at idle gaps, shows the heaviest tasks by what runs inside them:

| Task (4x CPU) | What is in it |
|---|---|
| 1,141 ms | the first render: `theme-fetch` to `engine.render`; `cssFor` composition is 319 ms of it (P3, §10) |
| 669 ms | the frame evaluating `lattice-runtime.js` |
| 575 ms | the editor's lint source loading the 279 KB lint core (`esm/lint.js`) and linting the draft, while the editor is hidden in Explore |
| 533 ms | the runtime's chart builders and layout in the frame |
| 472 + 441 ms | React commits |

**Candidate levers**, each with what it buys. Only A was measured end to end; the rest are sized from the profile.

| | Lever | Measured or sized | Cost and risk |
|---|---|---|---|
| A | Do not load or run the lint while the editor is hidden (Explore, a phone's preview pane); lint when it appears (`forceLinting` on show) | **Measured**: Playground TBT 1,870-1,990 ms to 1,620-1,790 ms (4 runs each, local, interleaved), score +0 to +3 | One condition in `src/playground/editor.js` and one re-lint trigger; the Studio editor already has the same hidden-pane gate (`useFirstSlideShown`). Edit-first visitors are unchanged |
| B | Skip the first `cssFor` composition (P3, §10) | sized: 319 ms of a 1,141 ms task at 4x | Changes what the engine ships; touches the CSP scan |
| C | Chart builders out of the preview runtime | sized: 0.2 s of first slide (2026-10-23 §3); about half of the 533 ms task | Export bytes stay identical only if the split output is docs-only; otherwise export sign-off |
| D | Time-slice hydration: `React.lazy` + `Suspense` around the toolbar sheets, the map, the editor host, so each hydrates in its own task | unmeasured; the 441-472 ms commits are the target | Touches every load of both apps; needs the trio |

**What this does not do.** A, B and C together are about 1.3 s of the 4x long-task time, out of about 4.3 s. Lighthouse wants TBT
near 200-300 ms for a 90 on this metric. Boot-order changes alone do not get there; the remaining work is the React tree
itself (D) and a first paint that does not need React. So the honest forecast for 90 is "not from this list".

**Recommendation.** Take A now (small, reversible, measured), D as a measured spike before any commitment, and treat B and C as
separate decisions. **Default if no one answers: A only, built in the next session; D spiked, not shipped.** A is NOT built in
this PR: followup 2868-p1 requires a design note and one owner question round first, and A changes every Playground load.

## 10. First-render stylesheet composition (followup 2794-p7)

Re-measured here with a profile instead of a harness. `composeCss` in Node, one cold call: 86-89 ms at 1x on the 1,013 KB
`dist/lattice-min.css` plus `cuoio.css`; a second call costs the same (no warm-up gain), so the cost is the work, not the JIT.
`packTheme` is 140 of 189 ms across the two calls in the CPU profile, `isPaginationTarget` and `packSelector` most of the rest.
In the Playground the same call shows as `cssFor` 319 ms inclusive at 4x on one profiled load, against the followup's 104 ms for the
composition alone; I did not find which of the two differs (profiler overhead is the likeliest), so treat the range as 100-320 ms.

Why a faster `packTheme` does not fix the first render: the base is one rule stream and the theme another, so packing them
apart and memoizing the base pack would speed every LATER palette change (about 70 of 88 ms) but not the first one. Only a build-time
answer removes the first cost, and a build-time answer has one safe shape: ship the packed base for our own sheet and trust it
only when the registered base text is byte-equal to the one the build packed. A hash key is a CSP bypass on collision (HARD RULE #22),
and an extra 560 KB download (not measured compressed) is likely to cost more on the Lighthouse link than the 70 ms it saves, so the packed base must REPLACE the raw
base for the Playground, not sit beside it. That changes the engine's input contract, and every consumer of `lattice-min.css`
(export to Marp, the CLI) keeps the raw one. So it is a design decision, not a slice: **not built.** Default if no one answers: not built.

## 11. Lever A built: no lint while the Playground editor is hidden (followup 2913-p1)

`lintSource` in `docs/src/playground/editor.js` now returns no findings while the editor has no layout. Explore and a phone's
preview pane hide the editor with `display: none`, and a box with no layout has no client rects, so that one check covers
both. It also arms a `ResizeObserver` on the editor. When the pane gets a size, the observer dispatches the effect the
linter's `needsRefresh` already reads for plugin-default changes, so the lint runs the moment the editor shows, with no
edit. The lint core (`esm/lint.js`) is therefore not fetched at all on an Explore load. An Edit-first load lints as before.

`docs/e2e/playground-lint-hidden.spec.ts` pins three things at desktop and phone width: an Explore load fetches no lint
core and the switch to Edit does; an Edit-first load underlines a stray component; and an editor hidden before first paint
lints with no edit once it shows. With the gate reverted, the first and third fail on "the lint core loaded while the
editor was hidden", so the spec can fail.

**On the CDN (Cloudflare Pages, Brotli), five runs each, interleaved.** Base is PR #2913's last preview (`2c46a003`, commit
`3bfedbe`, the same tree as `main` at `34b07aa`). Head is this change's preview (`414dae84`, `f867717`). `/playground/`, the
§1 mobile profile, from this sandbox.

| Build | Score | FCP | LCP | TBT | `esm/lint.js` fetched |
|---|---|---|---|---|---|
| base | 46, 44, 41, 46, 45 | 3.18-3.56 s | 5.11-6.33 s | 1630, 1817, 1786, 1566, 1686 ms | every run (95 KB Brotli) |
| head | 43, 45, 45, 47, 46 | 3.15-3.40 s | 5.10-6.00 s | 1528, 1385, 1562, 1532, 1628 ms | never |

Median TBT 1,686 ms to 1,532 ms (−154 ms), close to the −190 ms the throwaway build measured locally. Four of the five
head runs are below every base run. The median score is 45 on both builds, so this lever alone does not move the Playground
toward its bar of 60. It removes one long task and a 95 KB download that nobody in Explore needed.

## 12. Lever D measured: time-sliced hydration is a no-go; the picker's search index ships instead (followup 2913-p2)

**The prototype.** `<React.Suspense fallback={null}>` around three server-rendered subtrees of `PlaygroundApp` whose refs
the parent's mount effects never read: the toolbar (`.pg-bar`), the `WalkBar` and the `EditorHost`. With a boundary in the
server HTML, React can commit the shell first and hydrate each boundary as a later unit of work. The preview pane and the
chart layer were left alone, because the parent's effects read their refs on mount.

**Result, local HTTP/2 (§1), three Lighthouse runs each, interleaved:** TBT 1,138-1,315 ms without the boundaries and
1,213-1,388 ms with them. The first React task was 323-404 ms on both builds. **No gain.** The prototype also changed the
server HTML: React 19 outlines a large boundary (the toolbar) into a `<!--$?-->` placeholder plus a hidden segment that an
inline `$RC` script swaps in at the end of the document. That is a first-paint and CSP question the gain would have had
to pay for, and there is no gain.

**Why, from a CPU profile of an unminified build** (phone profile, 4x CPU, 250 µs samples). The React task that the
earlier tables called "commits" is 748 ms, and it is not many small pieces that a boundary could separate:

| Inside the 748 ms task | ms (4x) |
|---|---|
| render: `ComponentPicker`'s `useMemo(makeSearchIndex)` (Fuse + BM25 index of the catalog) | 160-171 |
| passive effects: `EditorHost`'s mount effect, `createEditor` (CodeMirror `EditorView` 108 ms of it) | 171 |
| the rest of `PlaygroundApp`'s render and commit | about 400 |

Each of the two large pieces is one call inside one component, and no boundary splits a single call. So the lever is
deferral, not slicing.

**What shipped: the search index waits for a query.** `rankedFor` reads the index only when the box holds two or more
characters, so `ComponentPicker` now builds it on the first such query (a memoized getter) instead of during render.
Most visitors never search. A first search pays the build once, about 40 ms at 1x. `ComponentPicker.index.test.tsx`
pins it: with the old memo restored, its first arm fails.

Measured with the page's own `longtask` entries (local HTTP/2, phone viewport, 4x CPU, 10 s after navigation, five runs
each, interleaved), the sum of each task's time over 50 ms:

| Build | Blocking time, five runs | Median |
|---|---|---|
| lint gate only (§11) | 2585, 2561, 2650, 2429, 2646 ms | 2,585 ms |
| plus the lazy index | 2405, 2626, 2340, 2323, 2626 ms | 2,405 ms |

About 180 ms less by median, in line with the profile's 160-171 ms, with overlapping ranges. Lighthouse's simulated TBT on
the same pair was too noisy to show a change of that size (1,235-1,482 ms against 1,083-1,640 ms, four runs each).

**On the CDN it does not show.** Five Lighthouse runs each, interleaved, `/playground/`, the §1 profile: the lint-gate
preview (`414dae84`) read TBT 1402, 1671, 1569, 1484, 1350 ms (median 1,484) and the lazy-index preview (`f9f79ae2`) read 1206,
1735, 1434, 1669, 2714 ms (median 1,669, one outlier). That is noise around a change worth about 45 ms of real CPU, not a
regression and not a win: the simulated metric cannot resolve it. The evidence for this change is the profile and the
long-task table above, not Lighthouse.

**Not done, recorded as followup 2921-p1:** deferring `createEditor` while the editor is hidden in Explore (the other
171 ms). It is the larger change. The tour, the Explore-to-Edit switch and the seeded draft all read the editor, so it
needs its own design pass.

## 13. The editor mounts when it is shown, and its chunk loads then (followup 2921-p1)

`EditorHost` used to call `createEditor` in its mount effect on every load. On an Explore load the editor is
`display: none`, and §12's profile put that call at 171 ms of the hydration task. Two changes, in order, with what each
measured:

**1. Defer the call (a string-backed adapter).** Until the editor has a size, `EditorHost` hands the controller an adapter
that holds the text as a string. `getValue` and `setValue` work on it, so the draft restore and the first render run as
before. The caret and slide band that the focus sync sets in the meantime are kept and replayed on the view when it is
built. The view is built when the host gets a size (a `ResizeObserver`: the switch to Edit, an Edit load), when something
asks to focus it, or on an idle moment after the first sign of a reader (`pointerdown`, `keydown`, `touchstart`,
`pointermove`), so the switch to Edit is not the first time CodeMirror starts.

Measured on the production build over local HTTP/2, phone viewport, 4x CPU, ten seconds after navigation, eight runs each,
interleaved: blocking time (the sum of each long task's time over 50 ms) 2,243 ms against 2,216 ms by median, main-thread
task time 4,340 against 4,301, script time 1,915 against 1,837. **No gain beyond the run-to-run spread** (base 2,048-2,615,
head 2,055-2,394). The call was not where the cost was: `EditorHost` still imports `editor.js` statically, so the
CodeMirror modules still downloaded, parsed and evaluated in the page's first task.

**2. Load the chunk when the view is built.** `editor.js` is now a dynamic `import()` inside the mount path, so a page that
never shows the editor never fetches or evaluates CodeMirror. Same method, eight runs each, interleaved:

| Build | Blocking time, median (range) | Task time, median | Script time, median |
|---|---|---|---|
| base (`992664b`) | 2,335 ms (2,175-2,793) | 4,436 ms | 1,912 ms |
| head (dynamic import) | 2,007 ms (1,792-2,293) | 4,053 ms | 1,554 ms |

About 330 ms less blocking time, 380 ms less main-thread time, and every head run is below the base median. No `.cm-editor`
exists on the head page ten seconds after load; on the base page one does.

**On the CDN (Cloudflare Pages, Brotli), five runs each, interleaved.** `/playground/`, the §1 mobile profile, from this
sandbox. Base is #2921's last preview (`f9f79ae2`, the lazy-index build, built from the same engine as `main` at `992664b`;
that equivalence was not checked byte for byte). Head is this change's preview (`73e3506e`, `9c84259`).

| Build | Score | FCP | LCP | TBT |
|---|---|---|---|---|
| base | 36, 42, 46, 43, 34 (median 42) | 2.87-7.64 s | 4.82-10.19 s (median 6.03) | 4208, 2176, 2233, 2147, 1128 ms (median 2,176) |
| head | 56, 60, 60, 57, 56 (median 57) | 2.24-2.42 s | 3.33-3.78 s (median 3.62) | 2439, 2048, 1876, 1885, 2745 ms (median 2,048) |

Median score 42 to 57 and median LCP 6.0 s to 3.6 s; every head score is above every base score. TBT alone is inside the
noise (the base runs span 1,128-4,208 ms). The Playground's bar is 60: head reached it on two of five runs. These base
scores read lower than §11's (44-46) and vary widely, so compare the two columns with each other and not with §11; the
sandbox load and the Lighthouse flags were not the same. The simulated metric moved through FCP and LCP, which is what
dropping 263 KB of eager JavaScript (616.7 to 353.7 KB gzipped, `check:route-budget`) would move, and not through TBT.

**The cost, and how it was removed.** Loading the chunk on demand first made an Edit-first load show the editor later:
1,358 ms against 1,567 ms by median (six runs each, 4x CPU, local HTTP/2, time from navigation to `.cm-content`; +209 ms),
because the fetch started only after hydration. An Edit load (the pre-paint seed's `data-pg-view="edit"`) now starts the
`import()` when `EditorHost`'s module evaluates, in parallel with hydration, and an Explore load still fetches nothing.
Measured again on a fresh production build, six runs each: 1,961 ms (base) against 1,969 ms, so Edit-first is back to parity.
The Explore win held with the prefetch in: blocking time 4,088 ms against 3,561 ms by median, every head run below every base
run (that sandbox was slower than the first measurement, so the absolute numbers are higher). The text paints from the
server-rendered placeholder throughout, and the placeholder is now hidden in the DOM the moment the view is built; before, the
state update that removed it could wait behind hydration for most of a second with its text over the editor's.

**A defect this exposed, fixed here (HARD RULE #18).** `playground-focus-sync.spec.ts` "the next key in the editor brings the
preview and the band back to the caret" failed on the dynamic build and passed on the first. It had been passing by
accident: an editor created before it is measured renders every line of a short deck (92 `.cm-line` elements on the test's 8-slide deck),
so the caret on line 1 was always in the rendered range. CodeMirror measured earlier renders about 71 lines, line 1 falls out
once the preview scroll carries the editor to slide 6, and CodeMirror's own ArrowDown steps from the viewport instead of the
caret: line 1 went to line 23. The same jump happens on the synchronous build with a 16-slide deck (line 1 to line 111).
`editor.js` now steps by the document's lines from the caret when the caret is outside `view.viewport`, and leaves
CodeMirror's visual-line stepping alone when it is drawn. `playground-editor-deferred.spec.ts` pins it on a 40-slide deck:
without the handler it lands on line 161, with it on line 2.

`docs/e2e/playground-editor-deferred.spec.ts` also pins the deferral: an Explore load builds no editor and the switch to
Edit builds one that types and saves; a pointer move builds it ahead of the switch with Explore still showing; an
Edit-first load builds it at once. `playground-lint-hidden.spec.ts` "showing a hidden editor lints it with no edit" now
moves the pointer first, because an editor hidden from the start is built only once a reader shows up.
