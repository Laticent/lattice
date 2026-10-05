---
origin: 2510
priority: P1
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2510
---

# Phase 2: move Lattice's inline grammars, sparks included, onto Segno

why now   — Decision 20 makes Segno Lattice's one parser, and decision 19 adds sparks to the
            migration (row 28). Until phase 2 lands, 27 hand-written grammars plus
            lib/core/inline-sparks.js keep parsing decks, and the clean break (decision 9)
            cannot start.
where     — engineering/decisions/2026-09-28-segno-unified-inline-notation.md: § What every
            current grammar becomes (rows 1–28) and § Plan (phase 2). The schemas go in the
            component manifests; the kernels to delete are listed in that table. Sparks need
            a `series` type (2–48 space-separated numbers) and a `ratio` type (`72/80`,
            `72%`) in docs/src/lib/segno/types.ts. Start with the 2462 follow-ups it depends
            on: 2462-p1-spike-flowchart-rows-in-segno-before-phase-2 first, then
            2462-p2-bind-every-corpus-span-against-the-old-kernels and
            2462-p2-lint-the-old-spellings-before-the-clean-break.
done when — every row of the table reads through a Segno slot schema; the codemod rewrites
            every shipped deck and doc (pills to `{BETA, tag, c4}`, sparks to
            `~{12 14 17, bar, c3}`); the old parsers are deleted; binding reads straight off
            the flat tree; a `**Breaking:**` changelog fragment lands; and the gallery
            renders unchanged apart from the rewritten source.
evidence  — the corpus binding against the old kernels (every span, same values);
            `npm run parser:bakeoff:segno` per-span times against today's kernels (pills
            2.3x and sparks 1.0x on 2026-10-04 — flat-tree binding is meant to close the
            pill gap); the gallery PDFs before and after via SendUserFile.
verify    — tier 2, the adversarial trio, because it changes what every chart reads: high
            blast radius and genuinely novel (the note's § Plan already says so).
