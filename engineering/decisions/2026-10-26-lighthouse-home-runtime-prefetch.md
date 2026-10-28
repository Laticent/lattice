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

**On the CDN (Cloudflare Pages, Brotli), five runs each, interleaved.** `/playground/`, the §1 mobile profile, from this
sandbox. Base is #2921's last preview (`f9f79ae2`, the lazy-index build, built from the same engine as `main` at `992664b`;
that equivalence was not checked byte for byte). Head is this change's final preview (`be54231c`, `d467435`).

| Build | Score | FCP | LCP | TBT |
|---|---|---|---|---|
| base | 41, 41, 43, 39, 44 (median 41) | 3.06-3.39 s (median 3.19) | 5.14-6.17 s (median 5.85) | 2105, 2198, 2237, 2607, 2140 ms (median 2,198) |
| head | 60, 59, 57, 58, 57 (median 58) | 2.23-2.65 s (median 2.41) | 3.18-3.63 s (median 3.46) | 1970, 2173, 1974, 2045, 2136 ms (median 2,045) |

Median score 41 to 58, LCP 5.85 s to 3.46 s and FCP 3.19 s to 2.41 s; every head run is above every base run. TBT moved by
about 150 ms at the median, inside the base's own spread (2,105-2,607 ms). The Playground's bar is 60: one of five head runs
reached it. An earlier set at `9c84259` (base 34-46, median 42; head 56-60, median 57) agrees on the size of the gain, and its
base runs were noisier, so compare the two columns with each other and not with §11's 44-46. The simulated metric moved
through FCP and LCP, which is what dropping 263 KB of eager JavaScript (616.7 to 353.7 KB gzipped, `check:route-budget`)
would move, and not through TBT.

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
