---
origin: 2327
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2327
---

# The unknown-split warning names the wrong fallback

Found while #2327 taught rule 16 to count heading-split slides. `findUnknownSplit` in
`lib/authoring/lint-core.js` warns that a mistyped `split:` value makes the deck "silently
fall back to 'rule' (split on ---)". `lib/core/resolve-split.js` resolves an unknown value
to `headings`, the default since the 2026-06 flip, so the warning tells the author the
opposite of what their deck does. The function's own header comment says the same wrong
thing.

```text
  P3 · Make the unknown-split warning name the real fallback
       why now   — an author who mistypes `split: rule` is told they got `rule`, and
                   their deck splits at every heading instead.
       where     — lib/authoring/lint-core.js findUnknownSplit (message + header);
                   its test in test/unit/components/lint-core.test.js.
       done when — the message names `headings` as the fallback, read from the same
                   default resolve-split.js uses (DEFAULT_SPLIT) or pinned to it by test.
       evidence  — the new message, and a test that fails if the two defaults diverge.
       verify    — tier 1: lint a deck with `split: rules`.
```
