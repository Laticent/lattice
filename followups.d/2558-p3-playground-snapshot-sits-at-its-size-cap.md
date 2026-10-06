---
origin: 2558
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2558
---

# The Playground's first-paint snapshot sits about 100 units under its size cap

why now   — #2558 tipped it over: two sketch-icon rules the snapshot's probe could not evaluate added
            320 units, the stored value reached 245,975 against `MAX_UNITS` 245,760, nothing was stored,
            and four `playground-first-paint` specs timed out waiting for it (`studio-smoke`). Rewriting
            the two rules as compounds the probe can test brought it to 245,651. That leaves about 109
            units of headroom on the default Edit deck, so the next CSS change of any size that lands a
            rule the probe keeps will fail the same way, far from the code that caused it.
where     — docs/src/playground/snapshot-cache.js: `MAX_UNITS`, `collectRules` and the probe that keeps a
            rule it cannot evaluate (STRIP_PSEUDO cannot strip a nested `:not(:is(…))`). The 10 KB
            `--print-cat-*` token block is the largest single rule.
done when — the default Edit deck's snapshot has real headroom (the size measured in a test, with a
            margin the test pins), either by dropping rules the captured slide cannot use (a palette's
            print tokens, nested-pseudo arms resolved properly) or by a cap chosen with the owner.
evidence  — the snapshot's units before and after, measured on `npm run build:e2e` + `/playground/?view=edit`.
verify    — tier 1 checker.
