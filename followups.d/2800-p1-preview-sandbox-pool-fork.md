---
origin: 2800
priority: P1
recorded: 2026-10-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md §5 D-B
---

# Move the math preview into the sandbox: pick the mechanism.

why now   — decision 15: no first-party plugin runs its library in the page that holds the deck. Mermaid and function-plot
            now draw in a sandboxed frame in the previews (#2822, owner pick D1 A). KaTeX still runs in the host page,
            inside the engine's synchronous `render()`; a frame answers by `postMessage`, so the two do not meet without a
            decision.
where     — lib/engine/katex-browser-stub.js; lib/export/locked-figures.js (the CLI's version); the decision note's "D-B findings".
decided   — Mermaid and function-plot: done in #2822. Math: nothing new.
done when — the owner picks one option for math and this file is replaced by the build issue:
            (a) the pool with a two-pass render and a `data-math-reflow` pass, or
            (b) the WebAssembly wall in the page (synchronous, byte-identical, no frame).
evidence  — latency before and after at 1440, 820 and 390 px; a screenshot of the math gallery slide.
verify    — tier 2 trio: the work adds a frame boundary (option a).
