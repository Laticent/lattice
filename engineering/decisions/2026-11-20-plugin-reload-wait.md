---
status: proposed
summary: What the Studio shows for an approved plugin's block while a reload waits for the plugin code — four arms (hold the preview, a sized box, a chart-shaped skeleton, an afterimage of the last drawing) built and measured on Chromium, WebKit, Gecko and the iOS Simulator. Recommends the afterimage with the skeleton as its fallback; the owner picks.
---

# What a plugin block shows while a reload waits for its code

**Asked (2026-11-20).** #3292 left one moment open (`followups.d/3292-p1-plugin-reload-code-block.md`):
after a reload, an approved plugin's block first shows as its fence source, then unstyled, then
drawn. The owner asked for both fixes the follow-up named, plus a third: a placeholder made for
plugin blocks, distinct from the slide and image placeholders, and "inspired by charts and
diagrams". Then a fourth, from the slide map's wireframes: a placeholder that looks like the real
thing. All four were built behind one switch and measured. This note records the numbers and
recommends one. **Nothing here ships until the owner picks.**

## Why the moment exists

A reload has three windows before a plugin draws. In each one the engine renders the fence as a
code block (`<pre class="lat-code">`), because nothing on the page knows the fence belongs to a plugin yet:

1. The Studio reads the Library from IndexedDB (`listStudioPlugins`).
2. The door chunk loads (`code-packages/door.ts`, lazy) and `setPlugins` runs.
3. The code-package stamp commits and the plugin's sheet joins the preview.

## The four arms

All four live in `docs/src/lib/code-packages/wait.ts`, switched by `localStorage['lattice-d1-arm']`
(`off` | `a` | `b` | `c` | `cplus`). `off` is today's main.

| Arm | What the reader sees | How |
|---|---|---|
| **A — hold** | the old preview stays hidden until the plugin can draw (3 s cap) | `StudioShell.tsx` keeps the preview `invisible` while `holdsPreview` says a listed plugin is not ready |
| **B — box** | a quiet box the size of the block's slot | `withWaits` swaps the fence for a sized `div` before the eager render, from a registry the door writes (`lattice-plugin-waits`) |
| **C — skeleton** | a muted bar-chart outline in the same box | as B, drawn as bars |
| **C+ — afterimage** | the block's own last drawing, as gray shapes and text bars | `capture` records the drawn block's boxes after each paint (`lattice-plugin-afterimages`, keyed by plugin and body); a reload draws them. No afterimage yet: falls back to C |

Every arm keeps the coda (the `.cell-coda` key-insight band) where it lands: the stage absorbs the
slack, so the coda never moves in any arm (measured below).

## How it was measured

`docs/scripts/bench/plugin-wait-bench.mjs` imports a small bar-chart plugin (`bench-bars`) through
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

## Recommendation

**C+, with C as its fallback.** It is the only arm that shows the reader something at once, never
shows a wrong frame, and never moves the block. A matches it on correctness and stillness but
shows nothing where the slide should be (see first paint). C+ costs about 0.8 KB over the route's
headroom, which is the decision below.

## The decision this needs

1. **Which arm ships** — A, B, C or C+.
2. **For B, C or C+: raise the Studio route ceiling by about 1 KB, or trim to fit** (move the
   capture into the door chunk, so it costs nothing eager).

Once picked, the losing arms and the switch come out, the chosen one gets an e2e test (the
watcher, as a failing arm against `off`), and the follow-up closes.
