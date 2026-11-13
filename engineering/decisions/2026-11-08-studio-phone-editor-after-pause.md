---
status: in-progress
summary: >
  Where mobile /studio/ spends its Lighthouse blocking time after LCP was fixed, and one lever tried and NOT shipped.
  Building a phone's hidden editor after the first slide plus a 3 s pause, instead of at the slide, took about 240 ms
  of React scripting out of Lighthouse's window, but the TBT change was inside the noise (-27 ms for the build that
  would ship), the work still ran later, an Edit tap 1.5 s after the slide got about 520 ms slower, and Coach's
  "Fix all" did nothing until the editor mounted. Reverted before merge. What is left: React hydration (~930 ms),
  the preview runtime (~305 ms) and unattributed work (~620 ms), ranked in §6.
---

# Mobile Studio: deferring the phone editor, measured and not shipped (2026-11-08)

Followup `2868-p1` asks for mobile Studio TBT and FCP to come down. After
`2026-11-08-docs-perf-nightly-diagnosis.md` brought LCP back to about 5.6 s, the
score sits near 0.41, and TBT is the biggest gap. This note records where the
blocking time goes, the one lever tried, what it measured, and why it was reverted before merge.

## 1. How it was measured

Lighthouse 12 through its Node API, with the exact `docs/lighthouserc.mobile.cjs` profile (390x844, 4x CPU, 150 ms
RTT, 1.6 Mbps, simulated throttling). Each build was served by the same static server with gzip (a script in the
session scratchpad, no HTTP/2), and the arms were alternated each round on one machine. `startup-bench.mjs` measured
the first slide on its phone profile against the same servers, also alternated. The base is `main` at `c9806d6`.

## 2. Where the time goes (base, 20 runs)

Lighthouse `bootup-time`, scripting per run, averaged:

| Script | Scripting |
|---|---|
| `client.*.js` (React DOM: hydrating and rendering the Studio) | 1,169 ms |
| Unattributable | 642 ms |
| `lattice-runtime.js` (the preview frame's runtime) | 336 ms |
| `single-slide-render.*.js` | 178 ms |

A CPU profile of one boot at 4x (Playwright, CDP sampling) puts the work in this order: React and the island
(0-2.5 s), the engine and the first slide (1-2.5 s), the runtime's evaluation in the preview frame (3 s, one task of
about 340 ms), then CodeMirror's modules, the editor view and the lint core (3.5 s, about 300 ms). On a phone the editor
pane is hidden at boot, so that last block bought nothing on screen. It used to start at the first slide, which is
also where Lighthouse is still recording.

**FCP is a simulation artifact more than a paint.** Unthrottled, the first paint happens at about 220 ms. Lighthouse's
simulated FCP (4-7 s here) counts every request that started before that paint, and about 145 had, most of them the
`modulepreload` hints `inject-modulepreload.mjs` writes. Dropping hints moves simulated FCP but was measured to make
the real first slide later (`2026-10-22-studio-startup-regression.md` §6, "Tried and measured"). This note does not
change it.

## 3. The lever tried: the phone editor mounts after a pause

`StudioShell.tsx` holds the editor on a phone only until the first slide. The trial held it until
`afterFirstSlideAndPause` fired (the first slide, then 3 s with no pointer or key input), the gate the panel warm-ups
use, with opening the edit pane still building it at once. A later revision added a 10 s cap after the first slide,
because every tap re-arms the pause. It was built, tested and reviewed (red team, inversion, checker), then reverted.

## 4. Measured

**Lighthouse, mobile /studio/, 20 runs per arm, alternated.** The treatment pools two builds that behave the same under
Lighthouse: the first one never mounted the phone editor, and the second mounts it after the pause, which no run
reached. Neither requested the Editor chunk in any of the 20 runs; base requested it in all 20.

| | base | head | Δ median | 95% interval (bootstrap) |
|---|---|---|---|---|
| TBT median | 977 ms | 865 ms | −112 ms | −339 to +91 ms |
| TBT range | 642–1,396 ms | 502–1,303 ms | | |
| Score median | 0.42 | 0.43 | +0.02 | −0.01 to +0.04 |
| React scripting (`client.*.js`), mean | 1,169 ms | 930 ms | −239 ms | |
| FCP median | 5,938 ms | 6,233 ms | +295 ms | −1,004 to +1,942 ms |

The second build alone (10 v 10) gave a TBT median of 1,004 -> 977 ms, and the first alone 898 -> 683 ms. On this
machine one arm's TBT varies by 700 ms between runs, so the TBT effect is not resolved. The scripting drop and the
missing Editor chunk say only that the work left Lighthouse's window: it still ran on every phone visit, later.

**First slide, `startup-bench.mjs` phone profile, 8 cold loads per arm, alternated:**

| | base | head |
|---|---|---|
| First slide, median | 4,910 ms | 4,919 ms |
| Visible, median | 6,172 ms | 6,098 ms |
| Requests at the slide | 214 | 201 |
| Main-thread busy before the slide | 2.86 s | 2.85 s |

**Tap Markdown source to a visible editor**, Playwright at 390 px, 4x CPU, 150 ms latency, 1.6 Mbps, 5 loads per arm,
alternated:

| Tap at | base, median | head, median |
|---|---|---|
| the first slide | 1,331 ms | 1,359 ms |
| 1.5 s after the first slide | 213 ms | 733 ms |

The red team measured the same shape at 1 s after the slide: 134-157 ms on base against 561-616 ms on head.

## 5. Why it was reverted

- **A dead control came back.** On a phone, Coach shows "Fix all" from the `issues` estimate before the editor reports
  lint counts, and the button calls `editorRef.current?.fixAll()`. With the editor not yet mounted, a tap did nothing
  and said nothing; the red team demonstrated it on a real build (the deck still had its fixable typo 5 s later). Tapping
  Coach is itself an input that re-arms the pause, so a Fix all tap within 3 s of opening Coach was always lost. The cap
  bounds that window; it does not close it.
- **The main action got slower.** An Edit tap 1.5 s after the slide went from about 0.2 s to 0.7 s.
- **The gain was not shown.** The build that would ship moved TBT by -27 ms, inside the noise. The owner decided on
  2026-10-26 that Lighthouse is not the Studio's bar; the first slide is, and it did not move.

Making it pay would take three things together: prefetch the Editor chunk graph at the first slide (network only),
queue editor actions such as Fix all until the editor mounts, and a TBT win that is resolved on a quieter machine or
on the nightly's runner. That is more than this lever is likely to return.

## 6. What is left, ranked by measured size

1. **React hydration, ~930 ms of scripting.** The shell renders one 8,700-line component. The profile shows the cost
   spread across React's reconciler, not in one component, so the next step is a React profiling build to find which
   subtrees mount before the slide and are not on screen on a phone (the strip, the dock, the craft panels).
   Done 2026-11-09: `2026-11-09-studio-react-mount-profile.md` has the ranked list.
2. **The preview runtime's evaluation, ~305 ms in one task.** `2026-10-23-studio-boot-order.md` §4 item 1 has the
   design: a docs-only runtime with the chart builders loaded on first use, leaving `lattice-runtime-min.js` (the one
   embedded in exports) byte-identical. Its default there was "not built", and it still needs that design note.
3. **Unattributable, ~620 ms.** Style, layout and parsing work Lighthouse cannot pin to a script. A real trace with
   the categories split would say whether it is the preview frame's layout or the shell's.

## Not measured

- The CI runner (Chrome 157).
- A real phone. The 4x CPU profile is a simulation.
- WebKit.
