---
origin: 2916
priority: P3
recorded: 2026-10-29
area: website
severity: low
swimlane: engineering/workflow.md
deferred: blocked — no slow device or throttled run here shows whether 2 s is too short, and the number is a latency tradeoff
source: https://github.com/Laticent/lattice/pull/2916
---

# The 2 s sheet-load timeout can let a slide body write before a slow phone parsed the sheet

why now   — #2916 makes the Studio frame wait for the new engine sheet (about 1.5 MB, shared
            across a pane deck) before it writes the slide body, so the table stops jumping.
            `swapSharedSheet` stops waiting after 2 s (`setTimeout(drop, 2000)`) so a frame
            torn down mid-swap cannot hold a render forever. On a phone that needs longer than
            2 s to parse the sheet, the body then writes under a half-parsed sheet and the old
            jump can come back. Before #2916 the jump happened on every swap, so this is no
            worse than before; the checker graded it a known limit, not a regression.
where     — `swapSharedSheet` in `docs/src/lib/single-slide-render.ts`.
done when — a measured sheet-parse time on a throttled or real slow device says what the timeout
            should be (for example, wait on `load` and fall back to the timer only when the
            document is gone), and the change keeps the 'settles after 2 s' test honest.
evidence  — CPU-throttled Playwright WebKit runs (4x and 6x) of `panes-probe.js`, or a real phone.
verify    — tier 2: the throttled probe run, light and dark.
