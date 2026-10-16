---
origin: 2718
priority: P3
recorded: 2026-10-16
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2718
---

# The shipped dispatcher spends 5.7x the retired kernel's time on ordinary code

why now   — #2718's inline-span bench tier measured it: `escapedText` + `dispatches` take about
            74 ns on an ordinary-code span (one no kind renders), against the retired kernel's
            12.7 ns on the same 4,946 spans. Ordinary code is 93% of what authors write in
            backticks. `dispatches` asks every row in `rowsAsked` in turn, while the old kernel
            gave up after its first test. The 15 ns #2692 removed from `isDirective` never
            reached this path, because every shipped caller tests `text[0] !== '{'` first.
where     — lib/core/inline-code-directives.js `dispatches` / `rowsAsked`: one shared
            first-character test before any row is asked (every kind opens with `{`, `[`, `\`
            or a tag character), or a per-row opener table.
done when — the `inline · ordinary code / retired kernel` ratio in `npm run bench:check` falls
            by at least half, the directives row stays within its band, and the inline unit
            suites pass unchanged.
evidence  — the before/after `bench:check` readings and the re-blessed baseline.json diff.
verify    — tier 1: unit suites for inline-code-directives and every inline kind, plus bench.
