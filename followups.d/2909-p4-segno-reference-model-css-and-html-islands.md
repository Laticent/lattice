---
origin: 2909
priority: P4
recorded: 2026-10-28
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §Phasing
deferred: large — R3 is the real work of the note (an HTML tokenizer of about 80 states), and D8 makes R4 one PR per consumer
source: https://github.com/Laticent/lattice/pull/2909
---

# The web-reference scanner still reads HTML privately (R3), and each consumer keeps its own scan (R4)

why now   — R2 landed on 2026-10-29: `cssRefSpans` reads CSS through the generated Segno parser, spans identical
            to the old tokenizer's (the note's "R2 landed"); the owner raised the Studio ceiling for it (D1 A on
            #2980). What is left is the HTML half. R3 is an HTML island that reports `unsure` spans where the
            platform parser would build the tree differently, replacing the scanner's private `risky` flag, and
            R4 migrates the consumers (gallery gate, export, linter, narrator) one PR each, each deleting its
            own scan. D8 says R3 starts after R2's gate has run green: it has.
where first, or wire it with R4). After that, R3 is
            an HTML island that reports `unsure` spans where the platform parser would build the tree
            differently, replacing the scanner's private `risky` flag, and R4 migrates the consumers (gallery
            gate, export, linter, narrator) one PR each, each deleting its own scan. D8 says R3 starts after
            R2's gate has run green; the gate's evidence exists (the note), pending the wiring.
where     — `lib/core/remote-ref.js` (`scanHtml`, the `risky` flag), the note's R3 and R4 rows.
done when — R3: the soundness invariant holds on 100,000 inputs per engine, a platform-parser differential
            on the corpus, and the `unsure` rate is reported. R4: the census count of private reference
            readers goes down by one per PR.
evidence  — the decision note's "R2 landed" is the pattern: a frozen oracle, a differential, the corpus
            check (`tools/check-css-ref-spans.mjs`), and `npm run fuzz:web-refs` in three engines.
verify    — tier 2 per phase: each rewrites a security sanitizer.
