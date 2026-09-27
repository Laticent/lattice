---
origin: 2398
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2398
---
# Find what WebKit still keeps per Add slide open, with no new preview documents

why now   — After #2398 an Add slide open + full scroll + close on WebKit creates zero preview
            documents, yet RSS still rises: +378, +384, +428, +453, +470, +492 MB over 6 cycles
            (main: +239 → +905). The step shrinks toward the end, so it may plateau; it has not
            been run long enough to say.
where     — `.scratch/perf/webkit-scroll-mem.mjs` reproduces the cycle (rebuild it from §5 of
            `engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md` if the
            scratch is gone). Suspects, unmeasured: decoded images inside the kept documents,
            the looks-panel subtrees, and the Studio's own preview.
done when — 12+ cycles show either a plateau (record the number) or a named, isolated cause
            that is then fixed.
evidence  — RSS per cycle on Playwright WebKit, main vs branch, same box, with the document
            count at 0 per reopen.
verify    — tier 1 checker if a fix touches the pool or the persistent surface, because both
            sit under every Studio thumbnail grid; tier 0 if it only records.
