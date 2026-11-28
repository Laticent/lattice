---
origin: 3599
priority: P2
recorded: 2026-11-28
area: engine
severity: medium
deferred: off-path — #3599 changes no render input (lib/, themes/, examples/, assets/ and lattice.css are identical to its merge base 893ade75); the goldens are the nightly bless's to settle
swimlane: engineering/decisions/2026-11-16-blessing-invariants-attribution.md
source: https://github.com/Laticent/lattice/pull/3599
---

# Four example decks drift from their goldens on main@893ade75

why now   — `npm run regress` on a tree whose render inputs equal main@893ade75 drifts deterministically,
            deck by deck: examples/image-pane-story 17 pages, worst 99.91%; guide-storyboards 9.55%;
            inline-code-contrast 9.13%; image-set-export 8.12%. The full run hit its 3,600 s bound with
            95 DRIFT lines, so more decks may drift. A 99.91% page is not anti-aliasing.
where     — the decks above and their golden PDFs; `node tools/regression-gate.mjs --scope decks --only <deck>`.
done when — each deck is either re-blessed (the change was intended) or its render fixed, and a full
            `npm run regress` on main finishes green.
evidence  — the regress log naming each deck ok.
verify    — `node tools/regression-gate.mjs --scope decks --only examples/image-pane-story`.
