---
status: shipped
summary: What the Studio shows for an approved plugin's block while a reload waits for the plugin code — four arms (hold the preview, a sized box, a chart-shaped skeleton, an afterimage of the last drawing) built and measured on Chromium, WebKit, Gecko and the iOS Simulator. The owner picked the afterimage (C+), with the skeleton as its fallback; it shipped in #3337.
---

# What a plugin block shows while a reload waits for its code

**Asked (2026-11-20).** #3292 left one moment open (`followups.d/3292-p1-plugin-reload-code-block.md`):
after a reload, an approved plugin's block first shows as its fence source, then unstyled, then
drawn. The owner asked for both fixes the follow-up named, plus a third: a placeholder made for
plugin blocks, distinct from the slide and image placeholders, and "inspired by charts and
diagrams". Then a fourth, from the slide map's wireframes: a placeholder that looks like the real
thing. All four were built behind one switch and measured. This note records the numbers, the
scores, and the pick.

**Decided (2026-11-21).** The owner picked **C+**. A, B and the switch were removed; C's skeleton
stays as C+'s fallback. See [What shipped](#what-shipped).

## Why the moment exists

A reload has three windows before a plugin draws. In each one the engine renders the fence as a
code block (`<pre class="lat-code">`), because nothing on the page knows the fence belongs to a plugin yet:

1. The Studio reads the Library from IndexedDB (`listStudioPlugins`).
2. The door chunk loads (`code-packages/door.ts`, lazy) and `setPlugins` runs.
3. The code-package stamp commits and the plugin's sheet joins the preview.

## The four arms

All four were built in `docs/src/lib/code-packages/wait.ts`, switched by `localStorage['lattice-d1-arm']`
(`off` | `a` | `b` | `c` | `cplus`); `off` was main. The arms, the switch and the benchmark harness
are in the tree at commit `d95b712` (#3337's head before the pick) and removed after it.

| Arm | What the reader sees | How |
|---|---|---|
| **A — hold** | the old preview stays hidden until the plugin can draw (3 s cap) | `StudioShell.tsx` keeps the preview `invisible` while `holdsPreview` says a listed plugin is not ready |
| **B — box** | a quiet box the size of the block's slot | `withWaits` swaps the fence for a sized `div` before the eager render, from a registry the door writes (`lattice-plugin-waits`) |
| **C — skeleton** | a muted bar-chart outline in the same box | as B, drawn as bars |
| **C+ — afterimage** | the block's own last drawing, as gray shapes and text bars | `capture` records the drawn block's boxes after each paint (`lattice-plugin-afterimages`, keyed by plugin and body); a reload draws them. No afterimage yet: falls back to C |

Every arm keeps the coda (the `.cell-coda` key-insight band) where it lands: the stage absorbs the
slack, so the coda never moves in any arm (measured below).

## How it was measured

`docs/scripts/bench/plugin-wait-bench.mjs` (at `d95b712`) imports a small bar-chart plugin (`bench-bars`) through
the real Library, writes a one-slide deck, approves it, then reloads the Studio. A watcher installed
before each load records every animation frame: whether the block is blank, the fence source, the
unstyled drawing, a placeholder, or drawn, plus the block's and the coda's position.

- **Wrong frame**: a frame showing the fence source or the unstyled drawing.
- **Block shift**: the most the block's box moved between its first visible frame and the drawn one.
- 40 reloads per arm per engine, 4 browser contexts at once, built docs site (`preview:e2e`).

## Results

**Correctness** — 40 reloads per arm, per engine:

| Engine | Arm | Runs with a wrong frame | Wrong frames per reload (mean) | Placeholder frames (mean) | Block shift (median) | Coda shift (max) |
|---|---|---|---|---|---|---|
| Chromium | off | 38 / 40 | 6.2 | 0 | 286 px | 0 |
| Chromium | A | 0 | 0 | 0 | 0 | 0 |
| Chromium | B | 0 | 0 | 28.9 | 126 px | 0 |
| Chromium | C | 0 | 0 | 6.4 | 126 px | 0 |
| Chromium | C+ | 0 | 0 | 6.2 | **0** | 0 |
| WebKit | off | 40 / 40 | 5.2 | 0 | 289 px | 0 |
| WebKit | A | 0 | 0 | 0 | 0 | 0 |
| WebKit | B | 0 | 0 | 5.5 | 124 px | 0 |
| WebKit | C | 0 | 0 | 5.2 | 124 px | 0 |
| WebKit | C+ | 0 | 0 | 5.1 | **0** | 0 |
| Gecko | off | 20 / 40 | 1.0 | 0 | 286 px | 0 |
| Gecko | A | 0 | 0 | 0 | 0 | 0 |
| Gecko | B | 0 | 0 | 0.7 | 0 (p90 126 px) | 0 |
| Gecko | C | 0 | 0 | 1.5 | 126 px | 0 |
| Gecko | C+ | 0 | 0 | 0.8 | **0** | 0 |

Every arm removes the wrong frames on every engine. B and C reserve the slot's size, not the
drawing's, so the block still jumps about 125 px when the chart arrives. Only A and C+ never move.

**First paint** — a second, low-load pass: one browser context, 10 reloads per arm, arms run one
after another. "First visible" is the first frame where the slide shows anything; "drawn" is the
first frame with the plugin's real drawing. Medians, in ms:

| Engine | off: visible / drawn | A | B | C | C+ |
|---|---|---|---|---|---|
| Chromium | 539 / 655 | 845 / 845 | 1001 / 1139 | 542 / 657 | 552 / 668 |
| WebKit | 1104 / 1252 | 1315 / 1315 | 1125 / 1283 | 1110 / 1228 | 1121 / 1255 |
| Gecko | 1166 / 1231 | 1327 / 1327 | 1304 / 1420 | 1384 / 1493 | 1964 / 2004 |

A holds the whole slide blank about 200–300 ms longer than today (Chromium +306 ms, WebKit
+211 ms): the reader waits for the drawing with nothing on screen. C and C+ show the slide as soon
as today does, and the drawing lands at the same moment. B's Chromium row and Gecko's later arms
are noise, not the arm: Gecko's C and C+ runs carry a 5–6 s tail in 3 of 10 reloads that none of
its earlier arms show (raw values in the bench output), and B's Chromium spread is 564–1682 ms. Gecko's
timings are not used to rank the arms; its correctness rows above are.

**iOS Simulator** — real Mobile Safari (Safari 26.5) in the iPad and iPhone iOS Simulators on a
GitHub macOS runner, 10 reloads per arm, via a throwaway dispatch of the platform suites
(run [44661218740](https://github.com/Laticent/lattice/actions/runs/44661218740), branch
`probe/d1-ios-bench`, not for main). The page records its own frames (`wait.ts` `benchRecorder`):

| Device | Arm | Runs with a wrong frame | Placeholder frames (mean) | Block shift (median) | Coda shift |
|---|---|---|---|---|---|
| iPad | off | 4 / 9 | 0 | 289 px | 0 |
| iPad | A | 0 / 10 | 0 | 0 | 0 |
| iPad | B | 0 / 10 | 2.0 | 124 px | 0 |
| iPad | C | 0 / 10 | 7.5 | 124 px | 0 |
| iPad | C+ | 0 / 10 | 2.4 | **0** | 0 |
| iPhone | off | 7 / 9 | 0 | 289 px | 0 |
| iPhone | A | 0 / 10 | 0 | 0 | 0 |
| iPhone | B | 0 / 10 | 2.2 | 124 px | 0 |
| iPhone | C | 0 / 10 | 1.8 | 124 px | 0 |
| iPhone | C+ | 0 / 10 | 2.3 | **0** | 0 |

The same pattern as the desktop engines: every arm removes the wrong frames, and only A and C+
never move the block. (`off` has 9 runs: one reload on each device recorded no drawn frame within
30 s and is left out.) The simulator runs on the runner's shared CPU and the arms ran one after
another, so its times (4–8 s to first paint) are not used to rank the arms.

**Bytes** on the Studio route (gzip level 6, the route budget's measure). The route has about
1.1 KB of headroom under its ceiling today:

| What | Eager bytes |
|---|---|
| A | 591 B |
| B as shipped | 1,450 B |
| C as shipped | 1,734 B |
| C+ as shipped | 1,870 B (the capture code, 1,294 B, could load lazily with the door) |

A fits the budget. B, C and C+ do not without a ceiling raise or a trim.

## Scores

Each arm scored 1–10 per criterion from the numbers above; the weights are a judgment call, so the
ranking is shown under a second weighting too.

| Criterion (weight) | off | A | B | C | C+ |
|---|---|---|---|---|---|
| No wrong frame (25%) | 1 | 10 | 10 | 10 | 10 |
| Nothing moves (20%) | 1 | 10 | 5 | 5 | 10 |
| Slide paints at once (20%) | 10 | 4 | 9 | 10 | 10 |
| What the wait tells the reader (10%) | 1 | 5 | 4 | 7 | 9 |
| Startup bytes (15%) | 10 | 9 | 5 | 4 | 3 as first built; 4 as shipped (1,558 B, measured) |
| Complexity and risk (10%) | 10 | 7 | 7 | 6 | 4 |
| **Weighted** | **5.1** | **7.9** | **7.2** | **7.4** | **8.3** as first built; **8.4** as shipped |

With bytes at 40% instead of 15%, A overtakes C+. The pick was made on an estimate of about 9.0 for C+ (580 B); the shipped measure is 8.4, still first at the stated weights.

## What shipped

**C+**, in two halves:

- `docs/src/lib/code-packages/wait.ts`, on the Studio's first load only: the registry of each
  plugin's fence (`lattice-plugin-waits`), `withWaits` (the deck with each listed plugin's block
  swapped for its wait before the eager render), `waitMarkup` (the afterimage, else the skeleton)
  and `waitKey`. `StudioShell.tsx` hands the three to `entry.ts` `setWaits`; the door chunks reach
  them through `getWaits`, so no other route and no door chunk carries them.
- `docs/src/lib/code-packages/wait-capture.ts`, loaded with the door: `rememberWaits` writes the
  registry, and each preview's `lattice-preview-painted` event (fired by `single-slide-render.ts`
  and `StudioShell.tsx` `onLivePreviewPaint`) hands its document to a recorder that measures each
  drawn block and stores its boxes as numbers (`lattice-plugin-afterimages`, 100 blocks, 150 boxes
  each). A Studio with no plugin never loads it.
- `door-run.ts` stamps each drawn block with `data-lattice-wait-key` and, in the stamp-less
  override, draws the block's wait instead of the engine's code block.

Every stored value is forced to a whole number (`n`) before it is written into the SVG, so nothing in
browser storage reaches a slide as markup (HARD RULE #22; `wait.test.ts` plants markup and fails
without the coercion).

**Bytes, measured against `main`** (both built here, `check-route-budget.mjs`): Studio +1,854 bytes
of startup JavaScript (`wait.ts` is about 1,740 of them), home +124, Playground +116, declared in
`docs/route-budget.d/3337-plugin-reload-afterimage.md`. The Studio stays under its ceiling with about
0.2 KB left. **The estimate behind the pick was wrong:** "about 580 B once the capture loads with the
door" subtracted the capture from a stub build, but the drawing code itself costs about 1.5 KB
wherever it lands, and the checker's fixes below added about 300 bytes. Compacting the SVG writer
saved 80 bytes. Re-scored with the measured bytes, C+'s bytes score is 4 rather than 8 and its
weighted score about 8.4, still first (A 7.9).

**Shared readers not reused, and why (HARD RULE #15).** `lib/core/deck-plugins.mjs` `deckPluginList`
and `lib/core/fence-languages.js` `scanFences` are the readers of record for the `plugins:` list and
for fences. Both ship in chunks the Studio loads lazily; importing them here measured +2.2 KB on the
first load, which the route cannot hold. `wait.ts` keeps a small copy of each rule (the last
`plugins:` key wins; every fence body is skipped, so a fence quoted in another code block is never
read as one), and `wait.test.ts` holds the plugins reader to `deckPluginList` case by case.

**What the checker found, and what changed** (maker-checker, one `checker` agent on the diff):

| Finding | Fix |
|---|---|
| An export taken before the door loaded printed the wait; the door-run key attribute reached Studio exports | Waits and their key apply to previews only (`codeStatus`, the door's `reporting`); `wait.test.ts` renders an export and a preview |
| A door that never loads, or an unreadable Library, left a stale registry and a skeleton for the page | `entry.ts` `setPlugins([])` clears the registry; a failed door load drops the waits |
| A plugin fence quoted inside another code block was rewritten | Every fence body is skipped |
| A fence in a list item broke the list, and its afterimage key never matched | The wait keeps the line's marker; the body is dedented as markdown-it does (tested against markdown-it's own token) |
| A fence under `>` was not found | Quote markers are read through |
| The `plugins:` reader disagreed with `deckPluginList` (scalar, comments, column-0 items, a repeated key) | A copy of its rules, held to it by a test |
| The recorder re-parsed the whole store on every mutation, in every preview, and thumbnails overwrote the live preview's afterimage | The live preview only; the store is kept in memory, written only when a drawing changed, least recently drawn evicted first |
| The e2e wait checks could pass without a wait ever painting | The reload step holds the door chunk until a wait frame is seen (a signal, not a timer), then requires it |

**The shipped code on iOS.** The iOS Simulator bench ran again on the shipped head (`0753277`, plus
only a per-frame recorder and the bench plugin, on the throwaway branch `probe/d1-ios-shipped`; run
[44972161874](https://github.com/Laticent/lattice/actions/runs/44972161874)), 30 reloads per device
in real Mobile Safari: iPad and iPhone each **0 of 30 reloads with a wrong frame, block shift 0 px,
coda shift 0 px**, the afterimage on screen for a mean of 1.0 (iPad) and 1.7 (iPhone) frames before
the drawing. Some reloads drew before any frame showed the wait, and a few recorded no drawn frame
before the recorder's 20 s cutoff on the shared runner; neither showed the source.

**Test.** `docs/e2e/plugin-slots.spec.ts` step 5 now also fails on any frame after a reload that
shows the plugin's fence as its source, on a reload where no frame shows the wait, on a wait that is
not the afterimage, and on a wait whose box differs from the drawing's by more than 2 px.
`wait.test.ts` covers the fence and front-matter cases, the export gate and the stored-value
coercion; each of its tests fails on the code the checker reviewed. The e2e failing arm and repeat
runs are in the PR body. The follow-up `3292-p1-plugin-reload-code-block` is closed by this change.
