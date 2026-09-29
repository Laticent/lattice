---
origin: 2361
priority: P2
recorded: 2026-09-29
---

# `lint:deck` is silent at laptop when a list-tabular or glossary slide overruns

why now   — `list-tabular` and `glossary` declare no slide `capacity`, and `capacity-scale` only
            runs when a deck sets `venue:`. At the default venue nothing counts their rows, so a
            7-row list-tabular (which fit at 13.5pt and clips at 16pt since the one-reading-size
            change) lints clean. Found by the inversion review. A bare markdown table on a
            non-table slide is never counted either.
where     — the two manifests (a `capacity` block at the measured laptop ceiling: list-tabular
            6, glossary 9), or `capacity-scale` in lib/authoring/lint-core.js judging laptop
            too. CHECK FIRST that a `capacity` block does not change how lib/core/auto-split.js
            paginates a glossary (record-shaped layouts split one member per page).
done when — `npm run lint:deck` warns on a 7-row `list-tabular` slide and a 10-term
            `glossary` slide with no `venue:`, and the shipped decks gain no new error.
evidence  — the lint output on both probes, and a lint:deck run over examples/ before and after.
verify    — self-review with the gates.
