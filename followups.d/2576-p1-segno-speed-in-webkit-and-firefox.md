---
origin: 2576
priority: P1
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2576
---

# Measure the faster Segno parsers in WebKit and Firefox, not only V8

why now   — #2576's pre-merge card is `high`, floored by one unknown: every speed figure is
            from Node 22 (V8). The Studio runs the generated parsers in Safari and Firefox
            too, and the regex tail and local-variable scans are V8-tuned. Correctness is
            plain JS and engine-independent; speed is not.
where     — `tools/parser-bakeoff/languages-grammars.mjs` (the grammars) and
            `docs/src/lib/segno/codegen.ts` (`generate()`); run both main's and the branch's
            generated CSS/HTML/Markdown parsers in Playwright's webkit and firefox over the
            same corpus the `languages` arm reads.
done when — a table of MB/s, main vs #2576, per language, in WebKit and Firefox, sits in
            the PR (or the decision note's § Generated-parser speed), and no language is
            slower than main in either engine. If one is, `SCAN_JS` or the regex tail is
            gated off for that case before merge.
evidence  — the MB/s table, with the browser versions it came from.
verify    — tier 0 gates; the numbers are the evidence.
