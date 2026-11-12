---
origin: 2772
priority: P3
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md
deferred: off-path — Compose's serializer (deck-doc.ts, the list node schema), which #3136's lift rules do not touch; it needs a marker attribute on both list nodes, parsed from the token and written back
source: https://github.com/Laticent/lattice/pull/3136
---

# Compose rewrites `*` and `1)` list markers, and two adjacent lists become one

why now   — the second checker on #3136 fuzzed the editor round trip (`deckToDoc` then `docToDeck`, 2,000 random slides
            with a blank line or a bare newline between shapes). After #3136 the lift itself changes no slide
            (0, 0 and 1 of 2,000 on seeds 7, 8 and 9, the 1 a whitespace-only diff inside a pane; `main` changes 184 to 205), but
            the editor arm still changes 136 to 152 of about 1,670 edited slides, against 444 to 466 on `main`. Most of what is
            left is the serializer: it writes every bullet as `-` and every number as `1.`, so `- a` / `* c` (two lists in
            CommonMark, because the marker changed) comes back as one list: `"## T\n\n* c\n- a"` becomes
            `"## T\n\n- c\n\n\n- a"`. An author who split a list with a different marker sees it merge after any edit.
where     — docs/src/lib/compose/deck-doc.ts (the bullet_list and ordered_list nodes and their serializer).
done when — both list nodes keep the marker they were parsed with (`-`, `*`, `+`; `.` or `)`) and write it back; the
            seeded editor arm in deck-source.test.ts gains the `* c`, `1) one` and `2) two` shapes and still passes.
evidence  — the checker's fuzz: /tmp scratch on #3136 (`fuzz.mts`, seeds 7-9); rerun with the SHAPES above.
verify    — tier 1 checker.
