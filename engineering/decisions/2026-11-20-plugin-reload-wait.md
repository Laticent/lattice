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

**First paint** — TIMING_PENDING

**iOS Simulator** — IOS_PENDING

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
