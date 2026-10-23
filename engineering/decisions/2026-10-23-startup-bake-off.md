---
status: proposed
summary: >
  A bake-off of the candidate changes for the Studio's startup and edit latency, each measured on the same harness, the
  same machine and interleaved builds, to move the plan's confidence from medium toward high. Results: the PR's own
  gain holds (4.96 s to 4.35 s on the phone profile, no IQR overlap) and holds on WebKit, Firefox and a warm
  service-worker load. Three new candidates passed. Grouping the lucide icons into one chunk takes the first slide
  from 4.42 s to 4.09 s (09-22 build: 3.98 s) for +7 to +9 KB of eager JS on the Playground and home. A runtime that
  settles at once on a host-driven swap with no diagram pending takes a prose edit from 169 ms to 24 ms (229 to 100 ms
  at 4x CPU) with every diagram arm unchanged. Removing the Nacre loader's noise image takes the Studio's Lighthouse
  LCP from 13.7 s to 4.2-5.0 s and the score from 52 to 62-69. None of these is applied; each has a cost and a gate
  named below.
---

# Startup and edit-latency bake-off (2026-10-23)

Follows `2026-10-23-studio-boot-order.md`, whose plan was graded `medium` because every number was one engine, one cold
load, and several items were unmeasured. Each experiment below is a prototype in a scratch tree or a patched copy of
`dist/`; nothing here is in the PR's diff except this note and the bench's engine and warm-load switches.

**Method.** `docs/scripts/startup-bench.mjs` (phone profile: 4x CPU, 80 ms, 6 Mbit/s, cold profile) and
`diagram-flash-bench.mjs`, both on this machine, builds served side by side, rounds interleaved so drift hits every arm.
The medians come with the interquartile range and the spread, because a median alone hid that the builds differ by less
than the noise in the first draft of the plan.

## E1. Is the harness steady enough to gate on?

15 loads per build, five rounds of three, interleaved:

| Build | Median | IQR | stdev | Requests |
|---|---|---|---|---|
| 2026-09-22 `d07eb78` | 3.98 s | 3.96-4.04 | 143 ms | 111 |
| PR base `577e38c` | 4.96 s | 4.93-5.02 | 65 ms | 197 |
| PR head | 4.35 s | 4.31-4.38 | 57 ms | 185 |

The PR's gain is 0.61 s and the IQRs do not touch. A stdev near 60 ms means a CI check that builds main and the PR in the
same job and compares them would flag a 0.3 s regression with no false alarm on this machine. **Not shown:** shared CI
runners are noisier than this box; the check should compare against a same-job baseline, never an absolute number.

## E2. Does the gain hold off Chromium and on a warm load?

Unthrottled on WebKit and Firefox (their DevTools protocols do not throttle; compare builds on the same engine only), and
throttled Chromium with the service worker allowed on a second load. Base against head, 5 loads each, twice:

| Surface | Base | Head |
|---|---|---|
| WebKit, cold | 1.07 s, 0.97 s | 0.82 s, 0.84 s |
| Firefox, cold | 0.83 s, 0.74 s | 0.67 s, 0.71 s |
| Chromium phone profile, warm (service worker, second load) | 1.78 s, 1.68 s | 1.44 s, 1.54 s |

Same direction on every surface; no regression anywhere. The inversion review's concern that a warm cache could make the
change worse did not happen. **Still not shown:** a real phone, and Safari on iOS.

## E3. Settle sooner after a host-driven edit

The runtime waits 150 ms (`DEBOUNCE_MS`) after a mutation burst before its content pass. Prototype: when the host stamped
the swap (`data-lattice-swap`, set by `patchSlideBody` and `patchSections`) and no diagram fence is pending, run the pass
at once; otherwise keep 150 ms. Last DOM change after one prose keystroke, medians of 8:

| Debounce | Desktop | 4x CPU |
|---|---|---|
| 150 ms (today) | 169 ms | 229 ms |
| 80 ms, flat | 99 ms | |
| 40 ms, flat | 61 ms | |
| 0 ms, flat | 28 ms | |
| **0 ms only when the host stamped and no fence is pending** | **24 ms** | **100 ms** |

Why not a flat cut. A flat 0 to 80 ms makes one `mermaid.render` per keystroke: an eight-key burst went from 1 render to
8. That is the failure `2026-09-06-diagram-edit-holds-the-last.md` §5 already cut a second delay for. The gated rule keeps
every diagram arm identical to today:

| Arm (Studio, 5 runs) | Today | Gated rule |
|---|---|---|
| `edit`: blank / held / repaint | 0 / 12 / 197 ms | 0 / 12 / 199 ms |
| `edit-burst`: blank / held / renders | 0 / 67 / 1 | 0 / 67 / 1 |
| `edit-broken`: source frames / renders | 94 / 1 | 94 / 1 |
| `nav` cold: source frames / repaint / renders | 10 / 226 ms / 1 | 2 / 198 ms / 1 |
| main-thread time per prose key, 4x CPU | 82 ms | 82 ms |

**Built** (`lib/core/settle-delay.js`, called from the runtime's observer; its own commit, separable from the rest of the PR).
On the real built Studio, same build, old runtime against new, alternating, 4x CPU, three rounds: last DOM change after a
prose key **243-250 ms to 120-126 ms**; main-thread time per key equal (113-116 ms against 107-119 ms). At normal CPU 169 ms
to 28 ms. Diagram arms on the final build: `edit` 0 blank / 12 held / 199 ms / 1 render; `edit-burst` 0 / 69 / 1 render;
`edit-broken` 93 source frames / 1 render; `nav` cold 2 source frames (was 10) / 206 ms / 1 render; Playground `edit` 0 blank /
11 held, `edit-burst` 0 / 64 / 1 render.

Tests. The old pins ("one plain-debounce run, no second delay") are replaced by pins that say what is true now: the observer
asks `settleDelay(hostSwap, pendingFence, DEBOUNCE_MS)` with the live pending query read in the same guard as the stamp
(a first version read it outside the guard and 13 runtime tests failed on a harness whose window had closed), `scheduleRun`
defaults to the full debounce and waits the delay it was armed with, and the old latched-delay names stay banned.
`test/unit/core/settle-delay.test.js` is a six-row table of the situations the runtime meets. Root unit suite and the
runtime suite pass.

**Export evidence** (the demo deck of this PR's test deck, prose and two Mermaid diagrams, `indaco` and `indaco-dark`, built
by the base tree and by this tree): the PDF is byte-identical in both modes, the standard HTML export is byte-identical, the
`--player` export is byte-identical, and the `--fluid` HTML export differs only inside the embedded runtime script
(90 lines, all minified runtime code); its full-page render at 1440 px is pixel-identical in both modes. An export never
stamps a swap, so the new rule never fires there. **Gate:** the runtime file itself (`dist/lattice-runtime*.js`, the Marp
bundle, `--fluid` HTML) carries new bytes, so this is for the owner's sign-off.

## E4. Fewer requests before the island runs

Prototype: one `manualChunks` rule putting every lucide icon and `createLucideIcon` in one chunk (`docs/astro.config.mjs`,
`vite.build.rollupOptions.output`). Interleaved, 4 rounds of 5 loads per arm:

| Build | Median | IQR | Requests |
|---|---|---|---|
| PR head | 4.42 s | 4.39-4.64 | 186 |
| + one lucide chunk | **4.09 s** | 4.06-4.15 | **162** |
| 2026-09-22 | 3.98 s | | 111 |

That contradicts the October 22 audit's "grouping did not move the first slide". It is not a contradiction of the
measurement: the audit grouped when the main thread was the bottleneck; with the editor deferred, the thread is free sooner
and the request count shows. Cost, from the route-budget gate on the prototype build: the chunk is 15.6 KB gzipped and
loads on every route that uses any icon: Playground eager JS +7.4 KB, home +9.1 KB, Studio -0.5 KB. Both stay under their
ceilings (home keeps 8.9 KB of headroom). `experimentalMinChunkSize` (6,000 and 15,000) changed nothing in this build, so
the targeted rule is the working form. A Studio-only chunk was not possible with `manualChunks`: an icon's importers are the
shared barrel, so the rule cannot tell routes apart. **Gate:** none beyond the route-budget allowance file.

## E5. Chart builders out of the preview runtime

Not rebuilt here. The stub experiment's ceiling stands at 0.2 s and 580 KB (`2026-10-23-studio-boot-order.md` §3), and
E3's finding raises the stakes: any runtime change needs the owner's export sign-off, so the split and E3 should be one
sign-off round. Confidence stays `medium` until the sibling-script fallback is built and its failure path tested.

## E6. Lighthouse: what does the largest paint need?

The LCP element is the app's Nacre loader, whose `::after` paints a noise image (`nacre-loader.css`, a data-URI SVG as
`background-image`) over the whole preview box when React mounts. The simulated time is the island's mount time. Test: the
same built page with `.nacre-loader::after { background-image: none }` injected, three Lighthouse runs each, mobile:

| Page | Score | FCP | LCP | TBT | LCP element |
|---|---|---|---|---|---|
| as built | 51-55 | 4.0-4.3 s | **13.6-13.7 s** | 430-520 ms | the app's loader |
| noise image removed | **62-69** | 3.6-4.3 s | **4.2-5.0 s** | 340-470 ms | the pre-paint shell's title |

That confirms the cause and puts LCP back where 09-22 had it. **Applied** (`docs/src/styles/nacre-loader.css`): the grain is
now a 2 px black-and-white checker drawn with `repeating-conic-gradient` at 1.8% opacity; a gradient is not an LCP
candidate. It had to keep the grain's job, which is to dither the color ramps against banding on a large 8-bit panel, so
it was measured against the noise tile on the loader rendered at 1200 px, dark and light (longest run of identical pixels
along a row; mean color against no grain):

| Grain | Flat run, dark | Flat run, light | Mean color shift (of 255) |
|---|---|---|---|
| none | 19.5 px | 12.7 px | 0 |
| noise tile (before) | 7.6 px | 7.5 px | +1.3 / +0.9 / +0.6 dark; about 0 light |
| **checker at 1.8% (now)** | **2.6 px** | **2.9 px** | +1.1 / +0.5 / -0.1 dark; -0.8 / -1.2 / -1.8 light |
| checker at 1.2% | 8.5 px | 9.7 px | smaller, but dithers no better than the noise |

It dithers better than the noise and moves the average color by under 2 of 255. Side-by-side renders at 390, 820 and
1440 px in both modes (old left, new right) show no difference. On the real build, Lighthouse mobile, three runs: score
**59-67** (was 51-55), LCP **4.5-5.3 s** (was 13.6-13.7 s), the LCP element the pre-paint shell. `nacre-loader.test.ts`
fails if a `url()` image returns to the file. **Not shown:** banding on a real desktop panel; the measure is on pixels, not
on a display.

It does not reach 90. With LCP fixed the weighted audits read: FCP 3.6 s (score 33), LCP 4.2 s (45), TBT 380 ms (69), CLS 0
(100), speed index 3.6 s (87). Reaching 90 needs FCP near 1.8 s (the render-blocking `landing.css`, 35 KB, is 304 ms of it)
and TBT under 200 ms (React's 800 ms of script, the runtime's 278 ms long task, 1.9 s of unattributable work).

## Where confidence stands now

| Item | Before | After | What moved it |
|---|---|---|---|
| The PR's boot change | medium | **high** | E1 (no IQR overlap), E2 (three engines, warm load) |
| Time budget in CI | medium | **high** (as a same-job comparison) | E1 spread 60 ms |
| Settle sooner (E3) | low-medium | **medium-high** | prose -145 ms, every diagram arm unchanged, 3 tests to rewrite, export bytes change |
| Icon chunk (E4) | low | **high** for the Studio, medium overall | interleaved, disjoint IQRs; cost on two routes is known and in budget |
| Chart-builder split (E5) | medium | medium | not rebuilt |
| Lighthouse (E6) | low | LCP fixed and applied (score 51-55 to 59-67); 90 still needs FCP and TBT work | cause confirmed, fix measured on the real build |

Everything is still emulated Chromium, WebKit and Firefox on one machine. A real phone is the one thing that would take
any of these to `very high`.
