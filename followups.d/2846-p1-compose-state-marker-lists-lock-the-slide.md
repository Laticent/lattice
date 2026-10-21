---
origin: 2846
priority: P1
recorded: 2026-10-21
area: website
severity: medium
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2846
---

# Compose: a checklist (`- [x] done`) locks the whole slide

why now   — measured on 2,965 shipped slides: 96 lock in Compose, 40 of them for a state-marker list item, the largest cause.
where     — docs/src/lib/compose/deck-source.ts (`LOSSY_CONSTRUCTS`), deck-markdown.ts (the serializer escapes `[`).
done when — a slide with `[x]`, `[ ]`, `[-]`, `[!]`, `[?]`, `[/]` list items edits in Compose, with a click toggle, and an untouched slide still emits its bytes.
evidence  — corpus byte test over the shipped decks, plus the real Studio at 1440 / 820 / 390.
verify    — tier 1 checker (it rewrites deck source).
