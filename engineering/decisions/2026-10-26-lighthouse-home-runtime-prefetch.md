---
status: shipped
summary: >
  Lighthouse mobile, reproduced on the built site over HTTP/2: Studio 48-55, Playground 42-51, home 60-66, against a target
  of 90. Two causes dominate. Total blocking time is script work (React, the island, the preview runtime). The simulated
  first and largest paints count every download that starts before the real paint. On home, the largest single such
  download was the 461 KB preview-runtime prefetch in the page head. Starting that prefetch on `load` moves home's LCP from
  4.7 s to 2.6 s and its score to 71-78, and the hero's first slide does not move. Studio and Playground are held by
  ~750-900 KB of module-preloaded JavaScript before the paint, which 2026-10-23-startup-bake-off.md E7 already measured
  and declined, so 90 there still needs the boot-order redesign.
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
| home | 60-66 | 1.66-1.81 s | 4.73-4.88 s | 662-907 ms | 38 requests, 805 KB, of which the runtime prefetch is 461 KB |
| Studio | 48-55 | 3.77-4.14 s | 4.22-4.82 s | 754-1419 ms | 138 requests, 757 KB: the island and its module-preloaded chunks |
| Playground | 42-51 | 2.87-4.67 s | 5.57-5.72 s | 1050-1542 ms | 88 requests, 918 KB: the editor, island and engine chunks |

Total blocking time, by script (base, first run of each): Studio, React's `client` chunk 1594 ms of script, unattributable
1316 ms, `single-slide-render` 513 ms, the preview runtime 368 ms; Playground, the island 690 ms, `client` 752 ms, the
runtime 359 ms; home, unattributable 637 ms, the runtime 321 ms, `client` 308 ms. Main-thread work is script evaluation first
on every page (home 1.5 s, Playground 2.3 s, Studio 4.0 s).

On home the LCP element is the hero `h1`. It paints at 137 ms in the real trace, at the same moment as FCP, and its
simulated LCP is 87% render delay: the graph makes it wait for everything that started in those 137 ms.

## 3. The change: the home page's runtime prefetch starts on `load`

`RuntimeWarm.astro` warms the preview runtime (`lattice-runtime.js`, 461 KB on the wire) for pages that render a slide on
load: home's hero and every component page's specimen. It was a static `<link rel="prefetch">` in the head, so the browser
started the download during HTML parse, beside the fonts and the render-blocking stylesheet. Variant measured first by
deleting the tag from the built home page: LCP 4.73-4.88 s to 2.63-2.79 s, score 60-66 to 71-78, FCP unchanged.

Removing it does not cost the hero anything measurable: the hero's first slide on the phone profile (`npm run
perf:startup`, HTTP/2, eight loads each, two interleaved batches) read 4.17-4.23 s median with the tag and 4.06-4.15 s
without. The hero asks for the runtime only after the engine has downloaded and rendered, seconds after `load`, so a
prefetch started at `load` still lands first. The shipped form keeps the warm and moves its start: an inline script appends
the same `<link rel="prefetch" as="script">` on `load` (at once if the page has already loaded). Same URL, same cache entry.

**Results, base against head:** see §5.

## 4. Why Studio and Playground were not changed here

Their paint waits on the island's own module graph: `inject-modulepreload.mjs` puts 122 hints on the Studio and 49 on the
Playground. E7 of 2026-10-23-startup-bake-off.md measured every hint variant (none, low priority, end of body, CSS
inlined): the best reached 69-74 and each cost real first-slide time on a phone, which is the target that PR met. TBT rises
in every faster-FCP variant because Lighthouse counts blocking time from FCP onward. What is left is the script work itself
(React, hydration, the runtime), which is the boot-order redesign the owner ordered third on 2026-10-23, and it needs a
design note first. Nothing in this pass changes that conclusion.

## 5. Results

(filled in from the interleaved runs)
