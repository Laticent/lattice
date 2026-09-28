---
origin: 2456
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2456
priority: P3
---

# The split seed's clamp sometimes misses the first frame

why now   — `playground-first-paint.spec.ts` "a share below a pane minimum … is clamped BEFORE
            paint" fails about 1 run in 25 on `main` as well as on #2456: the editor pane is first
            laid out at the raw share (883–884px at 1194) and snaps to the clamped 873px ~100ms
            later. Measured with a replay of the case (a 74/26 share, reload at 1194, CPU 6x):
            main 3 of 73 runs, #2456 6 of 156.
where     — the pre-paint split seed in `docs/src/pages/playground.astro` (the injected
            `@media … :root[data-pg-split-seed] .pg-split>#pg-split-preview{min-width}` rule), and
            the sampler in the spec. Two of main's three failures sampled the raw width before
            first-contentful-paint, so part of this may be the sampler counting a frame nobody saw.
done when — the replay shows 0 moves in 100 runs, or the sampler ignores pre-FCP frames and the
            remaining moves are gone.
evidence  — the replay script's run count and move count, before and after.
verify    — tier 2: `playground-first-paint.spec.ts --repeat-each=20` on desktop.
