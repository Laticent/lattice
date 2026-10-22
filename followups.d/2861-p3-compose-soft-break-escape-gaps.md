---
origin: 2861
priority: P3
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §7b
source: https://github.com/Laticent/lattice/pull/2861
---

# Compose: three places a soft-break paragraph can still write structure

why now   — the independent check of #2861 found them after the fix. None regressed from `main` (a soft break was a space there), but each is reachable by typing in an edited paragraph.
where     — docs/src/lib/compose/deck-markdown.ts (the `text` and `soft_break` serializer rules).
done when — (1) a line after a break that starts `1)`, `<div>` or leading spaces then `-`/`>` stays literal; (2) a two-line setext heading (`a\nb\n===`) keeps its break instead of writing `# a b` (the engine draws `<br>`); (3) `a\#\n===` keeps its `#`.
evidence  — a round-trip arm per input, and the corpus `<br>` count on a deck that has a two-line setext heading.
verify    — tier 1 checker.
