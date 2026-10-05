---
origin: 2424
priority: P2
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2427#issuecomment-5864048730
---

# Design note: should the state chart be a flowchart preset (markers, badges, the flowchart's tile type)?

```text
why now   — a design question, NOT a latency fix. The state tile inherits the slide's
            body type (21.4 px against the flowchart's 13.5 px), reserves 40 px of right
            padding for its badge (18 px) and wraps at 25cqi (17cqi), so the chart lands at
            0.7x where the flowchart lands at 1.2x. A prototype with the flowchart's tile type
            (same machine, real Studio, 3 runs each, recorded on #2424) lifted the scale to
            0.9x and cut a cold render to 3 layout calls of 1 routing each, but did NOT buy
            typing parity: key to visible got worse (316-356 ms vs 258-272 ms), each layout
            cost ~25% more (more grid candidates within the wrap margin), and the burst tail
            stayed noisy (354-685 ms vs 244-1,028 ms; the flowchart 194-223 ms). It was
            reverted. Whether the two charts should share one tile look stays a design
            question on its own merits (after #2424 they share the grammar, kernel, router,
            painter and fit loop); the typing gap is P3's (the router's cost per layout).
where     — lib/components/chart/state-chart/state-chart.styles.css (.state-node),
            lib/components/chart/flowchart/flowchart.styles.css (.fc-node),
            engineering/decisions/2026-09-27-trama.md
note      — written: engineering/decisions/2026-10-05-state-chart-tile-look.md (recommends
            keeping the state tile; names land 26-37% smaller on the flowchart's tile)
done when — the owner picks an option from a design note (it changes how every state
            chart looks); nothing ships before that pick
evidence  — both chart decks rendered light and dark per option (SendUserFile)
verify    — tier 0, because the deliverable is a decision doc
```
