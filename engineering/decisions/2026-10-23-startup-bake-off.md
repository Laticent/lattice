---
status: shipped
summary: >
  A bake-off of the candidate changes for the Studio's startup and edit latency, each measured on the same harness, the
  same machine and interleaved builds. The PR's own gain holds (4.96 s to 4.35 s on the phone profile, no IQR overlap)
  and holds on WebKit, Firefox and a warm service-worker load. Two candidates passed and are applied: grouping the lucide
  icons into one chunk (first slide 4.42 s to 4.09 s against 3.98 s for the 09-22 build, for +7 to +9 KB of eager JS on
  four other routes) and drawing the Nacre loader's grain with a gradient (Lighthouse LCP 13.7 s to 4.5-5.3 s, score 51-55
  to 59-67). One candidate was built, reviewed and reverted: letting the runtime settle at once after a host-driven edit
  moved the last DOM change from 169-250 ms to 24-126 ms, but the 150 ms it skipped only rewrites same-value attributes
  and screenshots before and after are identical, so the gain was in the metric, not on the screen. The chart-builder
  split was not rebuilt. Lighthouse 90 still needs FCP and TBT work.
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

## E3. Settle sooner after a host-driven edit: measured, built, reviewed, then NOT shipped

The runtime waits 150 ms (`DEBOUNCE_MS`) after a mutation burst before its content pass. Prototype: run the pass at once when
the host stamped the swap (`data-lattice-swap`) and no diagram fence is pending. Last DOM change after one prose keystroke,
medians of 8:

| Debounce | Desktop | 4x CPU |
|---|---|---|
| 150 ms (today) | 169 ms | 229-250 ms |
| 80 / 40 / 0 ms, flat | 99 / 61 / 28 ms | |
| 0 ms only when the host stamped and no fence is pending | 24-28 ms | 100-126 ms |

A flat cut makes an eight-key diagram burst cost 8 renders instead of 1 (the failure
`2026-09-06-diagram-edit-holds-the-last.md` §5 cut a second delay for). The gated rule kept every diagram arm unchanged
(`edit` 0 blank / 12 held, `edit-burst` 1 render, `edit-broken` 1 render, `nav` cold 10 to 2 source frames), main-thread
time per key equal, and the PDF, standard HTML and `--player` exports byte-identical (`--fluid` HTML differs only inside
the embedded runtime and renders pixel-identically in both modes). It was built (`lib/core/settle-delay.js`, commit
`2c741c0`) with tests, and the full adversarial trio ran on it.

**It is reverted, because the gain is in the metric and not on the screen.** The inversion review asked what the last 125 ms
actually changes; the check it asked for settles it. On the built Studio, logging every mutation record after one prose
keystroke: the host's patch lands in the first 25-50 ms, and the debounced pass that the 150 ms waits for rewrites only
`data-form="2d"` and `data-frame="standard"`, to the values they already hold. Screenshots of the preview at +30 ms and at
+380 ms are **pixel-identical on the old runtime and on the new one**. So "last DOM change" moved earlier and nothing an
author can see moved with it. Against that, the commit carried a new kernel, rewrote two runtime test pins, put new bytes in
the runtime that `--fluid` exports and the Marp bundle embed, and (the inversion's lead finding) relied on a side effect to
keep diagrams safe: the plugin passes tag a fence `pending` only AFTER the observer reads whether one is pending, so the
check never saw a Mermaid edit, and diagrams kept their wait only because a second, unstamped burst re-armed the timer. A
fix was possible (read after the plugin passes, or ask each pass), and a leading-plus-trailing rule would bound burst cost,
but a change with no visible benefit does not earn that complexity or an export-bytes sign-off.

The red team, working from the built Studio, found three more reasons not to re-land it in this form. (1) The pending-fence half of the
gate never saw a Mermaid edit: the engine writes a fence with no settle attribute and the plugin tags it `pending` only
after the observer reads, so the gate returned 0 on every diagram keystroke, and the diagram arms stayed at one render
only because the plugin's own follow-up DOM write re-armed the 150 ms; had that write ever stopped, an eight-key burst would
cost eight renders and nothing would have said so. (2) An eight-key prose burst ran 8 content passes at 0 ms plus 1 to 3
at 150 ms, against 2 to 4 before, each 26-44 ms against 6-8 ms at 4x CPU; the "main-thread time per key" figure was true for a
single key and not for a burst. (3) On a state-chart slide the 0 ms pass never fired, since the chart's microtask draw wrote
to the DOM and re-armed 150 ms, so the gain depended on the slide. And one latent hazard: only the Mermaid plugin clears the
swap stamp, so a runtime build without it would read `hostSwap` as true forever.

What this leaves true, and recorded so the next person does not redo it: the 150 ms is not a latency an author feels on a
prose edit; on a diagram edit the wait is the coalescing and the repaint (about 200 ms) is dominated by the diagram's own
render, which this change did not touch. A metric that counts the last attribute write is the wrong instrument for edit
latency; a screenshot series (as above) or the flash bench's repaint time is the right one.

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
| Settle sooner (E3) | low-medium | **dropped** | built and reviewed; the last 125 ms changes nothing visible (identical screenshots at +30 and +380 ms), so it is not worth a runtime-bytes change |
| Icon chunk (E4) | low | **high** for the Studio, medium overall | interleaved, disjoint IQRs; cost on two routes is known and in budget |
| Chart-builder split (E5) | medium | medium | not rebuilt |
| Lighthouse (E6) | low | LCP fixed and applied (score 51-55 to 59-67); 90 still needs FCP and TBT work | cause confirmed, fix measured on the real build |

Everything is still emulated Chromium, WebKit and Firefox on one machine. A real phone is the one thing that would take
any of these to `very high`.
