---
origin: 2728
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md
source: https://github.com/Laticent/lattice/pull/2728
---

# Write a reveal.js connector before freezing the assembler's connector contract

why now — the red team (§10 of the note) found that the prune gate drives the player's own views (`#lp-app`, `data-lp-view`), so a generic assembler cannot prune a document it does not know. If a plain reveal.js export cannot pass the gate on declared data plus a few-line state driver, the contract is the shell player under another name.
where — a scratch connector over one hand-written reveal.js export. Also add a refuse-on-zero-frames guard: feeding a reveal.js-shaped document to `buildPlayerHtml` today returns a 63 KB file with zero slides, no error and no warning.
done when — the gate passes on the reveal.js file with only declared data and a driver, or the note records why it cannot.
