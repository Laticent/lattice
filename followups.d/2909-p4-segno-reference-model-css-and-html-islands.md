---
origin: 2909
priority: P4
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: large — D8 makes R4 one PR per consumer (gallery gate, export, linter, narrator), each its own migration
source: https://github.com/Laticent/lattice/pull/2909
---

# Each consumer of web references keeps its own scan (R4)

why now   — R2 landed on 2026-10-29 and R3 on 2026-11-02: `cssRefSpans` and `scanHtml` both read through generated
            Segno parsers, and `scanHtml` reports `unsure` spans with a reason (the note's "R3 landed"). What is left is
            R4: the consumers (gallery gate, export, linter, narrator) migrate one PR each, each deleting its own scan.
where     — `lib/packages/gallery-gate.js` (parse5 + `remoteRefsInElements`), the export path, the linter and the
            narrator; the note's R4 row.
done when — R4: the census count of private reference readers goes down by one per PR, to zero.
evidence  — the note's "R2 landed" and "R3 landed" are the pattern: a frozen oracle, a differential, the corpus
            check (`npm run check:css-ref-spans`, `npm run check:html-ref-spans`), and `npm run fuzz:web-refs` in three engines.
verify    — tier 2 per migration: each rewrites a security sanitizer.
