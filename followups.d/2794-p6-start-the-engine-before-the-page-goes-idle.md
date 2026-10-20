---
origin: 2794
priority: P6
recorded: 2026-10-20
area: website
severity: medium
swimlane: docs/src/components/playground/PlaygroundApp.tsx
source: https://github.com/Laticent/lattice/pull/2794
---

# Start the Playground's engine download before the page goes idle, and slim the 1.18 MB runtime it waits behind

On a cold load the engine bundle is first requested at about 635 ms (loopback), 2.0 s on cable and 6.5 s on 4g, because
`PlaygroundApp.tsx` starts it from `requestIdleCallback` and the page's own scripts, led by the 1.18 MB (411 KB gzipped)
`lattice-runtime.js`, go first. The engine (309 KB gz) cannot start rendering until it arrives. Measured in the decision
note §11 ("Where the first slide's time goes"); the style loader's whole saving is about 5% of what the first slide waits for.

why now   — the biggest measured lever on first-slide time on slow links, and nothing in the style loader touches it.
where     — docs/src/components/playground/PlaygroundApp.tsx (the `requestIdleCallback(start)` effect), docs/src/pages/playground.astro (the runtime request), lib/runtime (what the 1.18 MB holds).
done when — the engine request starts within 100 ms of navigation on cable throttle (it starts at 2047 ms today), measured with `docs/scripts/style-loader-bench.mjs`-style resource timing, and the first styled slide on cable is at least 10% earlier than today's 4229 ms on `focus.md`, with no regression in the chrome's first paint.
evidence  — resource timing before and after on loopback, cable and 4g.
verify    — tier 2.
