---
origin: 2778
priority: P2
recorded: 2026-10-19
area: infra
severity: low
swimlane: engineering/workflow.md §One layout for all four cards
source: https://github.com/Laticent/lattice/pull/2778
---

# Decide whether a posting hook should validate cards in PR comments

`npm run card` makes a card correct by construction, but nothing stops an agent from
retyping a card by hand. A harness hook on the GitHub comment tool could run the
validator on any comment that starts a card and block a bad one. It edits shared agent
settings for every session, so it is the owner's call (CLAUDE.md second filter).

why now   — the generator's one known gap: hand-typed cards in PR comments are unchecked, and chat copies can never be checked.
where     — `.claude/settings.json` hooks (see `.claude/hooks/`), `tools/card.js --check`.
done when — the owner has answered; if yes, a hook blocks a malformed card comment and a test proves it.
evidence  — the hook blocking a deliberately malformed card, and passing a generated one.
verify    — tier 1 checker, because it changes shared harness settings.
