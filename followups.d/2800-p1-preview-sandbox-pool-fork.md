---
origin: 2800
priority: P1
recorded: 2026-10-20
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md §5 D-B
---

# Move the math, Mermaid and function-plot previews into the sandbox: pick the mechanism.

why now   — decision 15: no first-party plugin runs its library in the page that holds the deck. Mermaid and
            function-plot still load in the same-origin preview frame, and KaTeX in the host page. The pool the owner
            named (D-B) runs a worker, which has no DOM and no `'unsafe-eval'`; the note's "D-B findings" section has
            the table.
where     — docs/src/lib/code-packages/door-run.ts `frameFor`, runner.ts; lib/runtime and lib/plugins/host-browser.mjs
            (`ensureLibrary`); lib/engine/katex-browser-stub.js; lib/export/locked-figures.js (the CLI's version).
decided   — nothing new. D-B (the existing pool) stands until the owner picks below.
done when — the owner picks one option per library and this file is replaced by the build issue(s):
            (a) math: pool with a two-pass render, or the WebAssembly wall in the page (sync, byte-identical, no frame);
            (b) Mermaid: a second document in the pool, library inlined by hash, fonts as `data:`;
            (c) function-plot: the same, with `'unsafe-eval'` in that one document's policy, or keep it out of the pool
            and say so as a recorded exception.
evidence  — latency before and after at 1440, 820 and 390 px; screenshots of each plugin's gallery slide.
verify    — tier 2 trio: the work adds a frame boundary.
