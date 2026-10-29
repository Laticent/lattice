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

# The web-reference scanner still reads CSS by hand until R2 is wired, reads HTML privately (R3), and each consumer keeps its own scan (R4)

why now   — R2 is built and held to the old tokenizer (the note's "R2 built, not wired"), but NOT wired: the
            generated CSS parser adds 2,690 gzip bytes to `remote-ref.js`, which puts the Studio's eager JS
            at 548.5 KB against a 546.3 KB ceiling. Raising that ceiling is the owner's call (options in the
            note: raise it by about 2.3 KB, find 2.3 KB elsewhere first, or wire it with R4). After that, R3 is
            an HTML island that reports `unsure` spans where the platform parser would build the tree
            differently, replacing the scanner's private `risky` flag, and R4 migrates the consumers (gallery
            gate, export, linter, narrator) one PR each, each deleting its own scan. D8 says R3 starts after
            R2's gate has run green; the gate's evidence exists (the note), pending the wiring.
where     — `lib/core/remote-ref.js` (`cssRefSpans` to swap; `scanHtml`, the `risky` flag), the note's R3 and R4 rows.
done when — R2: the ceiling decision made, `cssRefSpans` replaced by `makeCssRefSpans(...)`, docs-build green. R3: the soundness invariant holds on 100,000 inputs per engine, a platform-parser differential
            on the corpus, and the `unsure` rate is reported. R4: the census count of private reference
            readers goes down by one per PR.
evidence  — the decision note's "R2 built, not wired" is the pattern: a frozen oracle, a differential, the corpus
            check (`tools/check-css-ref-spans.mjs`), and `npm run fuzz:web-refs` in three engines.
verify    — tier 2 per phase: each rewrites a security sanitizer.
