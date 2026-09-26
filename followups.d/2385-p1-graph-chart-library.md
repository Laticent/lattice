---
origin: 2385
priority: P1
recorded: 2026-09-26
---

# One shared graph-chart library; the state chart moves onto it (state chart v2)

why now   — The owner's call after #2385: no duplication, and a library any future
            graph chart can build on. Today `dagre.layout` is called in three places:
            the shared kernel (`_chart-family/graph-layout.js` `layoutOnce`, used by
            the flowchart in the page and in its Worker), the state chart's own
            `dagrePositions` (`state-chart.transform.js:2241-2463`) and its Node-side
            `machineBranches` (`state-chart.adoption.js:98`). The state chart shares
            none of the flowchart's code: not its router, not its layout cache, not
            its Worker, not its one-draw fit. It has no untrusted-input check on its
            model (`followups.d/2385-p2-state-chart-pass-census.md`).
where     — lib/components/chart/_chart-family/graph-layout.js (the layout half);
            lib/components/chart/flowchart/flowchart.layout.js (the browser half to
            lift: measure, fit and type floor, live Worker, paint shell);
            lib/components/chart/state-chart/state-chart.transform.js and
            state-chart.adoption.js; lattice-emulator.js:3017-3080 (dagre gating);
            lib/runtime/index.js; lib/core/chart-narration.js; tools/check-ownership.js
            (the mark-identity and markup-sink rows at :5250-5255 and :5491-5510);
            test/unit/core/dagre-delivery.test.js; engineering/decisions/
            2026-09-25-flowchart-authoring.md §12-§14 (the plan); the library shape
            in engineering/decisions/2026-07-08-library-shape-cadenza-vetrina.md.
done when — A design note settles the library's home and API with the owner first.
            Then:
              - one browser pipeline in `_chart-family` (parse model → measure →
                layout → fit → paint shell, live Worker, cache) that both charts call;
              - the state chart's start/end markers, ordinal badges and wrapping-chain
                grid rebuilt as kernel options;
              - `dagrePositions` and the copied DOM helpers deleted;
              - the state chart migrated to the flowchart grammar by a codemod, with
                all 64 slides re-rendered and reviewed;
              - `machineBranches` agreeing with the kernel;
              - the state chart's model sanitized (closing the P2 census follow-up);
              - the router's fixed-positions entry exposed if gantt dependencies adopt
                it.
            Quality counts stay zero; the flowchart bench tier is unchanged or better,
            and a state-chart tier is added.
evidence  — every state-chart slide re-rendered light and dark (SendUserFile); before
            and after bench numbers; the Studio typing measurement on a large state
            chart.
verify    — tier 2, the adversarial trio: a shared kernel, a codemod over 64 slides,
            and a new public library.
