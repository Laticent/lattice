---
origin: 2398
priority: P2
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2398
---
# Find what WebKit still keeps per Add slide open, with no new preview documents

why now   — After the frame dock, an Add slide open + full scroll + close on WebKit creates zero
            preview documents, yet RSS still rises about 30 MB per cycle (+383 → +597 MB over 8
            cycles, against main's +291 → +884 MB over 5). Whatever it is, it is the next thing an
            iPad session runs out of.
where     — `.scratch/perf/webkit-scroll-mem.mjs` and `doc-count.mjs` reproduce the cycle (rebuild
            them from §5 of `engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md`
            if the scratch is gone). Suspects, unmeasured: the looks-panel subtrees, decoded images
            inside the kept documents, and the dialog's own React tree.
done when — the residue is named with a measurement that isolates it, and either fixed (the RSS
            curve flattens across 8 cycles) or recorded as WebKit's own cost with the number.
evidence  — RSS per cycle on Playwright WebKit, main vs branch, same box, plus the document count
            staying at 0 per reopen.
verify    — tier 1 checker if the fix touches the pool or the dock, because every Studio thumbnail
            surface goes through them; tier 0 if it only records.
