---
origin: 2875
priority: P4
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md §8
source: https://github.com/Laticent/lattice/pull/2875
---

# Compose e2e: "copying a pill to another slide pastes the exact span" fails about 1 run in 4

why now   — measured on #2875 with `--repeat-each=8 -g "copying a pill"` on desktop: 2 of 8 failed with main's serializer, with this PR's previous commit and with its last one, so the PR does not cause it. An earlier brief guessed about 1 in 16. It fails at `toHaveCount` after the caret walk, so the arrow-key walk onto the pill most likely lands on text before the pill becomes an object.
where     — docs/e2e/compose-pill-editor.spec.ts:236 (the 9× ArrowRight walk, then `.ProseMirror-selectednode`).
done when — the spec places the selection on the pill through the DOM or the editor view instead of walking the caret, and 16 repeats pass.
evidence  — `--repeat-each=16` on desktop, all green.
verify    — tier 1 checker.
