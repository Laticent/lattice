---
origin: 2385
priority: P2
recorded: 2026-09-26
---

# Throttle the flowchart's live layout to one per ~300 ms while typing

why now   — #2385's live layout lays a chart out on nearly every keystroke, in a
            worker. Measured in the real Studio on the typing deck's 17-shape chart,
            a burst of 16-19 keys costs 14-18 layouts and about 1.5 s of worker CPU;
            Mermaid's twin costs 1 render (about 90 ms), because it waits for a
            150 ms pause, but it then shows nothing new until you stop. The owner
            chose a throttle as a follow-up: keep the chart moving, cut the CPU.
where     — lib/components/chart/flowchart/flowchart.layout.js: `liveWorker()`'s
            `W.post` / `send` queue (newest wins, one in flight per chart).
done when — during a burst a chart is laid out at most once per ~300 ms, plus one
            layout for the final edit as soon as typing stops; re-measured with the
            same method: about 4-6 layouts per burst instead of 14-18, the chart still
            updating mid-burst, and the last key drawn within ~40 ms of stopping; a
            unit test pins the throttle next to the newest-wins test.
evidence  — engineering/decisions/2026-09-25-flowchart-authoring.md §7 (burst typing);
            the cost table in the #2385 conversation: flowchart 14 layouts / 1,546 ms
            worker CPU (16 keys at 50 ms) and 18 / 1,593 ms (19 keys at 120 ms).
verify    — the typing deck in the Studio, slide 7, typed fast; `node --test
            test/unit/components/flowchart.test.js`.
