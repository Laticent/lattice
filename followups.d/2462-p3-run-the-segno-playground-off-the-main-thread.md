---
origin: 2462
priority: P3
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2462
---

# Run the /segno grammar playground off the main thread

why now   — #2462's checker: the playground evaluates the visitor's grammar code 150 ms after
            each keystroke on the main thread, so `for(;;){}` freezes the tab. It is the
            visitor's own code (no security issue), but the page should survive it.
where     — docs/src/pages/segno.astro (the grammar box's evaluator).
done when — the grammar compiles in a Worker with a time limit, and a looping grammar shows an
            error instead of freezing the page.
evidence  — tools/screenshot.js of the error state; a Playwright drive of the loop case.
verify    — tier 2; the real page in Chromium.
