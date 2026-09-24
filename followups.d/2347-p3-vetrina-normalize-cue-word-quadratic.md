---
origin: 2347
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2347
---

# Vetrina's `normalizeCueWord` is quadratic on a long punctuation run

why now   — the LTT red team measured the same regex in `@laticent/ltt`'s `normalizeMatch` at
            55 ms for 10k characters, 937 ms for 40k; PR #2347 replaced it there with a linear
            scan, and the two must keep agreeing on what "the same word" means.
where     — docs/src/lib/vetrina/narrate.ts `normalizeCueWord` (`/[^\p{L}\p{N}]+$/u`).
            Step 4 (`2339-p4-…`) opens Vetrina's gate to `@laticent/ltt`, at which point it can
            import `normalizeMatch` instead of keeping a copy.
done when — `normalizeCueWord` trims with a linear scan (or is `normalizeMatch`), with a test
            that a 40k-character punctuation run normalizes in milliseconds.
evidence  — the timing test.
verify    — self-review with the gates.
