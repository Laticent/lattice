---
origin: 3049
priority: P1
recorded: 2026-11-06
area: docs
severity: medium
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §7
deferred: large — nine new skills, each written to the nine-part shape and checked against the engine
source: https://github.com/Laticent/lattice/pull/3049
---

# Write the skills agents need for decks that already exist

why now   — every skill but cli.md teaches how to make something new. The jobs an agent does most (edit,
            restyle, fix findings, chart from data) have no skill, and the Studio chat's main job is editing.
where     — design/skills/ (front matter, then node tools/skill-index.js); the note §7 slice 2.
done when — edit-deck, restyle-deck, fix-findings, chart-from-data, diagram, math, import, accessibility-review and
            studio exist with valid front matter (kind: operate where they act on an existing deck, studio: true
            where the chat can do the job), and the overlap of design/skill.md, AGENTS.md, deck.md and the kit's
            writing-a-deck.md is settled: one is canonical and the others point at it.
evidence  — the index table shows every new row with its read cost; one real chat turn per Studio skill shows the
            chat reaching for it.
verify    — tier 1, self-review with the gates; a fact-checker on each skill's cited paths and tokens.
