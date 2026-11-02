---
group: Test & verify
---
Render every shipped deck (examples, the baseline decks, every gallery under lib/) through this tree and through another commit (`--ref`, default `origin/main`), and compare: the engine's HTML and CSS per deck, matched by the deck's source so a moved file still pairs, and `lint:deck --all`'s findings. Exit 1 on any difference. A deck whose source changed is named (`source changed`), as are added and removed decks; `--strict` fails on those too, which is the mode for a refactor. The characterization test for a refactor that must not move output (engineering/decisions/2026-11-02-slide-facts-for-kinds.md §8); verified able to fail by mutation.
