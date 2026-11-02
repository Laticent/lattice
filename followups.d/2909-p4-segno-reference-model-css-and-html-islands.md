---
origin: 2909
priority: P4
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: blocked — the R3 switch waits on the owner's D9 (a route-budget ceiling); D8 then makes R4 one PR per consumer
source: https://github.com/Laticent/lattice/pull/2909
---

# The R3 HTML reader is built but not switched on (D9), and each consumer keeps its own scan (R4)

why now   — R2 landed on 2026-10-29. R3 was built on 2026-10-30 (the note's "R3 built, not wired"): the generated HTML
            reader matches the live scanner on every gate and the spec parser on 195,641 corpus elements, but switching it on
            puts the Studio's eagerJsGz 2,495 bytes over a ceiling it sits 164 bytes under. D9 puts that to the owner. After
            the switch, R4: the consumers (gallery gate, export, linter, narrator) migrate one PR each, each deleting its scan.
where     — the switch: `lib/core/remote-ref.js` `scanHtml` (the statement `tools/lib/wired-remote-ref.mjs` applies)
            and docs/route-budget.json studio eagerJsGz; R4: `lib/packages/gallery-gate.js` (parse5 + `remoteRefsInElements`), the export path, the linter and the
            narrator; the note's R4 row.
done when — the switch: remote-ref.js reads through html-ref-reader.js and `npm run check:html-ref-spans` stays at 0.
            R4: the census count of private reference readers goes down by one per PR, to zero.
evidence  — the note's "R2 landed" and "R3 built, not wired" are the pattern: a frozen oracle, a differential, the corpus
            check (`npm run check:css-ref-spans`, `npm run check:html-ref-spans`), and `npm run fuzz:web-refs` in three engines.
verify    — tier 2 per migration: each rewrites a security sanitizer.
