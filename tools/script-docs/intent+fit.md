---
group: Test & verify
---
The FIT benchmark for the component recommender — the manifest grading itself. Turns every component's authored `whenToUse` (190) and `antiPatterns` (190) into held-out test cases: a whenToUse body IS a described task whose component should rank first, and an antiPattern that backticks a better component is a REDIRECT case where the warned-against one must stay behind (the project's first precision test — the deck-harvested corpora could only measure recall). Leave-one-out per case, since those notes are both the evidence and the questions. Reports `selection` (a task a recommender can answer) separately from `authoring` (how to write the markup), because only the first is answerable. On-demand; see engineering/decisions/2026-08-09-on-device-intent-routing.md.
