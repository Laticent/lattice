---
origin: 3128
priority: P2
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-10-compose-first.md §4
deferred: large — a new worker script the Studio's CSP, offline cache, Save-Data warm-up and route budget all have to admit; the owner chose a separate PR (2026-11-11)
source: https://github.com/Laticent/lattice/pull/3128
---

# Run Compose's lint pass in a Web Worker

why now   — Compose lints the deck text for Fix all and its count (StudioShell's Compose lint effect, deck-lint.ts).
            PR #3128 moved the pass off the typing path (a 1 s pause, an idle callback, no repeat on linted
            text, no re-render for an unchanged count), which brought typing back to main's long-task level. It
            is still one main-thread task of about 100 ms on a 123-slide deck after the author stops typing.
where     — docs/src/components/studio/deck-lint.ts (`lintCounts`), the authoring door it loads
            (docs/src/playground/authoring-door.js), plugin admission (`followDeckAdmission`), and the
            Compose lint effect in StudioShell.tsx. The lint core is pure, fs-free and synchronous (HARD RULE
            #7), and the vocabulary is plain sets, so both cross a postMessage.
done when — the count comes from a module worker; the main thread does no lint work while Compose is open;
            the worker chunk is in the offline warm-up and stays out of a Save-Data visitor's downloads unless
            Compose is their mode; the CSP admits it (worker-src); studio-warm-offline.spec.ts and
            compose-first.spec.ts pass.
evidence  — tools/studio-sync-bench.mjs (123 slides, compose) and the CPU profile recipe in the decision note:
            no lint.js or markdown-it self time on the main thread during or after a typing burst.
verify    — the same bench against main, three runs each side, and the offline and Save-Data specs.
