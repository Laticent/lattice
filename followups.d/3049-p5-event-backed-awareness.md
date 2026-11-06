---
origin: 3049
priority: P5
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §6
deferred: blocked — waits on 3037-p1, 3037-p4 and 3037-p5 (the Fuoco event channel)
source: https://github.com/Laticent/lattice/pull/3049
---

# Tell the chat what changed since its last reply

why now   — overflow, contrast and "you edited slide 7 by hand" never reach the chat.
where     — Fuoco event facts (fit.overflow, lint.changed, coach.photo-contrast, doc.changed) read at send time with
            replay; ChatGrounding.
done when — each turn carries only the facts that changed since the previous turn, one line each; nothing is sent
            when nothing changed; the chat never speaks first.
evidence  — tokens per turn with and without changes, measured.
verify    — tier 1, self-review with the gates.
