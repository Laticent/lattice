---
origin: 2654
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-studio-chat-polish.md §4c
source: https://github.com/Laticent/lattice/pull/2654
---

# One refused part of a mixed photo and video pick should not drop the other parts

why now   — picking two photos and a clip while a clip is already pending attaches nothing and says only
            "remove it first"; the same happens for a full photo shelf or a model that reads only one kind.
where     — docs/src/components/studio/ArchitectChat.tsx (`attachMedia`, the early `return`s).
done when — each kind is judged on its own: the photos attach, the clip is refused in words.
evidence  — a unit or Playwright case with a mixed selection and one refusal.
verify    — tier 1; a small change in one function.
