---
origin: 1958
priority: P3
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-codeql-triage.md
source: https://github.com/Laticent/lattice/pull/2910
---

# The Playground panel writes some front-matter values bare that do not read back

```text
  P3 · [no ticket] quote every value that a reader would change
       why now   — quoteIfNeeded (docs/src/playground/deck-config.js) quotes only values with
                   `:` or `#` or edge whitespace. The checker on PR 2910 (pre-existing):
                   `say "hi"` reads back from the engine as `say "hi`; `"Confidential"` reads
                   back as `Confidential` from both readers; a value with a newline would
                   inject a raw front-matter line (unchecked whether the input allows one).
       done when — every value the panel writes reads back unchanged through
                   frontMatterScalar and the panel's readFrontMatter (extend
                   deck-config.quote.test.ts).
       verify    — tier 0.
```
