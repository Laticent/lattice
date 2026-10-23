---
origin: 2852
priority: P2
recorded: 2026-10-22
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# The slide spectrum's space is not reserved, so content shifts when it is present or absent.

```text
  P2 · [no ticket] The slide spectrum's space is not reserved, so content shifts when it is present or absent.
       why now   — the owner's desktop check: slides move up or down depending on whether the spectrum ribbon is there.
       where     — docs/src/lib/calco/ (reader.ts reads positions as rendered; check whether the shift comes from the
                   page layout or from how the shared background and its placeholders are laid out in masters.ts).
       done when — content sits at the same position with or without the spectrum, matching the Chrome PDF.
       evidence  — the same deck with and without a spectrum, shape positions compared against the PDF.
       verify    — tier 1 maker-checker.
```
