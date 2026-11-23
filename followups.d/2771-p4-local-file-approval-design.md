---
origin: 2771
priority: P4
recorded: 2026-11-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
deferred: blocked — owner-gated: the brief says "do not start" until the owner asks for the design
source: https://github.com/Laticent/lattice/pull/2771#issuecomment-6258755986
---

# Write up how an author approves a local file that the export refuses today

why now   — #2771 made the export refuse a local file reference it cannot vouch for. The way to
            approve one was discussed and not built: `--allow-path` for the CLI, the Library for
            the Studio, and a folder grant for the desktop app. #2771's brief left it as P4,
            owner-gated, and #2818's standup carried it as "P4 stays owner-gated". Nothing in
            the tree records it, so it was a chat-only item. A second owner call from the same
            brief rides with it: the CLI exits 0 with a stderr warning on a refused local file.
where     — a new decision note beside `engineering/decisions/2026-10-16-media-plugins.md`; later,
            the CLI's export flags, the Studio Library and the desktop app's file access.
done when — the owner asks for the design, a decision note records the approval model for all
            three surfaces and the exit code on a refusal, and the owner has picked.
evidence  — the decision note and the owner's answer.
verify    — owner call first; tier 0 gates for the note.
